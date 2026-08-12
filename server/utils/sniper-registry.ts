import { RedisAuctionHouse } from '@server/auctionsniper/redis/RedisAuctionHouse.ts';
import { SniperLauncher } from '@server/auctionsniper/SniperLauncher.ts';
import { SniperPortfolio } from '@server/auctionsniper/SniperPortfolio.ts';
import { Column } from '@server/auctionsniper/ui/Column.ts';
import { SnipersTableModel } from '@server/auctionsniper/ui/SnipersTableModel.ts';
import { Item } from '@server/auctionsniper/UserRequestListener.ts';
import type { SnipersTableColumn, SniperRow } from '@shared/types.ts';

interface SnipersTableData {
  columns: SnipersTableColumn[];
  rows: SniperRow[];
}

type SnapshotsListener = (data: SnipersTableData) => void;

// 對應 Main.java 建構子觸發的 startUserInterface()：MainWindow 建構子裡的
// makeSnipersTable(portfolio) 建立 SnipersTableModel、掛上 portfolio
// listener。這裡沒有視窗可以顯示，改成模組載入時就把同一份 wiring 做好。
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

// 對應 Main.java 的 public static void main(String... args)：
//   Main main = new Main();                      → portfolio/tableModel 已在模組載入時建好
//   XMPPAuctionHouse.connect(...)                 → RedisAuctionHouse.connect(...)
//   main.disconnectWhenUICloses(auctionHouse);    → disconnectWhenServerCloses(...)
//   main.addUserRequestListenerFor(auctionHouse); → addUserRequestListenerFor(...)
export async function main(
  sniperId: string,
  registerServerCloseHandler: (handler: () => Promise<void>) => void
): Promise<void> {
  const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
  const auctionHouse = await RedisAuctionHouse.connect(redisUrl, sniperId);
  disconnectWhenServerCloses(auctionHouse, registerServerCloseHandler);
  addUserRequestListenerFor(auctionHouse);
}

function disconnectWhenServerCloses(
  auctionHouse: RedisAuctionHouse,
  registerServerCloseHandler: (handler: () => Promise<void>) => void
): void {
  registerServerCloseHandler(async () => {
    await auctionHouse.disconnect();
  });
}

function addUserRequestListenerFor(auctionHouse: RedisAuctionHouse): void {
  sniperLauncher = new SniperLauncher(auctionHouse, portfolio);
}

export function joinAuction(itemId: string, stopPrice: number): void {
  if (!sniperLauncher) {
    throw new Error('SniperLauncher is not initialized yet');
  }

  sniperLauncher.joinAuction(new Item(itemId, stopPrice));
}

// Column（見 server/auctionsniper/ui/Column.ts）沒有 key，因為 Java 版的
// auctionsniper.ui.Column 也沒有——這是純粹給 SnipersTable.vue 用的欄位識別，
// 同時當 v-for 的 Vue :key 與 <td> 的 data-testid（供 e2e 測試定位欄位），
// 跟 Column.values 同順序對應，只存在於這個 wire-payload 組裝層。
const COLUMN_KEYS = [
  'itemId',
  'lastPrice',
  'lastBid',
  'state'
] as const satisfies readonly (keyof SniperRow)[];

export function getTableData(): SnipersTableData {
  const columns: SnipersTableColumn[] = Column.values.map((column, index) => ({
    name: column.name,
    key: COLUMN_KEYS[index]!
  }));

  // getValueAt() 的欄位順序跟 Column.values／COLUMN_KEYS 一致（0: itemId、
  // 1: lastPrice、2: lastBid、3: state），才能這樣按位置對應到具名欄位。
  const rows: SniperRow[] = [];
  for (let row = 0; row < tableModel.getRowCount(); row++) {
    rows.push({
      itemId: String(tableModel.getValueAt(row, 0)),
      lastPrice: Number(tableModel.getValueAt(row, 1)),
      lastBid: Number(tableModel.getValueAt(row, 2)),
      state: String(tableModel.getValueAt(row, 3))
    });
  }

  return { columns, rows };
}

export function onSnapshotsChanged(listener: SnapshotsListener): void {
  snapshotsListeners.push(listener);
}
