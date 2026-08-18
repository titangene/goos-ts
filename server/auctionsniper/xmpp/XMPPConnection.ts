import { client as createXmppClient, xml } from '@xmpp/client';
import type { Client } from '@xmpp/client';

import { XMPPChatManager } from './XMPPChatManager.ts';

// 對應 Java 版 org.jivesoftware.smack.XMPPConnection：包住底層函式庫的
// 連線細節，XMPPAuction.ts/XMPPAuctionHouse.ts 不需要知道底下是
// @xmpp/client。connect() 把 Java 版分開的 new XMPPConnection(hostname) +
// connection.connect() + connection.login(...) 三步驟合併成一個 async
// factory，因為 @xmpp/client 本身的 client()/start() 就是這樣設計的，見
// docs/differences-from-java.md。
export class XMPPConnection {
  private readonly chatManager: XMPPChatManager;

  private constructor(private readonly xmppClient: Client) {
    this.chatManager = new XMPPChatManager(this);
    // xmpp.js 一條連線上的所有 stanza 都走同一個 'stanza' event，不像
    // Smack 內部會先解析出 Chat 再呼叫對應的 MessageListener——這裡把
    // 「訊息屬於哪個 Chat」的判斷全部交給 XMPPChatManager 處理，
    // XMPPConnection 自己不知道 Chat 的存在。
    this.xmppClient.on('stanza', stanza => {
      if (!stanza.is('message')) {
        return;
      }
      this.chatManager.dispatch(stanza);
    });
  }

  // 對應 Java 版 connection.getUser()：回傳含 resource 的完整 JID。
  getUser(): string {
    // start() resolve 後 xmppClient.jid 一定已經綁定，型別上是 JID | null
    // 只是因為連線建立之前也合法是 null。
    return this.xmppClient.jid!.toString();
  }

  getChatManager(): XMPPChatManager {
    return this.chatManager;
  }

  send(to: string, messageBody: string): void {
    // @xmpp/client 的 send() 回傳 Promise，但這裡是 fire-and-forget
    // （不像 Smack chat.sendMessage() 會丟 checked XMPPException），
    // 沒有對應的例外處理需要接。
    void this.xmppClient.send(xml('message', { to, type: 'chat' }, xml('body', {}, messageBody)));
  }

  async disconnect(): Promise<void> {
    await this.xmppClient.stop();
  }

  static async connect(
    serviceUrl: string,
    domain: string,
    username: string,
    password: string,
    resource: string
  ): Promise<XMPPConnection> {
    const xmppClient = createXmppClient({
      service: serviceUrl,
      domain,
      resource,
      username,
      password
    });
    // 已實測驗證：@xmpp/client 的 start() 本身在連線/驗證失敗時就會
    // reject（例如密碼錯誤會丟 SASLError），不需要自己攤開一份
    // 「哪些狀態算失敗」的清單手動判斷、手動包 Promise。
    await xmppClient.start();
    return new XMPPConnection(xmppClient);
  }
}
