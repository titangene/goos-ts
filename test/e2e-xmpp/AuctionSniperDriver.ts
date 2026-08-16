import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

// 完整獨立複製一份 test/e2e/AuctionSniperDriver.ts（不 import，見
// ADR-0008 Compliance #3：XMPP 路徑跟 Redis 路徑並存，互不取代）。跟
// Redis 版唯一的差異是 goto() 需要外部傳入 baseUrl——每個測試都是全新
// server process、監聽同一個固定 port（見 ApplicationRunner.ts），不像
// Redis 版整個測試期間只有一個長駐 server 可以直接沿用 Playwright 設定的
// baseURL。
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
