import type { XMPPChat } from './smack/XMPPChat.ts';
import type { XMPPMessage } from './smack/XMPPMessage.ts';

import type { AuctionEventListener } from '#server/auctionSniper/AuctionEventListener.ts';

export class AuctionMessageTranslator {
  constructor(private readonly listener: AuctionEventListener) {}

  processMessage(_chat: XMPPChat, _message: XMPPMessage): void {
    this.listener.auctionClosed();
  }
}
