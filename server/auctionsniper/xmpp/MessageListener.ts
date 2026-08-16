import type { XMPPChat } from './XMPPChat.ts';
import type { XMPPMessage } from './XMPPMessage.ts';

// 對應 Java 版 org.jivesoftware.smack.MessageListener，簽章比照 Java 版
// void processMessage(Chat chat, Message message) 的兩參數形狀——chat 參數
// 在 Java 版本身也沒被用到（見 AuctionMessageTranslator.java），這裡維持
// 同樣的「保留但不用」慣例，不是 TS port 自己發明的。
export interface MessageListener {
  processMessage(chat: XMPPChat, message: XMPPMessage): void;
}
