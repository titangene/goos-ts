import { RedisAuctionHouse } from '../auctionsniper/redis/RedisAuctionHouse.ts';
import { SniperLauncher } from '../auctionsniper/SniperLauncher.ts';
import { SniperPortfolio } from '../auctionsniper/SniperPortfolio.ts';
import { SnipersTableModel } from '../auctionsniper/ui/SnipersTableModel.ts';
import { Column } from '../auctionsniper/ui/Column.ts';
import { Item } from '../auctionsniper/UserRequestListener.ts';
import type { SnipersTableColumn, SniperRow } from '../../shared/types.ts';

// Column（見 server/auctionsniper/ui/Column.ts）沒有 className，因為 Java 版的
// auctionsniper.ui.Column 也沒有——這是純粹給瀏覽器渲染用的 CSS class，跟
// Column.values 同順序對應，只存在於這個 wire-payload 組裝層。
const COLUMN_CLASS_NAMES = ['itemId', 'lastPrice', 'lastBid', 'state'] as const;

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
    snapshotsListeners.forEach(listener => listener(data));
  }
});

let sniperLauncher: SniperLauncher | undefined;

export async function initSniperLauncher(sniperId: string): Promise<void> {
  const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
  const auctionHouse = await RedisAuctionHouse.connect(redisUrl, sniperId);
  sniperLauncher = new SniperLauncher(auctionHouse, portfolio);
}

export function joinAuction(itemId: string, stopPrice: number): void {
  if (!sniperLauncher) {
    throw new Error('SniperLauncher is not initialized yet');
  }

  sniperLauncher.joinAuction(new Item(itemId, stopPrice));
}

export function getTableData(): SnipersTableData {
  const columns: SnipersTableColumn[] = Column.values.map((column, index) => ({
    name: column.name,
    className: COLUMN_CLASS_NAMES[index]!
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
