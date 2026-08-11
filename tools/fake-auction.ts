/**
 * Interactive stand-in for a real auction house, so you can drive the
 * Auction Sniper app's UI by hand. Publishes/subscribes on the same
 * `auction:<itemId>:commands` and `auction:<itemId>:events` Redis channels
 * and SOL text protocol the tests' RedisFakeAuctionServer uses -- see
 * test/e2e/RedisFakeAuctionServer.ts.
 *
 * Usage:
 *   npm run fake-auction -- <itemId>            connect to local Redis
 *   npm run fake-auction:remote -- <itemId>     connect to REDIS_URL
 *                                                (e.g. a deployed Redis;
 *                                                 set REDIS_URL in .env.local)
 *
 * Commands (typed at the prompt once a sniper has joined):
 *   price <currentPrice> <increment> [bidder]   send a Price event
 *                                                (bidder defaults to "other bidder";
 *                                                 use "sniper" to simulate
 *                                                 the sniper's own bid landing)
 *   close                                        send a Close event
 *   quit                                         disconnect and exit
 */
import { clearLine, createInterface, cursorTo } from 'node:readline';
import { createClient } from 'redis';
import { Message } from '../server/auctionsniper/redis/Message.ts';
import { commandsChannel, eventsChannel } from '../server/auctionsniper/redis/Topic.ts';

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
  const itemId = args.find((arg) => !arg.startsWith('--'));
  if (!itemId) {
    console.error('usage: npm run fake-auction -- <itemId> [--remote]');
    process.exit(1);
  }

  if (remote && !process.env.REDIS_URL) {
    console.error('--remote requires REDIS_URL to be set (e.g. via --env-file=.env.local)');
    process.exit(1);
  }
  const redisUrl = remote ? process.env.REDIS_URL! : 'redis://localhost:6379';

  const publisher = createClient({ url: redisUrl });
  const subscriber = createClient({ url: redisUrl });
  await Promise.all([publisher.connect(), subscriber.connect()]);
  const commands = commandsChannel(itemId);
  const events = eventsChannel(itemId);

  let sniperJoined = false;

  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: '> ' });

  // Redis pub/sub messages arrive whenever the sniper feels like sending
  // them, independent of the readline prompt. Without clearing the
  // in-progress "> " line first, an async message lands mid-prompt and
  // swallows it, leaving the next line the user types with no visible
  // prompt at all.
  function printAsync(message: string): void {
    clearLine(process.stdout, 0);
    cursorTo(process.stdout, 0);
    console.log(message);
    rl.prompt(true);
  }

  await subscriber.subscribe(commands, (rawMessage) => {
    const fields = parseCommand(rawMessage);
    const command = fields.get('Command');
    const bidder = fields.get('Bidder');

    if (command === 'JOIN') {
      sniperJoined = true;
      printAsync(`Sniper joined: ${bidder}`);
    } else if (command === 'BID') {
      printAsync(`< received: Bid ${fields.get('Price')} from ${bidder}`);
    }
  });

  console.log(`Selling item ${itemId} on ${redisUrl}. Waiting for a sniper to join...`);
  console.log('Commands: price <currentPrice> <increment> [bidder] | close | quit');

  rl.prompt();

  rl.on('line', (line) => {
    void (async () => {
      const trimmed = line.trim();
      if (!trimmed) {
        rl.prompt();
        return;
      }

      if (!sniperJoined && trimmed !== 'quit') {
        console.log('(no sniper has joined yet)');
        rl.prompt();
        return;
      }

      const parts = trimmed.split(/\s+/);
      switch (parts[0]) {
        case 'price': {
          if (parts.length < 3) {
            console.log('usage: price <currentPrice> <increment> [bidder]');
            break;
          }
          const currentPrice = Number(parts[1]);
          const increment = Number(parts[2]);
          const bidder = parts[3] ?? 'other bidder';
          const rawMessage = Message.encode(Message.Price(currentPrice, increment, bidder));
          await publisher.publish(events, rawMessage);
          console.log(`> sent: ${rawMessage}`);
          break;
        }
        case 'close': {
          const rawMessage = Message.encode(Message.Close());
          await publisher.publish(events, rawMessage);
          console.log(`> sent: ${rawMessage}`);
          break;
        }
        case 'quit':
          rl.close();
          return;
        default:
          console.log(`unknown command: ${parts[0]}`);
      }
      rl.prompt();
    })();
  });

  rl.on('close', () => {
    void Promise.all([publisher.quit(), subscriber.quit()]).then(() => process.exit(0));
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
