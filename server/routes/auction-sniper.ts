import { Main } from '#server/auctionSniper/Main.ts';
import type { XMPPConnection } from '#server/auctionSniper/xmpp/smack/XMPPConnection.ts';

export default defineWebSocketHandler({
  async open(peer): Promise<void> {
    const config = useRuntimeConfig();
    const itemId = new URL(peer.request.url).searchParams.get('itemId')!;

    peer.context.connection = await Main.main(
      config.public.xmppServiceUrl,
      config.xmppUsername,
      config.xmppPassword,
      itemId,
      peer
    );
  },

  async close(peer): Promise<void> {
    await (peer.context.connection as XMPPConnection).disconnect();
  }
});
