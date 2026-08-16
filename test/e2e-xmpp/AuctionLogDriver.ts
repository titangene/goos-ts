import { expect } from '@playwright/test';
import { readFile, rm } from 'node:fs/promises';

import { XMPPAuctionHouse } from '@server/auctionsniper/xmpp/XMPPAuctionHouse.ts';

// 對應 Java 版 assertThat(FileUtils.readFileToString(logFile), matcher)
// （見 ApplicationRunner.java 呼叫時傳入的 containsString(brokenMessage)）。
// 完整獨立複製一份 test/e2e/AuctionLogDriver.ts（不 import），只有指向的
// LOG_FILE_NAME 常數來源不同（XMPPAuctionHouse 而非 RedisAuctionHouse，
// 兩者字面值目前剛好相同，但來源刻意保持獨立，見 ADR-0008 Compliance #3）。
export class AuctionLogDriver {
  async hasEntry(expectedSubstring: string): Promise<void> {
    const content = await readFile(XMPPAuctionHouse.LOG_FILE_NAME, 'utf-8').catch(() => '');
    expect(content).toContain(expectedSubstring);
  }

  async clearLog(): Promise<void> {
    await rm(XMPPAuctionHouse.LOG_FILE_NAME, { force: true });
  }
}
