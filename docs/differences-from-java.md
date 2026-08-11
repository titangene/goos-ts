# TS 版與 Java 版的刻意差異

`server/auctionsniper/mqtt/*` 已逐檔對照 `goos-code` 的 `src/auctionsniper/xmpp/*.java`，命名、結構盡量貼齊。這份文件記錄**刻意**跟 Java 版不同的地方——每一項都有明確理由，不是漏改、也不是還沒對齊。決策依據見 [`docs/adr/`](adr/)，這裡只整理「差異本身是什麼、為什麼非改不可」。

## 1. 協定與架構層級（見對應 ADR）

| 差異                                                | 對應 ADR                                           |
| --------------------------------------------------- | -------------------------------------------------- |
| 拍賣協定改用 MQTT（Mosquitto），不是 XMPP           | [ADR-0002](adr/ADR-0002-mqtt-replaces-redis.md)    |
| 身分識別改用 username-only 白名單，不做真實密碼驗證 | [ADR-0003](adr/ADR-0003-username-only-identity.md) |
| 拍賣協定分成 `commands`/`events` 兩個 topic         | [ADR-0006](adr/ADR-0006-mqtt-topic-topology.md)    |
| 訊息格式維持書中純文字 SOL 格式（非 JSON）          | [ADR-0007](adr/ADR-0007-message-format.md)         |

## 2. MQTT 沒有 XMPP「連線層級身分」，訊息內容要多帶一個 Bidder 欄位

- XMPP 的 `XMPPConnection` 物件本身知道「我是誰」（`connection.getUser()`），對方也能從 `chat.getParticipant()` 直接查到「這則訊息是誰送的」——身分完全在**連線層級**，訊息內容不需要帶任何身分資訊。
- 因此 `XMPPAuction.JOIN_COMMAND_FORMAT`/`BID_COMMAND_FORMAT` 完全沒有 Bidder 欄位：
  ```java
  public static final String JOIN_COMMAND_FORMAT = "SOLVersion: 1.1; Command: JOIN;";
  public static final String BID_COMMAND_FORMAT = "SOLVersion: 1.1; Command: BID; Price: %d;";
  ```
- MQTT client 沒有任何等價於 `connection.getUser()`／`chat.getParticipant()` 的機制——同一個 topic 底下，所有訂閱者收到的訊息看起來完全一樣，broker 不會告訴你「這則訊息是誰發的」。
- `Message.ts` 的 `JoinMessage`/`BidMessage` 因此都多了一個 `Bidder` 欄位，`encode()` 出來的訊息長這樣：
  ```
  SOLVersion: 1.1; Command: JOIN; Bidder: sniper;
  SOLVersion: 1.1; Command: BID; Price: 95; Bidder: sniper;
  ```
- 這個差異會連帶影響到第 3 節提到的 `FakeAuctionServer.ts`。

## 3. `FakeAuctionServer.ts` 一樣能做純字串相等比對，只是預期值要現算

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

- 訊息內容本身只做**字串完全相等**比對（`equalTo(JOIN_COMMAND_FORMAT)`），是誰送的另外用 `currentChat.getParticipant()`（連線層級）查——`JOIN_COMMAND_FORMAT`/`BID_COMMAND_FORMAT` 是固定字串／格式樣板，跟 sniperId 無關，因為身分已經由連線層級保證。
- 因為第 2 節那個必要分歧（Bidder 塞進訊息內容），TS 版的 JOIN/BID 訊息不是固定字串。但 `Message.encode()` 本來就是 `MqttAuction.join()`/`bid()` 產生訊息的唯一來源（跟 Java 的 `JOIN_COMMAND_FORMAT`/`BID_COMMAND_FORMAT` 常數扮演同一個角色：production code 跟測試用同一份格式定義），呼叫測試方法時 sniperId 本來就是已知參數。
- 所以 `test/e2e/FakeAuctionServer.ts` 直接用 `Message.encode(Message.Join(sniperId))`／`Message.encode(Message.Bid(sniperId, bid))` 算出「這個 sniper 應該送出的完整訊息」，再跟收到的內容做字串完全相等比對——身分檢查跟內容檢查合併成一次比對（因為身分本來就編碼在內容裡），不需要額外解析欄位，也不需要獨立的 `parseCommand()`。

## 4. `MqttClient` 沒有 `getUser()`，所以包了一個 `MqttConnection`

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

### `MqttConnection` 包住 `MqttClient`

`MqttClient`（mqtt.js 的原生型別）沒有 `getUser()`、也沒有 `connect()`/`login()` 這種分階段的連線流程——這些能力是 `XMPPConnection` 自己提供的，不是 XMPP 協定本身的功能。因此另外寫了 `MqttConnection.ts`，包住 `MqttClient`，補上 `connect()`／`login()`／`getUser()`／`disconnect()`，讓 `MqttAuctionHouse.connect()` 可以用跟 Java 幾乎一樣的順序操作：

```ts
const connection = new MqttConnection(brokerUrl);
await connection.connect();
connection.login(sniperId);
```

