import { type Page, expect } from '@playwright/test';

export class AuctionSniperDriver {
  constructor(private readonly page: Page) {}

  async showsSniperStatus(statusText: string): Promise<void> {
    await expect(this.page.getByTestId('sniper-status')).toHaveText(statusText);
  }
}
