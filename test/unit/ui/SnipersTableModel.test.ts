import { describe, expect, it, vi } from 'vitest';
import { SnipersTableModel } from '../../../server/auctionsniper/ui/SnipersTableModel.ts';
import { Column } from '../../../server/auctionsniper/ui/Column.ts';
import { AuctionSniper } from '../../../server/auctionsniper/AuctionSniper.ts';
import { SniperSnapshot } from '../../../server/auctionsniper/SniperSnapshot.ts';
import { SniperState } from '../../../server/auctionsniper/SniperState.ts';
import { Defect } from '../../../server/auctionsniper/util/Defect.ts';
import type { Auction } from '../../../server/auctionsniper/Auction.ts';
import { Item } from '../../../server/auctionsniper/UserRequestListener.ts';

const ITEM_ID = 'item 0';

describe('the snipers table model', () => {
  it('has enough columns', () => {
    const model = new SnipersTableModel();

    expect(model.getColumnCount()).toBe(Column.values.length);
  });

  it('sets up column headings', () => {
    const model = new SnipersTableModel();

    Column.values.forEach((column, index) => {
      expect(model.getColumnName(index)).toBe(column.name);
    });
  });

  it('accepts a new sniper', () => {
    const model = new SnipersTableModel();
    const onSnapshotsChanged = vi.fn();
    model.addListener({ onSnapshotsChanged });
    const sniper = new AuctionSniper(new Item(ITEM_ID, 234), stubAuction());

    model.sniperAdded(sniper);

    expect(onSnapshotsChanged).toHaveBeenCalledOnce();
    assertRowMatchesSnapshot(model, 0, SniperSnapshot.joining(ITEM_ID));
  });

  it('sets sniper values in columns', () => {
    const model = new SnipersTableModel();
    const sniper = new AuctionSniper(new Item(ITEM_ID, 234), stubAuction());
    const bidding = sniper.getSnapshot().bidding(555, 666);

    model.sniperAdded(sniper);
    model.sniperStateChanged(bidding);

    assertRowMatchesSnapshot(model, 0, bidding);
  });

  it('notifies listeners when adding a sniper', () => {
    const model = new SnipersTableModel();
    const onSnapshotsChanged = vi.fn();
    model.addListener({ onSnapshotsChanged });
    const sniper = new AuctionSniper(new Item(ITEM_ID, 234), stubAuction());

    expect(model.getRowCount()).toBe(0);

    model.sniperAdded(sniper);

    expect(model.getRowCount()).toBe(1);
    assertRowMatchesSnapshot(model, 0, SniperSnapshot.joining(ITEM_ID));
  });

  it('holds snipers in addition order', () => {
    const model = new SnipersTableModel();
    const sniper = new AuctionSniper(new Item(ITEM_ID, 234), stubAuction());
    const sniper2 = new AuctionSniper(new Item('item 1', 345), stubAuction());

    model.sniperAdded(sniper);
    model.sniperAdded(sniper2);

    expect(cellValue(model, 0, Column.ITEM_IDENTIFIER)).toBe(ITEM_ID);
    expect(cellValue(model, 1, Column.ITEM_IDENTIFIER)).toBe('item 1');
  });

  it('updates the correct row for a sniper', () => {
    const model = new SnipersTableModel();
    const sniper = new AuctionSniper(new Item(ITEM_ID, 234), stubAuction());
    const sniper2 = new AuctionSniper(new Item('item 1', 345), stubAuction());
    model.sniperAdded(sniper);
    model.sniperAdded(sniper2);

    const winning1 = sniper2.getSnapshot().winning(123);
    model.sniperStateChanged(winning1);

    assertRowMatchesSnapshot(model, 1, winning1);
  });

  it('throws a defect if no existing sniper for an update', () => {
    const model = new SnipersTableModel();

    expect(() =>
      model.sniperStateChanged(new SniperSnapshot('item 1', 123, 234, SniperState.WINNING))
    ).toThrow(Defect);
  });
});

function assertRowMatchesSnapshot(
  model: SnipersTableModel,
  row: number,
  snapshot: SniperSnapshot
): void {
  expect(cellValue(model, row, Column.ITEM_IDENTIFIER)).toBe(snapshot.itemId);
  expect(cellValue(model, row, Column.LAST_PRICE)).toBe(snapshot.lastPrice);
  expect(cellValue(model, row, Column.LAST_BID)).toBe(snapshot.lastBid);
  expect(cellValue(model, row, Column.SNIPER_STATE)).toBe(
    SnipersTableModel.textFor(snapshot.state)
  );
}

function cellValue(model: SnipersTableModel, rowIndex: number, column: Column): string | number {
  return model.getValueAt(rowIndex, Column.values.indexOf(column));
}

// Java 版直接傳 null 給 AuctionSniper 的 Auction 參數（測試中從未真正用到），
// TS 型別系統不允許這樣做，補一個 stub——沒有對應的 Java helper。
function stubAuction(): Auction {
  return { bid: vi.fn(), join: vi.fn(), addAuctionEventListener: vi.fn() };
}
