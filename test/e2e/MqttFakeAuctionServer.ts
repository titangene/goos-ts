import { connectAsync } from 'mqtt';
import type { MqttClient } from 'mqtt';
import { Message } from '../../server/auctionsniper/mqtt/Message.ts';
import type { Bidder } from '../../server/auctionsniper/mqtt/Message.ts';
import { MqttChat } from '../../server/auctionsniper/mqtt/MqttChat.ts';
import { commandsTopic, eventsTopic } from '../../server/auctionsniper/mqtt/Topic.ts';

// 見 docs/differences-from-java.md #3。
interface ReceivedCommand {
  command: string;
  bidder: Bidder;
  price?: number;
}

function parseCommand(messageBody: string): ReceivedCommand | undefined {
  const fields = new Map<string, string>();
  for (const field of messageBody.split(';')) {
    const trimmed = field.trim();
    if (!trimmed) continue;
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) continue;
    fields.set(trimmed.slice(0, colonIndex).trim(), trimmed.slice(colonIndex + 1).trim());
  }
  const command = fields.get('Command');
  const bidder = fields.get('Bidder');
  if (command === undefined || bidder === undefined) return undefined;
  const price = fields.get('Price');
  return { command, bidder, price: price === undefined ? undefined : Number(price) };
}

class BlockingQueue {
  private readonly commands: ReceivedCommand[] = [];

  push(command: ReceivedCommand): void {
    this.commands.push(command);
  }

  async waitForCommandFrom(bidder: Bidder): Promise<ReceivedCommand> {
    const deadline = Date.now() + 5000;

    while (Date.now() < deadline) {
      const command = this.commands.shift();

      if (command) {
        if (command.bidder === bidder) {
          return command;
        }
        continue;
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    throw new Error(`No message received from ${bidder} within timeout`);
  }
}

export class MqttFakeAuctionServer {
  static readonly BROKER_URL = process.env.MQTT_BROKER_URL ?? 'mqtt://localhost:1883';

  private client!: MqttClient;
  private chat!: MqttChat;
  private readonly messageQueue = new BlockingQueue();

  constructor(public readonly itemId: string) {}

  async startSellingItem(): Promise<void> {
    this.client = await connectAsync(MqttFakeAuctionServer.BROKER_URL);
    this.chat = new MqttChat(
      this.client,
      eventsTopic(this.itemId),
      commandsTopic(this.itemId),
      (rawMessage) => {
        const command = parseCommand(rawMessage);
        if (command) {
          this.messageQueue.push(command);
        }
      },
    );
  }

  async sendInvalidMessage(rawMessage: string): Promise<void> {
    this.chat.sendMessage(rawMessage);
  }

  async reportPrice(currentPrice: number, increment: number, bidder: Bidder): Promise<void> {
    this.chat.sendMessage(Message.encode(Message.Price(currentPrice, increment, bidder)));
  }

  async hasReceivedJoinRequestFrom(bidder: Bidder): Promise<void> {
    const command = await this.messageQueue.waitForCommandFrom(bidder);
    if (command.command !== 'JOIN') {
      throw new Error(`expected a JOIN message, got ${command.command}`);
    }
  }

  async hasReceivedBid(bid: number, bidder: Bidder): Promise<void> {
    const command = await this.messageQueue.waitForCommandFrom(bidder);
    if (command.command !== 'BID' || command.price !== bid) {
      throw new Error(`expected a BID message for ${bid}, got ${JSON.stringify(command)}`);
    }
  }

  async announceClosed(): Promise<void> {
    this.chat.sendMessage(Message.encode(Message.Close()));
  }

  async stop(): Promise<void> {
    if (this.client?.connected) {
      await this.client.endAsync();
    }
  }
}
