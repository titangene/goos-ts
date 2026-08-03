import { createClient } from 'redis';
import type { Bidder } from './Message.ts';
import { RedisAuction } from './RedisAuction.ts';
import { LoggingFailureReporter } from './LoggingFailureReporter.ts';
import type { RedisFailureReporter } from './RedisFailureReporter.ts';
import { RedisAuctionException } from './RedisAuctionException.ts';
import type { AuctionHouse } from '../AuctionHouse.ts';
import type { Auction } from '../Auction.ts';
import type { Item } from '../UserRequestListener.ts';

export class RedisAuctionHouse implements AuctionHouse {
  private readonly subscriber = createClient({ url: process.env.REDIS_URL });
  private readonly publisher = createClient({ url: process.env.REDIS_URL });
  private readonly failureReporter: RedisFailureReporter = new LoggingFailureReporter();

  private constructor(private readonly sniperId: Bidder) {}

  static async connect(sniperId: Bidder): Promise<RedisAuctionHouse> {
    const house = new RedisAuctionHouse(sniperId);
    try {
      await Promise.all([house.subscriber.connect(), house.publisher.connect()]);
    } catch (cause) {
      throw new RedisAuctionException(`Could not connect to auction: ${String(cause)}`, cause);
    }
    return house;
  }

  auctionFor(item: Item): Auction {
    return new RedisAuction(
      this.publisher,
      this.subscriber,
      item.identifier,
      this.sniperId,
      this.failureReporter,
    );
  }

  async disconnect(): Promise<void> {
    await Promise.all([this.subscriber.quit(), this.publisher.quit()]);
  }
}
