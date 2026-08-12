# TS 版與 Java 版的刻意差異

`server/auctionsniper/redis/*` 已逐檔對照 `goos-code` 的 `src/auctionsniper/xmpp/*.java`，命名、結構盡量貼齊。這份文件記錄**刻意**跟 Java 版不同的地方——每一項都有明確理由，不是漏改、也不是還沒對齊。決策依據見 [`docs/adr/`](adr/)，這裡只整理「差異本身是什麼、為什麼非改不可」。

跟 [`java-to-typescript-language-notes.md`](java-to-typescript-language-notes.md) 的分工：這份文件講「拍賣協定/domain 層為什麼要這樣改」，那份文件講「Java 語言本身的機制（enum 多型、巢狀類別、checked exception…）TypeScript 沒有對應物，所以程式碼結構才會不一樣」。

## 1. 協定與架構層級（見對應 ADR）

| 差異                                                | 對應 ADR                                           |
| --------------------------------------------------- | -------------------------------------------------- |
| 拍賣協定改用 Redis Pub/Sub，不是 XMPP               | [ADR-0002](adr/ADR-0002-transport-selection.md)    |
| 身分識別改用 username-only 白名單，不做真實密碼驗證 | [ADR-0003](adr/ADR-0003-username-only-identity.md) |
| 拍賣協定分成 `commands`/`events` 兩個 channel       | [ADR-0006](adr/ADR-0006-channel-topology.md)       |
| 訊息格式維持書中純文字 SOL 格式（非 JSON）          | [ADR-0007](adr/ADR-0007-message-format.md)         |

## 2. Redis Pub/Sub 沒有 XMPP「連線層級身分」，訊息內容要多帶一個 Bidder 欄位

- XMPP 的 `XMPPConnection` 物件本身知道「我是誰」（`connection.getUser()`），對方也能從 `chat.getParticipant()` 直接查到「這則訊息是誰送的」——身分完全在**連線層級**，訊息內容不需要帶任何身分資訊。
- 因此 `XMPPAuction.JOIN_COMMAND_FORMAT`/`BID_COMMAND_FORMAT` 完全沒有 Bidder 欄位：
  ```java
  public static final String JOIN_COMMAND_FORMAT = "SOLVersion: 1.1; Command: JOIN;";
  public static final String BID_COMMAND_FORMAT = "SOLVersion: 1.1; Command: BID; Price: %d;";
  ```
- Redis Pub/Sub 沒有任何等價於 `connection.getUser()`/`chat.getParticipant()` 的機制——同一個 channel 底下，所有訂閱者收到的訊息看起來完全一樣，broker 不會告訴你「這則訊息是誰發的」。
- `Message.ts` 的 `JoinMessage`/`BidMessage` 因此都多了一個 `Bidder` 欄位，`encode()` 出來的訊息長這樣：
  ```
  SOLVersion: 1.1; Command: JOIN; Bidder: sniper;
  SOLVersion: 1.1; Command: BID; Price: 95; Bidder: sniper;
  ```
- 這個差異會連帶影響到第 3 節提到的 `RedisFakeAuctionServer.ts`。

## 3. `RedisFakeAuctionServer.ts` 一樣能做純字串相等比對，只是預期值要現算

`FakeAuctionServer.java` 從不解析收到的 JOIN/BID 訊息內容，靠的是**兩件事分開檢查**：

```java
public void hasReceivedJoinRequestFrom(String sniperId) throws InterruptedException {
    receivesAMessageMatching(sniperId, equalTo(XMPPAuction.JOIN_COMMAND_FORMAT));
}
private void receivesAMessageMatching(String sniperId, Matcher<? super String> messageMatcher) throws InterruptedException {
    messageListener.receivesAMessage(messageMatcher);
    assertThat(currentChat.getParticipant(), equalTo(sniperId));  // 身分查連線層級，不查訊息內容
}
```

