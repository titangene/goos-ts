import { test } from '@playwright/test';

import { ApplicationRunner, SNIPER_XMPP_ID } from './ApplicationRunner.ts';
import { FakeAuctionServer } from './FakeAuctionServer.ts';

// 對應 goos-code 的
// test/end-to-end/test/endtoend/auctionsniper/AuctionSniperEndToEndTest.java。
// itemId 用固定字串（跟 Java 版一致，見 Java 版 auction/auction2 欄位初始
// 化），不像 test/e2e/AuctionSniperEndToEnd.test.ts（Redis 版）那樣用
// uniqueItemId() 隨機化——原因見 ApplicationRunner.ts 開頭的說明：每個測試
// 都是全新 server process，不會有跨測試的狀態污染，因此可以（也必須，因為
// Prosody 帳號要事先註冊）沿用固定的 item-54321/item-65432。
test.describe('the auction sniper', () => {
  let auction: FakeAuctionServer;
  let auction2: FakeAuctionServer;
  let application: ApplicationRunner;

  test.beforeEach(({ page }) => {
    auction = new FakeAuctionServer('item-54321');
    auction2 = new FakeAuctionServer('item-65432');
    application = new ApplicationRunner(page);
  });

  // 對應 Java 版兩個分開的 @After 方法（stopAuction()/stopApplication()）。
  test.afterEach(async () => {
    await auction.stop();
    await auction2.stop();
  });

  test.afterEach(async () => {
    await application.stop();
  });

  test('sniper joins auction until auction closes', async () => {
    await auction.startSellingItem();

    await application.startBiddingIn(auction);
    await auction.hasReceivedJoinRequestFrom(SNIPER_XMPP_ID);

    await auction.announceClosed();
    await application.hasShownSniperHasLostAuction(auction, 0, 0);
  });

  test('sniper makes a higher bid but loses', async () => {
    await auction.startSellingItem();

    await application.startBiddingIn(auction);
    await auction.hasReceivedJoinRequestFrom(SNIPER_XMPP_ID);
    await auction.reportPrice(1000, 98, 'other bidder');
    await application.hasShownSniperIsBidding(auction, 1000, 1098);

    await auction.hasReceivedBid(1098, SNIPER_XMPP_ID);

    await auction.announceClosed();
    await application.hasShownSniperHasLostAuction(auction, 1000, 1098);
  });

  test('sniper wins an auction by bidding higher', async () => {
    await auction.startSellingItem();

    await application.startBiddingIn(auction);
    await auction.hasReceivedJoinRequestFrom(SNIPER_XMPP_ID);
    await auction.reportPrice(1000, 98, 'other bidder');
    await application.hasShownSniperIsBidding(auction, 1000, 1098);

    await auction.hasReceivedBid(1098, SNIPER_XMPP_ID);

    await auction.reportPrice(1098, 97, SNIPER_XMPP_ID);
    await application.hasShownSniperIsWinning(auction, 1098);

    await auction.announceClosed();
    await application.hasShownSniperHasWonAuction(auction, 1098);
  });

  test('sniper bids for multiple items', async () => {
    await auction.startSellingItem();
    await auction2.startSellingItem();

    await application.startBiddingIn(auction, auction2);
    await auction.hasReceivedJoinRequestFrom(SNIPER_XMPP_ID);
    await auction2.hasReceivedJoinRequestFrom(SNIPER_XMPP_ID);

    await auction.reportPrice(1000, 98, 'other bidder');
    await auction.hasReceivedBid(1098, SNIPER_XMPP_ID);

    await auction2.reportPrice(500, 21, 'other bidder');
    await auction2.hasReceivedBid(521, SNIPER_XMPP_ID);

    await auction.reportPrice(1098, 97, SNIPER_XMPP_ID);
    await auction2.reportPrice(521, 22, SNIPER_XMPP_ID);

    await application.hasShownSniperIsWinning(auction, 1098);
    await application.hasShownSniperIsWinning(auction2, 521);

    await auction.announceClosed();
    await auction2.announceClosed();

    await application.hasShownSniperHasWonAuction(auction, 1098);
    await application.hasShownSniperHasWonAuction(auction2, 521);
  });

  test('sniper loses an auction when the price is too high', async () => {
    await auction.startSellingItem();

    await application.startBiddingWithStopPrice(auction, 1100);
    await auction.hasReceivedJoinRequestFrom(SNIPER_XMPP_ID);
    await auction.reportPrice(1000, 98, 'other bidder');
    await application.hasShownSniperIsBidding(auction, 1000, 1098);

    await auction.hasReceivedBid(1098, SNIPER_XMPP_ID);

    await auction.reportPrice(1197, 10, 'third party');
    await application.hasShownSniperIsLosing(auction, 1197, 1098);

    await auction.reportPrice(1207, 10, 'fourth party');
    await application.hasShownSniperIsLosing(auction, 1207, 1098);

    await auction.announceClosed();
    await application.hasShownSniperHasLostAuction(auction, 1207, 1098);
  });

  test('sniper reports invalid auction message and stops responding to events', async () => {
    const brokenMessage = 'a broken message';

    await auction.startSellingItem();
    await auction2.startSellingItem();

    await application.startBiddingIn(auction, auction2);
    await auction.hasReceivedJoinRequestFrom(SNIPER_XMPP_ID);

    await auction.reportPrice(500, 20, 'other bidder');
    await auction.hasReceivedBid(520, SNIPER_XMPP_ID);

    await auction.sendInvalidMessageContaining(brokenMessage);
    await application.hasShownSniperHasFailed(auction);

    await auction.reportPrice(520, 21, 'other bidder');
    await waitForAnotherAuctionEvent(application);

    await application.reportsInvalidMessage(brokenMessage);
    await application.hasShownSniperHasFailed(auction);
  });

  async function waitForAnotherAuctionEvent(runner: ApplicationRunner): Promise<void> {
    await auction2.hasReceivedJoinRequestFrom(SNIPER_XMPP_ID);
    await auction2.reportPrice(600, 6, 'other bidder');
    await runner.hasShownSniperIsBidding(auction2, 600, 606);
  }
});
