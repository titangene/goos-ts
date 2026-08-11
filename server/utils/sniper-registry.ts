import { MqttAuctionHouse } from '../auctionsniper/mqtt/MqttAuctionHouse.ts';
import { SniperLauncher } from '../auctionsniper/SniperLauncher.ts';
import { SniperPortfolio } from '../auctionsniper/SniperPortfolio.ts';
import { SnipersTableModel } from '../auctionsniper/ui/SnipersTableModel.ts';
import { Column } from '../auctionsniper/ui/Column.ts';
import { Item } from '../auctionsniper/UserRequestListener.ts';
import type { SnipersTableColumn, SniperRow } from '../../shared/types.ts';

interface SnipersTableData {
  columns: SnipersTableColumn[];
  rows: SniperRow[];
}

type SnapshotsListener = (data: SnipersTableData) => void;

const portfolio = new SniperPortfolio();
const tableModel = new SnipersTableModel();
portfolio.addPortfolioListener(tableModel);

const snapshotsListeners: SnapshotsListener[] = [];
tableModel.addListener({
  onSnapshotsChanged: () => {
    const data = getTableData();
    snapshotsListeners.forEach((listener) => listener(data));
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

export function getTableData(): SnipersTableData {
  const columns: SnipersTableColumn[] = Column.values.map((column) => ({
    name: column.name,
    className: column.className,
  }));

  const rows: SniperRow[] = [];
  for (let row = 0; row < tableModel.getRowCount(); row++) {
    const values: (string | number)[] = [];
    for (let column = 0; column < tableModel.getColumnCount(); column++) {
      values.push(tableModel.getValueAt(row, column));
    }
    rows.push({ itemId: String(tableModel.getValueAt(row, 0)), values });
  }

  return { columns, rows };
}

export function onSnapshotsChanged(listener: SnapshotsListener): void {
  snapshotsListeners.push(listener);
}
