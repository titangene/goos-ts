import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

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
      'State'
    ]);
  }

  async showsSniperStatus(
    itemId: string,
    lastPrice: number,
    lastBid: number,
    statusText: string
  ): Promise<void> {
    const row = this.page.locator(`#auction-${itemId}`);
    await expect(await this.cellFor(row, 'Item')).toHaveText(itemId);
    await expect(await this.cellFor(row, 'Last Price')).toHaveText(String(lastPrice));
    await expect(await this.cellFor(row, 'Last Bid')).toHaveText(String(lastBid));
    await expect(await this.cellFor(row, 'State')).toHaveText(statusText);
  }

  private async cellFor(row: Locator, columnName: string): Promise<Locator> {
    const columnNames = await this.page.locator('table thead th').allTextContents();
    const columnIndex = columnNames.indexOf(columnName);
    if (columnIndex === -1) {
      throw new Error(`No column named "${columnName}"`);
    }
    return row.locator('td').nth(columnIndex);
  }

  async startBiddingWithStopPrice(itemId: string, stopPrice: number): Promise<void> {
    await this.page.fill('#new-item-id', itemId);
    await this.page.fill('#new-item-stop-price', String(stopPrice));
    await this.page.click('#join-button');
  }
}
