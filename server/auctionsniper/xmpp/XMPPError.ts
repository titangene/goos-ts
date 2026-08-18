// 對應 Java 版 org.jivesoftware.smack.XMPPException：xmpp.js 底層送出訊息
// 失敗時只會丟出一般 Error，這裡包一層讓呼叫端能明確辨識是連線層的送出失敗。
export class XMPPError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'XMPPError';
  }
}
