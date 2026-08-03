import { describe, expect, it, vi } from 'vitest';
import { Message } from '../../../server/auctionsniper/redis/Message.ts';
import { AuctionMessageTranslator } from '../../../server/auctionsniper/redis/AuctionMessageTranslator.ts';
import { PriceSource } from '../../../server/auctionsniper/AuctionEventListener.ts';
import type { AuctionEventListener } from '../../../server/auctionsniper/AuctionEventListener.ts';
import type { RedisFailureReporter } from '../../../server/auctionsniper/redis/RedisFailureReporter.ts';

const sniperId = 'sniper';

function stubListener(): AuctionEventListener {
  return { auctionClosed: vi.fn(), auctionFailed: vi.fn(), currentPrice: vi.fn() };
}

function stubFailureReporter(): RedisFailureReporter {
  return { cannotTranslateMessage: vi.fn() };
}

describe('an auction message translator', () => {
  it('notifies the auction when a close message has been received', () => {
    const listener = stubListener();
    const translator = new AuctionMessageTranslator(sniperId, listener, stubFailureReporter());

    translator.processMessage(JSON.stringify(Message.Close()));

    expect(listener.auctionClosed).toHaveBeenCalled();
  });

  describe('notifies bid details when current price message received', () => {
    it('from other bidder', () => {
      const listener = stubListener();
      const translator = new AuctionMessageTranslator(sniperId, listener, stubFailureReporter());

      translator.processMessage(JSON.stringify(Message.Price(192, 7, 'Someone else')));

      expect(listener.currentPrice).toHaveBeenCalledWith(192, 7, PriceSource.FromOtherBidder);
    });

    it('from sniper', () => {
      const listener = stubListener();
      const translator = new AuctionMessageTranslator(sniperId, listener, stubFailureReporter());

      translator.processMessage(JSON.stringify(Message.Price(192, 7, sniperId)));

      expect(listener.currentPrice).toHaveBeenCalledWith(192, 7, PriceSource.FromSniper);
    });
  });

  it('notifies failure and reports it when the message cannot be translated', () => {
    const listener = stubListener();
    const failureReporter = stubFailureReporter();
    const translator = new AuctionMessageTranslator(sniperId, listener, failureReporter);
    const badMessage = 'not json';

    translator.processMessage(badMessage);

    expect(listener.auctionFailed).toHaveBeenCalled();
    expect(failureReporter.cannotTranslateMessage).toHaveBeenCalledWith(
      sniperId,
      badMessage,
      expect.anything(),
    );
  });

  it('notifies failure when a price message is missing required fields', () => {
    const listener = stubListener();
    const failureReporter = stubFailureReporter();
    const translator = new AuctionMessageTranslator(sniperId, listener, failureReporter);

    translator.processMessage(JSON.stringify({ command: 'Price' }));

    expect(listener.auctionFailed).toHaveBeenCalled();
    expect(failureReporter.cannotTranslateMessage).toHaveBeenCalled();
  });
});