- 訊息內容本身只做**字串完全相等**比對（`equalTo(JOIN_COMMAND_FORMAT)`），是誰送的另外用 `currentChat.getParticipant()`（連線層級）查——`JOIN_COMMAND_FORMAT`/`BID_COMMAND_FORMAT` 是固定字串/格式樣板，跟 sniperId 無關，因為身分已經由連線層級保證。
- 因為第 2 節那個必要分歧（Bidder 塞進訊息內容），TS 版的 JOIN/BID 訊息不是固定字串。但 `Message.encode()` 本來就是 `RedisAuction.join()`/`bid()` 產生訊息的唯一來源（跟 Java 的 `JOIN_COMMAND_FORMAT`/`BID_COMMAND_FORMAT` 常數扮演同一個角色：production code 跟測試用同一份格式定義），呼叫測試方法時 sniperId 本來就是已知參數。
- 所以 `test/e2e/RedisFakeAuctionServer.ts` 直接用 `Message.encode(Message.Join(sniperId))`/`Message.encode(Message.Bid(sniperId, bid))` 算出「這個 sniper 應該送出的完整訊息」，再跟收到的內容做字串完全相等比對——身分檢查跟內容檢查合併成一次比對（因為身分本來就編碼在內容裡），不需要額外解析欄位，也不需要獨立的 `parseCommand()`。

## 4. `RedisClientType` 沒有 `getUser()`，所以包了一個 `RedisConnection`

### `XMPPAuctionHouse` 不存身分，臨時查

`XMPPAuctionHouse` 完全不存 sniper 的身分：

```java
public Auction auctionFor(Item item) {
    return new XMPPAuction(connection, auctionId(item.identifier, connection), failureReporter);
}

private static String auctionId(String itemId, XMPPConnection connection) {
    return String.format(AUCTION_ID_FORMAT, itemId, connection.getServiceName());
}
```

只傳 `connection` 跟算好的 `auctionId(...)`（跟 sniper 身分無關，只用 `item.identifier` 跟 `connection.getServiceName()`）。`XMPPAuction` 要用到「我是誰」時，是在自己的 `translatorFor(connection)` 裡用 `connection.getUser()` 現查：

```java
private AuctionMessageTranslator translatorFor(XMPPConnection connection) {
    return new AuctionMessageTranslator(connection.getUser(), auctionEventListeners.announce(), failureReporter);
}
```

### `RedisConnection` 包住兩條 Redis 連線

`node-redis` 的 `RedisClientType` 沒有 `getUser()`、也沒有 `connect()`/`login()` 這種分階段的連線流程——這些能力是 `XMPPConnection` 自己提供的，不是 XMPP 協定本身的功能。因此另外寫了 `RedisConnection.ts`，補上 `connect()`/`login()`/`getUser()`/`disconnect()`，讓 `RedisAuctionHouse.connect()` 可以用跟 Java 幾乎一樣的順序操作：

```ts
const connection = new RedisConnection(redisUrl);
await connection.connect();
connection.login(sniperId);
```

對照 Java：

```java
XMPPConnection connection = new XMPPConnection(hostname);
connection.connect();
connection.login(username, password, AUCTION_RESOURCE);
```

`login()` 找不到 username 時只拋一般的 `Error`（對應 Smack `connection.login()` 拋出的 `XMPPException`，屬於連線失敗的其中一種），不是直接拋 `RedisAuctionException`——包裝成 `RedisAuctionException` 是 `RedisAuctionHouse.connect()` 外層 try/catch 的責任，這點也跟 Java 的兩層結構一致（見 [ADR-0003](adr/ADR-0003-username-only-identity.md) Compliance #3）。

`RedisConnection` 比 XMPP 版多一層 Java 完全沒有對應物的結構：Redis 協定規定**同一條連線一旦呼叫 `SUBSCRIBE`，就進入訂閱模式，不能再用同一條連線發 `PUBLISH` 等其他命令**——這是 Redis 協定本身的限制，不是 TS 版自己加的邏輯。`RedisConnection` 因此持有兩個 client（`publisher`/`subscriber`），`connect()`/`disconnect()` 都用 `Promise.all` 同時處理兩條連線：

