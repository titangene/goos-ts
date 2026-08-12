import { describe, expect, it } from 'vitest';
import { Column } from '@server/auctionsniper/ui/Column.ts';
import { SniperSnapshot } from '@server/auctionsniper/SniperSnapshot.ts';
import { SniperState } from '@server/auctionsniper/SniperState.ts';

describe('Column', () => {
  it('retrieves values from a sniper snapshot', () => {
    const snapshot = new SniperSnapshot('item', 123, 34, SniperState.BIDDING);

    expect(Column.ITEM_IDENTIFIER.valueIn(snapshot)).toBe('item');
    expect(Column.LAST_PRICE.valueIn(snapshot)).toBe(123);
    expect(Column.LAST_BID.valueIn(snapshot)).toBe(34);
    expect(Column.SNIPER_STATE.valueIn(snapshot)).toBe('Bidding');
  });
});
