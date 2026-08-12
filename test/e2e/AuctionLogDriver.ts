import { readFile, rm } from 'node:fs/promises';

import { RedisAuctionHouse } from '@server/auctionsniper/redis/RedisAuctionHouse.ts';

export class AuctionLogDriver {
  async hasEntry(expectedSubstring: string): Promise<void> {
    const content = await readFile(RedisAuctionHouse.LOG_FILE_NAME, 'utf-8').catch(() => '');
    if (!content.includes(expectedSubstring)) {
      throw new Error(`expected log file to contain "${expectedSubstring}", got: "${content}"`);
    }
  }

  async clearLog(): Promise<void> {
    await rm(RedisAuctionHouse.LOG_FILE_NAME, { force: true });
  }
}
