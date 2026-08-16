import type { Page } from '@playwright/test';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';

import { AuctionLogDriver } from './AuctionLogDriver.ts';
import { AuctionSniperDriver } from './AuctionSniperDriver.ts';
import { FakeAuctionServer } from './FakeAuctionServer.ts';
import { SniperState } from '@server/auctionsniper/SniperState.ts';
import { SnipersTableModel } from '@server/auctionsniper/ui/SnipersTableModel.ts';

export const SNIPER_ID = 'sniper';
export const SNIPER_PASSWORD = 'sniper';
// 對應 Java 版 ApplicationRunner.SNIPER_XMPP_ID = SNIPER_ID + "@" +
// XMPP_HOSTNAME + "/Auction"。
export const SNIPER_XMPP_ID = `${SNIPER_ID}@${FakeAuctionServer.DOMAIN}/${FakeAuctionServer.AUCTION_RESOURCE}`;

const NO_STOP_PRICE_LIMIT = 1_000_000_000;
const PORT = 3101;
const BASE_URL = `http://localhost:${PORT}`;
const SERVER_READY_TIMEOUT_MS = 20_000;

// startSniper()/stop() 比照 Java 版 ApplicationRunner.java 的
// startSniper()（`new Thread(...) { run() {
// Main.main(...) } }.start()`——每個測試都起一份全新的物件圖）跟 stop()
// （`driver.dispose()` 觸發 Main.java 的 disconnectWhenUICloses()）：每個
// 測試都 spawn 一個全新的 server process，帶一份全新的
// portfolio/tableModel，測試結束時整個 process 關掉，觸發
// server/plugins/init-sniper-launcher.ts 掛的
// nitroApp.hooks.hook('close', ...) → auctionHouse.disconnect()。Node 的
// 模組層級狀態是 process 生命週期，沒有等價於 Java「同一個 JVM 內
// new Main() 就拿到全新物件圖」的做法，只能整個 process 重開才能確保狀態
// 全新——這是 TS 版必要的落差，詳細比較見 docs/differences-from-java.md。
export class ApplicationRunner {
  private readonly driver: AuctionSniperDriver;
  private readonly logDriver = new AuctionLogDriver();
  private serverProcess: ChildProcess | null = null;

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

  // 對應 Java 版 driver.dispose()。
  async stop(): Promise<void> {
    const process_ = this.serverProcess;
    if (!process_) {
      return;
    }
    const exited = new Promise<void>(resolve => {
      process_.once('exit', () => resolve());
    });
    process_.kill();
    await exited;
    this.serverProcess = null;
  }

  private async startSniper(): Promise<void> {
    await this.logDriver.clearLog();
    this.serverProcess = spawn('node', ['.output/server/index.mjs'], {
      env: {
        ...process.env,
        PORT: String(PORT),
        NUXT_SNIPER_ID: SNIPER_ID
      },
      stdio: 'ignore'
    });
    await waitForServerReady(BASE_URL);
    await this.driver.goto(BASE_URL);
    await this.driver.hasColumnTitles();
  }

  // 這裡有先天的競速，跟 Java 版同一個位置的競速性質相同：Java 版
  // Main.main() 的 XMPPAuctionHouse.connect() 是背景執行緒裡的同步呼叫，
  // driver.hasColumnTitles()（startSniper() 最後一步）只確認視窗已顯示，
  // 不保證 connect() 已完成、main.addUserRequestListenerFor() 已把
  // SniperLauncher 接上；TS 版同理，waitForServerReady() 只確認 HTTP
  // server 已經在聽，不保證 sniper-registry.ts 的
  // XMPPAuctionHouse.connect() 已完成（實測會撞到
  // 'SniperLauncher is not initialized yet' 500 錯誤）。這裡用短暫重試
  // 取代任意猜測的固定等待時間，只在每個測試第一次呼叫
  // openBiddingFor()（也就是 XMPP 連線可能還沒就緒的窗口）需要重試，
  // 之後同一個測試內的呼叫連線早就緒了。
  private async openBiddingFor(auction: FakeAuctionServer, stopPrice: number): Promise<void> {
    const attempts = 5;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        await this.driver.startBiddingWithStopPrice(auction.itemId, stopPrice);
        await this.driver.showsSniperStatus(
          auction.itemId,
          0,
          0,
          SnipersTableModel.textFor(SniperState.JOINING),
          1000
        );
        return;
      } catch (error) {
        if (attempt === attempts) {
          throw error;
        }
      }
    }
  }
}

async function waitForServerReady(url: string): Promise<void> {
  const deadline = Date.now() + SERVER_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // server 還沒開始接受連線，繼續等待。
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`server did not become ready at ${url} within ${SERVER_READY_TIMEOUT_MS}ms`);
}
