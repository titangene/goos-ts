import { expect } from '@playwright/test';

import { bidCommand, JOIN_COMMAND } from '#server/auctionSniper/Main.ts';
import type { XMPPChat } from '#server/auctionSniper/xmpp/smack/XMPPChat.ts';
import { XMPPConnection } from '#server/auctionSniper/xmpp/smack/XMPPConnection.ts';
import type { XMPPMessage } from '#server/auctionSniper/xmpp/smack/XMPPMessage.ts';
import type { XMPPMessageListener } from '#server/auctionSniper/xmpp/smack/XMPPMessageListener.ts';

export class FakeAuctionServer {
  private readonly messageListener = new SingleMessageListener();

  static readonly XMPP_SERVICE_URL = 'ws://localhost:5280/xmpp-websocket';
  static readonly ITEM_ID_AS_LOGIN = 'auction-%s';
  private static readonly AUCTION_PASSWORD = 'auction';
  static readonly AUCTION_RESOURCE = 'Auction';

  static get XMPP_HOSTNAME(): string {
    return new URL(FakeAuctionServer.XMPP_SERVICE_URL).hostname;
  }

  private connection: XMPPConnection | null = null;
  private currentChat: XMPPChat | null = null;

  constructor(private readonly itemId: string) {}

  async startSellingItem(): Promise<void> {
    this.connection = await XMPPConnection.connect(
      FakeAuctionServer.XMPP_SERVICE_URL,
      FakeAuctionServer.ITEM_ID_AS_LOGIN.replace('%s', this.itemId),
      FakeAuctionServer.AUCTION_PASSWORD,
      FakeAuctionServer.AUCTION_RESOURCE
    );
    this.connection.getChatManager().addChatListener({
      chatCreated: (chat: XMPPChat) => {
        this.currentChat = chat;
        chat.addMessageListener(this.messageListener);
      }
    });
  }

  getItemId(): string {
    return this.itemId;
  }

  async reportPrice(price: number, increment: number, bidder: string): Promise<void> {
    await this.currentChat!.sendMessage(
      `SOLVersion: 1.1; Event: PRICE; CurrentPrice: ${price}; Increment: ${increment}; Bidder: ${bidder};`
    );
  }

  async hasReceivedJoinRequestFrom(sniperId: string): Promise<void> {
    await this.receivesAMessageMatching(sniperId, body => expect(body).toBe(JOIN_COMMAND));
  }

  async hasReceivedBid(bid: number, sniperId: string): Promise<void> {
    await this.receivesAMessageMatching(sniperId, body => expect(body).toBe(bidCommand(bid)));
  }

  private async receivesAMessageMatching(
    sniperId: string,
    assertBody: (body: string | undefined) => void
  ): Promise<void> {
    await this.messageListener.receivesAMessage(assertBody);
    expect(this.currentChat!.getParticipant()).toBe(sniperId);
  }

  async announceClosed(): Promise<void> {
    await this.currentChat!.sendMessage('SOLVersion: 1.1; Event: CLOSE;');
  }

  async stop(): Promise<void> {
    await this.connection!.disconnect();
  }
}

class SingleMessageListener implements XMPPMessageListener {
  private readonly messages: XMPPMessage[] = [];

  processMessage(_chat: XMPPChat, message: XMPPMessage): void {
    this.messages.push(message);
  }

  async receivesAMessage(assertBody: (body: string | undefined) => void): Promise<void> {
    let message: XMPPMessage | undefined;
    await expect.poll(() => (message = this.messages.shift()), { timeout: 5000 }).toBeDefined();
    assertBody(message!.getBody());
  }
}
