import { expect } from '@playwright/test';
import { readFile, rm } from 'node:fs/promises';

import { XMPPAuctionHouse } from '@server/auctionsniper/xmpp/XMPPAuctionHouse.ts';

// 對應 Java 版 assertThat(FileUtils.readFileToString(logFile), matcher)
// （見 ApplicationRunner.java 呼叫時傳入的 containsString(brokenMessage)）。
// LOG_FILE_NAME 沿用 XMPPAuctionHouse 宣告的同一個常數，避免兩處各自維護
// 一份檔名字面值。
export class AuctionLogDriver {
  async hasEntry(expectedSubstring: string): Promise<void> {
    const content = await readFile(XMPPAuctionHouse.LOG_FILE_NAME, 'utf-8').catch(() => '');
    expect(content).toContain(expectedSubstring);
  }

  async clearLog(): Promise<void> {
    await rm(XMPPAuctionHouse.LOG_FILE_NAME, { force: true });
  }
}
