import type { MqttClient } from 'mqtt';
import { Announcer } from '../util/Announcer.ts';
import { Message } from './Message.ts';
import type { Bidder } from './Message.ts';
import { MqttChat } from './MqttChat.ts';
import { AuctionMessageTranslator } from './AuctionMessageTranslator.ts';
import type { AuctionEventListener, PriceSource } from '../AuctionEventListener.ts';
import type { MqttFailureReporter } from './MqttFailureReporter.ts';
import type { Auction } from '../Auction.ts';

// 對應 Java 版 auctionsniper.xmpp.XMPPAuction。
//
// 建構子跟 Java 的 XMPPAuction(XMPPConnection, String auctionJID,
// XMPPFailureReporter) 比，多兩個必要的分歧：(1) commandsTopic/eventsTopic
// 兩個字串，取代 Java 單一的 auctionJID——MQTT 沒有 XMPP 1:1 chat，要靠
// ADR-0006 的兩個 topic 重現同樣的隔離；(2) sniperId 這個欄位，Java 完全
// 不需要存（XMPPAuction 要用「我是誰」時，是靠 connection.getUser() 現查，
// MQTT client 沒有這種東西，只能自己存、自己塞進訊息內容裡，這點在
// Message.ts 開頭已有說明）。命名沿用 AuctionMessageTranslator 建構子參數
// 的 sniperId，跟 Message.ts 的 Bidder 型別（代表「某則訊息記載的出價者」，
// 可能是我、也可能是別人）分開，避免搞混。
export class MqttAuction implements Auction {
  private readonly auctionEventListeners = Announcer.to<AuctionEventListener>();
  private readonly chat: MqttChat;

  constructor(
    client: MqttClient,
    commandsTopic: string,
    eventsTopic: string,
    private readonly sniperId: Bidder,
    private readonly failureReporter: MqttFailureReporter,
  ) {
    const translator = this.translatorFor();
    this.chat = new MqttChat(client, commandsTopic, eventsTopic, (messageBody) =>
      translator.processMessage(messageBody),
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

  private translatorFor(): AuctionMessageTranslator {
    return new AuctionMessageTranslator(
      this.sniperId,
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
