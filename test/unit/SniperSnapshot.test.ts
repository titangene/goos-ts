import { describe, expect, it } from 'vitest';
import { SniperSnapshot } from '../../server/auctionsniper/SniperSnapshot.ts';
import { SniperState } from '../../server/auctionsniper/SniperState.ts';

describe('SniperSnapshot', () => {
  it('transitions between states', () => {
    const itemId = 'item id';
    const joining = SniperSnapshot.joining(itemId);

    expect(joining).toEqual(new SniperSnapshot(itemId, 0, 0, SniperState.JOINING));

    const bidding = joining.bidding(123, 234);
    expect(bidding).toEqual(new SniperSnapshot(itemId, 123, 234, SniperState.BIDDING));

    expect(bidding.losing(456)).toEqual(new SniperSnapshot(itemId, 456, 234, SniperState.LOSING));

    expect(bidding.winning(456)).toEqual(
      new SniperSnapshot(itemId, 456, 234, SniperState.WINNING),
    );

    expect(bidding.closed()).toEqual(new SniperSnapshot(itemId, 123, 234, SniperState.LOST));

    expect(bidding.winning(678).closed()).toEqual(
      new SniperSnapshot(itemId, 678, 234, SniperState.WON),
    );
  });

  it('compares item identities', () => {
    expect(SniperSnapshot.joining('item 1').isForSameItemAs(SniperSnapshot.joining('item 1'))).toBe(
      true,
    );
    expect(
      SniperSnapshot.joining('item 1').isForSameItemAs(SniperSnapshot.joining('item 2')),
    ).toBe(false);
  });
});
