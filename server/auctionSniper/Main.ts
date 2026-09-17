import type { Peer } from 'crossws';

import type { AuctionEventListener } from '#server/auctionSniper/AuctionEventListener.ts';
import { AuctionMessageTranslator } from '#server/auctionSniper/xmpp/AuctionMessageTranslator.ts';
import { XMPPConnection } from '#server/auctionSniper/xmpp/smack/XMPPConnection.ts';

const AUCTION_RESOURCE = 'Auction';
const STATUS_LOST = 'Lost';

export const JOIN_COMMAND = 'SOLVersion: 1.1; Command: JOIN;';
export const bidCommand = (price: number): string =>
  `SOLVersion: 1.1; Command: BID; Price: ${price};`;

export class Main implements AuctionEventListener {
  constructor(private readonly peer: Peer) {}

  static async main(
    serviceUrl: string,
    username: string,
    password: string,
    itemId: string,
    peer: Peer
  ): Promise<XMPPConnection> {
    const main = new Main(peer);
    const connection = await XMPPConnection.connect(
      serviceUrl,
      username,
      password,
      AUCTION_RESOURCE
    );
    await main.joinAuction(connection, itemId);
    return connection;
  }

  private async joinAuction(connection: XMPPConnection, itemId: string): Promise<void> {
    const chat = connection
      .getChatManager()
      .createChat(Main.auctionId(itemId, connection), new AuctionMessageTranslator(this));

    await chat.sendMessage(JOIN_COMMAND);
  }

  private static auctionId(itemId: string, connection: XMPPConnection): string {
    return `auction-${itemId}@${connection.getServiceName()}/${AUCTION_RESOURCE}`;
  }

  auctionClosed(): void {
    this.peer.send(STATUS_LOST);
  }
}
