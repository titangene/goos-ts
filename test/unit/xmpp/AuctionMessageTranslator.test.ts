import { describe, expect, test } from 'vitest';
import { mock } from 'vitest-mock-extended';

import type { AuctionEventListener } from '#server/auctionSniper/AuctionEventListener.ts';
import { AuctionMessageTranslator } from '#server/auctionSniper/xmpp/AuctionMessageTranslator.ts';
import type { XMPPChat } from '#server/auctionSniper/xmpp/smack/XMPPChat.ts';
import { XMPPMessage } from '#server/auctionSniper/xmpp/smack/XMPPMessage.ts';

const UNUSED_CHAT = null as unknown as XMPPChat;

describe('AuctionMessageTranslator', () => {
  test('notifies auction closed when close message received', () => {
    const listener = mock<AuctionEventListener>();
    const translator = new AuctionMessageTranslator(listener);

    const message = new XMPPMessage('SOLVersion: 1.1; Event: CLOSE;');

    translator.processMessage(UNUSED_CHAT, message);

    expect(listener.auctionClosed).toHaveBeenCalledExactlyOnceWith();
  });

  test('notifies bid details when current price message received', () => {
    const listener = mock<AuctionEventListener>();
    const translator = new AuctionMessageTranslator(listener);

    const message = new XMPPMessage(
      'SOLVersion: 1.1; Event: PRICE; CurrentPrice: 192; Increment: 7; Bidder: Someone else;'
    );

    translator.processMessage(UNUSED_CHAT, message);

    expect(listener.currentPrice).toHaveBeenCalledExactlyOnceWith(192, 7);
  });
});
