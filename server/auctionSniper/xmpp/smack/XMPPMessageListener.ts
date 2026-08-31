import type { XMPPChat } from './XMPPChat.ts';
import type { XMPPMessage } from './XMPPMessage.ts';

export interface XMPPMessageListener {
  processMessage(chat: XMPPChat, message: XMPPMessage): void;
}
