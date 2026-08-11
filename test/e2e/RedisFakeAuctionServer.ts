import { RedisChannel } from '../../server/auctionsniper/redis/RedisChannel.ts';
import { RedisConnection } from '../../server/auctionsniper/redis/RedisConnection.ts';
import { Message } from '../../server/auctionsniper/redis/Message.ts';
import type { MessageListener } from '../../server/auctionsniper/redis/MessageListener.ts';
import { commandsChannel, eventsChannel } from '../../server/auctionsniper/redis/Topic.ts';

export class RedisFakeAuctionServer {
  static readonly REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

  private readonly messageListener = new SingleMessageListener();
  private readonly connection: RedisConnection;
  private channel!: RedisChannel;

  constructor(public readonly itemId: string) {
    this.connection = new RedisConnection(RedisFakeAuctionServer.REDIS_URL);
  }

  async startSellingItem(): Promise<void> {
    await this.connection.connect();
    this.channel = new RedisChannel(
      this.connection.publisher,
      this.connection.subscriber,
      eventsChannel(this.itemId),
      commandsChannel(this.itemId),
      this.messageListener
    );
  }

  async sendInvalidMessageContaining(brokenMessage: string): Promise<void> {
    this.channel.sendMessage(brokenMessage);
  }

  async reportPrice(price: number, increment: number, bidder: string): Promise<void> {
    this.channel.sendMessage(Message.encode(Message.Price(price, increment, bidder)));
  }

  async hasReceivedJoinRequestFrom(sniperId: string): Promise<void> {
    await this.receivesAMessageMatching(Message.encode(Message.Join(sniperId)));
  }

  async hasReceivedBid(bid: number, sniperId: string): Promise<void> {
    await this.receivesAMessageMatching(Message.encode(Message.Bid(sniperId, bid)));
  }

  private async receivesAMessageMatching(expectedMessage: string): Promise<void> {
    const messageBody = await this.messageListener.receivesAMessage();
    if (messageBody !== expectedMessage) {
      throw new Error(`expected message "${expectedMessage}", got "${messageBody}"`);
    }
  }

  async announceClosed(): Promise<void> {
    this.channel.sendMessage(Message.encode(Message.Close()));
  }

  async stop(): Promise<void> {
    if (this.connection.publisher.isOpen) {
      await this.connection.disconnect();
    }
  }
}

class SingleMessageListener implements MessageListener {
  private readonly messages: string[] = [];

  processMessage(_channel: RedisChannel, messageBody: string): void {
    this.messages.push(messageBody);
  }

  async receivesAMessage(): Promise<string> {
    const deadline = Date.now() + 5000;

    while (Date.now() < deadline) {
      const messageBody = this.messages.shift();
      if (messageBody !== undefined) {
        return messageBody;
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    throw new Error('No message received within timeout');
  }
}
