import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RedisAuctionHouse } from '../../../server/auctionsniper/redis/RedisAuctionHouse.ts';
import { Item } from '../../../server/auctionsniper/UserRequestListener.ts';
import type { AuctionEventListener } from '../../../server/auctionsniper/AuctionEventListener.ts';
import { FakeAuctionServer } from '../../e2e/FakeAuctionServer.ts';

const SNIPER_ID = 'sniper@localhost';

function uniqueItemId(name: string): string {
  return `${name}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

describe('RedisAuctionHouse', () => {
  let auctionServer: FakeAuctionServer;
  let auctionHouse: RedisAuctionHouse;

  beforeEach(async () => {
    auctionServer = new FakeAuctionServer(uniqueItemId('item-54321'));
    auctionHouse = await RedisAuctionHouse.connect(SNIPER_ID);
    await auctionServer.startSellingItem();
  });

  afterEach(async () => {
    await auctionHouse.disconnect();
    await auctionServer.stop();
  });

  it(
    'receives events from auction server after joining',
    async () => {
      let resolveClosed: () => void;
      const auctionWasClosed = new Promise<void>((resolve) => {
        resolveClosed = resolve;
      });

      const listener: AuctionEventListener = {
        auctionClosed: () => resolveClosed(),
        auctionFailed: () => {},
        currentPrice: () => {},
      };

      const auction = auctionHouse.auctionFor(new Item(auctionServer.itemId, 567));
      auction.addAuctionEventListener(listener);
      auction.join();

      await auctionServer.hasReceivedJoinRequestFrom(SNIPER_ID);
      await auctionServer.announceClosed();

      await expect(auctionWasClosed).resolves.toBeUndefined();
    },
    10_000,
  );
});
