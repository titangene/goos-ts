import { Announcer } from './util/Announcer.ts';
import { PriceSource } from './AuctionEventListener.ts';
import type { AuctionEventListener } from './AuctionEventListener.ts';
import type { Auction } from './Auction.ts';
import type { SniperListener } from './SniperListener.ts';
import { SniperSnapshot } from './SniperSnapshot.ts';
import type { Item } from './UserRequestListener.ts';

export class AuctionSniper implements AuctionEventListener {
  private readonly listeners = Announcer.to<SniperListener>();
  private snapshot: SniperSnapshot;

  constructor(
    private readonly item: Item,
    private readonly auction: Auction,
  ) {
    this.snapshot = SniperSnapshot.joining(item.identifier);
    this.notifyChange();
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
