import type { AuctionEventListener } from './AuctionEventListener.ts';

export interface Auction {
  join(): void;
  bid(amount: number): void;
  addAuctionEventListener(listener: AuctionEventListener): void;
}
