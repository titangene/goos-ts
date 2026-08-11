import { Defect } from './util/Defect.ts';

// 對應 Java 的 SniperState 列舉常數順序（ordinal() 0~6）；顯示文字改由
// SnipersTableModel.textFor() 負責，見 docs/differences-from-java.md #9。
export enum SniperState {
  JOINING,
  BIDDING,
  WINNING,
  LOSING,
  LOST,
  WON,
  FAILED
}

const CLOSE_TRANSITIONS: Partial<Record<SniperState, SniperState>> = {
  [SniperState.JOINING]: SniperState.LOST,
  [SniperState.BIDDING]: SniperState.LOST,
  [SniperState.WINNING]: SniperState.WON,
  [SniperState.LOSING]: SniperState.LOST
};

export function whenAuctionClosed(state: SniperState): SniperState {
  const next = CLOSE_TRANSITIONS[state];
  if (next === undefined) {
    throw new Defect('Auction is already closed');
  }
  return next;
}
