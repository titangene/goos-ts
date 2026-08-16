// 對應 Java 版 auctionsniper.xmpp.XMPPAuctionException。
export class XMPPAuctionException extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'XMPPAuctionException';
  }
}
