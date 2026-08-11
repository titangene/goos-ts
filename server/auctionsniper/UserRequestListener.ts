export interface UserRequestListener {
  joinAuction(item: Item): void;
}

export class Item {
  constructor(
    public readonly identifier: string,
    public readonly stopPrice: number
  ) {}

  allowsBid(bid: number): boolean {
    return bid <= this.stopPrice;
  }
}
