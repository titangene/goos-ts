import { appendFileSync } from 'node:fs';
import { Strophe } from 'strophe.js';

import type { Logger } from './Logger.ts';
import { LoggingXMPPFailureReporter } from './LoggingXMPPFailureReporter.ts';
import type { Connection } from './StropheTypes.ts';
import { XMPPAuction } from './XMPPAuction.ts';
import { XMPPAuctionException } from './XMPPAuctionException.ts';
import type { Auction } from '@server/auctionsniper/Auction.ts';
import type { AuctionHouse } from '@server/auctionsniper/AuctionHouse.ts';
import type { Item } from '@server/auctionsniper/UserRequestListener.ts';

// 對應 Java 版 auctionsniper.xmpp.XMPPAuctionHouse.AUCTION_RESOURCE。書中
// 原始碼裡，sniper 自己的連線跟它要連的拍賣現場，兩者的 JID resource 都是
// 這個常數（一併查證過 goos-code 原始碼，確認不是筆誤，是書中範例本身就
// 共用同一個常數）。
const AUCTION_RESOURCE = 'Auction';

// 需要真正的 SASL 失敗判斷，跟 Redis 版（ADR-0003：不做密碼驗證，只比對
// username 白名單）不同：Prosody 是真實的第三方 XMPP server，密碼驗證
// 100% 委託給它（跟書中 Java 版 XMPPAuctionHouse.connect() 把帳密原封不動
// 交給 connection.login() 一致，見 ADR-0003 Context）。
const FAILURE_STATUSES: readonly number[] = [
  Strophe.Status.CONNFAIL,
  Strophe.Status.AUTHFAIL,
  Strophe.Status.ERROR,
  Strophe.Status.CONNTIMEOUT
];

// 對應 Java 版 auctionsniper.xmpp.XMPPAuctionHouse。
export class XMPPAuctionHouse implements AuctionHouse {
  static readonly LOG_FILE_NAME = 'auction-sniper.log';

  private readonly connection: Connection;
  private readonly domain: string;
  private readonly failureReporter: LoggingXMPPFailureReporter;

  private constructor(connection: Connection, domain: string) {
    this.connection = connection;
    this.domain = domain;
    this.failureReporter = new LoggingXMPPFailureReporter(this.makeLogger());
  }

  auctionFor(item: Item): Auction {
    return new XMPPAuction(this.connection, this.auctionId(item.identifier), this.failureReporter);
  }

  disconnect(): void {
    this.connection.disconnect();
  }

  static async connect(
    serviceUrl: string,
    domain: string,
    username: string,
    password: string
  ): Promise<XMPPAuctionHouse> {
    const connection = new Strophe.Connection(serviceUrl);
    return new Promise((resolve, reject) => {
      connection.connect(`${username}@${domain}/${AUCTION_RESOURCE}`, password, status => {
        if (status === Strophe.Status.CONNECTED) {
          resolve(new XMPPAuctionHouse(connection, domain));
        } else if (FAILURE_STATUSES.includes(status)) {
          reject(
            new XMPPAuctionException(
              `Could not connect to auction: ${serviceUrl}`,
              new Error(`Strophe.Status ${status}`)
            )
          );
        }
        // 其餘狀態（CONNECTING、AUTHENTICATING…）是連線過程中的中繼狀態，
        // 不對應 resolve 或 reject，等下一次 callback 觸發。
      });
    });
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
