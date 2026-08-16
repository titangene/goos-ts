import type { Element } from '@xmpp/xml';

import type { MessageListener } from './MessageListener.ts';
import { XMPPChat } from './XMPPChat.ts';
import type { XMPPConnection } from './XMPPConnection.ts';
import { XMPPMessage } from './XMPPMessage.ts';

// 對應 Java 版 org.jivesoftware.smack.ChatManager（透過
// connection.getChatManager() 取得）。xmpp.js 沒有這個概念，一條連線上
// 收到的所有 stanza 都走同一個 'stanza' event，這裡自己補上兩種 Smack
// ChatManager 支援的建立 Chat 的方式：
//   - createChat(participant, listener)：對應 XMPPAuction 主動發起對話。
//   - addChatListener(listener)：對應 FakeAuctionServer 用
//     ChatManagerListener#chatCreated() 被動接收——收到第一則來自陌生
//     JID 的訊息時自動建立一個新的 XMPPChat 並通知所有註冊的 listener，
//     行為對照書中 FakeAuctionServer.java 的 ChatManagerListener 用法
//     （被動接受任何 sniper 主動建立的對話）。
//
// 比對 key 統一用完整 JID（含 resource），不像 Smack 額外用 thread ID
// 比對——這是刻意的，不是遺漏，見 docs/smack-chatmanager-internals.md
// 「這個比對規則在 TS 版是否需要對應實作」。
//
// ChatManagerListener#chatCreated(chat, createdLocally) 的 createdLocally
// 參數，書中唯一的實作（FakeAuctionServer.java）沒有讀取，這裡因此省略，
// 見 docs/smack-chatmanager-internals.md「MessageListener/ChatManagerListener
// 介面」。
export type ChatCreatedListener = (chat: XMPPChat) => void;

export class XMPPChatManager {
  private readonly chats = new Map<string, XMPPChat>();
  private readonly chatListeners: ChatCreatedListener[] = [];

  constructor(private readonly connection: XMPPConnection) {}

  createChat(participant: string, listener: MessageListener): XMPPChat {
    const chat = new XMPPChat(this.connection, participant, listener);
    this.chats.set(participant, chat);
    this.notifyChatCreated(chat);
    return chat;
  }

  addChatListener(listener: ChatCreatedListener): void {
    this.chatListeners.push(listener);
  }

  removeChat(participant: string): void {
    this.chats.delete(participant);
  }

  dispatch(stanza: Element): void {
    const from = stanza.attrs.from as string | undefined;
    if (!from) {
      return;
    }
    let chat = this.chats.get(from);
    if (!chat) {
      chat = new XMPPChat(this.connection, from);
      this.chats.set(from, chat);
      this.notifyChatCreated(chat);
    }
    chat.dispatch(new XMPPMessage(stanza));
  }

  private notifyChatCreated(chat: XMPPChat): void {
    for (const listener of this.chatListeners) {
      listener(chat);
    }
  }
}
