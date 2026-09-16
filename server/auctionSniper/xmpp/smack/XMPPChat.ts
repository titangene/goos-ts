import type { Client } from '@xmpp/client';
import { xml } from '@xmpp/client';

import { XMPPMessage } from './XMPPMessage.ts';
import type { XMPPMessageListener } from './XMPPMessageListener.ts';

export class XMPPChat {
  private listener: XMPPMessageListener | undefined;

  constructor(
    private readonly xmppClient: Client,
    private readonly participant: string
  ) {}

  getParticipant(): string {
    return this.participant;
  }

  addMessageListener(listener: XMPPMessageListener): void {
    this.listener = listener;
  }

  async sendMessage(text?: string): Promise<void> {
    const message = xml('message', { to: this.participant, type: 'chat' });
    if (text !== undefined) {
      message.append(xml('body', {}, text));
    }
    await this.xmppClient.send(message);
  }

  deliver(body: string | undefined): void {
    this.listener?.processMessage(this, new XMPPMessage(body));
  }
}