對照 Java：

```java
XMPPConnection connection = new XMPPConnection(hostname);
connection.connect();
connection.login(username, password, AUCTION_RESOURCE);
```

`login()` 找不到 username 時只拋一般的 `Error`（對應 Smack `connection.login()` 拋出的 `XMPPException`，屬於連線失敗的其中一種），不是直接拋 `MqttAuctionException`——包裝成 `MqttAuctionException` 是 `MqttAuctionHouse.connect()` 外層 try/catch 的責任，這點也跟 Java 的兩層結構一致（見 [ADR-0003](adr/ADR-0003-username-only-identity.md) Compliance #3）。

有了這層包裝，`MqttAuction` 的 `translatorFor(connection)` 也能跟 Java 一樣接收 `connection` 當參數、內部呼叫 `connection.getUser()`，不用額外傳一個 `sniperId` 參數進建構子。

### `FakeAuctionServer.ts` 也共用 `MqttConnection`，但反向建立 chat

`MqttConnection` 也不只服務 sniper 端：

- TS 版 `test/e2e/FakeAuctionServer.ts` 一樣用它處理 `connect()`/`disconnect()`，對照 Java 的 `FakeAuctionServer.java` 同樣直接持有一個 `XMPPConnection` 欄位、呼叫 `connection.connect()`/`connection.disconnect()`。
- 但 Java 版建立 `Chat` 的方式跟 `XMPPAuction` 不同——它從不主動呼叫 `createChat()`，而是用 `connection.getChatManager().addChatListener(...)` 被動等對方（sniper）建立 chat 後拿到 `currentChat`。
- TS 版對應的作法是直接用 `connection.client` 建構方向相反的 `MqttChat`（publish 用 events topic、subscribe 用 commands topic，跟 `MqttAuction` 的 `commandsTopic`/`eventsTopic` 方向正好相反），因為 mqtt.js 沒有 `ChatManager`／`addChatListener` 這種「被動等對方建立 chat」的機制，且 `MqttConnection.createChat()` 內建的 topic 方向本來就是為了 sniper 端設計，不適用於 fake auction server 這種角色相反的情境。
- 因此 `MqttConnection` 沒有另外提供反向的 `createChat()`，`login()`/`getUser()` 也用不到（fake auction server 不是 sniper，沒有身分白名單需求）。

## 5. 非同步 API：`connect()`/`disconnect()` 的簽章差異

- `XMPPAuctionHouse.disconnect()` 是同步的 `void` 方法；`MqttAuctionHouse.disconnect()` 是 `async`，回傳 `Promise<void>`——因為 Node.js 的 I/O（包含 mqtt.js 的斷線）本來就是非同步的，Smack 提供同步 API，這點沒有辦法讓 TS 版變成同步，是平台本身的差異。`connection.connect()`/`connection.login()` 同理。
- `AuctionMessageTranslator.processMessage(Chat chat, Message message)` 接收 Smack 的 `Message` 物件，內部呼叫 `message.getBody()` 取出字串；TS 版 `processMessage(chat: MqttChat, messageBody: string)` 的 `chat` 參數維持（跟 Java 一樣沒被用到），但第二個參數直接是字串——因為 mqtt.js 沒有對應 Smack `Message` 的物件模型，拿到的就是原始 payload，沒有 `.getBody()` 這一步可以省。

## 6. 循序保證要靠明確設定 QoS，不是天生就有

書中原文（Ch.12）：「we expect it to ensure that messages between a bidder and an auction arrive in the same order in which they were sent」——這個保證在 XMPP 裡是**單一 TCP 連線天生就有**的，不需要額外設定。MQTT 沒有這個天生保證，`MqttChat`／`FakeAuctionServer` 的所有 publish 都明確帶 `{ qos: 1 }`，且同一條連線循序發送（不並行多個 in-flight），才能重現同等的循序保證（ADR-0002 Compliance #3）。

## 7. `MqttChat` 要自己過濾 topic，Smack 的 `Chat` 天生只收自己的訊息

Smack 的 `Chat` 物件，`addMessageListener()` 註冊的 listener 天生只會收到「這個 chat」的訊息——因為每個 `Chat` 對應到一個特定的 JID 對話。mqtt.js 的 `client.on('message', ...)` 是**整個 client 共用**的單一事件，訂閱多個 topic 時，所有 topic 的訊息都會觸發同一個 handler。`MqttChat` 的建構子因此得自己判斷 `topic === this.subscribeTopic` 才呼叫 `receive()`，這段過濾邏輯在 Java 版完全不需要，是 mqtt.js API 設計本身的差異。

## 8. 命名上刻意不逐字沿用 Java 的地方

`XMPPFailureReporter` 介面宣告：

```java
public interface XMPPFailureReporter {
  void cannotTranslateMessage(String auctionId, String failedMessage, Exception exception);
}
```

