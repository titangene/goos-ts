import type { Stanza } from './StropheTypes.ts';
import type { XMPPFailureReporter } from './XMPPFailureReporter.ts';
import type { AuctionEventListener } from '@server/auctionsniper/AuctionEventListener.ts';
import { PriceSource } from '@server/auctionsniper/AuctionEventListener.ts';

// 對應 Java 版 auctionsniper.xmpp.AuctionMessageTranslator，implements
// org.jivesoftware.smack.MessageListener。Strophe 沒有 Chat 物件，
// processMessage() 因此只收 stanza（不像 Java 版收 (Chat chat, Message message)
// 兩個參數），這個方法本身的簽章對應 Strophe.Connection#addHandler 的 callback
// 型別（見 StropheTypes.ts），回傳 true 讓 handler 保持註冊——移除 handler
// 是 XMPPAuction 的 chatDisconnectorFor() 職責，不是這個方法自己決定。
export class AuctionMessageTranslator {
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

  processMessage(stanza: Stanza): boolean {
    // xmldom（Strophe 在 Node.js 底下使用的 XML DOM 實作）沒有實作
    // querySelector，只能用 getElementsByTagName（已實測驗證）。
    const messageBody = stanza.getElementsByTagName('body')[0]?.textContent ?? '';
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
    return true;
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
