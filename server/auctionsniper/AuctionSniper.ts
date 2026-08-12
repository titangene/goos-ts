import type { Auction } from './Auction.ts';
import { PriceSource } from './AuctionEventListener.ts';
import type { AuctionEventListener } from './AuctionEventListener.ts';
import type { SniperListener } from './SniperListener.ts';
import { SniperSnapshot } from './SniperSnapshot.ts';
import type { Item } from './UserRequestListener.ts';
import { Announcer } from './util/Announcer.ts';

export class AuctionSniper implements AuctionEventListener {
  private readonly listeners = Announcer.to<SniperListener>();
  private readonly auction: Auction;
  private snapshot: SniperSnapshot;
  private readonly item: Item;

  constructor(item: Item, auction: Auction) {
    this.item = item;
    this.auction = auction;
    this.snapshot = SniperSnapshot.joining(item.identifier);
  }

  addSniperListener(listener: SniperListener): void {
    this.listeners.addListener(listener);
  }

  auctionClosed(): void {
    this.snapshot = this.snapshot.closed();
    this.notifyChange();
  }

  auctionFailed(): void {
    this.snapshot = this.snapshot.failed();
    this.notifyChange();
  }

  currentPrice(price: number, increment: number, priceSource: PriceSource): void {
    switch (priceSource) {
      case PriceSource.FromSniper:
        this.snapshot = this.snapshot.winning(price);
        break;
      case PriceSource.FromOtherBidder: {
        const bid = price + increment;
        if (this.item.allowsBid(bid)) {
          this.auction.bid(bid);
          this.snapshot = this.snapshot.bidding(price, bid);
        } else {
          this.snapshot = this.snapshot.losing(price);
        }
        break;
      }
    }
    this.notifyChange();
  }

  getSnapshot(): SniperSnapshot {
    return this.snapshot;
  }

  private notifyChange(): void {
    this.listeners.announce().sniperStateChanged(this.snapshot);
  }
}
