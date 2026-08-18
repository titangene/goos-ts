import { AuctionMessageTranslator } from './AuctionMessageTranslator.ts';
import type { XMPPChat } from './XMPPChat.ts';
import type { XMPPConnection } from './XMPPConnection.ts';
import type { XMPPFailureReporter } from './XMPPFailureReporter.ts';
import type { Auction } from '@server/auctionsniper/Auction.ts';
import type {
  AuctionEventListener,
  PriceSource
} from '@server/auctionsniper/AuctionEventListener.ts';
import { Announcer } from '@server/auctionsniper/util/Announcer.ts';

// 對應 Java 版 auctionsniper.xmpp.XMPPAuction。書中原文的 JOIN/BID 訊息完全
// 沒有 Bidder 欄位：真正的 XMPP chat 天生帶有寄件人身分（對方看得到 stanza
// 的 from 屬性），不需要在訊息內容裡另外重複帶一次。
// 對應 Java 版 XMPPAuction.JOIN_COMMAND_FORMAT/BID_COMMAND_FORMAT——書中把
// 這兩個常數宣告成 public static final，讓 production code 跟測試（見
// test/e2e/FakeAuctionServer.ts）共用同一份格式定義，這裡一併 export 出去
// 維持同樣的用途。
export const JOIN_COMMAND_FORMAT = 'SOLVersion: 1.1; Command: JOIN;';
export function bidCommand(amount: number): string {
  return `SOLVersion: 1.1; Command: BID; Price: ${amount};`;
}

export class XMPPAuction implements Auction {
  private readonly auctionEventListeners = Announcer.to<AuctionEventListener>();
  private readonly chat: XMPPChat;

  constructor(
    connection: XMPPConnection,
    auctionJID: string,
    failureReporter: XMPPFailureReporter
  ) {
    const translator = this.translatorFor(connection, failureReporter);
    // 對應 Java 版 connection.getChatManager().createChat(auctionJID,
    // translator)。
    this.chat = connection.getChatManager().createChat(auctionJID, translator);
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

  private translatorFor(
    connection: XMPPConnection,
    failureReporter: XMPPFailureReporter
  ): AuctionMessageTranslator {
    return new AuctionMessageTranslator(
      connection.getUser(),
      this.auctionEventListeners.announce(),
      failureReporter
    );
  }

  // translator 參數本身沒被用到，保留這個參數只是為了跟 Java 版
  // chatDisconnectorFor(final AuctionMessageTranslator translator) 的方法
  // 簽章維持結構對應。
  private chatDisconnectorFor(translator: AuctionMessageTranslator): AuctionEventListener {
    return {
      auctionFailed: () => this.chat.removeMessageListener(translator),
      auctionClosed: () => {},
      currentPrice: (_price: number, _increment: number, _priceSource: PriceSource) => {}
    };
  }

  // 對應 Java 版 try/catch + e.printStackTrace()——已查證 GOOS 全書只有這一處
  // 處理 XMPPException，作者明確承認這是暫時性折衷但從未在書中後續章節改進，
  // 這裡對齊原始碼的最終定案，就地接住、印出後不往外傳播。
  private sendMessage(message: string): void {
    this.chat.sendMessage(message).catch((error: unknown) => {
      console.error(error);
    });
  }
}
