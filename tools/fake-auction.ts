/**
 * Interactive stand-in for a real auction house, so you can drive the
 * Auction Sniper app's UI by hand. Publishes/subscribes on the same
 * `auction-<itemId>` Redis topic and JSON protocol the tests' FakeAuctionServer
 * uses -- see test/e2e/FakeAuctionServer.ts.
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
 *                                                 use "sniper@localhost" to simulate
 *                                                 the sniper's own bid landing)
 *   close                                        send a Close event
 *   quit                                         disconnect and exit
 */
import { createInterface } from 'node:readline';
import { createClient } from 'redis';
import { Message } from '../server/auctionsniper/redis/Message.ts';
import type { AuctionMessage } from '../server/auctionsniper/redis/Message.ts';

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
  const redisUrl = remote ? process.env.REDIS_URL : undefined;

  const topic = `auction-${itemId}`;
  const publisher = createClient({ url: redisUrl });
  const subscriber = createClient({ url: redisUrl });
  await Promise.all([publisher.connect(), subscriber.connect()]);

  let sniperJoined = false;

  await subscriber.subscribe(topic, (rawMessage) => {
    let message: AuctionMessage;
    try {
      message = JSON.parse(rawMessage) as AuctionMessage;
    } catch {
      return;
    }

    if (message.command === 'Join') {
      sniperJoined = true;
      console.log(`Sniper joined: ${message.bidder}`);
    } else if (message.command === 'Bid') {
      console.log(`< received: Bid ${message.bid} from ${message.bidder}`);
    }
  });

  console.log(`Logged in as auction-${itemId}. Waiting for a sniper to join...`);
  console.log('Commands: price <currentPrice> <increment> [bidder] | close | quit');

  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: '> ' });
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
          const message = Message.Price(currentPrice, increment, bidder);
          await publisher.publish(topic, JSON.stringify(message));
          console.log(`> sent: ${JSON.stringify(message)}`);
          break;
        }
        case 'close': {
          const message = Message.Close();
          await publisher.publish(topic, JSON.stringify(message));
          console.log(`> sent: ${JSON.stringify(message)}`);
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
