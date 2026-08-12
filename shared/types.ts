export interface SniperRow {
  itemId: string;
  lastPrice: number;
  lastBid: number;
  state: string;
}

export interface SnipersTableColumn {
  name: string;
  key: keyof SniperRow;
}

export interface SnapshotsMessage {
  type: 'snapshots';
  columns: SnipersTableColumn[];
  rows: SniperRow[];
}
