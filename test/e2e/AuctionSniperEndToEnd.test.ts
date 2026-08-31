import { test } from '@playwright/test';

import { ApplicationRunner } from './ApplicationRunner.ts';
import { FakeAuctionServer } from './FakeAuctionServer.ts';

test.describe('auction sniper', () => {
  let auction: FakeAuctionServer;
  let application: ApplicationRunner;

  test.beforeEach(({ page }) => {
    auction = new FakeAuctionServer('item-54321');
    application = new ApplicationRunner(page);
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
