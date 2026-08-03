import { describe, expect, it, vi } from 'vitest';
import { SniperLauncher } from '../../server/auctionsniper/SniperLauncher.ts';
import type { AuctionSniper } from '../../server/auctionsniper/AuctionSniper.ts';
import { Item } from '../../server/auctionsniper/UserRequestListener.ts';
import type { Auction } from '../../server/auctionsniper/Auction.ts';
import type { AuctionHouse } from '../../server/auctionsniper/AuctionHouse.ts';
import type { SniperCollector } from '../../server/auctionsniper/SniperCollector.ts';

describe('SniperLauncher', () => {
  it('adds new sniper to collector and then joins auction', () => {
    const item = new Item('item 123', 456);
    const callOrder: string[] = [];

    const auction: Auction = {
      bid: vi.fn(),
      join: vi.fn(() => callOrder.push('join')),
      addAuctionEventListener: vi.fn((sniper: AuctionSniper) => {
        callOrder.push('addAuctionEventListener');
        expect(sniper.getSnapshot().itemId).toBe(item.identifier);
      }),
    };
    const auctionHouse: AuctionHouse = {
      auctionFor: vi.fn((requestedItem: Item) => {
        expect(requestedItem).toBe(item);
        return auction;
      }),
    };
    const sniperCollector: SniperCollector = {
      addSniper: vi.fn((sniper: AuctionSniper) => {
        callOrder.push('addSniper');
        expect(sniper.getSnapshot().itemId).toBe(item.identifier);
      }),
    };

    const launcher = new SniperLauncher(auctionHouse, sniperCollector);
    launcher.joinAuction(item);

    expect(auctionHouse.auctionFor).toHaveBeenCalledWith(item);
    expect(callOrder).toEqual(['addAuctionEventListener', 'addSniper', 'join']);
  });
});
