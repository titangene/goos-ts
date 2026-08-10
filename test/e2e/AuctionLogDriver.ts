import { readFile, rm } from 'node:fs/promises';
import { MqttAuctionHouse } from '../../server/auctionsniper/mqtt/MqttAuctionHouse.ts';

export class AuctionLogDriver {
  async hasEntry(expectedSubstring: string): Promise<void> {
    const content = await readFile(MqttAuctionHouse.LOG_FILE_NAME, 'utf-8').catch(() => '');
    if (!content.includes(expectedSubstring)) {
      throw new Error(`expected log file to contain "${expectedSubstring}", got: "${content}"`);
    }
  }

  async clearLog(): Promise<void> {
    await rm(MqttAuctionHouse.LOG_FILE_NAME, { force: true });
  }
}
