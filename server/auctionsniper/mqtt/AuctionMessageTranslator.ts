import { PriceSource } from '../AuctionEventListener.ts';
import type { AuctionEventListener } from '../AuctionEventListener.ts';
import type { Bidder } from './Message.ts';
import type { MqttChat } from './MqttChat.ts';
import type { MessageListener } from './MessageListener.ts';
import type { MqttFailureReporter } from './MqttFailureReporter.ts';

export class AuctionMessageTranslator implements MessageListener {
  private readonly listener: AuctionEventListener;
  private readonly sniperId: Bidder;
  private readonly failureReporter: MqttFailureReporter;

  constructor(
    sniperId: Bidder,
    listener: AuctionEventListener,
    failureReporter: MqttFailureReporter,
  ) {
    this.sniperId = sniperId;
    this.listener = listener;
    this.failureReporter = failureReporter;
  }

  processMessage(_chat: MqttChat, messageBody: string): void {
    try {
      this.translate(messageBody);
    } catch (parseException) {
      this.failureReporter.cannotTranslateMessage(
        this.sniperId,
        messageBody,
        parseException as Error,
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
        event.isFrom(this.sniperId),
      );
    }
  }
}

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

class MissingValueException extends Error {
  constructor(fieldName: string) {
    super(`Missing value for ${fieldName}`);
    this.name = 'MissingValueException';
  }
}
