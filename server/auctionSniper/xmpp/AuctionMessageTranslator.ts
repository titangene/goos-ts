import type { XMPPChat } from './smack/XMPPChat.ts';
import type { XMPPMessage } from './smack/XMPPMessage.ts';

import type { AuctionEventListener } from '#server/auctionSniper/AuctionEventListener.ts';
import type { XMPPMessageListener } from '#server/auctionSniper/xmpp/smack/XMPPMessageListener.ts';

export class AuctionMessageTranslator implements XMPPMessageListener {
  constructor(private readonly listener: AuctionEventListener) {}

  processMessage(_chat: XMPPChat, message: XMPPMessage): void {
    const event = this.unpackEventFrom(message);

    const type = event.get('Event');

    if (type === 'CLOSE') {
      this.listener.auctionClosed();
    } else if (type === 'PRICE') {
      this.listener.currentPrice(
        Number.parseInt(event.get('CurrentPrice')!, 10),
        Number.parseInt(event.get('Increment')!, 10)
      );
    }
  }

  private unpackEventFrom(message: XMPPMessage): Map<string, string> {
    const event = new Map<string, string>();

    for (const element of message.getBody()!.split(';')) {
      if (element.trim() === '') continue;

      const pair = element.split(':');
      event.set(pair[0]!.trim(), pair[1]!.trim());
    }

    return event;
  }
}
