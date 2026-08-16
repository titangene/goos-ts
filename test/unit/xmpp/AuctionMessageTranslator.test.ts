import { describe, expect, it, vi } from 'vitest';

import { PriceSource } from '@server/auctionsniper/AuctionEventListener.ts';
import type { AuctionEventListener } from '@server/auctionsniper/AuctionEventListener.ts';
import { AuctionMessageTranslator } from '@server/auctionsniper/xmpp/AuctionMessageTranslator.ts';
import type { XMPPFailureReporter } from '@server/auctionsniper/xmpp/XMPPFailureReporter.ts';
import { stanzaWithBody } from '@test/unit/xmpp/stanza.ts';

// 1:1 對照 goos-code 的 test/unit/test/auctionsniper/xmpp/AuctionMessageTranslatorTest.java
// （5 個測項、SNIPER_ID、輸入的 SOL 字串皆沿用該檔案）。
const SNIPER_ID = 'sniper id';

describe('AuctionMessageTranslator', () => {
  it('notifies auction closed when close message received', () => {
    const listener = stubListener();
    const translator = new AuctionMessageTranslator(SNIPER_ID, listener, stubFailureReporter());

    translator.processMessage(stanzaWithBody('SOLVersion: 1.1; Event: CLOSE;'));

    expect(listener.auctionClosed).toHaveBeenCalledTimes(1);
  });

  it('notifies bid details when current price message received from other bidder', () => {
    const listener = stubListener();
    const translator = new AuctionMessageTranslator(SNIPER_ID, listener, stubFailureReporter());

    translator.processMessage(
      stanzaWithBody(
        'SOLVersion: 1.1; Event: PRICE; CurrentPrice: 192; Increment: 7; Bidder: Someone else;'
      )
    );

    expect(listener.currentPrice).toHaveBeenCalledWith(192, 7, PriceSource.FromOtherBidder);
  });

  it('notifies bid details when current price message received from sniper', () => {
    const listener = stubListener();
    const translator = new AuctionMessageTranslator(SNIPER_ID, listener, stubFailureReporter());

    translator.processMessage(
      stanzaWithBody(
        `SOLVersion: 1.1; Event: PRICE; CurrentPrice: 192; Increment: 7; Bidder: ${SNIPER_ID};`
      )
    );

    expect(listener.currentPrice).toHaveBeenCalledWith(192, 7, PriceSource.FromSniper);
  });

  it('notifies auction failed when bad message received', () => {
    const listener = stubListener();
    const failureReporter = stubFailureReporter();
    const translator = new AuctionMessageTranslator(SNIPER_ID, listener, failureReporter);
    const badMessage = 'a bad message';

    translator.processMessage(stanzaWithBody(badMessage));

    expectFailureWithMessage(listener, failureReporter, badMessage);
  });

  it('notifies auction failed when event type missing', () => {
    const listener = stubListener();
    const failureReporter = stubFailureReporter();
    const translator = new AuctionMessageTranslator(SNIPER_ID, listener, failureReporter);
    const badMessage = `SOLVersion: 1.1; CurrentPrice: 234; Increment: 5; Bidder: ${SNIPER_ID};`;

    translator.processMessage(stanzaWithBody(badMessage));

    expectFailureWithMessage(listener, failureReporter, badMessage);
  });
});

function stubListener(): AuctionEventListener {
  return { auctionClosed: vi.fn(), auctionFailed: vi.fn(), currentPrice: vi.fn() };
}

function stubFailureReporter(): XMPPFailureReporter {
  return { cannotTranslateMessage: vi.fn() };
}

// 對應 Java 版 AuctionMessageTranslatorTest.expectFailureWithMessage()。
function expectFailureWithMessage(
  listener: AuctionEventListener,
  failureReporter: XMPPFailureReporter,
  badMessage: string
): void {
  expect(listener.auctionFailed).toHaveBeenCalledTimes(1);
  expect(failureReporter.cannotTranslateMessage).toHaveBeenCalledWith(
    SNIPER_ID,
    badMessage,
    expect.anything()
  );
}