- 第一個參數叫 `auctionId`，但 Java 原始碼裡唯一的呼叫處（`AuctionMessageTranslator.java`）永遠傳的是 `sniperId` 這個變數，從未真正代表過拍賣本身的 ID——這是書中原始碼自己的命名瑕疵。`MqttFailureReporter` 刻意不逐字沿用，改叫 `sniperId`，跟 `MqttAuctionHouse`/`MqttAuction`/`AuctionMessageTranslator` 裡代表「我是誰」的其他地方統一命名，避免混淆。
- `Message.ts` 的 `Bidder` 型別維持獨立，不跟 `sniperId` 統一——因為它代表的是「某則訊息裡記載的出價者」，可能是目前這個 sniper 自己，也可能是別人（`PriceMessage.bidder` 可以是 `"Someone else"`），跟「我自己是誰」是不同的概念，Java 原始碼裡也是分開處理的（`isFrom(sniperId)` 拿訊息裡的 bidder 去跟自己的 sniperId 比對）。

## 9. Domain／util 層的框架轉換差異

以下是 `server/auctionsniper/*.ts`（非 mqtt 部分，即 `AuctionSniper`、`SniperSnapshot`、`SniperState`、`SnipersTableModel`、`util/Announcer` 等對應書中 `src/auctionsniper/*.java` 核心邏輯）跟 Java 版逐檔比對後，確認屬於**必要**的框架/語言轉換差異，不是漏改：

### `equals()`/`hashCode()`/`toString()` 省略

Java 的 `SniperSnapshot`、`UserRequestListener.Item` 都用 Apache Commons `EqualsBuilder`/`HashCodeBuilder`/`ToStringBuilder` 做反射式實作，測試裡用 `assertEquals`/`samePropertyValuesAs` 做值比較。TS 版沒有實作這三個方法——Vitest 的 `expect(...).toEqual(...)` 本來就會對物件做深度結構比較，不需要 class 自己提供 `equals()`；`toString()`／`hashCode()` 在 TS 測試或執行流程中也沒有被用到。

### `SniperState.whenAuctionClosed()` 的多型改用查表

Java `SniperState` 是列舉，每個常數（`JOINING`、`BIDDING`、`WINNING`、`LOSING`）各自 `@Override` `whenAuctionClosed()`、其餘常數繼承拋 `Defect` 的預設實作。TypeScript 的 `enum` 是純值型別，不支援每個成員各自覆寫方法，`SniperState.ts` 改用 `CLOSE_TRANSITIONS` 查表 + 獨立函式 `whenAuctionClosed(state)`，查不到就拋 `Defect`——效果對等，只是把「多型分派」換成「資料表查詢」。

### `Column` 的多型改用 class + 具名靜態實例

Java `ui/Column` 也是列舉、每個常數各自 `@Override` `valueIn()`。`shared/Column.ts` 改用另一種譯法：一般 class，建構子收一個 `valueInFn` closure，四個「常數」變成 `static readonly` 具名實例（`Column.ITEM_IDENTIFIER` 等），`Column.values`／`Column.at()` 對應 Java 的 `values()`／`at(offset)`。

跟 `SniperState` 的查表法不同，是因為 `Column` 除了行為外，前端（`SnipersTable.vue`）還需要把它當一個可迭代集合直接渲染表頭／欄位，用具名靜態實例比查表更貼近「還是一個個獨立物件」的用法。

### `Announcer` 用 JS `Proxy` 取代 `java.lang.reflect.Proxy`

兩者概念一致——回傳一個實作了目標介面的動態代理物件，呼叫代理物件的任何方法都會廣播給所有已註冊的 listener。

- Java 版靠 `java.lang.reflect.Proxy.newProxyInstance()` + `InvocationHandler`，還得手動處理 `InvocationTargetException` 把底層例外重新拋出。
- TS 版用語言原生的 `Proxy`（`get` trap 攔截任意屬性存取、回傳一個會遍歷 `listeners` 呼叫同名方法的函式），不需要 Java 反射那套例外包裝，呼叫端的例外會原生往上拋，行為等價但機制更直接。

### `SnipersTableModel` 從 Swing `AbstractTableModel` 改成陣列 + 整包通知

- Java 版繼承 `AbstractTableModel`，用 `fireTableRowsInserted(row, row)`／`fireTableRowsUpdated(row, row)` 精確通知 Swing 是「哪一列」變了。
- TS 版沒有 Swing，`SnipersTableModel.ts` 自己維護 `snapshots` 陣列，`sniperAdded()`／`sniperStateChanged()` 都是呼叫同一個 `notifyChange()`，把**整包**陣列透過 `SnipersTableListener.onSnapshotsChanged(snapshots)` 傳給監聽者，不區分是新增還是更新、也不指出是哪一列。
- 這是因為下游的 `server/routes/ws.ts` 只是把整包 snapshots 序列化成 WebSocket 訊息推給瀏覽器，瀏覽器端 `SnipersTable.vue` 直接用 Vue 的響應式陣列重新渲染整張表，沒有 Swing 那種「精確更新單一 row」的效能考量，也就不需要 Java 版那樣的行號精細度。
