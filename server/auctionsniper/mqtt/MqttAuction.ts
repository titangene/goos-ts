import { Announcer } from '../util/Announcer.ts';
import { Message } from './Message.ts';
import type { Bidder } from './Message.ts';
import { MqttChat } from './MqttChat.ts';
import type { MqttConnection } from './MqttConnection.ts';
import { AuctionMessageTranslator } from './AuctionMessageTranslator.ts';
import type { AuctionEventListener, PriceSource } from '../AuctionEventListener.ts';
import type { MqttFailureReporter } from './MqttFailureReporter.ts';
import type { Auction } from '../Auction.ts';
import { commandsTopic, eventsTopic } from './Topic.ts';

// 對應 Java 版 auctionsniper.xmpp.XMPPAuction。
//
// 建構子跟 Java 的 XMPPAuction(XMPPConnection, String auctionJID,
// XMPPFailureReporter) 現在對得更齊：itemId 取代 Java 已經算好的單一
// auctionJID 字串，topic 字串（ADR-0006 的 commandsTopic/eventsTopic）
// 在建構子內部算，呼叫端不用自己處理 topic 格式；sniperId 透過
// connection.getUser() 取得，不再是額外傳入的參數，對應 Java 版
// translatorFor(connection) 呼叫 connection.getUser() 的用法。
export class MqttAuction implements Auction {
  private readonly auctionEventListeners = Announcer.to<AuctionEventListener>();
  private readonly chat: MqttChat;
  private readonly sniperId: Bidder;

  constructor(
    connection: MqttConnection,
    itemId: string,
    private readonly failureReporter: MqttFailureReporter,
  ) {
    this.sniperId = connection.getUser();
    const translator = this.translatorFor(connection);
    this.chat = new MqttChat(
      connection.client,
      commandsTopic(itemId),
      eventsTopic(itemId),
      (messageBody) => translator.processMessage(messageBody),
    );
    this.addAuctionEventListener(this.chatDisconnectorFor());
  }

  bid(amount: number): void {
    this.sendMessage(Message.encode(Message.Bid(this.sniperId, amount)));
  }

  join(): void {
    this.sendMessage(Message.encode(Message.Join(this.sniperId)));
  }

  addAuctionEventListener(listener: AuctionEventListener): void {
    this.auctionEventListeners.addListener(listener);
  }

  private translatorFor(connection: MqttConnection): AuctionMessageTranslator {
    return new AuctionMessageTranslator(
      connection.getUser(),
      this.auctionEventListeners.announce(),
      this.failureReporter,
    );
  }

  private chatDisconnectorFor(): AuctionEventListener {
    return {
      auctionFailed: () => this.chat.unsubscribe(),
      auctionClosed: () => {},
      currentPrice: (_price: number, _increment: number, _priceSource: PriceSource) => {},
    };
  }

  // 對應 Java 版 XMPPAuction.sendMessage(String)：發送失敗不拋出給呼叫端，
  // 印出錯誤即可（Java 版用 e.printStackTrace()）。
  private sendMessage(message: string): void {
    try {
      this.chat.sendMessage(message);
    } catch (error) {
      console.error(error);
    }
  }
}
