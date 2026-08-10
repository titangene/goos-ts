// ADR-0007: 拍賣協定訊息格式維持書中 XMPP 純文字格式（SOL），對應
// Java 版 XMPPAuction.JOIN_COMMAND_FORMAT/BID_COMMAND_FORMAT。
//
// 解析（decode）刻意不放在這裡：Java 版對應的 AuctionEvent 是
// AuctionMessageTranslator 的 private inner class，只服務 Event:
// 方向（PRICE/CLOSE），從不解析自己送出去的 Command:（JOIN/BID）——
// 見 AuctionMessageTranslator.ts。
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
