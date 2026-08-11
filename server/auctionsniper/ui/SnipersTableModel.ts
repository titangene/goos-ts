import { Column } from './Column.ts';
import type { AuctionSniper } from '../AuctionSniper.ts';
import type { SniperListener } from '../SniperListener.ts';
import type { SniperSnapshot } from '../SniperSnapshot.ts';
import type { SniperState } from '../SniperState.ts';
import type { PortfolioListener } from '../SniperPortfolio.ts';
import { Defect } from '../util/Defect.ts';

// 對應 Java 的 STATUS_TEXT，索引對應 SniperState 的 ordinal（宣告順序）。
const STATUS_TEXT: readonly string[] = [
  'Joining',
  'Bidding',
  'Winning',
  'Losing',
  'Lost',
  'Won',
  'Failed'
];

// 對應 Java 版 javax.swing.event.TableModelListener——只通知「有變動」，
// 監聽者要自己透過 getRowCount()／getColumnCount()／getValueAt() 重新讀取，
// 不像 Swing 有 TableModelEvent 帶行號範圍，這裡簡化成單一訊號。
export interface SnipersTableListener {
  onSnapshotsChanged(): void;
}

export class SnipersTableModel implements SniperListener, PortfolioListener {
  private snapshots: SniperSnapshot[] = [];
  private readonly listeners: SnipersTableListener[] = [];

  getColumnCount(): number {
    return Column.values.length;
  }

  getRowCount(): number {
    return this.snapshots.length;
  }

  getColumnName(column: number): string {
    return Column.at(column).name;
  }

  getValueAt(rowIndex: number, columnIndex: number): string | number {
    return Column.at(columnIndex).valueIn(this.snapshots[rowIndex]!);
  }

  static textFor(state: SniperState): string {
    return STATUS_TEXT[state]!;
  }

  sniperStateChanged(newSnapshot: SniperSnapshot): void {
    const index = this.snapshots.findIndex(s => s.isForSameItemAs(newSnapshot));
    if (index === -1) {
      throw new Defect(`No existing Sniper state for ${newSnapshot.itemId}`);
    }
    this.snapshots[index] = newSnapshot;
    this.notifyChange();
  }

  sniperAdded(sniper: AuctionSniper): void {
    this.addSniperSnapshot(sniper.getSnapshot());
    sniper.addSniperListener(this);
  }

  private addSniperSnapshot(newSniper: SniperSnapshot): void {
    this.snapshots.push(newSniper);
    this.notifyChange();
  }

  addListener(listener: SnipersTableListener): void {
    this.listeners.push(listener);
  }

  private notifyChange(): void {
    this.listeners.forEach(listener => listener.onSnapshotsChanged());
  }
}
