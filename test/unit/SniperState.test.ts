import { describe, expect, it } from 'vitest';

import { SniperState, whenAuctionClosed } from '@server/auctionsniper/SniperState.ts';
import { Defect } from '@server/auctionsniper/util/Defect.ts';

describe('SniperState', () => {
  it('is won when auction closes while winning', () => {
    expect(whenAuctionClosed(SniperState.JOINING)).toBe(SniperState.LOST);
    expect(whenAuctionClosed(SniperState.BIDDING)).toBe(SniperState.LOST);
    expect(whenAuctionClosed(SniperState.WINNING)).toBe(SniperState.WON);
  });

  it('is a defect if the auction closes when already won', () => {
    expect(() => whenAuctionClosed(SniperState.WON)).toThrow(Defect);
  });

  it('is a defect if the auction closes when already lost', () => {
    expect(() => whenAuctionClosed(SniperState.LOST)).toThrow(Defect);
  });
});
