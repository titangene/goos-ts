/**
 * 互動式的假拍賣現場，XMPP 版本（見 ADR-0008/0009/0010）。跟
 * test/integration/xmpp/FakeAuctionServer.ts 一樣連 Prosody，但這支是給人
 * 手動操作用的 CLI，不是測試替身，兩者不共用程式碼（比照
 * tools/fake-auction.ts 不 import test/e2e/FakeAuctionServer.ts 的既有慣例）。
 *
 * 用法：
 *   npm run fake-auction:xmpp -- <itemId>            連本機 Prosody
 *   npm run fake-auction:xmpp:remote -- <itemId>     連 XMPP_SERVICE_URL/
 *                                                      XMPP_DOMAIN 指定的
 *                                                      Prosody（例如已部署
 *                                                      的 Back4app，見
 *                                                      poc/docs/xmpp-prosody-back4app-spike.md；
 *                                                      在 .env.local 設定）
 *
 * itemId 要對應到 Prosody 上已經用 `prosodyctl register` 註冊過的帳號
 * `auction-<itemId>`（ADR-0003 白名單），不是隨便一個字串都能用——這點跟
 * tools/fake-auction.ts（Redis channel 名稱可以任意取）不同。
 *
 * sniper 加入後，直接輸入要發布的 SOL 訊息本文即可，用法跟
 * tools/fake-auction.ts 一致。輸入 "quit" 中斷連線並結束程式。
 */
import { clearLine, createInterface, cursorTo, moveCursor } from 'node:readline';
import { Strophe, stx } from 'strophe.js';

import type { Connection, Stanza } from '@server/auctionsniper/xmpp/StropheTypes.ts';

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

function connect(jid: string, password: string, serviceUrl: string): Promise<Connection> {
  const connection = new Strophe.Connection(serviceUrl);
  return new Promise((resolve, reject) => {
    connection.connect(jid, password, status => {
      if (status === Strophe.Status.CONNECTED) {
        resolve(connection);
      } else if (
        status === Strophe.Status.AUTHFAIL ||
        status === Strophe.Status.CONNFAIL ||
        status === Strophe.Status.ERROR ||
        status === Strophe.Status.CONNTIMEOUT
      ) {
        reject(new Error(`Could not connect to ${serviceUrl}: Strophe.Status ${status}`));
      }
    });
  });
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
  const connection = await connect(jid, AUCTION_PASSWORD, serviceUrl);

  let sniperJID: string | null = null;

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

  // fake-auction-xmpp 這裡扮演拍賣現場，不指定 from 過濾（對應 Java 版
  // ChatManager 被動接受任何 sniper 主動建立的 chat），收到第一個訊息時記
  // 住對方完整 JID，之後發送 PRICE/CLOSE 都送給這個 JID。
  connection.addHandler(
    (stanza: Stanza) => {
      const body = stanza.getElementsByTagName('body')[0]?.textContent ?? '';
      const from = stanza.getAttribute('from');
      const fields = parseCommand(body);
      const command = fields.get('Command');

      if (command === 'JOIN') {
        sniperJID = from;
        printAsync(`Sniper joined: ${from}`);
      } else if (command === 'BID') {
        printAsync(`< received: Bid ${fields.get('Price')} from ${from}`);
      }
      return true;
    },
    null,
    'message',
    'chat'
  );

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

    if (!sniperJID) {
      console.log('(no sniper has joined yet)');
      promptAgain();
      return;
    }

    const rawMessage = `${SOL_VERSION_PREFIX}${trimmed}`;
    connection.send(
      stx`<message to="${sniperJID}" type="chat" xmlns="jabber:client"><body>${rawMessage}</body></message>`
    );
    console.log(`> sent: ${rawMessage}`);
    promptAgain();
  });

  rl.on('close', () => {
    connection.disconnect();
    process.exit(0);
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
