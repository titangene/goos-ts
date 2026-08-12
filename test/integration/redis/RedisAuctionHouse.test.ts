import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AuctionEventListener } from '@server/auctionsniper/AuctionEventListener.ts';
import { RedisAuctionHouse } from '@server/auctionsniper/redis/RedisAuctionHouse.ts';
import { Item } from '@server/auctionsniper/UserRequestListener.ts';
import { FakeAuctionServer } from '@test/e2e/FakeAuctionServer.ts';

// 對照 goos-code 的
// test/integration/test/integration/auctionsniper/xmpp/XMPPAuctionHouseTest.java
// 的 receivesEventsFromAuctionServerAfterJoining()。
// 需要真實 Redis（見 ADR-0002 Compliance #4：unit test 不能碰真實
// broker，這一層才是驗證跟真實 broker 整合的地方）。
const SNIPER_ID = 'sniper';

function uniqueItemId(name: string): string {
  return `${name}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

describe('RedisAuctionHouse', () => {
  let auctionServer: FakeAuctionServer;
  let auctionHouse: RedisAuctionHouse;

  beforeEach(async () => {
    auctionServer = new FakeAuctionServer(uniqueItemId('item-54321'));
    auctionHouse = await RedisAuctionHouse.connect(FakeAuctionServer.REDIS_URL, SNIPER_ID);
    await auctionServer.startSellingItem();
  });

  afterEach(async () => {
    await auctionHouse.disconnect();
    await auctionServer.stop();
  });

  it('receives events from auction server after joining', async () => {
    let resolveClosed: () => void;
    const auctionWasClosed = new Promise<void>(resolve => {
      resolveClosed = resolve;
    });

    const listener: AuctionEventListener = {
      auctionClosed: () => resolveClosed(),
      auctionFailed: () => {},
      currentPrice: () => {}
    };

    const auction = auctionHouse.auctionFor(new Item(auctionServer.itemId, 567));
    auction.addAuctionEventListener(listener);
    auction.join();

    await auctionServer.hasReceivedJoinRequestFrom(SNIPER_ID);
    await auctionServer.announceClosed();

    await expect(auctionWasClosed).resolves.toBeUndefined();
  }, 10_000);
});
