import { describe, expect, it } from 'vitest';
import { Column } from '../../../shared/Column.ts';
import type { SniperSnapshotData } from '../../../shared/types.ts';

describe('Column', () => {
  it('retrieves values from a sniper snapshot', () => {
    const snapshot: SniperSnapshotData = {
      itemId: 'item',
      lastPrice: 123,
      lastBid: 34,
      state: 'Bidding',
    };

    expect(Column.ITEM_IDENTIFIER.valueIn(snapshot)).toBe('item');
    expect(Column.LAST_PRICE.valueIn(snapshot)).toBe(123);
    expect(Column.LAST_BID.valueIn(snapshot)).toBe(34);
    expect(Column.SNIPER_STATE.valueIn(snapshot)).toBe('Bidding');
  });
});
