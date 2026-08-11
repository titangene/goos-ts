import { SniperState, whenAuctionClosed } from './SniperState.ts';

export class SniperSnapshot {
  constructor(
    public readonly itemId: string,
    public readonly lastPrice: number = 0,
    public readonly lastBid: number = 0,
    public readonly state: SniperState = SniperState.JOINING,
  ) {}

  static joining(itemId: string): SniperSnapshot {
    return new SniperSnapshot(itemId, 0, 0, SniperState.JOINING);
  }

  bidding(newLastPrice: number, newLastBid: number): SniperSnapshot {
    return new SniperSnapshot(this.itemId, newLastPrice, newLastBid, SniperState.BIDDING);
  }

  winning(newLastPrice: number): SniperSnapshot {
    return new SniperSnapshot(this.itemId, newLastPrice, this.lastBid, SniperState.WINNING);
  }

  losing(newLastPrice: number): SniperSnapshot {
    return new SniperSnapshot(this.itemId, newLastPrice, this.lastBid, SniperState.LOSING);
  }

  closed(): SniperSnapshot {
    return new SniperSnapshot(
      this.itemId,
      this.lastPrice,
      this.lastBid,
      whenAuctionClosed(this.state),
    );
  }

  failed(): SniperSnapshot {
    return new SniperSnapshot(this.itemId, 0, 0, SniperState.FAILED);
  }

  isForSameItemAs(other: SniperSnapshot): boolean {
    return this.itemId === other.itemId;
  }
}
