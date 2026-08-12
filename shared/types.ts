export interface SnipersTableColumn {
  name: string;
  key: string;
}

export interface SniperRow {
  itemId: string;
  values: (string | number)[];
}

export interface SnapshotsMessage {
  type: 'snapshots';
  columns: SnipersTableColumn[];
  rows: SniperRow[];
}
