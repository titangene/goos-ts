// 對應 Java 版 auctionsniper.xmpp.XMPPFailureReporter。
export interface XMPPFailureReporter {
  cannotTranslateMessage(auctionId: string, failedMessage: string, exception: Error): void;
}
