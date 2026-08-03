import { createClient } from 'redis';
import { Message } from '../../server/auctionsniper/redis/Message.ts';
import type { AuctionMessage, Bidder } from '../../server/auctionsniper/redis/Message.ts';

class BlockingQueue {
  private readonly messages: AuctionMessage[] = [];

  push(message: AuctionMessage): void {
    this.messages.push(message);
  }

  async waitForMessageFrom(bidder: Bidder): Promise<AuctionMessage> {
    const deadline = Date.now() + 5000;

    while (Date.now() < deadline) {
      const message = this.messages.shift();

      if (message) {
        if ('bidder' in message && message.bidder === bidder) {
          return message;
        }
        // Not a match — e.g. our own published Price/Close message echoed back
        // on the shared topic. Keep looking rather than failing on it.
        continue;
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    throw new Error(`No message received from ${bidder} within timeout`);
  }
}

export class FakeAuctionServer {
  private readonly subscriber = createClient();
  private readonly publisher = createClient();
  private readonly topic: string;
  private readonly messageQueue = new BlockingQueue();

  constructor(public readonly itemId: string) {
    this.topic = `auction-${itemId}`;
  }

  async startSellingItem(): Promise<void> {
    await Promise.all([this.subscriber.connect(), this.publisher.connect()]);
    await this.subscriber.subscribe(this.topic, (jsonMessage) => {
      try {
        this.messageQueue.push(JSON.parse(jsonMessage) as AuctionMessage);
      } catch {
        // ignore messages that are intentionally malformed, e.g. sendInvalidMessage
      }
    });
  }

  async announceClosed(): Promise<void> {
    await this.publisher.publish(this.topic, JSON.stringify(Message.Close()));
  }

  async sendInvalidMessage(rawMessage: string): Promise<void> {
    await this.publisher.publish(this.topic, rawMessage);
  }

  async reportPrice(currentPrice: number, increment: number, bidder: Bidder): Promise<void> {
    await this.publisher.publish(
      this.topic,
      JSON.stringify(Message.Price(currentPrice, increment, bidder)),
    );
  }

  async hasReceivedJoinRequestFrom(bidder: Bidder): Promise<void> {
    const message = await this.messageQueue.waitForMessageFrom(bidder);
    if (message.command !== 'Join') {
      throw new Error(`expected a Join message, got ${message.command}`);
    }
  }

  async hasReceivedBid(bid: number, bidder: Bidder): Promise<void> {
    const message = await this.messageQueue.waitForMessageFrom(bidder);
    if (message.command !== 'Bid' || message.bid !== bid) {
      throw new Error(`expected a Bid message for ${bid}, got ${JSON.stringify(message)}`);
    }
  }

  async stop(): Promise<void> {
    await Promise.all([
      this.subscriber.isOpen ? this.subscriber.quit() : Promise.resolve(),
      this.publisher.isOpen ? this.publisher.quit() : Promise.resolve(),
    ]);
  }
}
