import type { XMPPChat } from './smack/XMPPChat.ts';
import type { XMPPMessage } from './smack/XMPPMessage.ts';

import type { AuctionEventListener } from '#server/auctionSniper/AuctionEventListener.ts';
import type { XMPPMessageListener } from '#server/auctionSniper/xmpp/smack/XMPPMessageListener.ts';

export class AuctionMessageTranslator implements XMPPMessageListener {
  constructor(private readonly listener: AuctionEventListener) {}

  processMessage(_chat: XMPPChat, _message: XMPPMessage): void {
    this.listener.auctionClosed();
  }
}
