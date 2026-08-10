// 對應 Java 版 XMPPFailureReporter。Java 介面宣告的第一個參數叫 auctionId，
// 但實際唯一的呼叫處（AuctionMessageTranslator.java）永遠傳的是 sniperId
// 這個變數，從未真正代表過拍賣本身的 ID——這是書中原始碼自己的命名瑕疵。
// 這裡刻意不逐字沿用，改叫 sniperId，跟 AuctionMessageTranslator、
// MqttAuction 裡代表「我是誰」的其他地方統一命名，避免混淆。
export interface MqttFailureReporter {
  cannotTranslateMessage(sniperId: string, failedMessage: string, exception: unknown): void;
}
