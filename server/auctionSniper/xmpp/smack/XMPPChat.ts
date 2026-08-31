import { xml } from '@xmpp/client';
import type { Client } from '@xmpp/client';

import { XMPPMessage } from './XMPPMessage.ts';
import type { XMPPMessageListener } from './XMPPMessageListener.ts';

export class XMPPChat {
  private listener: XMPPMessageListener | undefined;

  constructor(
    private readonly xmppClient: Client,
    private readonly peerJid: string
  ) {}

  addMessageListener(listener: XMPPMessageListener): void {
    this.listener = listener;
  }

  async sendMessage(_message: XMPPMessage): Promise<void> {
    await this.xmppClient.send(xml('message', { to: this.peerJid, type: 'chat' }));
  }

  deliver(): void {
    this.listener?.processMessage(this, new XMPPMessage());
  }
}
