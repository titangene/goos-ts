import { xml } from '@xmpp/client';

import { XMPPMessage } from '@server/auctionsniper/xmpp/XMPPMessage.ts';

// 建一個帶 <body> 的 XMPPMessage，模擬 AuctionMessageTranslator 收到的真實
// 訊息（Java 版對照測試傳的是純字串 messageBody，這裡因為 processMessage()
// 收的是 XMPPMessage、不是字串，需要多這一層）。xml() 直接組出底層 stanza
// Element，內容的跳脫由 ltx 序列化時處理，不需要自己組 XML 字串再解析。
export function messageWithBody(body: string): XMPPMessage {
  return new XMPPMessage(xml('message', { xmlns: 'jabber:client' }, xml('body', {}, body)));
}
