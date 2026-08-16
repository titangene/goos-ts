import type { MessageListener } from './MessageListener.ts';
import type { XMPPChat } from './XMPPChat.ts';
import type { XMPPFailureReporter } from './XMPPFailureReporter.ts';
import type { XMPPMessage } from './XMPPMessage.ts';
import type { AuctionEventListener } from '@server/auctionsniper/AuctionEventListener.ts';
import { PriceSource } from '@server/auctionsniper/AuctionEventListener.ts';

// 對應 Java 版 auctionsniper.xmpp.AuctionMessageTranslator，implements
// org.jivesoftware.smack.MessageListener。chat 參數（見 MessageListener.ts）
// 在 Java 版本身也沒被用到，這裡維持同樣的「保留但不用」慣例。
export class AuctionMessageTranslator implements MessageListener {
  private readonly listener: AuctionEventListener;
  private readonly sniperId: string;
  private readonly failureReporter: XMPPFailureReporter;

  constructor(
    sniperId: string,
    listener: AuctionEventListener,
    failureReporter: XMPPFailureReporter
  ) {
    this.sniperId = sniperId;
    this.listener = listener;
    this.failureReporter = failureReporter;
  }

  processMessage(_chat: XMPPChat, message: XMPPMessage): void {
    const messageBody = message.getBody();
    try {
      this.translate(messageBody);
    } catch (parseException) {
      this.failureReporter.cannotTranslateMessage(
        this.sniperId,
        messageBody,
        parseException as Error
      );
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
        event.isFrom(this.sniperId)
      );
    }
  }
}

class AuctionEvent {
  private readonly fields = new Map<string, string>();

  private constructor() {}

  type(): string {
    return this.get('Event');
  }

  currentPrice(): number {
    return this.getInt('CurrentPrice');
  }

  increment(): number {
    return this.getInt('Increment');
  }

  isFrom(sniperId: string): PriceSource {
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

  static from(messageBody: string): AuctionEvent {
    const event = new AuctionEvent();
    for (const field of AuctionEvent.fieldsIn(messageBody)) {
      event.addField(field);
    }
    return event;
  }

  // Java 的 String.split(regex) 預設會丟掉結尾的空字串，JS 的
  // String.prototype.split() 不會，所以要自己 filter 掉，否則
  // "SOLVersion: 1.1; Event: CLOSE;".split(';') 最後會多一個空字串欄位。
  private static fieldsIn(messageBody: string): string[] {
    return messageBody.split(';').filter(field => field !== '');
  }
}

class MissingValueException extends Error {
  constructor(fieldName: string) {
    super(`Missing value for ${fieldName}`);
    this.name = 'MissingValueException';
  }
}
