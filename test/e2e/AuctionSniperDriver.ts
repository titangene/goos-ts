import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

// goto() 需要外部傳入 baseUrl，因為每個測試都是全新 server process、監聽
// 同一個固定 port（見 ApplicationRunner.ts），不是共用單一長駐 server，
// 沒有 Playwright 全域 baseURL 設定可以直接沿用。
export class AuctionSniperDriver {
  constructor(private readonly page: Page) {}

  async goto(baseUrl: string): Promise<void> {
    await this.page.goto(baseUrl);
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
    statusText: string,
    timeout?: number
  ): Promise<void> {
    const row = this.page.locator(`#auction-${itemId}`);
    await expect(row.getByTestId('itemId')).toHaveText(itemId, { timeout });
    await expect(row.getByTestId('lastPrice')).toHaveText(String(lastPrice), { timeout });
    await expect(row.getByTestId('lastBid')).toHaveText(String(lastBid), { timeout });
    await expect(row.getByTestId('state')).toHaveText(statusText, { timeout });
  }

  async startBiddingWithStopPrice(itemId: string, stopPrice: number): Promise<void> {
    await this.page.getByRole('textbox', { name: 'Item Id' }).fill(itemId);
    await this.page.getByRole('spinbutton', { name: 'Stop Price' }).fill(String(stopPrice));
    await this.page.getByRole('button', { name: 'Join' }).click();
  }
}
