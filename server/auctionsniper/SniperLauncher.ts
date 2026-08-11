import type { AuctionHouse } from './AuctionHouse.ts';
import { AuctionSniper } from './AuctionSniper.ts';
import type { SniperCollector } from './SniperCollector.ts';
import type { UserRequestListener, Item } from './UserRequestListener.ts';

export class SniperLauncher implements UserRequestListener {
  constructor(
    private readonly auctionHouse: AuctionHouse,
    private readonly collector: SniperCollector
  ) {}

  joinAuction(item: Item): void {
    const auction = this.auctionHouse.auctionFor(item);
    const sniper = new AuctionSniper(item, auction);

    auction.addAuctionEventListener(sniper);
    this.collector.addSniper(sniper);

    auction.join();
  }
}
