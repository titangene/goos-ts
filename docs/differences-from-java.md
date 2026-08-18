# TS 版與 Java 版的刻意差異

`server/auctionsniper/xmpp/*` 用 xmpp.js（`@xmpp/client`，見 [ADR-0003](adr/ADR-0003-xmpp-client-library-selection.md)）連線 Prosody，使用方式盡量比照 `goos-code` 的 `src/auctionsniper/xmpp/*.java` 用 Smack library 的 `XMPPConnection`/`ChatManager`/`Chat`/`Message`/`MessageListener` 這一套物件模型，呼叫方式盡可能逐字對照。Smack 內部機制的完整查證筆記見 [`smack-chatmanager-internals.md`](smack-chatmanager-internals.md)。

這份文件記錄**刻意**跟 Java 版不同的地方——每一項都有明確理由，不是漏改、也不是還沒對齊。決策依據見 [`docs/adr/`](adr/)。

跟 [`java-to-typescript-language-notes.md`](java-to-typescript-language-notes.md) 的分工：這份文件講「拍賣協定/domain 層為什麼要這樣改」，那份文件講「Java 語言本身的機制（enum 多型、巢狀類別、checked exception…）TypeScript 沒有對應物，所以程式碼結構才會不一樣」。

## 1. 跟 Smack 一致的部分

以下呼叫方式跟 Java 版幾乎逐字對照：

| Java（Smack）                                                                   | TS（xmpp.js 版，`server/auctionsniper/xmpp/*`）                                   |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `connection.getChatManager().createChat(auctionJID, translator)`                | `connection.getChatManager().createChat(auctionJID, translator)`                  |
| `connection.getUser()`                                                          | `connection.getUser()`                                                            |
| `connection.getServiceName()`                                                   | `connection.getServiceName()`                                                     |
| `chat.sendMessage(message)`                                                     | `chat.sendMessage(message)`                                                       |
| `chat.removeMessageListener(translator)`                                        | `chat.removeMessageListener(translator)`                                          |
| `chat.getParticipant()`                                                         | `chat.getParticipant()`                                                           |
| `message.getBody()`                                                             | `message.getBody()`                                                               |
| `void processMessage(Chat chat, Message message)`（`chat` 參數不使用）          | `processMessage(chat: XMPPChat, message: XMPPMessage): void`（`chat` 參數不使用） |
| JOIN/BID 訊息完全沒有 Bidder 欄位（身分在連線層級，見 `chat.getParticipant()`） | 同左——真正的 XMPP chat 天生帶有寄件人身分，訊息內容不需要額外帶身分欄位           |

`XMPPAuction.ts`（`chat` 欄位、`chatDisconnectorFor()`）、`FakeAuctionServer.ts`（`connection.getChatManager().addChatListener(...)` 被動接收）都直接用這套物件模型，命名、呼叫順序、方法職責分工都跟 Java 版一致。

`XMPPAuctionHouse.ts` 的 `auctionId()` 也跟 Java 版 `auctionId(String itemId, XMPPConnection connection)` 一致：組 auction JID 用的 hostname 透過 `connection.getServiceName()` 取得，`XMPPAuctionHouse` 本身不直接持有 `domain`——那是只有 `XMPPConnection` 才該知道的連線層參數。`XMPPConnection.connect()` 的 `domain` 參數命名維持不變，沒有比照 Java 版改成 `hostname`，因為那是 xmpp.js `client({ domain, ... })` 本身的命名慣例（見第 2 節）。

## 2. `XMPPConnection.connect()` 把 Java 的三個步驟合併成一個 async factory

Java 版分三步：

```java
this.connection = new XMPPConnection(hostname);  // 建構：只設定 host，還沒真的連線
connection.connect();                             // 連線
connection.login(username, password, resource);   // 驗證
```

TS 版合併成一個 `static async connect()`：

```ts
const connection = await XMPPConnection.connect(serviceUrl, domain, username, password, resource);
```

**原因**：

