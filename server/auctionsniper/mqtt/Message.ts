// ADR-0007。解析（decode）在 AuctionMessageTranslator.ts 的 AuctionEvent，
// 不在這裡。
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
  Price(currentPrice: number, increment: number, bidder: Bidder): PriceMessage {
    return {
      command: 'Price',
      currentPrice,
      increment,
      bidder,
    };
  },
  Bid: (bidder: Bidder, bid: number): BidMessage => ({ command: 'Bid', bidder, bid }),
  encode(message: AuctionMessage): string {
    switch (message.command) {
      case 'Join':
        return `SOLVersion: 1.1; Command: JOIN; Bidder: ${message.bidder};`;
      case 'Bid':
        return `SOLVersion: 1.1; Command: BID; Price: ${message.bid}; Bidder: ${message.bidder};`;
      case 'Price':
        return `SOLVersion: 1.1; Event: PRICE; CurrentPrice: ${message.currentPrice}; Increment: ${message.increment}; Bidder: ${message.bidder};`;
      case 'Close':
        return 'SOLVersion: 1.1; Event: CLOSE;';
    }
  },
};
