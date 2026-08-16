import { stx } from 'strophe.js';

import { AuctionMessageTranslator } from './AuctionMessageTranslator.ts';
import type { Connection } from './StropheTypes.ts';
import type { XMPPFailureReporter } from './XMPPFailureReporter.ts';
import type { Auction } from '@server/auctionsniper/Auction.ts';
import type {
  AuctionEventListener,
  PriceSource
} from '@server/auctionsniper/AuctionEventListener.ts';
import { Announcer } from '@server/auctionsniper/util/Announcer.ts';

// 對應 Java 版 auctionsniper.xmpp.XMPPAuction。書中原文的 JOIN/BID 訊息完全
// 沒有 Bidder 欄位（不像 Redis 版的 Message.ts，因為 Redis Pub/Sub 沒有
// XMPP 連線層級的身分，見 docs/differences-from-java.md 第 2 節）：真正的
// XMPP chat 天生帶有寄件人身分（對方看得到 stanza 的 from 屬性），不需要
// 在訊息內容裡另外重複帶一次。
// 對應 Java 版 XMPPAuction.JOIN_COMMAND_FORMAT/BID_COMMAND_FORMAT——書中把
// 這兩個常數宣告成 public static final，讓 production code 跟測試（見
// test/integration/xmpp/FakeAuctionServer.ts）共用同一份格式定義，這裡一併
// export 出去維持同樣的用途。
export const JOIN_COMMAND_FORMAT = 'SOLVersion: 1.1; Command: JOIN;';
export function bidCommand(amount: number): string {
  return `SOLVersion: 1.1; Command: BID; Price: ${amount};`;
}

export class XMPPAuction implements Auction {
  private readonly auctionEventListeners = Announcer.to<AuctionEventListener>();
  private readonly connection: Connection;
  private readonly auctionJID: string;
  private handlerRef: ReturnType<Connection['addHandler']> | null;

  constructor(connection: Connection, auctionJID: string, failureReporter: XMPPFailureReporter) {
    this.connection = connection;
    this.auctionJID = auctionJID;
    const translator = this.translatorFor(failureReporter);
    // ADR-0009 Compliance #3：用 addHandler 的 from 參數依對話（auctionJID）
    // 過濾，對應 Java 版 connection.getChatManager().createChat(auctionJID,
    // translator) 建立的 1:1 Chat 語意——Strophe 沒有 Chat 物件，這裡直接
    // 註冊一個只接收該 auctionJID 訊息的 handler。
    this.handlerRef = this.connection.addHandler(
      stanza => translator.processMessage(stanza),
      null,
      'message',
      'chat',
      null,
      this.auctionJID
    );
    this.addAuctionEventListener(this.chatDisconnectorFor(translator));
  }

  bid(amount: number): void {
    this.sendMessage(bidCommand(amount));
  }

  join(): void {
    this.sendMessage(JOIN_COMMAND_FORMAT);
  }

  addAuctionEventListener(listener: AuctionEventListener): void {
    this.auctionEventListeners.addListener(listener);
  }

  private translatorFor(failureReporter: XMPPFailureReporter): AuctionMessageTranslator {
    return new AuctionMessageTranslator(
      this.connection.jid,
      this.auctionEventListeners.announce(),
      failureReporter
    );
  }

  // translator 參數本身沒被用到（用 handlerRef 記住的 handler 參照就夠
  // 移除），保留這個參數只是為了跟 Java 版 chatDisconnectorFor(final
  // AuctionMessageTranslator translator) 的方法簽章維持結構對應。
  private chatDisconnectorFor(_translator: AuctionMessageTranslator): AuctionEventListener {
    return {
      auctionFailed: () => {
        if (this.handlerRef) {
          this.connection.deleteHandler(this.handlerRef);
          this.handlerRef = null;
        }
      },
      auctionClosed: () => {},
      currentPrice: (_price: number, _increment: number, _priceSource: PriceSource) => {}
    };
  }

  private sendMessage(message: string): void {
    // Strophe 的 send() 是 fire-and-forget（void，不丟例外），不像 Smack 的
    // chat.sendMessage() 會丟 checked XMPPException 讓 Java 版包一層
    // try/catch + e.printStackTrace()——這裡沒有對應的例外可以接。
    this.connection.send(
      stx`<message to="${this.auctionJID}" type="chat" xmlns="jabber:client"><body>${message}</body></message>`
    );
  }
}
