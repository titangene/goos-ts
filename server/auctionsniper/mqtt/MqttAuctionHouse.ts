import { appendFileSync } from 'node:fs';
import { connectAsync } from 'mqtt';
import type { Bidder } from './Message.ts';
import { MqttAuction } from './MqttAuction.ts';
import { MqttConnection } from './MqttConnection.ts';
import { LoggingMqttFailureReporter } from './LoggingMqttFailureReporter.ts';
import { MqttAuctionException } from './MqttAuctionException.ts';
import { assertKnownUsername } from './Identity.ts';
import type { AuctionHouse } from '../AuctionHouse.ts';
import type { Auction } from '../Auction.ts';
import type { Item } from '../UserRequestListener.ts';

// 對應 Java 版 auctionsniper.xmpp.XMPPAuctionHouse。
export class MqttAuctionHouse implements AuctionHouse {
  // 對應 Java 版 XMPPAuctionHouse.LOG_FILE_NAME——這個常數在 Java 原始碼裡
  // 是宣告在 AuctionHouse，不是 LoggingXMPPFailureReporter，這裡對齊同樣的
  // 位置：由 AuctionHouse 決定要寫去哪裡，注入給 reporter，reporter 本身
  // 不知道檔案路徑。
  static readonly LOG_FILE_NAME = 'auction-sniper.log';

  // 型別對應 Java 版欄位宣告用的具體類別 LoggingXMPPFailureReporter，
  // 不是介面 XMPPFailureReporter。
  private readonly failureReporter: LoggingMqttFailureReporter = new LoggingMqttFailureReporter(
    (line) => appendFileSync(MqttAuctionHouse.LOG_FILE_NAME, `${line}\n`),
  );

  private constructor(private readonly connection: MqttConnection) {}

  static async connect(brokerUrl: string, sniperId: Bidder): Promise<MqttAuctionHouse> {
    assertKnownUsername(sniperId);

    try {
      const client = await connectAsync(brokerUrl);
      return new MqttAuctionHouse(new MqttConnection(client, sniperId));
    } catch (cause) {
      throw new MqttAuctionException(`Could not connect to auction: ${String(cause)}`, cause);
    }
  }

  auctionFor(item: Item): Auction {
    return new MqttAuction(this.connection, item.identifier, this.failureReporter);
  }

  async disconnect(): Promise<void> {
    await this.connection.client.endAsync();
  }
}
