import type { Peer } from 'crossws';

import { XMPPMessage } from '#server/auctionSniper/xmpp/smack/XMPPMessage.ts';
import { XMPPConnection } from '#server/auctionSniper/xmpp/smack/XMPPConnection.ts';

const AUCTION_RESOURCE = 'Auction';
const STATUS_LOST = 'Lost';

export class Main {
  static async main(
    serviceUrl: string,
    username: string,
    password: string,
    itemId: string,
    peer: Peer
  ): Promise<void> {
    const main = new Main();
    const connection = await XMPPConnection.connect(
      serviceUrl,
      username,
      password,
      AUCTION_RESOURCE
    );
    await main.joinAuction(connection, itemId, peer);
  }

  private async joinAuction(connection: XMPPConnection, itemId: string, peer: Peer): Promise<void> {
    const chat = connection.getChatManager().createChat(Main.auctionId(itemId, connection), {
      processMessage: () => {
        peer.send(STATUS_LOST);
      }
    });
    await chat.sendMessage(new XMPPMessage());
  }

  private static auctionId(itemId: string, connection: XMPPConnection): string {
    return `auction-${itemId}@${connection.getServiceName()}/${AUCTION_RESOURCE}`;
  }
}
