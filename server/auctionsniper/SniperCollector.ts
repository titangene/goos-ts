import type { AuctionSniper } from './AuctionSniper.ts';

export interface SniperCollector {
  addSniper(sniper: AuctionSniper): void;
}
