import { readFile, rm } from 'node:fs/promises';
import { LOG_FILE_NAME } from '../../server/auctionsniper/redis/LoggingFailureReporter.ts';

export class AuctionLogDriver {
  async hasEntry(expectedSubstring: string): Promise<void> {
    const content = await readFile(LOG_FILE_NAME, 'utf-8').catch(() => '');
    if (!content.includes(expectedSubstring)) {
      throw new Error(`expected log file to contain "${expectedSubstring}", got: "${content}"`);
    }
  }

  async clearLog(): Promise<void> {
    await rm(LOG_FILE_NAME, { force: true });
  }
}
