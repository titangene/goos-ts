// 對應 Java 版 XMPPAuctionException：包裝連線層的失敗，讓呼叫端只需要處理
// 一種例外類型，不需要知道底層失敗的細節。
export class MqttAuctionException extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'MqttAuctionException';
  }
}
