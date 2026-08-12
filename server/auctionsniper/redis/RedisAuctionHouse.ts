import { appendFileSync } from 'node:fs';

import type { Logger } from './Logger.ts';
import { LoggingRedisFailureReporter } from './LoggingRedisFailureReporter.ts';
import { RedisAuction } from './RedisAuction.ts';
import { RedisAuctionException } from './RedisAuctionException.ts';
import { RedisConnection } from './RedisConnection.ts';
import type { Auction } from '../Auction.ts';
import type { AuctionHouse } from '../AuctionHouse.ts';
import type { Item } from '../UserRequestListener.ts';

export class RedisAuctionHouse implements AuctionHouse {
  static readonly LOG_FILE_NAME = 'auction-sniper.log';

  private readonly connection: RedisConnection;
  private readonly failureReporter: LoggingRedisFailureReporter;

  private constructor(connection: RedisConnection) {
    this.connection = connection;
    this.failureReporter = new LoggingRedisFailureReporter(this.makeLogger());
  }

  auctionFor(item: Item): Auction {
    return new RedisAuction(this.connection, item.identifier, this.failureReporter);
  }

  async disconnect(): Promise<void> {
    await this.connection.disconnect();
  }

  static async connect(redisUrl: string, sniperId: string): Promise<RedisAuctionHouse> {
    const connection = new RedisConnection(redisUrl);
    try {
      await connection.connect();
      connection.login(sniperId);
      return new RedisAuctionHouse(connection);
    } catch (cause) {
      throw new RedisAuctionException(`Could not connect to auction: ${String(cause)}`, cause);
    }
  }

  private makeLogger(): Logger {
    return {
      severe: message => appendFileSync(RedisAuctionHouse.LOG_FILE_NAME, `${message}\n`)
    };
  }
}
