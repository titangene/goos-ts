import { describe, expect, it, vi } from 'vitest';

import { PriceSource } from '@server/auctionsniper/AuctionEventListener.ts';
import type { AuctionEventListener } from '@server/auctionsniper/AuctionEventListener.ts';
import { AuctionMessageTranslator } from '@server/auctionsniper/xmpp/AuctionMessageTranslator.ts';
import type { XMPPChat } from '@server/auctionsniper/xmpp/XMPPChat.ts';
import type { XMPPFailureReporter } from '@server/auctionsniper/xmpp/XMPPFailureReporter.ts';
import { messageWithBody } from '@test/unit/message.ts';

// 1:1 對照 goos-code 的 test/unit/test/auctionsniper/xmpp/AuctionMessageTranslatorTest.java
// （5 個測項、SNIPER_ID、輸入的 SOL 字串皆沿用該檔案）。jMock 的
// Mockery 預設是嚴格 mock：Expectations 區塊沒列出的呼叫，一律視為測試
// 失敗（等於隱含斷言「其他方法都沒被呼叫」）。vi.fn() 不是嚴格 mock，
// 這裡因此每個測項都明確補上「沒被預期的方法沒被呼叫」的斷言，讓涵蓋範圍
// 對齊 Java 版每個 Expectations 區塊實際保證的內容，不只是複製有寫在
// Expectations 裡的那幾行。
const SNIPER_ID = 'sniper id';
// processMessage() 的 chat 參數不影響翻譯邏輯，測試不需要真的建一個。
const UNUSED_CHAT = null as unknown as XMPPChat;

describe('AuctionMessageTranslator', () => {
  it('notifies auction closed when close message received', () => {
    const listener = stubListener();
    const failureReporter = stubFailureReporter();
    const translator = new AuctionMessageTranslator(SNIPER_ID, listener, failureReporter);

    translator.processMessage(UNUSED_CHAT, messageWithBody('SOLVersion: 1.1; Event: CLOSE;'));

    expect(listener.auctionClosed).toHaveBeenCalledTimes(1);
    expect(listener.currentPrice).not.toHaveBeenCalled();
    expect(listener.auctionFailed).not.toHaveBeenCalled();
    expect(failureReporter.cannotTranslateMessage).not.toHaveBeenCalled();
  });

  it('notifies bid details when current price message received from other bidder', () => {
    const listener = stubListener();
    const failureReporter = stubFailureReporter();
    const translator = new AuctionMessageTranslator(SNIPER_ID, listener, failureReporter);

    translator.processMessage(
      UNUSED_CHAT,
      messageWithBody(
        'SOLVersion: 1.1; Event: PRICE; CurrentPrice: 192; Increment: 7; Bidder: Someone else;'
      )
    );

    expect(listener.currentPrice).toHaveBeenCalledTimes(1);
    expect(listener.currentPrice).toHaveBeenCalledWith(192, 7, PriceSource.FromOtherBidder);
    expect(listener.auctionClosed).not.toHaveBeenCalled();
    expect(listener.auctionFailed).not.toHaveBeenCalled();
    expect(failureReporter.cannotTranslateMessage).not.toHaveBeenCalled();
  });

  it('notifies bid details when current price message received from sniper', () => {
    const listener = stubListener();
    const failureReporter = stubFailureReporter();
    const translator = new AuctionMessageTranslator(SNIPER_ID, listener, failureReporter);

    translator.processMessage(
      UNUSED_CHAT,
      messageWithBody(
        `SOLVersion: 1.1; Event: PRICE; CurrentPrice: 192; Increment: 7; Bidder: ${SNIPER_ID};`
      )
    );

    expect(listener.currentPrice).toHaveBeenCalledTimes(1);
    expect(listener.currentPrice).toHaveBeenCalledWith(192, 7, PriceSource.FromSniper);
    expect(listener.auctionClosed).not.toHaveBeenCalled();
    expect(listener.auctionFailed).not.toHaveBeenCalled();
    expect(failureReporter.cannotTranslateMessage).not.toHaveBeenCalled();
  });

  it('notifies auction failed when bad message received', () => {
    const listener = stubListener();
    const failureReporter = stubFailureReporter();
    const translator = new AuctionMessageTranslator(SNIPER_ID, listener, failureReporter);
    const badMessage = 'a bad message';

    translator.processMessage(UNUSED_CHAT, messageWithBody(badMessage));

    expectFailureWithMessage(listener, failureReporter, badMessage);
  });

  it('notifies auction failed when event type missing', () => {
    const listener = stubListener();
    const failureReporter = stubFailureReporter();
    const translator = new AuctionMessageTranslator(SNIPER_ID, listener, failureReporter);
    const badMessage = `SOLVersion: 1.1; CurrentPrice: 234; Increment: 5; Bidder: ${SNIPER_ID};`;

    translator.processMessage(UNUSED_CHAT, messageWithBody(badMessage));

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
  expect(failureReporter.cannotTranslateMessage).toHaveBeenCalledTimes(1);
  expect(failureReporter.cannotTranslateMessage).toHaveBeenCalledWith(
    SNIPER_ID,
    badMessage,
    expect.anything()
  );
  expect(listener.auctionClosed).not.toHaveBeenCalled();
  expect(listener.currentPrice).not.toHaveBeenCalled();
}
