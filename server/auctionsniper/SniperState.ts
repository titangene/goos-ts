import { Defect } from './util/Defect.ts';

export enum SniperState {
  JOINING = 'Joining',
  BIDDING = 'Bidding',
  WINNING = 'Winning',
  LOSING = 'Losing',
  LOST = 'Lost',
  WON = 'Won',
  FAILED = 'Failed',
}

const CLOSE_TRANSITIONS: Partial<Record<SniperState, SniperState>> = {
  [SniperState.JOINING]: SniperState.LOST,
  [SniperState.BIDDING]: SniperState.LOST,
  [SniperState.WINNING]: SniperState.WON,
  [SniperState.LOSING]: SniperState.LOST,
};

export function whenAuctionClosed(state: SniperState): SniperState {
  const next = CLOSE_TRANSITIONS[state];
  if (!next) {
    throw new Defect('Auction is already closed');
  }
  return next;
}
