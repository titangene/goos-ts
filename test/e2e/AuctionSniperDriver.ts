import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

export class AuctionSniperDriver {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/');
  }

  async hasColumnTitles(): Promise<void> {
    await expect(this.page.locator('table thead th')).toHaveText([
      'Item',
      'Last Price',
      'Last Bid',
      'State',
    ]);
  }

  async showsSniperStatus(
    itemId: string,
    lastPrice: number,
    lastBid: number,
    statusText: string,
  ): Promise<void> {
    const row = this.page.locator(`#auction-${itemId}`);
    await expect(row.locator('td.itemId')).toHaveText(itemId);
    await expect(row.locator('td.lastPrice')).toHaveText(String(lastPrice));
    await expect(row.locator('td.lastBid')).toHaveText(String(lastBid));
    await expect(row.locator('td.state')).toHaveText(statusText);
  }

  async startBiddingWithStopPrice(itemId: string, stopPrice: number): Promise<void> {
    await this.page.fill('#new-item-id', itemId);
    await this.page.fill('#new-item-stop-price', String(stopPrice));
    await this.page.click('#join-button');
  }
}
