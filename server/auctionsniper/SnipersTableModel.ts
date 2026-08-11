import type { AuctionSniper } from './AuctionSniper.ts';
import type { SniperListener } from './SniperListener.ts';
import type { SniperSnapshot } from './SniperSnapshot.ts';
import type { PortfolioListener } from './SniperPortfolio.ts';
import { Defect } from './util/Defect.ts';

export interface SnipersTableListener {
  onSnapshotsChanged(snapshots: SniperSnapshot[]): void;
}

export class SnipersTableModel implements PortfolioListener, SniperListener {
  private snapshots: SniperSnapshot[] = [];
  private readonly listeners: SnipersTableListener[] = [];

  addListener(listener: SnipersTableListener): void {
    this.listeners.push(listener);
  }

  sniperAdded(sniper: AuctionSniper): void {
    this.snapshots.push(sniper.getSnapshot());
    sniper.addSniperListener(this);
    this.notifyChange();
  }

  sniperStateChanged(snapshot: SniperSnapshot): void {
    const index = this.snapshots.findIndex((s) => s.isForSameItemAs(snapshot));
    if (index === -1) {
      throw new Defect(`No existing Sniper state for ${snapshot.itemId}`);
    }
    this.snapshots[index] = snapshot;
    this.notifyChange();
  }

  getSnapshots(): SniperSnapshot[] {
    return this.snapshots;
  }

  private notifyChange(): void {
    this.listeners.forEach((listener) => listener.onSnapshotsChanged(this.snapshots));
  }
}
