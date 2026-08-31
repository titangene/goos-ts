import type { XMPPChat } from './XMPPChat.ts';

export interface XMPPChatManagerListener {
  chatCreated(chat: XMPPChat): void;
}
