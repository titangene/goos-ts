import { expect } from '@playwright/test';
import { readFile, rm } from 'node:fs/promises';

import { RedisAuctionHouse } from '@server/auctionsniper/redis/RedisAuctionHouse.ts';

export class AuctionLogDriver {
  // 對應 Java 版 assertThat(FileUtils.readFileToString(logFile), matcher)
  // （見 ApplicationRunner.java 呼叫時傳入的 containsString(brokenMessage)）。
  async hasEntry(expectedSubstring: string): Promise<void> {
    const content = await readFile(RedisAuctionHouse.LOG_FILE_NAME, 'utf-8').catch(() => '');
    expect(content).toContain(expectedSubstring);
  }

  async clearLog(): Promise<void> {
    await rm(RedisAuctionHouse.LOG_FILE_NAME, { force: true });
  }
}
