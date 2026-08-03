export type SniperStateName =
  'Joining' | 'Bidding' | 'Winning' | 'Losing' | 'Lost' | 'Won' | 'Failed';

export interface SniperSnapshotData {
  itemId: string;
  lastPrice: number;
  lastBid: number;
  state: SniperStateName;
}

export interface SnapshotsMessage {
  type: 'snapshots';
  snapshots: SniperSnapshotData[];
}
