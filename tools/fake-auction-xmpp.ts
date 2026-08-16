/**
 * 互動式的假拍賣現場，XMPP 版本（見 ADR-0008/0010/0011）。跟
 * test/integration/xmpp/FakeAuctionServer.ts 一樣連 Prosody、用同一套
 * XMPPConnection/XMPPChatManager 抽象（見
 * docs/xmpp-ts-vs-java-differences.md），但這支是給人手動操作用的 CLI，
 * 不是測試替身，兩者不共用程式碼（比照 tools/fake-auction.ts 不 import
 * test/e2e/FakeAuctionServer.ts 的既有慣例）。
 *
 * 用法：
 *   npm run fake-auction:xmpp -- <itemId>            連本機 Prosody
 *   npm run fake-auction:xmpp:remote -- <itemId>     連 XMPP_SERVICE_URL/
 *                                                      XMPP_DOMAIN 指定的
 *                                                      Prosody（例如已部署
 *                                                      到 Render 的服務，見
 *                                                      poc/docs/xmpp-prosody-deploy.md；
 *                                                      在 .env.local 設定）
 *
 * itemId 要對應到 Prosody 上已經用 `prosodyctl register` 註冊過的帳號
 * `auction-<itemId>`（ADR-0003 白名單），不是隨便一個字串都能用——這點跟
 * tools/fake-auction.ts（Redis channel 名稱可以任意取）不同。
 *
 * sniper 加入後，直接輸入要發布的 SOL 訊息本文即可，用法跟
 * tools/fake-auction.ts 一致。輸入 "quit" 中斷連線並結束程式。
 *
 * 模擬「自己出的價成交」時，Bidder 欄位要填完整 JID（例如
 * sniper@localhost/Auction），不是單純使用者名稱，見
 * docs/fake-auction-xmpp.md「Bidder 欄位的正確寫法」。
 */
import { clearLine, createInterface, cursorTo, moveCursor } from 'node:readline';

import type { XMPPChat } from '@server/auctionsniper/xmpp/XMPPChat.ts';
import { XMPPConnection } from '@server/auctionsniper/xmpp/XMPPConnection.ts';

const SOL_VERSION_PREFIX = 'SOLVersion: 1.1; ';
const AUCTION_RESOURCE = 'Auction';
const AUCTION_PASSWORD = 'auction';

function parseCommand(messageBody: string): Map<string, string> {
  const fields = new Map<string, string>();
  for (const field of messageBody.split(';')) {
    const trimmed = field.trim();
    if (!trimmed) continue;
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) continue;
    fields.set(trimmed.slice(0, colonIndex).trim(), trimmed.slice(colonIndex + 1).trim());
  }
  return fields;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const remote = args.includes('--remote');
  const itemId = args.find(arg => !arg.startsWith('--'));
  if (!itemId) {
    console.error('usage: npm run fake-auction:xmpp -- <itemId> [--remote]');
    process.exit(1);
  }

  if (remote && (!process.env.XMPP_SERVICE_URL || !process.env.XMPP_DOMAIN)) {
    console.error(
      '--remote requires XMPP_SERVICE_URL and XMPP_DOMAIN to be set (e.g. via --env-file=.env.local)'
    );
    process.exit(1);
  }
  const serviceUrl = remote ? process.env.XMPP_SERVICE_URL! : 'ws://localhost:5280/xmpp-websocket';
  const domain = remote ? process.env.XMPP_DOMAIN! : 'localhost';

  const jid = `auction-${itemId}@${domain}/${AUCTION_RESOURCE}`;
  let connection: XMPPConnection;
  try {
    connection = await XMPPConnection.connect(
      serviceUrl,
      domain,
      `auction-${itemId}`,
      AUCTION_PASSWORD,
      AUCTION_RESOURCE
    );
  } catch (error) {
    console.error(`Could not connect to ${serviceUrl}:`, error);
    process.exit(1);
  }

  let sniperChat: XMPPChat | null = null;

  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: '>>> ' });

  function promptAgain(preserveCursor = false): void {
    console.log();
    rl.prompt(preserveCursor);
  }

  function printAsync(message: string): void {
    clearLine(process.stdout, 0);
    cursorTo(process.stdout, 0);
    moveCursor(process.stdout, 0, -1);
    clearLine(process.stdout, 0);
    console.log(message);
    promptAgain(true);
  }

  // fake-auction-xmpp 這裡扮演拍賣現場，用 addChatListener() 被動接受任何
  // sniper 主動建立的 chat（對應 Java 版 ChatManagerListener#chatCreated()），
  // 收到第一個訊息時記住對方的 XMPPChat，之後發送 PRICE/CLOSE 都透過同一個
  // chat 送出。
  connection.getChatManager().addChatListener(chat => {
    sniperChat = chat;
    chat.addMessageListener({
      processMessage: (_chat, message) => {
        const body = message.getBody();
        const fields = parseCommand(body);
        const command = fields.get('Command');

        if (command === 'JOIN') {
          printAsync(`Sniper joined: ${chat.getParticipant()}`);
        } else if (command === 'BID') {
          printAsync(`< received: Bid ${fields.get('Price')} from ${chat.getParticipant()}`);
        }
      }
    });
  });

  console.log(`Selling item ${itemId} as ${jid} on ${serviceUrl}. Waiting for a sniper to join...`);
  console.log(
    `Type a SOL message body (without the "${SOL_VERSION_PREFIX}" prefix) to send it, e.g.:`
  );
  console.log('  Event: PRICE; CurrentPrice: 90; Increment: 5; Bidder: other bidder;');
  console.log('  Event: CLOSE;');
  console.log('Type "quit" to disconnect and exit.');

  promptAgain();

  rl.on('line', line => {
    const trimmed = line.trim();
    if (!trimmed) {
      promptAgain();
      return;
    }

    if (trimmed === 'quit') {
      rl.close();
      return;
    }

    if (!sniperChat) {
      console.log('(no sniper has joined yet)');
      promptAgain();
      return;
    }

    const rawMessage = `${SOL_VERSION_PREFIX}${trimmed}`;
    sniperChat.sendMessage(rawMessage);
    console.log(`> sent: ${rawMessage}`);
    promptAgain();
  });

  rl.on('close', () => {
    void connection.disconnect().then(() => process.exit(0));
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
