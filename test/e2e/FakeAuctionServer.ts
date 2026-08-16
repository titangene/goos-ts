import { expect } from 'vitest';

import { JOIN_COMMAND_FORMAT, bidCommand } from '@server/auctionsniper/xmpp/XMPPAuction.ts';
import type { XMPPChat } from '@server/auctionsniper/xmpp/XMPPChat.ts';
import { XMPPConnection } from '@server/auctionsniper/xmpp/XMPPConnection.ts';
import type { XMPPMessage } from '@server/auctionsniper/xmpp/XMPPMessage.ts';

// 對應 goos-code 的
// test/end-to-end/test/endtoend/auctionsniper/FakeAuctionServer.java。跟
// production code 共用同一套 XMPPConnection/XMPPChatManager 抽象（見
// docs/differences-from-java.md），用
// connection.getChatManager().addChatListener() 被動接收第一個 sniper 主動
// 建立的 chat，對照 Java 版的 ChatManagerListener#chatCreated()。
//
// 比照 Java 版 XMPPAuctionHouseTest.java 直接 import
// test.endtoend.auctionsniper.FakeAuctionServer 的慣例（Java 只有一份
// FakeAuctionServer，integration 測試重用 e2e 套件那份，不是各自獨立複製）：
// 這個檔案放在 test/e2e/，同時被 test/e2e/*.test.ts（Playwright）與
// test/integration/XMPPAuctionHouse.test.ts（Vitest）匯入使用，底下用的
// vitest 的 expect() 已實測驗證在 Playwright test runner 內一樣能正常運作
// （不依賴 vitest 的執行環境，是獨立可用的斷言函式）。
export class FakeAuctionServer {
  static readonly ITEM_ID_AS_LOGIN = 'auction-%s';
  static readonly AUCTION_RESOURCE = 'Auction';
  static readonly SERVICE_URL =
    process.env.XMPP_SERVICE_URL ?? 'ws://localhost:5280/xmpp-websocket';
  static readonly DOMAIN = process.env.XMPP_DOMAIN ?? 'localhost';
  private static readonly AUCTION_PASSWORD = 'auction';

  private readonly messageListener = new SingleMessageListener();
  private connection: XMPPConnection | null = null;
  private currentChat: XMPPChat | null = null;

  constructor(public readonly itemId: string) {}

  async startSellingItem(): Promise<void> {
    // Java 版建構子先 new XMPPConnection(hostname)、startSellingItem() 才
    // connect()/login()：XMPPConnection.connect() 把這三步驟合併成一個
    // async factory（見 docs/differences-from-java.md），這裡因此
    // 沒有分開的建構子連線步驟，直接在 startSellingItem() 一次做完。
    try {
      this.connection = await XMPPConnection.connect(
        FakeAuctionServer.SERVICE_URL,
        FakeAuctionServer.DOMAIN,
        FakeAuctionServer.ITEM_ID_AS_LOGIN.replace('%s', this.itemId),
        FakeAuctionServer.AUCTION_PASSWORD,
        FakeAuctionServer.AUCTION_RESOURCE
      );
    } catch (error) {
      throw new Error(`FakeAuctionServer could not connect: ${String(error)}`, { cause: error });
    }
    this.connection.getChatManager().addChatListener(chat => {
      this.currentChat = chat;
      chat.addMessageListener(this.messageListener);
    });
  }

  sendInvalidMessageContaining(brokenMessage: string): void {
    this.sendMessage(brokenMessage);
  }

  reportPrice(price: number, increment: number, bidder: string): void {
    this.sendMessage(
      `SOLVersion: 1.1; Event: PRICE; CurrentPrice: ${price}; Increment: ${increment}; Bidder: ${bidder};`
    );
  }

  async hasReceivedJoinRequestFrom(sniperId: string): Promise<void> {
    await this.receivesAMessageMatching(sniperId, JOIN_COMMAND_FORMAT);
  }

  async hasReceivedBid(bid: number, sniperId: string): Promise<void> {
    await this.receivesAMessageMatching(sniperId, bidCommand(bid));
  }

  // 對應 Java 版 receivesAMessageMatching()：用 assertThat(...,
  // equalTo(...)) 比對，不是手寫 if/throw——比照 vitest 的 expect().toBe()。
  private async receivesAMessageMatching(sniperId: string, expectedMessage: string): Promise<void> {
    const messageBody = await this.messageListener.receivesAMessage();
    expect(messageBody).toBe(expectedMessage);
    expect(this.currentChat?.getParticipant()).toBe(sniperId);
  }

  announceClosed(): void {
    this.sendMessage('SOLVersion: 1.1; Event: CLOSE;');
  }

  async stop(): Promise<void> {
    await this.connection?.disconnect();
  }

  private sendMessage(message: string): void {
    if (!this.currentChat) {
      throw new Error('No sniper has joined yet');
    }
    this.currentChat.sendMessage(message);
  }
}

class SingleMessageListener {
  private readonly messages: string[] = [];

  processMessage(_chat: XMPPChat, message: XMPPMessage): void {
    this.messages.push(message.getBody());
  }

  async receivesAMessage(): Promise<string> {
    const deadline = Date.now() + 5000;

    while (Date.now() < deadline) {
      const messageBody = this.messages.shift();
      if (messageBody !== undefined) {
        return messageBody;
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    throw new Error('No message received within timeout');
  }
}
