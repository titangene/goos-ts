import { PriceSource } from '../AuctionEventListener.ts';
import type { AuctionEventListener } from '../AuctionEventListener.ts';
import type { Bidder } from './Message.ts';
import type { MqttFailureReporter } from './MqttFailureReporter.ts';

// 對應 Java 版 private static class MissingValueException（
// AuctionMessageTranslator 的 sibling private class，不是 AuctionEvent 的
// nested class）。
class MissingValueException extends Error {
  constructor(fieldName: string) {
    super(`Missing value for ${fieldName}`);
    this.name = 'MissingValueException';
  }
}

// 對應 Java 版 auctionsniper.xmpp.AuctionMessageTranslator 的 private static
// class AuctionEvent：只服務「Event:」方向（PRICE/CLOSE），lazy 提供欄位，
// 只有在被呼叫時才驗證存不存在，不是一次性 eager 解析成完整物件。
// isFrom() 掛在事件物件本身，不是外部拿欄位自己比對。
class AuctionEvent {
  private readonly fields = new Map<string, string>();

  private constructor() {}

  static from(messageBody: string): AuctionEvent {
    const event = new AuctionEvent();
    for (const field of AuctionEvent.fieldsIn(messageBody)) {
      event.addField(field);
    }
    return event;
  }

  private static fieldsIn(messageBody: string): string[] {
    // Java 的 String.split(regex) 預設會去掉結尾的空字串（結尾的 ";" 不會
    // 多出一個空元素），JS 的 split 不會，這裡用 filter 補上同樣的效果。
    return messageBody.split(';').filter((field) => field !== '');
  }

  type(): string {
    return this.get('Event');
  }

  currentPrice(): number {
    return this.getInt('CurrentPrice');
  }

  increment(): number {
    return this.getInt('Increment');
  }

  isFrom(sniperId: Bidder): PriceSource {
    return this.bidder() === sniperId ? PriceSource.FromSniper : PriceSource.FromOtherBidder;
  }

  private bidder(): string {
    return this.get('Bidder');
  }

  private getInt(fieldName: string): number {
    return Number(this.get(fieldName));
  }

  private get(fieldName: string): string {
    const value = this.fields.get(fieldName);
    if (value === undefined) {
      throw new MissingValueException(fieldName);
    }
    return value;
  }

  private addField(field: string): void {
    const pair = field.split(':');
    this.fields.set(pair[0]!.trim(), pair[1]!.trim());
  }
}

// 對應 Java 版 AuctionMessageTranslator。
export class AuctionMessageTranslator {
  constructor(
    private readonly sniperId: Bidder,
    private readonly listener: AuctionEventListener,
    private readonly failureReporter: MqttFailureReporter,
  ) {}

  processMessage(messageBody: string): void {
    try {
      this.translate(messageBody);
    } catch (parseException) {
      this.failureReporter.cannotTranslateMessage(this.sniperId, messageBody, parseException);
      this.listener.auctionFailed();
    }
  }

  private translate(messageBody: string): void {
    const event = AuctionEvent.from(messageBody);
    const eventType = event.type();
    if (eventType === 'CLOSE') {
      this.listener.auctionClosed();
    }
    if (eventType === 'PRICE') {
      this.listener.currentPrice(
        event.currentPrice(),
        event.increment(),
        event.isFrom(this.sniperId),
      );
    }
  }
}
