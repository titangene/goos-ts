import { expect } from '@playwright/test';

import type { XMPPChat } from '#server/auctionSniper/xmpp/smack/XMPPChat.ts';
import { XMPPConnection } from '#server/auctionSniper/xmpp/smack/XMPPConnection.ts';
import { XMPPMessage } from '#server/auctionSniper/xmpp/smack/XMPPMessage.ts';
import type { XMPPMessageListener } from '#server/auctionSniper/xmpp/smack/XMPPMessageListener.ts';

export class FakeAuctionServer {
  private readonly messageListener = new SingleMessageListener();

  static readonly XMPP_SERVICE_URL = 'ws://localhost:5280/xmpp-websocket';
  static readonly ITEM_ID_AS_LOGIN = 'auction-%s';
  private static readonly AUCTION_PASSWORD = 'auction';
  static readonly AUCTION_RESOURCE = 'Auction';

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

  async hasReceivedJoinRequestFromSniper(): Promise<void> {
    await this.messageListener.receivesAMessage();
  }

  async announceClosed(): Promise<void> {
    await this.currentChat!.sendMessage(new XMPPMessage());
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

  async receivesAMessage(): Promise<void> {
    await expect.poll(() => this.messages.shift(), { timeout: 5000 }).toBeDefined();
  }
}
