import { test } from '@playwright/test';

test.describe('auction sniper', () => {
  let auction: FakeAuctionServer;
  let application: ApplicationRunner;

  test.beforeEach(() => {
    auction = new FakeAuctionServer('item-54321');
    application = new ApplicationRunner();
  });

  test.afterEach(async () => {
    await auction.stop();
  });

  test.afterEach(async () => {
    await application.stop();
  });

  test('sniper joins auction until auction closes', async () => {
    await auction.startSellingItem();

    await application.startBiddingIn(auction);
    await auction.hasReceivedJoinRequestFromSniper();

    await auction.announceClosed();
    await application.showsSniperHasLostAuction();
  });
});
