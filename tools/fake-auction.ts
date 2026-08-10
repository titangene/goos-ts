/**
 * Interactive stand-in for a real auction house, so you can drive the
 * Auction Sniper app's UI by hand. Publishes/subscribes on the same
 * `auction/<itemId>/commands` and `auction/<itemId>/events` MQTT topics and
 * SOL text protocol the tests' MqttFakeAuctionServer uses -- see
 * test/e2e/MqttFakeAuctionServer.ts.
 *
 * Usage:
 *   npm run fake-auction -- <itemId>            connect to local Mosquitto
 *   npm run fake-auction:remote -- <itemId>     connect to MQTT_BROKER_URL
 *                                                (e.g. a deployed Mosquitto;
 *                                                 set MQTT_BROKER_URL in .env.local)
 *
 * Commands (typed at the prompt once a sniper has joined):
 *   price <currentPrice> <increment> [bidder]   send a Price event
 *                                                (bidder defaults to "other bidder";
 *                                                 use "sniper" to simulate
 *                                                 the sniper's own bid landing)
 *   close                                        send a Close event
 *   quit                                         disconnect and exit
 */
import { createInterface } from 'node:readline';
import { connectAsync } from 'mqtt';
import { Message } from '../server/auctionsniper/mqtt/Message.ts';
import { commandsTopic, eventsTopic } from '../server/auctionsniper/mqtt/Topic.ts';

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

  if (remote && !process.env.MQTT_BROKER_URL) {
    console.error('--remote requires MQTT_BROKER_URL to be set (e.g. via --env-file=.env.local)');
    process.exit(1);
  }
  const brokerUrl = remote ? process.env.MQTT_BROKER_URL! : 'mqtt://localhost:1883';

  const client = await connectAsync(brokerUrl);
  const commands = commandsTopic(itemId);
  const events = eventsTopic(itemId);

  let sniperJoined = false;

  client.on('message', (topic, payload) => {
    if (topic !== commands) return;

    const fields = parseCommand(payload.toString());
    const command = fields.get('Command');
    const bidder = fields.get('Bidder');

    if (command === 'JOIN') {
      sniperJoined = true;
      console.log(`Sniper joined: ${bidder}`);
    } else if (command === 'BID') {
      console.log(`< received: Bid ${fields.get('Price')} from ${bidder}`);
    }
  });
  await client.subscribeAsync(commands, { qos: 1 });

  console.log(`Selling item ${itemId} on ${brokerUrl}. Waiting for a sniper to join...`);
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
          const rawMessage = Message.encode(Message.Price(currentPrice, increment, bidder));
          await client.publishAsync(events, rawMessage, { qos: 1 });
          console.log(`> sent: ${rawMessage}`);
          break;
        }
        case 'close': {
          const rawMessage = Message.encode(Message.Close());
          await client.publishAsync(events, rawMessage, { qos: 1 });
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
    void client.endAsync().then(() => process.exit(0));
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
