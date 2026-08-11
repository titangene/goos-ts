import { test } from '@playwright/test';
import { ApplicationRunner, SNIPER_ID } from './ApplicationRunner.ts';
import { RedisFakeAuctionServer } from './RedisFakeAuctionServer.ts';

function uniqueItemId(name: string): string {
  return `${name}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

test.describe('the auction sniper', () => {
  let auction: RedisFakeAuctionServer;
  let auction2: RedisFakeAuctionServer;

  test.beforeEach(() => {
    auction = new RedisFakeAuctionServer(uniqueItemId('item-54321'));
    auction2 = new RedisFakeAuctionServer(uniqueItemId('item-65432'));
  });

  test.afterEach(async () => {
    await auction.stop();
    await auction2.stop();
  });

  test('sniper joins auction until auction closes', async ({ page }) => {
    const application = new ApplicationRunner(page);

    await auction.startSellingItem();

    await application.startBiddingIn(auction);
    await auction.hasReceivedJoinRequestFrom(SNIPER_ID);

    await auction.announceClosed();
    await application.hasShownSniperHasLostAuction(auction, 0, 0);
  });

  test('sniper makes a higher bid but loses', async ({ page }) => {
    const application = new ApplicationRunner(page);

    await auction.startSellingItem();

    await application.startBiddingIn(auction);
    await auction.hasReceivedJoinRequestFrom(SNIPER_ID);
    await auction.reportPrice(1000, 98, 'other bidder');
    await application.hasShownSniperIsBidding(auction, 1000, 1098);

    await auction.hasReceivedBid(1098, SNIPER_ID);

    await auction.announceClosed();
    await application.hasShownSniperHasLostAuction(auction, 1000, 1098);
  });

  test('sniper wins an auction by bidding higher', async ({ page }) => {
    const application = new ApplicationRunner(page);

    await auction.startSellingItem();

    await application.startBiddingIn(auction);
    await auction.hasReceivedJoinRequestFrom(SNIPER_ID);
    await auction.reportPrice(1000, 98, 'other bidder');
    await application.hasShownSniperIsBidding(auction, 1000, 1098);

    await auction.hasReceivedBid(1098, SNIPER_ID);

    await auction.reportPrice(1098, 97, SNIPER_ID);
    await application.hasShownSniperIsWinning(auction, 1098);

    await auction.announceClosed();
    await application.hasShownSniperHasWonAuction(auction, 1098);
  });

  test('sniper bids for multiple items', async ({ page }) => {
    const application = new ApplicationRunner(page);

    await auction.startSellingItem();
    await auction2.startSellingItem();

    await application.startBiddingIn(auction, auction2);
    await auction.hasReceivedJoinRequestFrom(SNIPER_ID);
    await auction2.hasReceivedJoinRequestFrom(SNIPER_ID);

    await auction.reportPrice(1000, 98, 'other bidder');
    await auction.hasReceivedBid(1098, SNIPER_ID);

    await auction2.reportPrice(500, 21, 'other bidder');
    await auction2.hasReceivedBid(521, SNIPER_ID);

    await auction.reportPrice(1098, 97, SNIPER_ID);
    await auction2.reportPrice(521, 22, SNIPER_ID);

    await application.hasShownSniperIsWinning(auction, 1098);
    await application.hasShownSniperIsWinning(auction2, 521);

    await auction.announceClosed();
    await auction2.announceClosed();

    await application.hasShownSniperHasWonAuction(auction, 1098);
    await application.hasShownSniperHasWonAuction(auction2, 521);
  });

  test('sniper loses an auction when the price is too high', async ({ page }) => {
    const application = new ApplicationRunner(page);

    await auction.startSellingItem();

    await application.startBiddingWithStopPrice(auction, 1100);
    await auction.hasReceivedJoinRequestFrom(SNIPER_ID);
    await auction.reportPrice(1000, 98, 'other bidder');
    await application.hasShownSniperIsBidding(auction, 1000, 1098);

    await auction.hasReceivedBid(1098, SNIPER_ID);

    await auction.reportPrice(1197, 10, 'third party');
    await application.hasShownSniperIsLosing(auction, 1197, 1098);

    await auction.reportPrice(1207, 10, 'fourth party');
    await application.hasShownSniperIsLosing(auction, 1207, 1098);

    await auction.announceClosed();
    await application.hasShownSniperHasLostAuction(auction, 1207, 1098);
  });

  test('sniper reports invalid auction message and stops responding to events', async ({
    page
  }) => {
    const application = new ApplicationRunner(page);
    const brokenMessage = 'a broken message';

    await auction.startSellingItem();
    await auction2.startSellingItem();

    await application.startBiddingIn(auction, auction2);
    await auction.hasReceivedJoinRequestFrom(SNIPER_ID);

    await auction.reportPrice(500, 20, 'other bidder');
    await auction.hasReceivedBid(520, SNIPER_ID);

    await auction.sendInvalidMessageContaining(brokenMessage);
    await application.hasShownSniperHasFailed(auction);

    await auction.reportPrice(520, 21, 'other bidder');
    await waitForAnotherAuctionEvent(application);

    await application.reportsInvalidMessage(brokenMessage);
    await application.hasShownSniperHasFailed(auction);
  });

  async function waitForAnotherAuctionEvent(application: ApplicationRunner): Promise<void> {
    await auction2.hasReceivedJoinRequestFrom(SNIPER_ID);
    await auction2.reportPrice(600, 6, 'other bidder');
    await application.hasShownSniperIsBidding(auction2, 600, 606);
  }
});