```ts
export class RedisConnection {
  readonly publisher: RedisClientType;
  readonly subscriber: RedisClientType;

  async connect(): Promise<void> {
    await Promise.all([this.publisher.connect(), this.subscriber.connect()]);
  }

  async disconnect(): Promise<void> {
    await Promise.all([this.publisher.quit(), this.subscriber.quit()]);
  }
}
```

`XMPPConnection`（單一連線可同時收發）不需要這個分裂，這是 Redis Pub/Sub 協定設計本身要求的，跟「貼近書中精神」的取捨無關。

有了 `RedisConnection` 這層包裝，`RedisAuction` 的 `translatorFor(connection)` 也能跟 Java 一樣接收 `connection` 當參數、內部呼叫 `connection.getUser()`，不用額外傳一個 `sniperId` 參數進建構子。

### `RedisFakeAuctionServer.ts` 也共用 `RedisConnection`，但反向建立 channel

`RedisConnection` 也不只服務 sniper 端：

- TS 版 `test/e2e/RedisFakeAuctionServer.ts` 一樣用它處理 `connect()`/`disconnect()`，對照 Java 的 `FakeAuctionServer.java` 同樣直接持有一個 `XMPPConnection` 欄位、呼叫 `connection.connect()`/`connection.disconnect()`。
- 但 Java 版建立 `Chat` 的方式跟 `XMPPAuction` 不同——它從不主動呼叫 `createChat()`，而是用 `connection.getChatManager().addChatListener(...)` 被動等對方（sniper）建立 chat 後拿到 `currentChat`。
- TS 版對應的作法是直接用 `connection.publisher`/`connection.subscriber` 建構方向相反的 `RedisChannel`（publish 用 events channel、subscribe 用 commands channel，跟 `RedisAuction` 的 `commandsChannel`/`eventsChannel` 方向正好相反），因為 node-redis 沒有 `ChatManager`/`addChatListener` 這種「被動等對方建立 chat」的機制，且 `RedisConnection.createChannel()` 內建的 channel 方向本來就是為了 sniper 端設計，不適用於 fake auction server 這種角色相反的情境。
- 因此 `RedisConnection` 沒有另外提供反向的 `createChannel()`，`login()`/`getUser()` 也用不到（fake auction server 不是 sniper，沒有身分白名單需求）。

## 5. 非同步 API：`connect()`/`disconnect()` 的簽章差異

- `XMPPAuctionHouse.disconnect()` 是同步的 `void` 方法；`RedisAuctionHouse.disconnect()` 是 `async`，回傳 `Promise<void>`——因為 Node.js 的 I/O（包含 node-redis 的斷線）本來就是非同步的，Smack 提供同步 API，這點沒有辦法讓 TS 版變成同步，是平台本身的差異。`connection.connect()`/`connection.login()` 同理。
- `AuctionMessageTranslator.processMessage(Chat chat, Message message)` 接收 Smack 的 `Message` 物件，內部呼叫 `message.getBody()` 取出字串；TS 版 `processMessage(channel: RedisChannel, messageBody: string)` 的 `channel` 參數維持（跟 Java 一樣沒被用到），但第二個參數直接是字串——因為 node-redis 沒有對應 Smack `Message` 的物件模型，拿到的就是原始 payload，沒有 `.getBody()` 這一步可以省。

## 6. 循序保證由單一 TCP 連線天生保證，不需要額外設定

書中原文（Ch.12）：「we expect it to ensure that messages between a bidder and an auction arrive in the same order in which they were sent」——這個保證在 XMPP 裡是**單一 TCP 連線天生就有**的，不需要額外設定。

