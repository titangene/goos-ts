import type { Element } from '@xmpp/xml';

// 對應 Java 版 org.jivesoftware.smack.packet.Message。Message 完整 API 還有
// getSubject()/getType()/getBody(language)/getThread() 等，書中程式碼
// （XMPPAuction.java/AuctionMessageTranslator.java/FakeAuctionServer.java）
// 只呼叫過 getBody()，這裡因此只實作這一個方法——把 stanza 解析邏輯集中在
// 這裡，其他地方（AuctionMessageTranslator.ts、FakeAuctionServer.ts 等）
// 不用各自重複 stanza.getChildText('body')。省略項目與依據見
// docs/smack-chatmanager-internals.md「Message/Packet 的完整欄位」。
export class XMPPMessage {
  constructor(private readonly stanza: Element) {}

  getBody(): string {
    return this.stanza.getChildText('body') ?? '';
  }
}
