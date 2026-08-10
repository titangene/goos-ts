import type { MqttFailureReporter } from './MqttFailureReporter.ts';

// 對應 Java 版 LoggingXMPPFailureReporter（命名規則：Logging + 協定 +
// FailureReporter，這裡協定是 Mqtt，所以命名成 LoggingMqttFailureReporter，
// 不是單純的 LoggingFailureReporter）。
//
// 用模版字串直接組字串，不用 MESSAGE_FORMAT.replace('%s', ...) 這種鏈式
// replace——鏈式 replace 有實際的 bug：String.prototype.replace 只換掉
// 第一個符合的地方，如果 failedMessage 或 exception 轉成字串後剛好含有
// 字面上的 "%s"，後面的 .replace('%s', ...) 就會誤換到那段殘留文字，而不
// 是原本設計的下一個佔位符，造成 log 內容錯亂。
//
// writeLine 不提供預設實作，一律由呼叫端（MqttAuctionHouse）透過建構子
// 注入實際要寫去哪裡，這個 class 本身不知道、也不需要知道 log 檔案路徑。
export class LoggingMqttFailureReporter implements MqttFailureReporter {
  constructor(private readonly writeLine: (line: string) => void) {}

  cannotTranslateMessage(sniperId: string, failedMessage: string, exception: unknown): void {
    this.writeLine(
      `<${sniperId}> Could not translate message "${failedMessage}" because "${String(exception)}"`,
    );
  }
}
