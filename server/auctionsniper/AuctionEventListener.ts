export enum PriceSource {
  FromSniper = 'FromSniper',
  FromOtherBidder = 'FromOtherBidder'
}

export interface AuctionEventListener {
  auctionClosed(): void;
  currentPrice(price: number, increment: number, priceSource: PriceSource): void;
  auctionFailed(): void;
}
