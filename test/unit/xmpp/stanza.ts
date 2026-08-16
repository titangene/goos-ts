import { Strophe } from 'strophe.js';

import type { Stanza } from '@server/auctionsniper/xmpp/StropheTypes.ts';

// 建一個帶 <body> 的 <message> stanza，模擬 Strophe.Connection#addHandler
// 收到的真實 stanza（Java 版對照測試傳的是純字串 messageBody，這裡因為
// Strophe 的 handler 收的是 stanza Element、不是字串，需要多這一層）。
export function stanzaWithBody(body: string): Stanza {
  return Strophe.Stanza.toElement(
    `<message xmlns="jabber:client"><body>${escapeXmlText(body)}</body></message>`
  );
}

function escapeXmlText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
