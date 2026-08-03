import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuctionSniper } from '../../server/auctionsniper/AuctionSniper.ts';
import { PriceSource } from '../../server/auctionsniper/AuctionEventListener.ts';
import { SniperState } from '../../server/auctionsniper/SniperState.ts';
import type { Auction } from '../../server/auctionsniper/Auction.ts';
import type { SniperListener } from '../../server/auctionsniper/SniperListener.ts';
import { Item } from '../../server/auctionsniper/UserRequestListener.ts';

describe('The Auction Sniper', () => {
  const itemId = 'item';
  const stopPrice = 2000;

  let item: Item;
  let auction: Auction;
  let listener: SniperListener;
  let sniper: AuctionSniper;

  beforeEach(() => {
    item = new Item(itemId, stopPrice);
    auction = { bid: vi.fn(), join: vi.fn(), addAuctionEventListener: vi.fn() };
    listener = { sniperStateChanged: vi.fn() };
    sniper = new AuctionSniper(item, auction);
    sniper.addSniperListener(listener);
  });

  describe('reports lost', () => {
    it('if auction closes immediately', () => {
      sniper.auctionClosed();

      expect(listener.sniperStateChanged).toHaveBeenCalledWith(
        expect.objectContaining({ state: SniperState.LOST, itemId }),
      );
    });

    it('if auction closes when bidding', () => {
      sniper.currentPrice(123, 45, PriceSource.FromOtherBidder);
      sniper.auctionClosed();

      expect(listener.sniperStateChanged).toHaveBeenCalledWith(
        expect.objectContaining({ state: SniperState.LOST, itemId }),
      );
    });
  });

  it('reports won if auction closes when winning', () => {
    sniper.currentPrice(123, 45, PriceSource.FromSniper);
    sniper.auctionClosed();

    expect(listener.sniperStateChanged).toHaveBeenCalledWith(
      expect.objectContaining({ state: SniperState.WON, itemId }),
    );
  });

  it('bids higher and reports bidding when new price arrives', () => {
    const price = 1001;
    const increment = 25;
    const bid = price + increment;

    sniper.currentPrice(price, increment, PriceSource.FromOtherBidder);

    expect(listener.sniperStateChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        state: SniperState.BIDDING,
        itemId,
        lastPrice: price,
        lastBid: bid,
      }),
    );
    expect(auction.bid).toHaveBeenCalledWith(bid);
  });

  it('reports winning when current price comes from sniper', () => {
    sniper.currentPrice(123, 12, PriceSource.FromOtherBidder);
    expect(auction.bid).toHaveBeenCalledOnce();

    sniper.currentPrice(135, 45, PriceSource.FromSniper);

    expect(listener.sniperStateChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        state: SniperState.WINNING,
        itemId,
        lastPrice: 135,
        lastBid: 135,
      }),
    );
  });

  it('reports losing when a bid exceeds the stop price', () => {
    const cheapItem = new Item(itemId, 1000);
    sniper = new AuctionSniper(cheapItem, auction);
    sniper.addSniperListener(listener);

    sniper.currentPrice(990, 50, PriceSource.FromOtherBidder);

    expect(auction.bid).not.toHaveBeenCalled();
    expect(listener.sniperStateChanged).toHaveBeenCalledWith(
      expect.objectContaining({ state: SniperState.LOSING, itemId, lastPrice: 990 }),
    );
  });

  it('reports failed when the auction fails', () => {
    sniper.auctionFailed();

    expect(listener.sniperStateChanged).toHaveBeenCalledWith(
      expect.objectContaining({ state: SniperState.FAILED, itemId }),
    );
  });
});
