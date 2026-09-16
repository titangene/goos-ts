import { test } from '@playwright/test';

import { ApplicationRunner, SNIPER_XMPP_ID } from './ApplicationRunner.ts';
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
    await auction.hasReceivedJoinRequestFrom(SNIPER_XMPP_ID);

    await auction.announceClosed();
    await application.showsSniperHasLostAuction();
  });

  test('sniper makes a higher bid but loses', async () => {
    await auction.startSellingItem();

    await application.startBiddingIn(auction);
    await auction.hasReceivedJoinRequestFrom(SNIPER_XMPP_ID);

    await auction.reportPrice(1000, 98, 'other bidder');
    await application.hasShownSniperIsBidding();

    await auction.hasReceivedBid(1098, SNIPER_XMPP_ID);

    await auction.announceClosed();
    await application.showsSniperHasLostAuction();
  });
});
