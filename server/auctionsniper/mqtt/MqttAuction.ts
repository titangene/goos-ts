import { Announcer } from '../util/Announcer.ts';
import { Message } from './Message.ts';
import type { MqttChannel } from './MqttChannel.ts';
import type { MqttConnection } from './MqttConnection.ts';
import { AuctionMessageTranslator } from './AuctionMessageTranslator.ts';
import type { AuctionEventListener, PriceSource } from '../AuctionEventListener.ts';
import type { MqttFailureReporter } from './MqttFailureReporter.ts';
import type { Auction } from '../Auction.ts';

export class MqttAuction implements Auction {
  private readonly auctionEventListeners = Announcer.to<AuctionEventListener>();
  private readonly channel: MqttChannel;
  private readonly failureReporter: MqttFailureReporter;
  private readonly sniperId: string;

  constructor(connection: MqttConnection, itemId: string, failureReporter: MqttFailureReporter) {
    this.failureReporter = failureReporter;
    this.sniperId = connection.getUser();
    const translator = this.translatorFor(connection);
    this.channel = connection.createChannel(itemId, translator);
    this.addAuctionEventListener(this.channelDisconnectorFor(translator));
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

  private channelDisconnectorFor(translator: AuctionMessageTranslator): AuctionEventListener {
    return {
      auctionFailed: () => this.channel.removeMessageListener(translator),
      auctionClosed: () => {},
      currentPrice: (_price: number, _increment: number, _priceSource: PriceSource) => {},
    };
  }

  private sendMessage(message: string): void {
    try {
      this.channel.sendMessage(message);
    } catch (error) {
      console.error(error);
    }
  }
}
