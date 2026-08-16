import { Strophe, stx } from 'strophe.js';

import type { Connection, Stanza } from '@server/auctionsniper/xmpp/StropheTypes.ts';
import { JOIN_COMMAND_FORMAT, bidCommand } from '@server/auctionsniper/xmpp/XMPPAuction.ts';

// 對應 goos-code 的
// test/end-to-end/test/endtoend/auctionsniper/FakeAuctionServer.java。跟
// test/e2e/FakeAuctionServer.ts（Redis 版）是平行、互相獨立的測試替身，
// 不共用程式碼（見 ADR-0008 Compliance #3：XMPP 路徑跟 Redis 路徑並存，
// 互不取代）。
export class FakeAuctionServer {
  static readonly ITEM_ID_AS_LOGIN = 'auction-%s';
  static readonly AUCTION_RESOURCE = 'Auction';
  static readonly SERVICE_URL =
    process.env.XMPP_SERVICE_URL ?? 'ws://localhost:5280/xmpp-websocket';
  static readonly DOMAIN = process.env.XMPP_DOMAIN ?? 'localhost';
  private static readonly AUCTION_PASSWORD = 'auction';

  private readonly messageListener = new SingleMessageListener();
  private readonly connection: Connection;
  private currentParticipant: string | null = null;

  constructor(public readonly itemId: string) {
    this.connection = new Strophe.Connection(FakeAuctionServer.SERVICE_URL);
  }

  async startSellingItem(): Promise<void> {
    const jid = `${FakeAuctionServer.ITEM_ID_AS_LOGIN.replace('%s', this.itemId)}@${FakeAuctionServer.DOMAIN}/${FakeAuctionServer.AUCTION_RESOURCE}`;
    await new Promise<void>((resolve, reject) => {
      this.connection.connect(jid, FakeAuctionServer.AUCTION_PASSWORD, status => {
        if (status === Strophe.Status.CONNECTED) {
          resolve();
        } else if (
          status === Strophe.Status.AUTHFAIL ||
          status === Strophe.Status.CONNFAIL ||
          status === Strophe.Status.ERROR
        ) {
          reject(new Error(`FakeAuctionServer could not connect: Strophe.Status ${status}`));
        }
      });
    });
    // Strophe 沒有 Java 版 ChatManager 的 chatCreated 事件（等一個新對話
    // 被動建立），這裡改成不加 from 過濾條件、接收第一個收到的訊息，記住
    // 對方的完整 JID 當作後續發送的對象——等效於 Java 版 currentChat 的
    // 賦值時機。
    this.connection.addHandler(
      stanza => {
        this.currentParticipant = stanza.getAttribute('from');
        this.messageListener.processMessage(stanza);
        return true;
      },
      null,
      'message',
      'chat'
    );
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

  private async receivesAMessageMatching(sniperId: string, expectedMessage: string): Promise<void> {
    const messageBody = await this.messageListener.receivesAMessage();
    if (messageBody !== expectedMessage) {
      throw new Error(`expected message "${expectedMessage}", got "${messageBody}"`);
    }
    if (this.currentParticipant !== sniperId) {
      throw new Error(`expected participant "${sniperId}", got "${this.currentParticipant}"`);
    }
  }

  announceClosed(): void {
    this.sendMessage('SOLVersion: 1.1; Event: CLOSE;');
  }

  stop(): void {
    this.connection.disconnect();
  }

  private sendMessage(message: string): void {
    if (!this.currentParticipant) {
      throw new Error('No sniper has joined yet');
    }
    this.connection.send(
      stx`<message to="${this.currentParticipant}" type="chat" xmlns="jabber:client"><body>${message}</body></message>`
    );
  }
}

class SingleMessageListener {
  private readonly messages: string[] = [];

  processMessage(stanza: Stanza): void {
    const body = stanza.getElementsByTagName('body')[0]?.textContent ?? '';
    this.messages.push(body);
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
