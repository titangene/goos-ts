import { clearLine, createInterface, cursorTo } from 'node:readline';

import type { XMPPChat } from '../server/auctionSniper/xmpp/smack/XMPPChat.ts';
import { XMPPConnection } from '../server/auctionSniper/xmpp/smack/XMPPConnection.ts';

const AUCTION_RESOURCE = 'Auction';
const AUCTION_PASSWORD = 'auction';

async function main(): Promise<void> {
  const itemId = process.argv[2];
  if (!itemId) {
    console.error('usage: npm run fake-auction -- <itemId>');
    process.exit(1);
  }

  const serviceUrl = process.env.NUXT_PUBLIC_XMPP_SERVICE_URL;
  if (!serviceUrl) {
    console.error(
      'NUXT_PUBLIC_XMPP_SERVICE_URL is not set (create .env.dev.local, see README, or .env.production.local, see docs/deploy.md)'
    );
    process.exit(1);
  }

  let connection: XMPPConnection;
  try {
    connection = await XMPPConnection.connect(
      serviceUrl,
      `auction-${itemId}`,
      AUCTION_PASSWORD,
      AUCTION_RESOURCE
    );
  } catch (error) {
    console.error(`Could not connect to ${serviceUrl}:`, error);
    process.exit(1);
  }

  let sniperChat: XMPPChat | null = null;

  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: '>>> ' });

  connection.getChatManager().addChatListener({
    chatCreated: (chat: XMPPChat) => {
      sniperChat = chat;
      clearLine(process.stdout, 0);
      cursorTo(process.stdout, 0);
      console.log('> Sniper joined the auction.');
      console.log('');
      rl.prompt();
    }
  });

  console.log(`Selling item ${itemId} as auction-${itemId} on ${serviceUrl}.`);
  console.log('Waiting for a sniper to join...');
  console.log('');
  console.log('Commands:');
  console.log('  "close" (end the auction, sniper shows "Lost")');
  console.log('  "quit" (disconnect and exit)');
  console.log('');

  rl.prompt();

  rl.on('line', async line => {
    const command = line.trim();

    if (command === 'quit') {
      rl.close();
      return;
    }

    if (command === 'close') {
      if (!sniperChat) {
        console.log('(no sniper has joined yet)');
      } else {
        await sniperChat.sendMessage();
        console.log('> sent: auction closed');
        console.log('');
      }
    } else if (command) {
      console.log('(unsupported command; only "close" and "quit" are implemented so far)');
    }

    rl.prompt();
  });

  rl.on('close', () => {
    void connection.disconnect().then(() => process.exit(0));
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
