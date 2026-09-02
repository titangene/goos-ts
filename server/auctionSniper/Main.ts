import { XMPPMessage } from '#server/auctionSniper/xmpp/smack/XMPPMessage.ts';
import { XMPPConnection } from '#server/auctionSniper/xmpp/smack/XMPPConnection.ts';

const AUCTION_RESOURCE = 'Auction';

export class Main {
  static async main(
    serviceUrl: string,
    username: string,
    password: string,
    itemId: string
  ): Promise<void> {
    const connection = await XMPPConnection.connect(serviceUrl, username, password, AUCTION_RESOURCE);

    const chat = connection.getChatManager().createChat(Main.auctionId(itemId, connection), {
      processMessage: () => {
        // nothing yet
      }
    });
    await chat.sendMessage(new XMPPMessage());
  }

  private static auctionId(itemId: string, connection: XMPPConnection): string {
    return `auction-${itemId}@${connection.getServiceName()}/${AUCTION_RESOURCE}`;
  }
}
