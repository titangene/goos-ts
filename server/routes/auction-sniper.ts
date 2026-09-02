import { Main } from '#server/auctionSniper/Main.ts';

export default defineWebSocketHandler({
  async open(peer): Promise<void> {
    const config = useRuntimeConfig();
    const itemId = new URL(peer.request.url).searchParams.get('itemId')!;

    await Main.main(config.public.xmppServiceUrl, config.xmppUsername, config.xmppPassword, itemId);
  }
});
