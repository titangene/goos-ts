import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AuctionEventListener } from '@server/auctionsniper/AuctionEventListener.ts';
import { Item } from '@server/auctionsniper/UserRequestListener.ts';
import { XMPPAuctionHouse } from '@server/auctionsniper/xmpp/XMPPAuctionHouse.ts';
import { SNIPER_ID, SNIPER_PASSWORD, SNIPER_XMPP_ID } from '@test/e2e-xmpp/ApplicationRunner.ts';
import { FakeAuctionServer } from '@test/e2e-xmpp/FakeAuctionServer.ts';

// 對照 goos-code 的
// test/integration/test/integration/auctionsniper/xmpp/XMPPAuctionHouseTest.java
// 的 receivesEventsFromAuctionServerAfterJoining()。需要真實 Prosody（見
// ADR-0008 Compliance #1）。itemId 用固定字串（跟 Java 版一致），不能像
// test/integration/redis/RedisAuctionHouse.test.ts 那樣每次測試隨機化——
// Redis channel 名稱可以隨便取，但 XMPP 帳號要照 ADR-0003 白名單事先在
// Prosody 註冊過，隨機出來的 itemId 不會有對應帳號。SNIPER_ID/
// SNIPER_PASSWORD/SNIPER_XMPP_ID 從 test/e2e-xmpp/ApplicationRunner.ts
// 匯入，對應 Java 版 import test.endtoend.auctionsniper.ApplicationRunner
// 直接重用同一份常數的慣例（而非在這裡各自宣告一份）。
const ITEM_ID = 'item-54321';

describe('XMPPAuctionHouse', () => {
  let auctionServer: FakeAuctionServer;
  let auctionHouse: XMPPAuctionHouse;

  // 對應 Java 版 openConnection()/closeConnection()：分開成獨立的
  // before/after，不跟下面 startAuction()/stopAuction() 那組合併，比照
  // Java 版四個各自獨立的 @Before/@After 方法。
  beforeEach(async () => {
    auctionHouse = await XMPPAuctionHouse.connect(
      FakeAuctionServer.SERVICE_URL,
      FakeAuctionServer.DOMAIN,
      SNIPER_ID,
      SNIPER_PASSWORD
    );
  });

  afterEach(async () => {
    await auctionHouse.disconnect();
  });

  // 對應 Java 版 startAuction()/stopAuction()。
  beforeEach(async () => {
    auctionServer = new FakeAuctionServer(ITEM_ID);
    await auctionServer.startSellingItem();
  });

  afterEach(async () => {
    await auctionServer.stop();
  });

  it('receives events from auction server after joining', async () => {
    let resolveClosed: () => void;
    const auctionWasClosed = new Promise<void>(resolve => {
      resolveClosed = resolve;
    });

    const auction = auctionHouse.auctionFor(new Item(auctionServer.itemId, 567));
    auction.addAuctionEventListener(auctionClosedListener(() => resolveClosed()));
    auction.join();

    await auctionServer.hasReceivedJoinRequestFrom(SNIPER_XMPP_ID);
    auctionServer.announceClosed();

    // 對應 Java 版 assertTrue("should have been closed",
    // auctionWasClosed.await(4, SECONDS))：Java 用 CountDownLatch 是因為
    // Swing/AWT 事件在另一條執行緒，這裡改用 Promise 承載同樣的「等關閉
    // 事件」語意（TS/JS 單執行緒，沒有跨執行緒等待的問題）。
    await expect(auctionWasClosed).resolves.toBeUndefined();
  }, 10_000);
});

// 對應 Java 版 XMPPAuctionHouseTest.auctionClosedListener(CountDownLatch)。
function auctionClosedListener(onAuctionClosed: () => void): AuctionEventListener {
  return {
    auctionClosed: () => onAuctionClosed(),
    auctionFailed: () => {},
    currentPrice: () => {}
  };
}
