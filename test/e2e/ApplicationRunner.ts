import type { Page } from '@playwright/test';

import { AuctionLogDriver } from './AuctionLogDriver.ts';
import { AuctionSniperDriver } from './AuctionSniperDriver.ts';
import type { FakeAuctionServer } from './FakeAuctionServer.ts';
import { SniperState } from '@server/auctionsniper/SniperState.ts';
import { SnipersTableModel } from '@server/auctionsniper/ui/SnipersTableModel.ts';

export const SNIPER_ID = 'sniper';
const NO_STOP_PRICE_LIMIT = 1_000_000_000;

export class ApplicationRunner {
  private readonly driver: AuctionSniperDriver;
  private readonly logDriver = new AuctionLogDriver();

  constructor(page: Page) {
    this.driver = new AuctionSniperDriver(page);
  }

  async startBiddingIn(...auctions: FakeAuctionServer[]): Promise<void> {
    await this.startSniper();
    for (const auction of auctions) {
      await this.openBiddingFor(auction, NO_STOP_PRICE_LIMIT);
    }
  }

  async startBiddingWithStopPrice(auction: FakeAuctionServer, stopPrice: number): Promise<void> {
    await this.startSniper();
    await this.openBiddingFor(auction, stopPrice);
  }

  async hasShownSniperHasLostAuction(
    auction: FakeAuctionServer,
    lastPrice: number,
    lastBid: number
  ): Promise<void> {
    await this.driver.showsSniperStatus(
      auction.itemId,
      lastPrice,
      lastBid,
      SnipersTableModel.textFor(SniperState.LOST)
    );
  }

  async hasShownSniperIsBidding(
    auction: FakeAuctionServer,
    lastPrice: number,
    lastBid: number
  ): Promise<void> {
    await this.driver.showsSniperStatus(
      auction.itemId,
      lastPrice,
      lastBid,
      SnipersTableModel.textFor(SniperState.BIDDING)
    );
  }

  async hasShownSniperIsWinning(auction: FakeAuctionServer, winningBid: number): Promise<void> {
    await this.driver.showsSniperStatus(
      auction.itemId,
      winningBid,
      winningBid,
      SnipersTableModel.textFor(SniperState.WINNING)
    );
  }

  async hasShownSniperIsLosing(
    auction: FakeAuctionServer,
    lastPrice: number,
    lastBid: number
  ): Promise<void> {
    await this.driver.showsSniperStatus(
      auction.itemId,
      lastPrice,
      lastBid,
      SnipersTableModel.textFor(SniperState.LOSING)
    );
  }

  async hasShownSniperHasWonAuction(auction: FakeAuctionServer, lastPrice: number): Promise<void> {
    await this.driver.showsSniperStatus(
      auction.itemId,
      lastPrice,
      lastPrice,
      SnipersTableModel.textFor(SniperState.WON)
    );
  }

  async hasShownSniperHasFailed(auction: FakeAuctionServer): Promise<void> {
    await this.driver.showsSniperStatus(
      auction.itemId,
      0,
      0,
      SnipersTableModel.textFor(SniperState.FAILED)
    );
  }

  async reportsInvalidMessage(brokenMessage: string): Promise<void> {
    await this.logDriver.hasEntry(brokenMessage);
  }

  private async startSniper(): Promise<void> {
    await this.logDriver.clearLog();
    await this.driver.goto();
    await this.driver.hasColumnTitles();
  }

  private async openBiddingFor(auction: FakeAuctionServer, stopPrice: number): Promise<void> {
    await this.driver.startBiddingWithStopPrice(auction.itemId, stopPrice);
    await this.driver.showsSniperStatus(
      auction.itemId,
      0,
      0,
      SnipersTableModel.textFor(SniperState.JOINING)
    );
  }
}
