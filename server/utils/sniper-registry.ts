import type { AuctionHouse } from '@server/auctionsniper/AuctionHouse.ts';
import { RedisAuctionHouse } from '@server/auctionsniper/redis/RedisAuctionHouse.ts';
import { SniperLauncher } from '@server/auctionsniper/SniperLauncher.ts';
import { SniperPortfolio } from '@server/auctionsniper/SniperPortfolio.ts';
import { Column } from '@server/auctionsniper/ui/Column.ts';
import { SnipersTableModel } from '@server/auctionsniper/ui/SnipersTableModel.ts';
import { Item } from '@server/auctionsniper/UserRequestListener.ts';
import { XMPPAuctionHouse } from '@server/auctionsniper/xmpp/XMPPAuctionHouse.ts';
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

// XMPP 帳號密碼固定是 sniperId 本身（ADR-0003 username-only 白名單精神
// 延伸到 XMPP 路徑：Prosody 上實際註冊的密碼是 'sniper'，跟 sniperId 湊巧
// 同名，不是巧合——見 poc/docker/xmpp/register-and-start.sh）。
const XMPP_SNIPER_PASSWORD = 'sniper';

// 對應 Main.java 的 public static void main(String... args)：
//   Main main = new Main();                      → portfolio/tableModel 已在模組載入時建好
//   XMPPAuctionHouse.connect(...)                 → connectAuctionHouse(...)
//   main.disconnectWhenUICloses(auctionHouse);    → disconnectWhenServerCloses(...)
//   main.addUserRequestListenerFor(auctionHouse); → addUserRequestListenerFor(...)
//
// AUCTION_TRANSPORT 是 TS 版特有的切換點，Java 版沒有對應物（Java 只有
// XMPP 一條路）：ADR-0002 選定的 Redis 是預設/正式路徑，ADR-0008 起新增的
// XMPP 路徑是並行的實驗性路徑，兩者互不取代，由這個環境變數決定這次啟動
// 要連哪一邊，預設 redis。
export async function main(
  sniperId: string,
  registerServerCloseHandler: (handler: () => Promise<void>) => void
): Promise<void> {
  const auctionHouse = await connectAuctionHouse(sniperId);
  disconnectWhenServerCloses(auctionHouse, registerServerCloseHandler);
  addUserRequestListenerFor(auctionHouse);
}

async function connectAuctionHouse(
  sniperId: string
): Promise<RedisAuctionHouse | XMPPAuctionHouse> {
  if (process.env.AUCTION_TRANSPORT === 'xmpp') {
    const serviceUrl = process.env.XMPP_SERVICE_URL ?? 'ws://localhost:5280/xmpp-websocket';
    const domain = process.env.XMPP_DOMAIN ?? 'localhost';
    return XMPPAuctionHouse.connect(serviceUrl, domain, sniperId, XMPP_SNIPER_PASSWORD);
  }
  const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
  return RedisAuctionHouse.connect(redisUrl, sniperId);
}

function disconnectWhenServerCloses(
  auctionHouse: RedisAuctionHouse | XMPPAuctionHouse,
  registerServerCloseHandler: (handler: () => Promise<void>) => void
): void {
  registerServerCloseHandler(async () => {
    await auctionHouse.disconnect();
  });
}

function addUserRequestListenerFor(auctionHouse: AuctionHouse): void {
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

  // getValueAt() 的欄位順序跟 Column.values/COLUMN_KEYS 一致（0: itemId、
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
