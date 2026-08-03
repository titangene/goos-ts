import { PriceSource } from '../AuctionEventListener.ts';
import type { AuctionEventListener } from '../AuctionEventListener.ts';
import type { Bidder } from './Message.ts';
import type { RedisFailureReporter } from './RedisFailureReporter.ts';

interface RawAuctionEvent {
  command?: unknown;
  currentPrice?: unknown;
  increment?: unknown;
  bidder?: unknown;
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== 'number') {
    throw new Error(`Missing value for ${field}`);
  }
  return value;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Missing value for ${field}`);
  }
  return value;
}

export class AuctionMessageTranslator {
  constructor(
    private readonly sniperId: Bidder,
    private readonly listener: AuctionEventListener,
    private readonly failureReporter: RedisFailureReporter,
  ) {}

  processMessage(rawMessage: string): void {
    try {
      this.translate(rawMessage);
    } catch (error) {
      this.failureReporter.cannotTranslateMessage(this.sniperId, rawMessage, error);
      this.listener.auctionFailed();
    }
  }

  private translate(rawMessage: string): void {
    const event = JSON.parse(rawMessage) as RawAuctionEvent;

    if (event.command === 'Close') {
      this.listener.auctionClosed();
    } else if (event.command === 'Price') {
      const currentPrice = requireNumber(event.currentPrice, 'currentPrice');
      const increment = requireNumber(event.increment, 'increment');
      const bidder = requireString(event.bidder, 'bidder');
      const priceSource =
        bidder === this.sniperId ? PriceSource.FromSniper : PriceSource.FromOtherBidder;
      this.listener.currentPrice(currentPrice, increment, priceSource);
    }
  }
}
