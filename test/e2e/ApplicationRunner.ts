import type { Page } from '@playwright/test';
import { AuctionSniperDriver } from './AuctionSniperDriver.ts';
import { AuctionLogDriver } from './AuctionLogDriver.ts';
import type { MqttFakeAuctionServer } from './MqttFakeAuctionServer.ts';

export const SNIPER_ID = 'sniper';
const NO_STOP_PRICE_LIMIT = 1_000_000_000;

export class ApplicationRunner {
  private readonly driver: AuctionSniperDriver;
  private readonly logDriver = new AuctionLogDriver();

  constructor(page: Page) {
    this.driver = new AuctionSniperDriver(page);
  }

  async startBiddingIn(...auctions: MqttFakeAuctionServer[]): Promise<void> {
    await this.startSniper();
    for (const auction of auctions) {
      await this.openBiddingFor(auction, NO_STOP_PRICE_LIMIT);
    }
  }

  async startBiddingWithStopPrice(
    auction: MqttFakeAuctionServer,
    stopPrice: number,
  ): Promise<void> {
    await this.startSniper();
    await this.openBiddingFor(auction, stopPrice);
  }

  async hasShownSniperHasLostAuction(
    auction: MqttFakeAuctionServer,
    lastPrice: number,
    lastBid: number,
  ): Promise<void> {
    await this.driver.showsSniperStatus(auction.itemId, lastPrice, lastBid, 'Lost');
  }

  async hasShownSniperIsBidding(
    auction: MqttFakeAuctionServer,
    lastPrice: number,
    lastBid: number,
  ): Promise<void> {
    await this.driver.showsSniperStatus(auction.itemId, lastPrice, lastBid, 'Bidding');
  }

  async hasShownSniperIsWinning(auction: MqttFakeAuctionServer, winningBid: number): Promise<void> {
    await this.driver.showsSniperStatus(auction.itemId, winningBid, winningBid, 'Winning');
  }

  async hasShownSniperIsLosing(
    auction: MqttFakeAuctionServer,
    lastPrice: number,
    lastBid: number,
  ): Promise<void> {
    await this.driver.showsSniperStatus(auction.itemId, lastPrice, lastBid, 'Losing');
  }

  async hasShownSniperHasWonAuction(
    auction: MqttFakeAuctionServer,
    lastPrice: number,
  ): Promise<void> {
    await this.driver.showsSniperStatus(auction.itemId, lastPrice, lastPrice, 'Won');
  }

  async hasShownSniperHasFailed(auction: MqttFakeAuctionServer): Promise<void> {
    await this.driver.showsSniperStatus(auction.itemId, 0, 0, 'Failed');
  }

  async reportsInvalidMessage(brokenMessage: string): Promise<void> {
    await this.logDriver.hasEntry(brokenMessage);
  }

  private async startSniper(): Promise<void> {
    await this.logDriver.clearLog();
    await this.driver.goto();
    await this.driver.hasColumnTitles();
  }

  private async openBiddingFor(auction: MqttFakeAuctionServer, stopPrice: number): Promise<void> {
    await this.driver.startBiddingWithStopPrice(auction.itemId, stopPrice);
    await this.driver.showsSniperStatus(auction.itemId, 0, 0, 'Joining');
  }
}
