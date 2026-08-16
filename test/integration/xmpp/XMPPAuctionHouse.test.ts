import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AuctionEventListener } from '@server/auctionsniper/AuctionEventListener.ts';
import { Item } from '@server/auctionsniper/UserRequestListener.ts';
import { XMPPAuctionHouse } from '@server/auctionsniper/xmpp/XMPPAuctionHouse.ts';
import { FakeAuctionServer } from '@test/integration/xmpp/FakeAuctionServer.ts';

// 對照 goos-code 的
// test/integration/test/integration/auctionsniper/xmpp/XMPPAuctionHouseTest.java
// 的 receivesEventsFromAuctionServerAfterJoining()。需要真實 Prosody（見
// ADR-0008 Compliance #1）。itemId 用固定字串（跟 Java 版一致），不能像
// test/integration/redis/RedisAuctionHouse.test.ts 那樣每次測試隨機化——
// Redis channel 名稱可以隨便取，但 XMPP 帳號要照 ADR-0003 白名單事先在
// Prosody 註冊過，隨機出來的 itemId 不會有對應帳號。
const SNIPER_ID = 'sniper';
const SNIPER_PASSWORD = 'sniper';
const ITEM_ID = 'item-54321';

function sniperXmppId(): string {
  return `${SNIPER_ID}@${FakeAuctionServer.DOMAIN}/Auction`;
}

describe('XMPPAuctionHouse', () => {
  let auctionServer: FakeAuctionServer;
  let auctionHouse: XMPPAuctionHouse;

  beforeEach(async () => {
    auctionServer = new FakeAuctionServer(ITEM_ID);
    auctionHouse = await XMPPAuctionHouse.connect(
      FakeAuctionServer.SERVICE_URL,
      FakeAuctionServer.DOMAIN,
      SNIPER_ID,
      SNIPER_PASSWORD
    );
    await auctionServer.startSellingItem();
  });

  afterEach(() => {
    auctionHouse.disconnect();
    auctionServer.stop();
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

    await auctionServer.hasReceivedJoinRequestFrom(sniperXmppId());
    auctionServer.announceClosed();

    await expect(auctionWasClosed).resolves.toBeUndefined();
  }, 10_000);
});
