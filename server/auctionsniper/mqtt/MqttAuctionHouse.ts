import { connectAsync } from 'mqtt';
import type { MqttClient } from 'mqtt';
import type { Bidder } from './Message.ts';
import { MqttAuction } from './MqttAuction.ts';
import { LoggingMqttFailureReporter } from './LoggingMqttFailureReporter.ts';
import { MqttAuctionException } from './MqttAuctionException.ts';
import { assertKnownUsername } from './Identity.ts';
import { commandsTopic, eventsTopic } from './Topic.ts';
import type { AuctionHouse } from '../AuctionHouse.ts';
import type { Auction } from '../Auction.ts';
import type { Item } from '../UserRequestListener.ts';

// 對應 Java 版 auctionsniper.xmpp.XMPPAuctionHouse。
//
// 建構子跟 Java 的 XMPPAuctionHouse(XMPPConnection) 比，多存了一個
// sniperId 欄位——Java 完全不存這個，XMPPAuction 要用「我是誰」時是靠
// connection.getUser() 現查，MQTT client 沒有這種連線層級的身分查詢，
// 只能在 AuctionHouse 這層存下來、往下傳。這是必要的分歧，不是遺漏。
export class MqttAuctionHouse implements AuctionHouse {
  // 型別對應 Java 版欄位宣告用的具體類別 LoggingXMPPFailureReporter，
  // 不是介面 XMPPFailureReporter。
  private readonly failureReporter: LoggingMqttFailureReporter = new LoggingMqttFailureReporter();

  private constructor(
    private readonly client: MqttClient,
    private readonly sniperId: Bidder,
  ) {}

  static async connect(brokerUrl: string, sniperId: Bidder): Promise<MqttAuctionHouse> {
    assertKnownUsername(sniperId);

    try {
      const client = await connectAsync(brokerUrl);
      return new MqttAuctionHouse(client, sniperId);
    } catch (cause) {
      throw new MqttAuctionException(`Could not connect to auction: ${String(cause)}`, cause);
    }
  }

  auctionFor(item: Item): Auction {
    return new MqttAuction(
      this.client,
      commandsTopic(item.identifier),
      eventsTopic(item.identifier),
      this.sniperId,
      this.failureReporter,
    );
  }

  async disconnect(): Promise<void> {
    await this.client.endAsync();
  }
}