- **xmpp.js 本身的 API 設計就是這樣**——`client({ service, domain, resource, username, password })` 建立 client 物件後，`.start()` 一次做完「連線+驗證」，沒有對應 Smack `connect()`/`login()` 分開兩步的中繼狀態可以介入。刻意拆成三步反而要自己在 `.start()` 中途插入不存在的中斷點，沒有實際好處。
- **Node.js 平台本身是非同步的**：Smack 提供同步 API，Node.js 的 I/O（含 xmpp.js 的連線/斷線）本來就是非同步的，`XMPPConnection.connect()`/`disconnect()`、`XMPPAuctionHouse.connect()`/`disconnect()` 因此都回傳 `Promise`，這點沒有辦法讓 TS 版變成同步。

**影響範圍**：`XMPPAuctionHouse.connect()`、`test/integration/XMPPAuctionHouse.test.ts`、`test/e2e/FakeAuctionServer.ts#startSellingItem()`、`tools/fake-auction.ts` 都用這個合併後的單一 async factory，呼叫端看不到中間狀態。

## 3. `XMPPChatManager` 的訊息比對規則比 Smack `ChatManager` 簡單，但外部行為一致

Smack `ChatManager` 的完整比對規則（thread ID 優先、bare JID 其次）記錄在 [`smack-chatmanager-internals.md`](smack-chatmanager-internals.md#訊息路由比對規則thread-id-優先bare-jid-其次)。`XMPPChatManager.dispatch()` 只用 stanza 的 `from` 屬性（完整 JID，含 resource）當唯一比對 key，沒有 thread ID 這一層。

**這是刻意簡化，不是遺漏，理由已查證確認**（見 [`smack-chatmanager-internals.md`](smack-chatmanager-internals.md#為什麼-thread-id-對-smack-來說不是可有可無的最佳化) 完整推導）：

- **Smack 需要 thread ID 的原因**：它主動建立 `Chat` 時用完整 JID 當 key、被動 fallback 卻用裁過 resource 的 bare JID 查，兩者不一致，需要 thread ID 補救。
- **TS 版不需要的原因**：`XMPPChatManager` 存跟查都統一用完整 JID，天生一致，不會出現這種自我矛盾。
- **本專案的使用情境嚴格 1:1**：一個 `XMPPAuction`/`FakeAuctionServer` 實例從頭到尾只跟一個固定對象對話，不需要 Smack 為了「同一組使用者同時開多個對話」這種泛用聊天情境而設計的 thread 分流機制。
- **已實測驗證**：`test/integration/XMPPAuctionHouse.test.ts`（真實連線 Prosody，非 mock）證實 sniper 主動建立的 chat 能正確收到拍賣現場的回覆，行為跟 Java 版一致。

## 4. `XMPPMessage` 只實作 `getBody()`

- **Smack**：`Message`（`extends Packet`）完整 API 還有 `getFrom()`/`getTo()`/`getSubject()`/`getType()`/`getThread()`/`getBody(language)` 等方法，書中程式碼（`AuctionMessageTranslator.java`/`FakeAuctionServer.java`）查過只用到 `getBody()`（完整查證過程見 [`smack-chatmanager-internals.md`](smack-chatmanager-internals.md#messagepacket-的完整欄位跟書中實際用到的部分)）。
- **TS**：`server/auctionsniper/xmpp/XMPPMessage.ts` 因此只實作 `getBody()`，把 `stanza.getChildText('body')` 這個解析細節集中在單一檔案，`AuctionMessageTranslator.ts`、`FakeAuctionServer.ts`、`tools/fake-auction.ts` 都透過 `XMPPMessage.getBody()` 取得訊息內容，不各自重複解析 stanza。

## 5. `addChatListener()` 的 callback 省略 `createdLocally` 參數

Java 版 `ChatManagerListener#chatCreated(Chat chat, boolean createdLocally)` 有兩個參數，但書中唯一的實作（`FakeAuctionServer.java`）沒有讀取 `createdLocally`：

```java
public void chatCreated(Chat chat, boolean createdLocally) {
  currentChat = chat;
  chat.addMessageListener(messageListener);
}
```

TS 版的 `ChatCreatedListener` 型別因此省略這個參數（`(chat: XMPPChat) => void`），`XMPPChatManager.createChat()`/`dispatch()` 內部也不再區分「主動建立」跟「被動建立」，只呼叫同一個不帶參數的通知函式。完整查證依據見 [`smack-chatmanager-internals.md`](smack-chatmanager-internals.md#messagelistenerchatmanagerlistener-介面)。

## 6. 型別定義依賴社群維護的 DefinitelyTyped 套件

- **Java（含 Smack）**：本身是靜態型別語言，方法簽章本來就是原始碼的一部分。
- **TS（xmpp.js）**：型別是社群維護的 `@types/xmpp__client`（含一串 `@types/xmpp__*` 相依套件），不是 `@xmpp/client` 自己發佈的（已用 `npm view`/查看 `package.json` 直接確認無 `types` 欄位）。

這是 [ADR-0003](adr/ADR-0003-xmpp-client-library-selection.md) 已知並接受的取捨，這裡列出只是為了完整記錄「跟 Java 版用起來哪裡不一樣」。

## 7. Domain/util 層的框架轉換差異

以下是 `server/auctionsniper/*.ts`（不含 `xmpp/` 子目錄，即 `AuctionSniper`、`SniperSnapshot`、`SniperState`、`SnipersTableModel`、`util/Announcer` 等對應書中 `src/auctionsniper/*.java` 核心邏輯）跟 Java 版逐檔比對後，確認屬於**必要**的框架/語言轉換差異，不是漏改：

### `equals()`/`hashCode()`/`toString()` 省略

`SniperSnapshot`、`UserRequestListener.Item` 這兩個 domain 類別對應到 Java 版都省略了 `equals()`/`hashCode()`/`toString()`，機制原因（Apache Commons 反射式實作 vs. Vitest `toEqual()` 深度結構比較）見 [`java-to-typescript-language-notes.md` 第 15 節](java-to-typescript-language-notes.md#15-apache-commons-反射式-equalshashcodetostring)。

### `SniperState.whenAuctionClosed()` 的多型改用查表

`SniperState.ts` 改用 `CLOSE_TRANSITIONS` 查表 + 獨立函式 `whenAuctionClosed(state)` 取代 Java enum 每個常數各自 `@Override` 的多型分派，機制原因見 [`java-to-typescript-language-notes.md` 第 1 節](java-to-typescript-language-notes.md#1-enum-的每個成員各自覆寫方法)。

`SniperState` 的 enum 成員刻意**不帶字串值**（`JOINING`、`BIDDING`…直接用 TS 自動遞增的數字，等同 Java 的 `ordinal()`），跟 Java 一樣不持有任何顯示文字——顯示文字統一由 `SnipersTableModel.STATUS_TEXT`/`textFor()` 負責（見下面 `Column`/`SnipersTableModel` 那節），不是這裡的責任。

### `Column`/`SnipersTableModel` 的多型改用 class + 具名靜態實例

`server/auctionsniper/ui/Column.ts` 改用另一種譯法重現 Java 版 `Column`/`SnipersTableModel` 互相依賴的關係：

- **Java**：`ui/Column` 也是 enum、每個常數各自 `@Override` `valueIn()`，且 `SNIPER_STATE` 常數的 `valueIn()` 呼叫 `SnipersTableModel.textFor(snapshot.state)`——`Column`/`SnipersTableModel` 同在 `auctionsniper.ui` package，互相依賴。
- **TS 實作方式**：一般 class，建構子收一個 `valueInFn` closure，四個「常數」變成 `static readonly` 具名實例（`Column.ITEM_IDENTIFIER` 等），`Column.values`/`Column.at()` 對應 Java 的 `values()`/`at(offset)`；`SNIPER_STATE` 一樣呼叫 `SnipersTableModel.textFor(snapshot.state)`。
- **TS 循環依賴**：兩個檔案互相 import（`Column.ts` import `SnipersTableModel.ts` 取得 `textFor`，`SnipersTableModel.ts` import `Column.ts` 取得 `values`/`at`），這在 ESM 是合法的循環依賴——雙方都只在方法/closure 內部才真正引用對方，模組頂層求值階段不會互相卡住。

跟 `SniperState` 的查表法不同，是因為 `Column` 除了行為外，`server/utils/sniper-registry.ts` 建構 WebSocket/HTTP payload 時還需要把它當一個可迭代集合走訪每個欄位，用具名靜態實例比查表更貼近「還是一個個獨立物件」的用法。

`Column.ts` 的欄位（`name`、`valueInFn`）刻意只對到 Java `Column` enum 實際有的東西（`name` 欄位 + `valueIn()` 行為），不多帶一個 `key` 欄位——這是純粹給 `SnipersTable.vue` 用的欄位識別，同時當 `v-for` 的 Vue `:key` 與 `<td>` 的 `data-testid`（供 e2e 測試定位欄位），是 TS/Vue 特有需求（Java 版用 WindowLicker 直接對整列 label text 做 Hamcrest matcher，不需要額外的欄位識別），因此放在沒有 Java 對應物、本來就是 TS 專屬的 `server/utils/sniper-registry.ts`（見下一節）裡維護，不汙染 `Column` 這個直接對照 Java enum 的檔案。

`SnipersTableModel.ts` 本身則跟 Java 版結構一致：`STATUS_TEXT` 陣列（索引對應 `SniperState` 的數字值，即 Java 的 `ordinal()`）、`static textFor(state)`、`getColumnCount()`/`getRowCount()`/`getColumnName()`/`getValueAt()` 都對應 Java `AbstractTableModel` 的同名方法。差異在於通知機制的有無：

- **Java**：`AbstractTableModel` 內建 `addTableModelListener()`。
- **TS**：沒有 `AbstractTableModel` 可以繼承，`addListener()`/`SnipersTableListener` 是額外補上的通知機制，且 `onSnapshotsChanged()` 刻意設計成**不帶參數**，模擬 Swing `TableModelListener.tableChanged(TableModelEvent e)` 的精神——只通知「有變動」，監聽者要自己呼叫 `getRowCount()`/`getColumnCount()`/`getValueAt()` 重新讀取。

以及變更通知的精細度：

- **Java**：`fireTableRowsInserted(row, row)`/`fireTableRowsUpdated(row, row)` 能精確指出「哪一列」變了。
- **TS**：`notifyChange()` 只是單一訊號，不帶行號範圍，因為下游的 `server/routes/ws.ts`/`server/api/snipers.get.ts` 都是重新整包查詢建構整份 payload 推給瀏覽器，`SnipersTable.vue` 用 Vue 的響應式陣列重新渲染整張表，沒有 Swing 那種「精確更新單一 row」的效能考量。

### `server/utils/sniper-registry.ts` 對應 Java 的哪裡

這個檔案沒有單一個 Java 檔案可以 1:1 對照，因為它身兼兩種角色，一種有 Java 對應物，一種完全是 TS 專屬：

- **有對應物的部分**：`main()`/`joinAuction()` 對應 `Main.java` 的 `main()` 方法本體，逐行保留原本的呼叫順序與職責切分（`Main` 建構子觸發的 `startUserInterface()` 對應到模組載入時就建好的 `portfolio`/`tableModel` wiring；`disconnectWhenUICloses()` 對應到接收一個「怎麼註冊關閉時要執行的 handler」的 callback，實際呼叫端是 `server/plugins/init-sniper-launcher.ts` 傳進來的 `nitroApp.hooks.hook('close', ...)`；`addUserRequestListenerFor()` 建立 `SniperLauncher` 供 `joinAuction()` 轉呼叫）：
  ```java
  // Main.java
  private final SniperPortfolio portfolio = new SniperPortfolio();

  public static void main(String... args) throws Exception {
    Main main = new Main();
    XMPPAuctionHouse auctionHouse = XMPPAuctionHouse.connect(args[ARG_HOSTNAME], args[ARG_USERNAME], args[ARG_PASSWORD]);
    main.disconnectWhenUICloses(auctionHouse);
    main.addUserRequestListenerFor(auctionHouse);
  }

  private void disconnectWhenUICloses(final XMPPAuctionHouse auctionHouse) {
    ui.addWindowListener(new WindowAdapter() {
      @Override public void windowClosed(WindowEvent e) {
        auctionHouse.disconnect();
      }
    });
  }

  private void addUserRequestListenerFor(final AuctionHouse auctionHouse) {
    ui.addUserRequestListener(new SniperLauncher(auctionHouse, portfolio));
  }
  ```
  ```ts
  // sniper-registry.ts
  const portfolio = new SniperPortfolio();

  export async function main(
    sniperId: string,
    registerServerCloseHandler: (handler: () => Promise<void>) => void
  ): Promise<void> {
    const auctionHouse = await connectAuctionHouse(sniperId);
    disconnectWhenServerCloses(auctionHouse, registerServerCloseHandler);
    addUserRequestListenerFor(auctionHouse);
  }

  function disconnectWhenServerCloses(
    auctionHouse: XMPPAuctionHouse,
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
    sniperLauncher.joinAuction(new Item(itemId, stopPrice));
  }
  ```
  ```ts
  // server/plugins/init-sniper-launcher.ts
  export default defineNitroPlugin(async nitroApp => {
    const config = useRuntimeConfig();

    await main(config.sniperId, handler => {
      nitroApp.hooks.hook('close', handler);
    });
  });
  ```
  兩者的差異在於：
  - **Java**：`ui`（`MainWindow`）本身就是 `disconnectWhenUICloses()` 能直接拿到的欄位。
  - **TS**：沒有「視窗」可以掛 `WindowListener`，改成用 callback 參數把「關閉時要做什麼」交給真正握有 `nitroApp`（Nitro 伺服器生命週期）的呼叫端決定——`main()` 本身仍然不依賴任何 Nitro 型別，維持成一支框架無關的 orchestration 函式。
- **沒有對應物的部分**：`getTableData()` 把 `SnipersTableModel` 的 `getColumnCount()`/`getRowCount()`/`getColumnName()`/`getValueAt()` 走訪一遍，組成一份 `{ columns, rows }` 的純資料物件，供 `server/api/snipers.get.ts`（HTTP）、`server/routes/ws.ts`（WebSocket）序列化成 JSON 送給瀏覽器。為什麼需要這一步：
  - **Java 版不需要**：`MainWindow`（Swing `JFrame`）跟 `SnipersTableModel` 活在**同一個 JVM process** 裡，`JTable` 直接呼叫 `model.getValueAt(row, col)` 就能拿到資料渲染，中間沒有任何序列化或網路邊界。
  - **TS 版需要**：goos-ts 的 UI 是瀏覽器裡的 Vue app，跟跑 `SnipersTableModel` 的 Node process 是**兩個不同 process、隔著網路**，所以需要一個地方把「表格模型」轉成「可以序列化過網路的純資料」，`getTableData()` 就是在做這件事——這整個轉譯步驟是 client-server 架構的必然需求，Java 桌面應用完全不需要。

### `Announcer` 用 JS `Proxy` 取代 `java.lang.reflect.Proxy`

`util/Announcer.ts` 用語言原生的 `Proxy` 取代 Java 版 `java.lang.reflect.Proxy.newProxyInstance()` + `InvocationHandler`，機制原因見 [`java-to-typescript-language-notes.md` 第 14 節](java-to-typescript-language-notes.md#14-javalangreflectproxy-動態代理)。

### Java 的 `extends EventListener` 標記介面沒有對應物

`AuctionEventListener.ts`、`SniperListener.ts`、`UserRequestListener.ts`、`SniperPortfolio.ts` 的 `PortfolioListener` 都不 `extends` 任何東西，對應 Java 版各自宣告 `extends java.util.EventListener` 的標記介面（marker interface），機制原因見 [`java-to-typescript-language-notes.md` 第 13 節](java-to-typescript-language-notes.md#13-marker-interface標記介面)。

### `SwingThreadSniperListener` 沒有 TS 對應檔案

- **Java**：`SwingThreadSniperListener` 把通知轉派到 Swing 的 Event Dispatch Thread 再處理，`ui/SnipersTableModel.java` 的 `sniperAdded()` 因此包一層 `sniper.addSniperListener(new SwingThreadSniperListener(this))` 再註冊。
- **TS**：`SnipersTableModel.ts` 的 `sniperAdded()` 直接 `sniper.addSniperListener(this)`，這整個包裝檔案在 TS 版被刪除，不是漏翻譯，機制原因見 [`java-to-typescript-language-notes.md` 第 11 節](java-to-typescript-language-notes.md#11-執行緒thread兩種不同用途)。

## 8. 測試檔案跟 Java 版刻意不一致的地方

`test/unit/**`（不含 `ui/` 子目錄以外的分類）已逐檔對照 `goos-code` 的 `test/unit/test/auctionsniper/**`，測項數量、測項涵蓋的情境、測項宣告順序都已對齊到跟 Java 版一致（例如 `AuctionSniper.test.ts` 對照 `AuctionSniperTest.java`、`SnipersTableModel.test.ts` 對照 `SnipersTableModelTest.java`）。以下是 review 後確認**必要**保留、不會也不需要對齊的差異：

- **測試框架語法**：Java 用 JUnit 4 的 `@Test public void methodName()`（方法名即測項描述，駝峰命名），TS 用 Vitest 的 `it('描述文字', () => {...})`（描述文字用一般英文句子）。這是框架慣例差異，測項對應關係已在各測試檔案逐一核對，順序、數量、涵蓋情境都有比對，只是描述的書寫方式不同。
- **Mock 機制**：Java 用 jMock 2（`Mockery`、`Expectations`、`context.checking(...)`、`States`/`Sequence` 表達呼叫順序與狀態機限制），TS 用 Vitest 內建的 `vi.fn()`/`toHaveBeenCalledWith()`/`toHaveBeenNthCalledWith()`。兩者能表達的斷言能力大致對等（`toHaveBeenNthCalledWith` 對應 jMock 的 `inSequence`），但寫法不同，不強求逐字翻譯 jMock 的 `Expectations` DSL。
- **Matcher 語法**：Java 用 Hamcrest（`equalTo`、`samePropertyValuesAs`、自訂 `FeatureMatcher`），TS 用 Vitest 內建的 `expect(...).toEqual(...)`/`expect.objectContaining(...)`。`samePropertyValuesAs`（比對物件所有屬性值，不要求同一個 class）對應 `toEqual`；Java 自訂的 `FeatureMatcher`（例如 `AuctionSniperTest.aSniperThatIs(state)`）在 TS 版用 `expect.objectContaining({ state })` 這種內建局部比對取代，不需要另外寫一個 matcher class。
- **例外斷言**：Java 用 `@Test(expected = Defect.class)` annotation 屬性宣告預期例外；TS 用 `expect(() => ...).toThrow(Defect)`。兩者都明確指定例外的 class/類型，斷言強度對等。
- **helper 函式的宣告位置**：Java 的私有 helper 方法（`AuctionMessageTranslatorTest.expectFailureWithMessage()`、`SnipersTableModelTest.assertRowMatchesSnapshot()`/`cellValue()`、`AuctionSniperEndToEndTest.waitForAnotherAuctionEvent()` 等）都宣告在**所有 `@Test` 方法之後**。對應的 TS 測試檔案已全部核對並改成同樣的順序（`describe()`/`test.describe()` 裡的 `it`/`test` 全部排在前面，helper function 放在最後），不是宣告在檔案開頭——JS/TS 的 function 宣告本來就會 hoisting，所以放在檔案結尾不影響 helper 在測試中被呼叫。

## 未涵蓋的檔案

`tools/fake-auction.ts` 沒有 Java 對應物（書中只有測試用的 `FakeAuctionServer.java`，見 README「專案結構比較」表格「手動模擬拍賣現場工具」一列），但實作上一樣重用 `XMPPConnection`/`XMPPChatManager`/`XMPPChat`/`XMPPMessage`，維持全專案只有一套「怎麼跟 Prosody 對話」的抽象。
