import type { SniperSnapshot } from './SniperSnapshot.ts';

export interface SniperListener {
  sniperStateChanged(snapshot: SniperSnapshot): void;
}