Redis Pub/Sub 跟 XMPP 一樣：`publisher`/`subscriber` 各自透過**單一 TCP 連線**跟 Redis server 通訊，同一條連線上的訊息順序天生保證，`RedisChannel.sendMessage()`/訂閱都不需要任何額外設定就能重現書中的循序保證（[ADR-0002](adr/ADR-0002-transport-selection.md) Compliance #3）。這正是 [ADR-0002](adr/ADR-0002-transport-selection.md) 選 Redis Pub/Sub、不選 MQTT 的理由之一——MQTT 沒有這個天生保證，需要額外設定 QoS 才能重現同等保證。

## 7. `RedisChannel` 沿用 node-redis 的 per-channel callback 機制

Smack 的 `Chat` 物件，`addMessageListener()` 註冊的 listener 天生只會收到「這個 chat」的訊息——因為每個 `Chat` 對應到一個特定的 JID 對話。`node-redis` 的 `subscriber.subscribe(channel, listener)` 剛好是同樣的模型：**每次訂閱都拿到專屬的 callback**，`RedisChannel` 因此不需要自己判斷「這則訊息是不是我訂閱的那個 channel」，直接把 subscribe 拿到的訊息轉呼叫 `listener.processMessage(...)` 即可：

```ts
// RedisChannel.ts
constructor(
  private readonly publisher: RedisClientType,
  private readonly subscriber: RedisClientType,
  private readonly publishChannel: string,
  private readonly subscribeChannel: string,
  private readonly listener: MessageListener,
) {
  void this.subscriber.subscribe(this.subscribeChannel, (rawMessage) =>
    this.listener.processMessage(this, rawMessage),
  );
}
```

