import { appendFileSync } from 'node:fs';

import type { Logger } from './Logger.ts';
import { LoggingXMPPFailureReporter } from './LoggingXMPPFailureReporter.ts';
import { XMPPAuction } from './XMPPAuction.ts';
import { XMPPAuctionException } from './XMPPAuctionException.ts';
import { XMPPConnection } from './XMPPConnection.ts';
import type { Auction } from '@server/auctionsniper/Auction.ts';
import type { AuctionHouse } from '@server/auctionsniper/AuctionHouse.ts';
import type { Item } from '@server/auctionsniper/UserRequestListener.ts';

// 對應 Java 版 auctionsniper.xmpp.XMPPAuctionHouse.AUCTION_RESOURCE。書中
// 原始碼裡，sniper 自己的連線跟它要連的拍賣現場，兩者的 JID resource 都是
// 這個常數（一併查證過 goos-code 原始碼，確認不是筆誤，是書中範例本身就
// 共用同一個常數）。
const AUCTION_RESOURCE = 'Auction';

// 對應 Java 版 auctionsniper.xmpp.XMPPAuctionHouse。
export class XMPPAuctionHouse implements AuctionHouse {
  static readonly LOG_FILE_NAME = 'auction-sniper.log';

  private readonly connection: XMPPConnection;
  private readonly domain: string;
  private readonly failureReporter: LoggingXMPPFailureReporter;

  private constructor(connection: XMPPConnection, domain: string) {
    this.connection = connection;
    this.domain = domain;
    this.failureReporter = new LoggingXMPPFailureReporter(this.makeLogger());
  }

  auctionFor(item: Item): Auction {
    return new XMPPAuction(this.connection, this.auctionId(item.identifier), this.failureReporter);
  }

  async disconnect(): Promise<void> {
    await this.connection.disconnect();
  }

  static async connect(
    serviceUrl: string,
    domain: string,
    username: string,
    password: string
  ): Promise<XMPPAuctionHouse> {
    // 密碼驗證 100% 委託給 Prosody 這個真實的第三方 XMPP server（跟書中
    // Java 版 XMPPAuctionHouse.connect() 把帳密原封不動交給
    // connection.login() 一致），這裡只負責把連線/驗證失敗包裝成
    // XMPPAuctionException（見 ADR-0003 Context）。
    try {
      const connection = await XMPPConnection.connect(
        serviceUrl,
        domain,
        username,
        password,
        AUCTION_RESOURCE
      );
      return new XMPPAuctionHouse(connection, domain);
    } catch (cause) {
      throw new XMPPAuctionException(`Could not connect to auction: ${serviceUrl}`, cause);
    }
  }

  private auctionId(itemId: string): string {
    return `auction-${itemId}@${this.domain}/${AUCTION_RESOURCE}`;
  }

  private makeLogger(): Logger {
    return {
      severe: message => appendFileSync(XMPPAuctionHouse.LOG_FILE_NAME, `${message}\n`)
    };
  }
}
