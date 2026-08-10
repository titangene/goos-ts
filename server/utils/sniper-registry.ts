import { MqttAuctionHouse } from '../auctionsniper/mqtt/MqttAuctionHouse.ts';
import { SniperLauncher } from '../auctionsniper/SniperLauncher.ts';
import { SniperPortfolio } from '../auctionsniper/SniperPortfolio.ts';
import { SnipersTableModel } from '../auctionsniper/SnipersTableModel.ts';
import { Item } from '../auctionsniper/UserRequestListener.ts';
import type { SniperSnapshot } from '../auctionsniper/SniperSnapshot.ts';

type SnapshotsListener = (snapshots: SniperSnapshot[]) => void;

const portfolio = new SniperPortfolio();
const tableModel = new SnipersTableModel();
portfolio.addPortfolioListener(tableModel);

const snapshotsListeners: SnapshotsListener[] = [];
tableModel.addListener({
  onSnapshotsChanged: (snapshots) => {
    snapshotsListeners.forEach((listener) => listener(snapshots));
  },
});

let sniperLauncher: SniperLauncher | undefined;

export async function initSniperLauncher(sniperId: string): Promise<void> {
  const brokerUrl = process.env.MQTT_BROKER_URL ?? 'mqtt://localhost:1883';
  const auctionHouse = await MqttAuctionHouse.connect(brokerUrl, sniperId);
  sniperLauncher = new SniperLauncher(auctionHouse, portfolio);
}

export function joinAuction(itemId: string, stopPrice: number): void {
  if (!sniperLauncher) {
    throw new Error('SniperLauncher is not initialized yet');
  }

  sniperLauncher.joinAuction(new Item(itemId, stopPrice));
}

export function getSnapshots(): SniperSnapshot[] {
  return tableModel.getSnapshots();
}

export function onSnapshotsChanged(listener: SnapshotsListener): void {
  snapshotsListeners.push(listener);
}
