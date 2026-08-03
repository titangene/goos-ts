import { describe, expect, it, vi } from 'vitest';
import { SnipersTableModel } from '../../server/auctionsniper/SnipersTableModel.ts';
import { AuctionSniper } from '../../server/auctionsniper/AuctionSniper.ts';
import { SniperSnapshot } from '../../server/auctionsniper/SniperSnapshot.ts';
import { SniperState } from '../../server/auctionsniper/SniperState.ts';
import type { Auction } from '../../server/auctionsniper/Auction.ts';
import { Item } from '../../server/auctionsniper/UserRequestListener.ts';
import { Column } from '../../shared/Column.ts';

function stubAuction(): Auction {
  return { bid: vi.fn(), join: vi.fn(), addAuctionEventListener: vi.fn() };
}

function assertRowMatchesSnapshot(model: SnipersTableModel, row: number, snapshot: SniperSnapshot): void {
  const actual = model.getSnapshots()[row];
  expect(Column.ITEM_IDENTIFIER.valueIn(actual)).toBe(Column.ITEM_IDENTIFIER.valueIn(snapshot));
  expect(Column.LAST_PRICE.valueIn(actual)).toBe(Column.LAST_PRICE.valueIn(snapshot));
  expect(Column.LAST_BID.valueIn(actual)).toBe(Column.LAST_BID.valueIn(snapshot));
  expect(Column.SNIPER_STATE.valueIn(actual)).toBe(Column.SNIPER_STATE.valueIn(snapshot));
}

describe('the snipers table model', () => {
  const itemId = 'item 0';

  it('notifies listeners when accepting a new sniper', () => {
    const model = new SnipersTableModel();
    const onSnapshotsChanged = vi.fn();
    model.addListener({ onSnapshotsChanged });
    const sniper = new AuctionSniper(new Item(itemId, 234), stubAuction());

    model.sniperAdded(sniper);

    expect(onSnapshotsChanged).toHaveBeenCalled();
    assertRowMatchesSnapshot(model, 0, SniperSnapshot.joining(itemId));
  });

  it('sets sniper values in columns when the state changes', () => {
    const model = new SnipersTableModel();
    const sniper = new AuctionSniper(new Item(itemId, 234), stubAuction());
    model.sniperAdded(sniper);

    const bidding = sniper.getSnapshot().bidding(555, 666);
    model.sniperStateChanged(bidding);

    assertRowMatchesSnapshot(model, 0, bidding);
  });

  it('notifies listeners when adding a sniper', () => {
    const model = new SnipersTableModel();
    const onSnapshotsChanged = vi.fn();
    model.addListener({ onSnapshotsChanged });
    const sniper = new AuctionSniper(new Item(itemId, 234), stubAuction());

    expect(model.getSnapshots()).toHaveLength(0);

    model.sniperAdded(sniper);

    expect(model.getSnapshots()).toHaveLength(1);
    assertRowMatchesSnapshot(model, 0, SniperSnapshot.joining(itemId));
  });

  it('holds snipers in addition order', () => {
    const model = new SnipersTableModel();
    const sniper = new AuctionSniper(new Item(itemId, 234), stubAuction());
    const sniper2 = new AuctionSniper(new Item('item 1', 345), stubAuction());

    model.sniperAdded(sniper);
    model.sniperAdded(sniper2);

    expect(Column.ITEM_IDENTIFIER.valueIn(model.getSnapshots()[0])).toBe(itemId);
    expect(Column.ITEM_IDENTIFIER.valueIn(model.getSnapshots()[1])).toBe('item 1');
  });

  it('updates the correct row for a sniper', () => {
    const model = new SnipersTableModel();
    const sniper = new AuctionSniper(new Item(itemId, 234), stubAuction());
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
      model.sniperStateChanged(new SniperSnapshot('item 1', 123, 234, SniperState.WINNING)),
    ).toThrow();
  });
});