`RedisChannel` 這層抽象要對齊的是 `XMPPAuction`/`RedisAuction` 呼叫端的介面形狀（`sendMessage(...)`、`removeMessageListener(listener)`），不是底層 wire 語意本身的點對點保證：`events` channel 對單一 sniper 而言，其實是廣播頻道的其中一個訂閱者（[ADR-0006](adr/ADR-0006-channel-topology.md) 的 `commands`/`events` channel 拆分工程出來的效果），跟 Smack `Chat` 協定天生保證的專屬點對點通道性質不同——即使 node-redis 的 API 形狀比其他 pub/sub client 更接近 Smack 的 per-`Chat` 模型（不需要手動過濾），底層仍然是「同一個 channel 底下所有訂閱者都收到同一份訊息」的廣播語意，這也是為什麼這個類別沒有沿用 Java 的 `Chat` 命名，改叫 `RedisChannel`，見[第 8 節](#8-命名上刻意不逐字沿用-java-的地方)。

## 8. 命名上刻意不逐字沿用 Java 的地方

`XMPPFailureReporter` 介面宣告：

```java
public interface XMPPFailureReporter {
  void cannotTranslateMessage(String auctionId, String failedMessage, Exception exception);
}
```

- 第一個參數叫 `auctionId`，但 Java 原始碼裡唯一的呼叫處（`AuctionMessageTranslator.java`）永遠傳的是 `sniperId` 這個變數，從未真正代表過拍賣本身的 ID——這是書中原始碼自己的命名瑕疵。`RedisFailureReporter` 刻意不逐字沿用，改叫 `sniperId`，跟 `RedisAuctionHouse`/`RedisAuction`/`AuctionMessageTranslator` 裡代表「我是誰」的其他地方統一命名，避免混淆。

### `Chat` 改名叫 `RedisChannel`

Java 的 `org.jivesoftware.smack.Chat`、`XMPPAuction.chat` 欄位、`chatDisconnectorFor()` 方法，這幾個命名 TS 版沒有逐字沿用——對應的 `chat`/`chatDisconnectorFor()` 已改名為 `channel`/`channelDisconnectorFor()`。`Chat` 在 Smack 裡是協定天生保證的點對點通道，`RedisChannel` 底下其實是一個私有的 publish channel 加一個廣播的 subscribe channel（見[第 7 節](#7-redischannel-沿用-node-redis-的-per-channel-callback-機制)），沿用 `Chat` 這個名字會讓讀者誤以為兩者有一樣的協定層保證，屬於 Clean Code「避免誤導性命名」（Avoid Disinformation）要處理的情況，跟上面 `sniperId`/`auctionId` 那個例子屬於同一類——書中命名不能直接沿用時，準則 2（貼近書中精神）要對齊的是介面形狀跟呼叫端寫法（`XMPPAuction.java` 圍繞一個 `Chat` collaborator 設計，`RedisAuction.ts` 也圍繞一個 `RedisChannel` collaborator 設計，兩者結構一致），不是連已經不成立的命名語意也要照搬。

### `Message.ts` 的訊息內容欄位跟 `sniperId` 都用 `string`，不另外宣告型別

`Message.ts` 的 `JoinMessage.bidder`/`PriceMessage.bidder`/`BidMessage.bidder`（訊息裡記載的出價者，可能是目前這個 sniper 自己，也可能是別人）跟 `sniperId`（我自己是誰，出現在 `RedisAuction`、`RedisAuctionHouse.connect()`、`RedisConnection.login()`/`getUser()`、`AuctionMessageTranslator` 等處）是兩個不同語意的概念，但兩邊都直接用 `string`，不另外用型別系統區分——因為 TypeScript 是結構型別，就算宣告一個 `type Bidder = string` 這樣的別名，也只是 `string` 的別名，兩者可以無條件互相賦值，編譯器不會攔任何誤用，型別別名在這裡不會提供實質的型別安全，只會是純語意提示。跟 Java 原始碼一致（Java 兩種概念也都只用 `String`），語意上的差異只靠變數命名（`bidder` vs `sniperId`）跟註解自己說清楚。

## 9. Domain/util 層的框架轉換差異

以下是 `server/auctionsniper/*.ts`（不含 `redis/` 子目錄，即 `AuctionSniper`、`SniperSnapshot`、`SniperState`、`SnipersTableModel`、`util/Announcer` 等對應書中 `src/auctionsniper/*.java` 核心邏輯）跟 Java 版逐檔比對後，確認屬於**必要**的框架/語言轉換差異，不是漏改：

### `equals()`/`hashCode()`/`toString()` 省略

Java 的 `SniperSnapshot`、`UserRequestListener.Item` 都用 Apache Commons `EqualsBuilder`/`HashCodeBuilder`/`ToStringBuilder` 做反射式實作，測試裡用 `assertEquals`/`samePropertyValuesAs` 做值比較。TS 版沒有實作這三個方法——Vitest 的 `expect(...).toEqual(...)` 本來就會對物件做深度結構比較，不需要 class 自己提供 `equals()`；`toString()`/`hashCode()` 在 TS 測試或執行流程中也沒有被用到。

### `SniperState.whenAuctionClosed()` 的多型改用查表

Java `SniperState` 是 enum，每個常數（`JOINING`、`BIDDING`、`WINNING`、`LOSING`）各自 `@Override` `whenAuctionClosed()`，其餘常數繼承拋 `Defect` 的預設實作。TypeScript 的 `enum` 是純值型別，不支援每個成員各自覆寫方法，`SniperState.ts` 改用 `CLOSE_TRANSITIONS` 查表 + 獨立函式 `whenAuctionClosed(state)`，查不到就拋 `Defect`——效果對等，只是把「多型分派」換成「資料表查詢」。

`SniperState` 的 enum 成員刻意**不帶字串值**（`JOINING`、`BIDDING`…直接用 TS 自動遞增的數字，等同 Java 的 `ordinal()`），跟 Java 一樣不持有任何顯示文字——顯示文字統一由 `SnipersTableModel.STATUS_TEXT`/`textFor()` 負責（見下面 `Column`/`SnipersTableModel` 那節），不是這裡的責任。

### `Column`/`SnipersTableModel` 的多型改用 class + 具名靜態實例

Java `ui/Column` 也是 enum、每個常數各自 `@Override` `valueIn()`，且 `SNIPER_STATE` 常數的 `valueIn()` 呼叫 `SnipersTableModel.textFor(snapshot.state)`——`Column`/`SnipersTableModel` 同在 `auctionsniper.ui` package，互相依賴。

`server/auctionsniper/ui/Column.ts` 改用另一種譯法重現這個依賴：一般 class，建構子收一個 `valueInFn` closure，四個「常數」變成 `static readonly` 具名實例（`Column.ITEM_IDENTIFIER` 等），`Column.values`/`Column.at()` 對應 Java 的 `values()`/`at(offset)`；`SNIPER_STATE` 一樣呼叫 `SnipersTableModel.textFor(snapshot.state)`。兩個檔案互相 import（`Column.ts` import `SnipersTableModel.ts` 取得 `textFor`，`SnipersTableModel.ts` import `Column.ts` 取得 `values`/`at`），這在 ESM 是合法的循環依賴——雙方都只在方法/closure 內部才真正引用對方，模組頂層求值階段不會互相卡住。

跟 `SniperState` 的查表法不同，是因為 `Column` 除了行為外，`server/utils/sniper-registry.ts` 建構 WebSocket/HTTP payload 時還需要把它當一個可迭代集合走訪每個欄位，用具名靜態實例比查表更貼近「還是一個個獨立物件」的用法。

`Column.ts` 的欄位（`name`、`valueInFn`）刻意只對到 Java `Column` enum 實際有的東西（`name` 欄位 + `valueIn()` 行為），不多帶一個 `key` 欄位——這是純粹給 `SnipersTable.vue` 用的欄位識別，同時當 `v-for` 的 Vue `:key` 與 `<td>` 的 `data-testid`（供 e2e 測試定位欄位），是 TS/Vue 特有需求（Java 版用 WindowLicker 直接對整列 label text 做 Hamcrest matcher，不需要額外的欄位識別），因此放在沒有 Java 對應物、本來就是 TS 專屬的 `server/utils/sniper-registry.ts`（見下一節）裡維護，不汙染 `Column` 這個直接對照 Java enum 的檔案。

`SnipersTableModel.ts` 本身則跟 Java 版結構一致：`STATUS_TEXT` 陣列（索引對應 `SniperState` 的數字值，即 Java 的 `ordinal()`）、`static textFor(state)`、`getColumnCount()`/`getRowCount()`/`getColumnName()`/`getValueAt()` 都對應 Java `AbstractTableModel` 的同名方法。差異只在於：

- TS 沒有 `AbstractTableModel` 可以繼承，`addListener()`/`SnipersTableListener` 是額外補上的通知機制（Java 版是 `AbstractTableModel` 內建的 `addTableModelListener()`），且 `onSnapshotsChanged()` 刻意設計成**不帶參數**，模擬 Swing `TableModelListener.tableChanged(TableModelEvent e)` 的精神——只通知「有變動」，監聽者要自己呼叫 `getRowCount()`/`getColumnCount()`/`getValueAt()` 重新讀取。
- Java 版 `fireTableRowsInserted(row, row)`/`fireTableRowsUpdated(row, row)` 能精確指出「哪一列」變了；TS 版的 `notifyChange()` 只是單一訊號，不帶行號範圍，因為下游的 `server/routes/ws.ts`/`server/api/snipers.get.ts` 都是重新整包查詢建構整份 payload 推給瀏覽器，`SnipersTable.vue` 用 Vue 的響應式陣列重新渲染整張表，沒有 Swing 那種「精確更新單一 row」的效能考量。

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
    const auctionHouse = await RedisAuctionHouse.connect(redisUrl, sniperId);
    disconnectWhenServerCloses(auctionHouse, registerServerCloseHandler);
    addUserRequestListenerFor(auctionHouse);
  }

  function disconnectWhenServerCloses(
    auctionHouse: RedisAuctionHouse,
    registerServerCloseHandler: (handler: () => Promise<void>) => void
  ): void {
    registerServerCloseHandler(() => auctionHouse.disconnect());
  }

  function addUserRequestListenerFor(auctionHouse: RedisAuctionHouse): void {
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
  兩者的差異只在於 Java 的 `ui`（`MainWindow`）本身就是 `disconnectWhenUICloses()` 能直接拿到的欄位，TS 版沒有「視窗」可以掛 `WindowListener`，改成用 callback 參數把「關閉時要做什麼」交給真正握有 `nitroApp`（Nitro 伺服器生命週期）的呼叫端決定——`main()` 本身仍然不依賴任何 Nitro 型別，維持成一支框架無關的 orchestration 函式。
- **沒有對應物的部分**：`getTableData()` 把 `SnipersTableModel` 的 `getColumnCount()`/`getRowCount()`/`getColumnName()`/`getValueAt()` 走訪一遍，組成一份 `{ columns, rows }` 的純資料物件，供 `server/api/snipers.get.ts`（HTTP）、`server/routes/ws.ts`（WebSocket）序列化成 JSON 送給瀏覽器。Java 版完全沒有這一步——`MainWindow`（Swing `JFrame`）跟 `SnipersTableModel` 活在**同一個 JVM process** 裡，`JTable` 直接呼叫 `model.getValueAt(row, col)` 就能拿到資料渲染，中間沒有任何序列化或網路邊界。goos-ts 的 UI 是瀏覽器裡的 Vue app，跟跑 `SnipersTableModel` 的 Node process 是**兩個不同 process、隔著網路**，所以需要一個地方把「表格模型」轉成「可以序列化過網路的純資料」，`getTableData()` 就是在做這件事——這整個轉譯步驟是 client-server 架構的必然需求，Java 桌面應用完全不需要。

### `Announcer` 用 JS `Proxy` 取代 `java.lang.reflect.Proxy`

兩者概念一致——回傳一個實作了目標介面的動態代理物件，呼叫代理物件的任何方法都會廣播給所有已註冊的 listener。

- Java 版靠 `java.lang.reflect.Proxy.newProxyInstance()` + `InvocationHandler`，還得手動處理 `InvocationTargetException` 把底層例外重新拋出。
- TS 版用語言原生的 `Proxy`（`get` trap 攔截任意屬性存取、回傳一個會遍歷 `listeners` 呼叫同名方法的函式），不需要 Java 反射那套例外包裝，呼叫端的例外會原生往上拋，行為等價但機制更直接。

### Java 的 `extends EventListener` 標記介面沒有對應物

Java 有好幾個介面宣告 `extends java.util.EventListener`（`AuctionEventListener`、`SniperListener`、`UserRequestListener`、`SniperPortfolio.PortfolioListener`）——`java.util.EventListener`本身沒有任何方法，純粹是一個**標記介面**（marker interface），Swing/AWT 事件系統慣例上要求所有 listener 介面都繼承它，方便框架用 `instanceof EventListener` 之類的方式做通用處理，但這些介面自己完全沒有因為繼承它而多出任何行為。

TypeScript 是結構型別（structural typing），本來就不需要顯式標記「這是一個 listener 介面」才能被當成 listener 使用，所以 TS 版的對應介面（`AuctionEventListener.ts`、`SniperListener.ts`、`UserRequestListener.ts`、`SniperPortfolio.ts` 的 `PortfolioListener`）都不 `extends` 任何東西。`Announcer<T>` 的泛型上界也對應改成 `T extends object`（TS 沒有 `EventListener` 這個概念可以當上界），而不是 `T extends EventListener`。

### `SwingThreadSniperListener` 沒有 TS 對應檔案

Java 的 `SwingThreadSniperListener` 是一個 `SniperListener` 的包裝器：`sniperStateChanged()` 收到通知時，用 `SwingUtilities.invokeLater()` 把實際處理**轉派到 Swing 的 Event Dispatch Thread（EDT）**再執行，因為 Swing 元件只能在 EDT 上安全存取，而通知來源（XMPP 網路執行緒）不是 EDT。`ui/SnipersTableModel.java` 的 `sniperAdded()` 因此是 `sniper.addSniperListener(new SwingThreadSniperListener(this))`，包一層再註冊。

Node.js 是單執行緒事件迴圈，沒有「必須轉派到特定執行緒才能安全更新 UI」這個問題，`SnipersTableModel.ts` 的 `sniperAdded()` 因此直接 `sniper.addSniperListener(this)`，不需要、也没有對應 `SwingThreadSniperListener` 的包裝類別——這整個檔案在 TS 版被刪除，不是漏翻譯。

## 10. 測試檔案跟 Java 版刻意不一致的地方

`test/unit/**`（不含 `redis/` 子目錄）已逐檔對照 `goos-code` 的 `test/unit/test/auctionsniper/**`，測項數量、測項涵蓋的情境、測項宣告順序都已對齊到跟 Java 版一致（例如 `AuctionSniper.test.ts` 對照 `AuctionSniperTest.java`、`SnipersTableModel.test.ts` 對照 `SnipersTableModelTest.java`）。以下是review 後確認**必要**保留、不會也不需要對齊的差異：

- **測試框架語法**：Java 用 JUnit 4 的 `@Test public void methodName()`（方法名即測項描述，駝峰命名），TS 用 Vitest 的 `it('描述文字', () => {...})`（描述文字用一般英文句子）。這是框架慣例差異，測項對應關係已在各測試檔案逐一核對，順序、數量、涵蓋情境都有比對，只是描述的書寫方式不同。
- **Mock 機制**：Java 用 jMock 2（`Mockery`、`Expectations`、`context.checking(...)`、`States`/`Sequence` 表達呼叫順序與狀態機限制），TS 用 Vitest 內建的 `vi.fn()`/`toHaveBeenCalledWith()`/`toHaveBeenNthCalledWith()`。兩者能表達的斷言能力大致對等（`toHaveBeenNthCalledWith` 對應 jMock 的 `inSequence`），但寫法不同，不強求逐字翻譯 jMock 的 `Expectations` DSL。
- **Matcher 語法**：Java 用 Hamcrest（`equalTo`、`samePropertyValuesAs`、自訂 `FeatureMatcher`），TS 用 Vitest 內建的 `expect(...).toEqual(...)`/`expect.objectContaining(...)`。`samePropertyValuesAs`（比對物件所有屬性值，不要求同一個 class）對應 `toEqual`；Java 自訂的 `FeatureMatcher`（例如 `AuctionSniperTest.aSniperThatIs(state)`）在 TS 版用 `expect.objectContaining({ state })` 這種內建局部比對取代，不需要另外寫一個 matcher class。
- **例外斷言**：Java 用 `@Test(expected = Defect.class)` annotation 屬性宣告預期例外；TS 用 `expect(() => ...).toThrow(Defect)`。兩者都明確指定例外的 class/類型，斷言強度對等。
- **helper 函式的宣告位置**：Java 的私有 helper 方法（`AuctionMessageTranslatorTest.expectFailureWithMessage()`、`SnipersTableModelTest.assertRowMatchesSnapshot()`/`cellValue()`、`AuctionSniperEndToEndTest.waitForAnotherAuctionEvent()` 等）都宣告在**所有 `@Test` 方法之後**。對應的 TS 測試檔案已全部核對並改成同樣的順序（`describe()`/`test.describe()` 裡的 `it`/`test` 全部排在前面，helper function 放在最後），不是宣告在檔案開頭——JS/TS 的 function 宣告本來就會 hoisting，所以放在檔案結尾不影響 helper 在測試中被呼叫。
- **`uniqueItemId()` 沒有 Java 對應物**：`test/integration/redis/RedisAuctionHouse.test.ts` 用 `uniqueItemId()` 幫每個測試產生獨一無二的 item id，避免多次測試執行之間互相污染（因為這一層是接**真實 Redis**，channel 名稱如果撞到前一次測試殘留的訂閱/訊息會誤判）。Java 的 `XMPPAuctionHouseTest.java` 直接用固定字串 `"item-54321"`，沒有這層考量——推測是 Openfire 測試環境每次都是乾淨重來，不會有殘留狀態跨測試污染的問題。
