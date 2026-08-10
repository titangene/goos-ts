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

export class MqttAuction implements Auction {
  private readonly auctionEventListeners = Announcer.to<AuctionEventListener>();
  private readonly chat: MqttChat;
  private readonly failureReporter: MqttFailureReporter;
  private readonly sniperId: Bidder;

  constructor(connection: MqttConnection, itemId: string, failureReporter: MqttFailureReporter) {
    this.failureReporter = failureReporter;
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

  private sendMessage(message: string): void {
    try {
      this.chat.sendMessage(message);
    } catch (error) {
      console.error(error);
    }
  }
}
