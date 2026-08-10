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

XMPP 的 `XMPPConnection` 物件本身知道「我是誰」（`connection.getUser()`），對方也能從 `chat.getParticipant()` 直接查到「這則訊息是誰送的」——身分完全在**連線層級**，訊息內容不需要帶任何身分資訊。

`XMPPAuction.JOIN_COMMAND_FORMAT`/`BID_COMMAND_FORMAT` 因此完全沒有 Bidder 欄位：

```java
public static final String JOIN_COMMAND_FORMAT = "SOLVersion: 1.1; Command: JOIN;";
public static final String BID_COMMAND_FORMAT = "SOLVersion: 1.1; Command: BID; Price: %d;";
```

MQTT client 沒有任何等價於 `connection.getUser()`／`chat.getParticipant()` 的機制——同一個 topic 底下，所有訂閱者收到的訊息看起來完全一樣，broker 不會告訴你「這則訊息是誰發的」。`Message.ts` 的 `JoinMessage`/`BidMessage` 因此都多了一個 `Bidder` 欄位，`encode()` 出來的訊息長這樣：

```
SOLVersion: 1.1; Command: JOIN; Bidder: sniper;
SOLVersion: 1.1; Command: BID; Price: 95; Bidder: sniper;
```

這個差異會連帶影響到第 3 節提到的 `MqttFakeAuctionServer.ts`。

## 3. `MqttFakeAuctionServer.ts` 沒辦法照 Java 做純字串相等比對

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

訊息內容本身只做**字串完全相等**比對（`equalTo(JOIN_COMMAND_FORMAT)`），是誰送的另外用 `currentChat.getParticipant()`（連線層級）查。

因為第 2 節那個必要分歧（Bidder 塞進訊息內容），TS 版的 JOIN/BID 訊息不再是固定字串，沒辦法直接字串相等比對。`test/e2e/MqttFakeAuctionServer.ts` 因此自己寫了一個獨立的 `parseCommand()`，從訊息內容裡取出 `Command`/`Bidder`/`Price` 欄位。這個解析邏輯**刻意不跟** `AuctionMessageTranslator.ts` 的私有 `AuctionEvent` 共用程式碼——因為 Java 本來就沒有共用：`AuctionEvent` 只服務「Event:」方向（PRICE/CLOSE），`FakeAuctionServer` 從不解析「Command:」方向，兩者在 Java 原始碼裡根本沒有交集。

## 4. `MqttClient` 沒有 `getUser()`，所以包了一個 `MqttConnection`

`XMPPAuctionHouse` 完全不存 sniper 的身分：

```java
public Auction auctionFor(Item item) {
    return new XMPPAuction(connection, auctionId(item.identifier, connection), failureReporter);
}
```

只傳 `connection` 跟算好的 `auctionId(...)`（跟 sniper 身分無關，只用 `item.identifier` 跟 `connection.getServiceName()`）。`XMPPAuction` 要用到「我是誰」時，是在自己的 `translatorFor(connection)` 裡用 `connection.getUser()` 現查：

```java
private AuctionMessageTranslator translatorFor(XMPPConnection connection) {
    return new AuctionMessageTranslator(connection.getUser(), auctionEventListeners.announce(), failureReporter);
}
```

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

## 5. 非同步 API：`connect()`/`disconnect()`/`processMessage()` 的簽章差異

- `XMPPAuctionHouse.disconnect()` 是同步的 `void` 方法；`MqttAuctionHouse.disconnect()` 是 `async`，回傳 `Promise<void>`——因為 Node.js 的 I/O（包含 mqtt.js 的斷線）本來就是非同步的，Smack 提供同步 API，這點沒有辦法讓 TS 版變成同步，是平台本身的差異。
- `AuctionMessageTranslator.processMessage(Chat chat, Message message)` 接收 Smack 的 `Chat`/`Message` 物件，內部呼叫 `message.getBody()` 取出字串；TS 版 `processMessage(messageBody: string)` 直接接收字串——因為 mqtt.js 沒有對應 Smack `Message` 的物件模型，拿到的就是原始 payload。

## 6. 循序保證要靠明確設定 QoS，不是天生就有

書中原文（Ch.12）：「we expect it to ensure that messages between a bidder and an auction arrive in the same order in which they were sent」——這個保證在 XMPP 裡是**單一 TCP 連線天生就有**的，不需要額外設定。MQTT 沒有這個天生保證，`MqttChat`／`MqttFakeAuctionServer` 的所有 publish 都明確帶 `{ qos: 1 }`，且同一條連線循序發送（不並行多個 in-flight），才能重現同等的循序保證（ADR-0002 Compliance #3）。

## 7. `MqttChat` 要自己過濾 topic，Smack 的 `Chat` 天生只收自己的訊息

Smack 的 `Chat` 物件，`addMessageListener()` 註冊的 listener 天生只會收到「這個 chat」的訊息——因為每個 `Chat` 對應到一個特定的 JID 對話。mqtt.js 的 `client.on('message', ...)` 是**整個 client 共用**的單一事件，訂閱多個 topic 時，所有 topic 的訊息都會觸發同一個 handler。`MqttChat` 的建構子因此得自己判斷 `topic === this.subscribeTopic` 才呼叫 `receive()`，這段過濾邏輯在 Java 版完全不需要，是 mqtt.js API 設計本身的差異。

## 8. 命名上刻意不逐字沿用 Java 的地方

`XMPPFailureReporter` 介面宣告：

```java
public interface XMPPFailureReporter {
  void cannotTranslateMessage(String auctionId, String failedMessage, Exception exception);
}
```

第一個參數叫 `auctionId`，但 Java 原始碼裡唯一的呼叫處（`AuctionMessageTranslator.java`）永遠傳的是 `sniperId` 這個變數，從未真正代表過拍賣本身的 ID——這是書中原始碼自己的命名瑕疵。`MqttFailureReporter` 刻意不逐字沿用，改叫 `sniperId`，跟 `MqttAuctionHouse`/`MqttAuction`/`AuctionMessageTranslator` 裡代表「我是誰」的其他地方統一命名，避免混淆。

`Message.ts` 的 `Bidder` 型別維持獨立，不跟 `sniperId` 統一——因為它代表的是「某則訊息裡記載的出價者」，可能是目前這個 sniper 自己，也可能是別人（`PriceMessage.bidder` 可以是 `"Someone else"`），跟「我自己是誰」是不同的概念，Java 原始碼裡也是分開處理的（`isFrom(sniperId)` 拿訊息裡的 bidder 去跟自己的 sniperId 比對）。
