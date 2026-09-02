import type { Client } from '@xmpp/client';

import { XMPPChat } from './XMPPChat.ts';
import type { XMPPChatManagerListener } from './XMPPChatManagerListener.ts';
import type { XMPPMessageListener } from './XMPPMessageListener.ts';

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

  createChat(peerJid: string, listener: XMPPMessageListener): XMPPChat {
    this.chat = new XMPPChat(this.xmppClient, peerJid);
    this.chat.addMessageListener(listener);
    return this.chat;
  }
}
