import { describe, expect, it, vi } from 'vitest';
import { SniperPortfolio } from '@server/auctionsniper/SniperPortfolio.ts';
import type { AuctionSniper } from '@server/auctionsniper/AuctionSniper.ts';

describe('The sniper portfolio', () => {
  it('notifies listeners when a sniper is added', () => {
    const portfolio = new SniperPortfolio();
    const sniperAdded = vi.fn();
    portfolio.addPortfolioListener({ sniperAdded });

    const sniper = {} as AuctionSniper;
    portfolio.addSniper(sniper);

    expect(sniperAdded).toHaveBeenCalledWith(sniper);
  });
});
