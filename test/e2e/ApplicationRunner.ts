import type { Page } from '@playwright/test';
import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';

import { AuctionSniperDriver } from './AuctionSniperDriver.ts';
import { FakeAuctionServer } from './FakeAuctionServer.ts';

const STATUS_JOINING = 'Joining';
const STATUS_LOST = 'Lost';

const XMPP_USERNAME = 'sniper';
const XMPP_PASSWORD = 'sniper';

const PREVIEW_SERVER_PORT = '3000';

export class ApplicationRunner {
  constructor(private readonly page: Page) {}

  private driver: AuctionSniperDriver | null = null;
  private serverProcess: ChildProcess | null = null;

  async startBiddingIn(auction: FakeAuctionServer): Promise<void> {
    this.serverProcess = spawn('node', ['.output/server/index.mjs'], {
      env: {
        ...process.env,
        PORT: PREVIEW_SERVER_PORT,
        NUXT_PUBLIC_XMPP_SERVICE_URL: FakeAuctionServer.XMPP_SERVICE_URL,
        NUXT_XMPP_USERNAME: XMPP_USERNAME,
        NUXT_XMPP_PASSWORD: XMPP_PASSWORD
      },
      stdio: 'inherit'
    });

    const url = `http://localhost:${PREVIEW_SERVER_PORT}?itemId=${auction.getItemId()}`;
    await this.waitUntilServerReady(url, 1000);

    await this.page.goto(url);

    this.driver = new AuctionSniperDriver(this.page);
    await this.driver.showsSniperStatus(STATUS_JOINING);
  }

  async showsSniperHasLostAuction(): Promise<void> {
    await this.driver!.showsSniperStatus(STATUS_LOST);
  }

  async stop(): Promise<void> {
    this.serverProcess!.kill();
  }

  private async waitUntilServerReady(url: string, timeoutMilliseconds: number): Promise<void> {
    const deadline = Date.now() + timeoutMilliseconds;
    while (Date.now() < deadline) {
      try {
        const response = await fetch(url);
        if (response.ok) return;
      } catch {
        // server 尚未就緒，忽略錯誤繼續輪詢
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Server isn't ready within ${timeoutMilliseconds}ms`);
  }
}
