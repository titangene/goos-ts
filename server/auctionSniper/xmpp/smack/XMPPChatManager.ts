import type { Client } from '@xmpp/client';

import { XMPPChat } from './XMPPChat.ts';
import type { XMPPChatManagerListener } from './XMPPChatManagerListener.ts';

export class XMPPChatManager {
  private chat: XMPPChat | undefined;
  private listener: XMPPChatManagerListener | undefined;

  constructor(private readonly xmppClient: Client) {
    xmppClient.on('stanza', stanza => {
      if (!stanza.is('message') || !stanza.attrs.from) return;

      if (!this.chat) {
        this.chat = new XMPPChat(this.xmppClient, stanza.attrs.from);
        this.listener?.chatCreated(this.chat);
      }
      this.chat.deliver();
    });
  }

  addChatListener(listener: XMPPChatManagerListener): void {
    this.listener = listener;
  }
}
