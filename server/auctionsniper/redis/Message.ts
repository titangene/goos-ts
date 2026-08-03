export type Bidder = string;

export interface JoinMessage {
  command: 'Join';
  bidder: Bidder;
}

export interface CloseMessage {
  command: 'Close';
}

export interface PriceMessage {
  command: 'Price';
  currentPrice: number;
  increment: number;
  bidder: Bidder;
}

export interface BidMessage {
  command: 'Bid';
  bidder: Bidder;
  bid: number;
}

export type AuctionMessage = JoinMessage | CloseMessage | PriceMessage | BidMessage;

export const Message = {
  Join: (bidder: Bidder): JoinMessage => ({ command: 'Join', bidder }),
  Close: (): CloseMessage => ({ command: 'Close' }),
  Price: (currentPrice: number, increment: number, bidder: Bidder): PriceMessage => ({
    command: 'Price',
    currentPrice,
    increment,
    bidder,
  }),
  Bid: (bidder: Bidder, bid: number): BidMessage => ({ command: 'Bid', bidder, bid }),
};
