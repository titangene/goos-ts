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
    await expect(row.getByTestId('itemId')).toHaveText(itemId);
    await expect(row.getByTestId('lastPrice')).toHaveText(String(lastPrice));
    await expect(row.getByTestId('lastBid')).toHaveText(String(lastBid));
    await expect(row.getByTestId('state')).toHaveText(statusText);
  }

  async startBiddingWithStopPrice(itemId: string, stopPrice: number): Promise<void> {
    await this.page.getByRole('textbox', { name: 'Item Id' }).fill(itemId);
    await this.page.getByRole('spinbutton', { name: 'Stop Price' }).fill(String(stopPrice));
    await this.page.getByRole('button', { name: 'Join' }).click();
  }
}
