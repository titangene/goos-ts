/**
 * 互動式的假拍賣現場，讓你可以手動操作 Auction Sniper app 的 UI。跟
 * test/e2e/RedisFakeAuctionServer.ts 用同一套 `auction:<itemId>:commands`／
 * `auction:<itemId>:events` Redis channel 與 SOL 純文字協定收發訊息。
 *
 * 用法：
 *   npm run fake-auction -- <itemId>            連本機 Redis
 *   npm run fake-auction:remote -- <itemId>     連 REDIS_URL 指定的 Redis
 *                                                （例如已部署的 Redis；
 *                                                 在 .env.local 設定 REDIS_URL）
 *
 * sniper 加入後，直接輸入要發布的 SOL 訊息本文即可——只省略固定會自動幫你
 * 補上的 "SOLVersion: 1.1; " 前綴。例如：
 *   Event: PRICE; CurrentPrice: 90; Increment: 5; Bidder: other bidder;
 *   Event: CLOSE;
 * 輸入 "quit" 中斷連線並結束程式。
 */
import { clearLine, createInterface, cursorTo, moveCursor } from 'node:readline';

import type { MessageListener } from '@server/auctionsniper/redis/MessageListener.ts';
import { RedisChannel } from '@server/auctionsniper/redis/RedisChannel.ts';
import { RedisConnection } from '@server/auctionsniper/redis/RedisConnection.ts';
import { commandsChannel, eventsChannel } from '@server/auctionsniper/redis/Topic.ts';

const SOL_VERSION_PREFIX = 'SOLVersion: 1.1; ';

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
    console.error('usage: npm run fake-auction -- <itemId> [--remote]');
    process.exit(1);
  }

  if (remote && !process.env.REDIS_URL) {
    console.error('--remote requires REDIS_URL to be set (e.g. via --env-file=.env.local)');
    process.exit(1);
  }
  const redisUrl = remote ? process.env.REDIS_URL! : 'redis://localhost:6379';

  const connection = new RedisConnection(redisUrl);
  await connection.connect();

  let sniperJoined = false;

  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: '>>> ' });

  // 每次顯示提示字元前先印一個空白行，讓這一輪的輸出跟下一次輸入之間有
  // 視覺區隔，">>> " 才不會緊接著上一行輸出。
  function promptAgain(preserveCursor = false): void {
    console.log();
    rl.prompt(preserveCursor);
  }

  // Redis pub/sub 訊息什麼時候到達完全由 sniper 決定，跟 readline 的提示
  // 字元無關。清掉的不只是目前這行 ">>> "，還要連同上面 promptAgain() 留
  // 下的空白行一起清掉，這樣像「sent」後面緊接著到的「received」才會直接
  // 接在上一行輸出下面，不會被硬插一個空白行；同時也避免非同步訊息直接疊
  // 印在還沒被清掉的提示字元上，導致下一行使用者輸入看起來沒有提示字元。
  function printAsync(message: string): void {
    clearLine(process.stdout, 0);
    cursorTo(process.stdout, 0);
    moveCursor(process.stdout, 0, -1);
    clearLine(process.stdout, 0);
    console.log(message);
    promptAgain(true);
  }

  // fake-auction 這裡扮演拍賣現場，不是 sniper，所以不呼叫
  // RedisConnection.login()／getUser()（不需要身分白名單）。channel 也直接
  // 用 connection.publisher／connection.subscriber 反向建構——發布到
  // events channel、訂閱 commands channel，跟 RedisConnection.createChannel()
  // 內建給 sniper 端用的方向正好相反，作法對照
  // test/e2e/RedisFakeAuctionServer.ts。
  const listener: MessageListener = {
    processMessage(_channel: RedisChannel, rawMessage: string): void {
      const fields = parseCommand(rawMessage);
      const command = fields.get('Command');
      const bidder = fields.get('Bidder');

      if (command === 'JOIN') {
        sniperJoined = true;
        printAsync(`Sniper joined: ${bidder}`);
      } else if (command === 'BID') {
        printAsync(`< received: Bid ${fields.get('Price')} from ${bidder}`);
      }
    }
  };

  const channel = new RedisChannel(
    connection.publisher,
    connection.subscriber,
    eventsChannel(itemId),
    commandsChannel(itemId),
    listener
  );
  await channel.ready;

  console.log(`Selling item ${itemId} on ${redisUrl}. Waiting for a sniper to join...`);
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

    if (!sniperJoined) {
      console.log('(no sniper has joined yet)');
      promptAgain();
      return;
    }

    const rawMessage = `${SOL_VERSION_PREFIX}${trimmed}`;
    channel.sendMessage(rawMessage);
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
