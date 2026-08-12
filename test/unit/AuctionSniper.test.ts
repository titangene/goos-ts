import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Auction } from '@server/auctionsniper/Auction.ts';
import { PriceSource } from '@server/auctionsniper/AuctionEventListener.ts';
import { AuctionSniper } from '@server/auctionsniper/AuctionSniper.ts';
import type { SniperListener } from '@server/auctionsniper/SniperListener.ts';
import { SniperSnapshot } from '@server/auctionsniper/SniperSnapshot.ts';
import { SniperState } from '@server/auctionsniper/SniperState.ts';
import { Item } from '@server/auctionsniper/UserRequestListener.ts';

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

  it('has initial state of joining', () => {
    expect(sniper.getSnapshot()).toEqual(SniperSnapshot.joining(itemId));
  });

  it('reports lost when auction closes immediately', () => {
    sniper.auctionClosed();

    expect(listener.sniperStateChanged).toHaveBeenCalledWith(
      expect.objectContaining({ state: SniperState.LOST, itemId })
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
        lastBid: bid
      })
    );
    expect(auction.bid).toHaveBeenCalledWith(bid);
  });

  it('does not bid and reports losing if first price is above stop price', () => {
    sniper.currentPrice(1990, 50, PriceSource.FromOtherBidder);

    expect(auction.bid).not.toHaveBeenCalled();
    expect(listener.sniperStateChanged).toHaveBeenCalledWith(
      expect.objectContaining({ state: SniperState.LOSING, itemId, lastPrice: 1990, lastBid: 0 })
    );
  });

  it('does not bid and reports losing if subsequent price is above stop price', () => {
    sniper.currentPrice(123, 45, PriceSource.FromOtherBidder);
    sniper.currentPrice(2345, 25, PriceSource.FromOtherBidder);

    expect(auction.bid).toHaveBeenCalledOnce();
    expect(listener.sniperStateChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        state: SniperState.LOSING,
        itemId,
        lastPrice: 2345,
        lastBid: 168
      })
    );
  });

  it('does not bid and reports losing if price after winning is above stop price', () => {
    sniper.currentPrice(123, 45, PriceSource.FromOtherBidder);
    sniper.currentPrice(168, 45, PriceSource.FromSniper);
    sniper.currentPrice(2233, 25, PriceSource.FromOtherBidder);

    expect(listener.sniperStateChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        state: SniperState.LOSING,
        itemId,
        lastPrice: 2233,
        lastBid: 168
      })
    );
  });

  it('continues to be losing once stop price has been reached', () => {
    sniper.currentPrice(2233, 25, PriceSource.FromOtherBidder);
    sniper.currentPrice(2258, 25, PriceSource.FromOtherBidder);

    expect(listener.sniperStateChanged).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ state: SniperState.LOSING, itemId, lastPrice: 2233 })
    );
    expect(listener.sniperStateChanged).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ state: SniperState.LOSING, itemId, lastPrice: 2258 })
    );
  });

  it('reports lost if auction closes when bidding', () => {
    sniper.currentPrice(123, 45, PriceSource.FromOtherBidder);
    sniper.auctionClosed();

    expect(listener.sniperStateChanged).toHaveBeenCalledWith(
      expect.objectContaining({ state: SniperState.LOST, itemId })
    );
  });

  it('reports lost if auction closes when losing', () => {
    sniper.currentPrice(1990, 50, PriceSource.FromOtherBidder);
    sniper.auctionClosed();

    expect(listener.sniperStateChanged).toHaveBeenCalledWith(
      expect.objectContaining({ state: SniperState.LOST, itemId, lastPrice: 1990, lastBid: 0 })
    );
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
        lastBid: 135
      })
    );
  });

  it('reports won if auction closes when winning', () => {
    sniper.currentPrice(123, 45, PriceSource.FromSniper);
    sniper.auctionClosed();

    expect(listener.sniperStateChanged).toHaveBeenCalledWith(
      expect.objectContaining({ state: SniperState.WON, itemId })
    );
  });

  it('reports failed if auction fails when bidding', () => {
    sniper.currentPrice(123, 45, PriceSource.FromOtherBidder);
    sniper.auctionFailed();

    expect(listener.sniperStateChanged).toHaveBeenCalledWith(
      expect.objectContaining({ state: SniperState.FAILED, itemId, lastPrice: 0, lastBid: 0 })
    );
  });

  it('reports failed if auction fails immediately', () => {
    sniper.auctionFailed();

    expect(listener.sniperStateChanged).toHaveBeenCalledWith(
      expect.objectContaining({ state: SniperState.FAILED, itemId })
    );
  });

  it('reports failed if auction fails when losing', () => {
    sniper.currentPrice(1990, 50, PriceSource.FromOtherBidder);
    sniper.auctionFailed();

    expect(listener.sniperStateChanged).toHaveBeenCalledWith(
      expect.objectContaining({ state: SniperState.FAILED, itemId, lastPrice: 0, lastBid: 0 })
    );
  });

  it('reports failed if auction fails when winning', () => {
    sniper.currentPrice(123, 12, PriceSource.FromOtherBidder);
    sniper.currentPrice(135, 45, PriceSource.FromSniper);
    sniper.auctionFailed();

    expect(listener.sniperStateChanged).toHaveBeenCalledWith(
      expect.objectContaining({ state: SniperState.FAILED, itemId, lastPrice: 0, lastBid: 0 })
    );
  });
});
