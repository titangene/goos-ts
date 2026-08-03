import type { RedisClientType } from 'redis';
import { Announcer } from '../util/Announcer.ts';
import { Message } from './Message.ts';
import type { Bidder } from './Message.ts';
import { RedisChat } from './RedisChat.ts';
import { AuctionMessageTranslator } from './AuctionMessageTranslator.ts';
import type { AuctionEventListener, PriceSource } from '../AuctionEventListener.ts';
import type { RedisFailureReporter } from './RedisFailureReporter.ts';
import type { Auction } from '../Auction.ts';

type RedisClient = RedisClientType;

export class RedisAuction implements Auction {
  private readonly chat: RedisChat;
  private readonly listeners = Announcer.to<AuctionEventListener>();
  private readonly translator: AuctionMessageTranslator;

  constructor(
    publisher: RedisClient,
    subscriber: RedisClient,
    itemId: string,
    private readonly bidder: Bidder,
    failureReporter: RedisFailureReporter,
  ) {
    const topic = `auction-${itemId}`;
    this.translator = new AuctionMessageTranslator(bidder, this.listeners.announce(), failureReporter);
    this.chat = new RedisChat(publisher, subscriber, topic, (rawMessage) =>
      this.translator.processMessage(rawMessage),
    );
    this.addAuctionEventListener(this.chatDisconnector());
  }

  bid(amount: number): void {
    this.chat.sendMessage(Message.Bid(this.bidder, amount));
  }

  join(): void {
    this.chat.sendMessage(Message.Join(this.bidder));
  }

  addAuctionEventListener(listener: AuctionEventListener): void {
    this.listeners.addListener(listener);
  }

  private chatDisconnector(): AuctionEventListener {
    return {
      auctionFailed: () => this.chat.unsubscribe(),
      auctionClosed: () => {},
      currentPrice: (_price: number, _increment: number, _priceSource: PriceSource) => {},
    };
  }
}
