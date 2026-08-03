import type { SniperSnapshotData } from './types.ts';

export class Column {
  private constructor(
    public readonly name: string,
    public readonly className: string,
    private readonly valueInFn: (snapshot: SniperSnapshotData) => string | number,
  ) {}

  valueIn(snapshot: SniperSnapshotData): string | number {
    return this.valueInFn(snapshot);
  }

  static readonly ITEM_IDENTIFIER = new Column('Item', 'itemId', (snapshot) => snapshot.itemId);
  static readonly LAST_PRICE = new Column('Last Price', 'lastPrice', (snapshot) => snapshot.lastPrice);
  static readonly LAST_BID = new Column('Last Bid', 'lastBid', (snapshot) => snapshot.lastBid);
  static readonly SNIPER_STATE = new Column('State', 'state', (snapshot) => snapshot.state);

  static readonly values: readonly Column[] = [
    Column.ITEM_IDENTIFIER,
    Column.LAST_PRICE,
    Column.LAST_BID,
    Column.SNIPER_STATE,
  ];

  static at(offset: number): Column {
    const column = Column.values[offset];
    if (!column) {
      throw new Error(`No column at offset ${offset}`);
    }
    return column;
  }
}
