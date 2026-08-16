import type { MessageListener } from './MessageListener.ts';
import type { XMPPConnection } from './XMPPConnection.ts';
import type { XMPPMessage } from './XMPPMessage.ts';

// 對應 Java 版 org.jivesoftware.smack.Chat（透過
// connection.getChatManager().createChat(auctionJID, translator) 建立，
// 或由 ChatManagerListener#chatCreated() 被動收到）。xmpp.js 沒有內建這個
// 概念，用 XMPPChatManager.ts 補上（見該檔案說明）。
export class XMPPChat {
  private listener: MessageListener | null;

  constructor(
    private readonly connection: XMPPConnection,
    private readonly participant: string,
    listener: MessageListener | null = null
  ) {
    this.listener = listener;
  }

  getParticipant(): string {
    return this.participant;
  }

  sendMessage(messageBody: string): void {
    this.connection.send(this.participant, messageBody);
  }

  addMessageListener(listener: MessageListener): void {
    this.listener = listener;
  }

  removeMessageListener(listener: MessageListener): void {
    if (listener === this.listener) {
      this.listener = null;
    }
  }

  dispatch(message: XMPPMessage): void {
    this.listener?.processMessage(this, message);
  }
}
