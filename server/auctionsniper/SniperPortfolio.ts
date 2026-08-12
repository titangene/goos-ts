import type { AuctionSniper } from './AuctionSniper.ts';
import type { SniperCollector } from './SniperCollector.ts';
import { Announcer } from './util/Announcer.ts';

export interface PortfolioListener {
  sniperAdded(sniper: AuctionSniper): void;
}

export class SniperPortfolio implements SniperCollector {
  private readonly announcer = Announcer.to<PortfolioListener>();
  private readonly snipers: AuctionSniper[] = [];

  addSniper(sniper: AuctionSniper): void {
    this.snipers.push(sniper);
    this.announcer.announce().sniperAdded(sniper);
  }

  addPortfolioListener(listener: PortfolioListener): void {
    this.announcer.addListener(listener);
  }
}
