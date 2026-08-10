import { appendFileSync } from 'node:fs';
import { MqttAuction } from './MqttAuction.ts';
import { MqttConnection } from './MqttConnection.ts';
import { LoggingMqttFailureReporter } from './LoggingMqttFailureReporter.ts';
import { MqttAuctionException } from './MqttAuctionException.ts';
import type { Logger } from './Logger.ts';
import type { Bidder } from './Message.ts';
import type { AuctionHouse } from '../AuctionHouse.ts';
import type { Auction } from '../Auction.ts';
import type { Item } from '../UserRequestListener.ts';

export class MqttAuctionHouse implements AuctionHouse {
  static readonly LOG_FILE_NAME = 'auction-sniper.log';

  private readonly connection: MqttConnection;
  private readonly failureReporter: LoggingMqttFailureReporter;

  private constructor(connection: MqttConnection) {
    this.connection = connection;
    this.failureReporter = new LoggingMqttFailureReporter(this.makeLogger());
  }

  auctionFor(item: Item): Auction {
    return new MqttAuction(this.connection, item.identifier, this.failureReporter);
  }

  async disconnect(): Promise<void> {
    await this.connection.disconnect();
  }

  static async connect(brokerUrl: string, sniperId: Bidder): Promise<MqttAuctionHouse> {
    const connection = new MqttConnection(brokerUrl);
    try {
      await connection.connect();
      connection.login(sniperId);
      return new MqttAuctionHouse(connection);
    } catch (cause) {
      throw new MqttAuctionException(`Could not connect to auction: ${String(cause)}`, cause);
    }
  }

  private makeLogger(): Logger {
    return {
      severe: (message) => appendFileSync(MqttAuctionHouse.LOG_FILE_NAME, `${message}\n`),
    };
  }
}
