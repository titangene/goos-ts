import type { Auction } from './Auction.ts';
import type { Item } from './UserRequestListener.ts';

export interface AuctionHouse {
  auctionFor(item: Item): Auction;
}
