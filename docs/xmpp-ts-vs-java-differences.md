# XMPP 版 TS 與 Java 版的刻意差異

`server/auctionsniper/xmpp/*` 用 xmpp.js（`@xmpp/client`，見 [ADR-0011](adr/ADR-0011-xmpp-client-library-selection-xmpp-js.md)）連線 Prosody，使用方式盡量比照 `goos-code` 的 `src/auctionsniper/xmpp/*.java` 用 Smack library 的 `XMPPConnection`/`ChatManager`/`Chat`/`Message`/`MessageListener` 這一套物件模型，呼叫方式盡可能逐字對照。Smack 內部機制的完整查證筆記見 [`smack-chatmanager-internals.md`](smack-chatmanager-internals.md)。

這份文件記錄**刻意**跟 Java 版不同的地方——每一項都有明確理由，不是漏改、也不是還沒對齊。

## 一致的部分

以下呼叫方式跟 Java 版幾乎逐字對照：

| Java（Smack）                                                          | TS（xmpp.js 版，`server/auctionsniper/xmpp/*`）                                   |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `connection.getChatManager().createChat(auctionJID, translator)`       | `connection.getChatManager().createChat(auctionJID, translator)`                  |
| `connection.getUser()`                                                 | `connection.getUser()`                                                            |
| `chat.sendMessage(message)`                                            | `chat.sendMessage(message)`                                                       |
| `chat.removeMessageListener(translator)`                               | `chat.removeMessageListener(translator)`                                          |
| `chat.getParticipant()`                                                | `chat.getParticipant()`                                                           |
| `message.getBody()`                                                    | `message.getBody()`                                                               |
| `void processMessage(Chat chat, Message message)`（`chat` 參數不使用） | `processMessage(chat: XMPPChat, message: XMPPMessage): void`（`chat` 參數不使用） |

`XMPPAuction.ts`（`chat` 欄位、`chatDisconnectorFor()`）、`FakeAuctionServer.ts`（`connection.getChatManager().addChatListener(...)` 被動接收）都直接用這套物件模型，命名、呼叫順序、方法職責分工都跟 Java 版一致。

## 差異 1：`XMPPConnection.connect()` 把 Java 的三個步驟合併成一個 async factory

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

**原因**：xmpp.js 本身的 API 設計就是這樣——`client({ service, domain, resource, username, password })` 建立 client 物件後，`.start()` 一次做完「連線+驗證」，沒有對應 Smack `connect()`/`login()` 分開兩步的中繼狀態可以介入。刻意拆成三步反而要自己在 `.start()` 中途插入不存在的中斷點，沒有實際好處。

**影響範圍**：`XMPPAuctionHouse.connect()`、`test/integration/xmpp/FakeAuctionServer.ts#startSellingItem()`、`tools/fake-auction-xmpp.ts` 都用這個合併後的單一 async factory，呼叫端看不到中間狀態。

## 差異 2：`XMPPChatManager` 的訊息比對規則比 Smack `ChatManager` 簡單，但外部行為一致

Smack `ChatManager` 的完整比對規則（thread ID 優先、bare JID 其次）記錄在 [`smack-chatmanager-internals.md`](smack-chatmanager-internals.md#訊息路由比對規則thread-id-優先bare-jid-其次)。`XMPPChatManager.dispatch()` 只用 stanza 的 `from` 屬性（完整 JID，含 resource）當唯一比對 key，沒有 thread ID 這一層。

**這是刻意簡化，不是遺漏，理由已查證確認**（見 [`smack-chatmanager-internals.md`](smack-chatmanager-internals.md#為什麼-thread-id-對-smack-來說不是可有可無的最佳化) 完整推導）：Smack 需要 thread ID 是因為它主動建立 `Chat` 時用完整 JID 當 key、被動 fallback 卻用裁過 resource 的 bare JID 查，兩者不一致，需要 thread ID 補救。TS 版的 `XMPPChatManager` 存跟查都統一用完整 JID，天生一致，不會出現這種自我矛盾；而且本專案的使用情境嚴格 1:1（一個 `XMPPAuction`/`FakeAuctionServer` 實例從頭到尾只跟一個固定對象對話），不需要 Smack 為了「同一組使用者同時開多個對話」這種泛用聊天情境而設計的 thread 分流機制。這個結論已經用 `test/integration/xmpp/XMPPAuctionHouse.test.ts` 實測驗證（真實連線 Prosody，非 mock）：sniper 主動建立的 chat 能正確收到拍賣現場的回覆，行為跟 Java 版一致。

## 差異 3：`XMPPMessage` 只實作 `getBody()`

Smack 的 `Message`（`extends Packet`）完整 API 還有 `getFrom()`/`getTo()`/`getSubject()`/`getType()`/`getThread()`/`getBody(language)` 等方法，書中程式碼（`AuctionMessageTranslator.java`/`FakeAuctionServer.java`）查過只用到 `getBody()`（完整查證過程見 [`smack-chatmanager-internals.md`](smack-chatmanager-internals.md#messagepacket-的完整欄位跟書中實際用到的部分)）。`server/auctionsniper/xmpp/XMPPMessage.ts` 因此只實作 `getBody()`，把 `stanza.getChildText('body')` 這個解析細節集中在單一檔案，`AuctionMessageTranslator.ts`、`FakeAuctionServer.ts`、`tools/fake-auction-xmpp.ts` 都透過 `XMPPMessage.getBody()` 取得訊息內容，不各自重複解析 stanza。

## 差異 4：`addChatListener()` 的 callback 省略 `createdLocally` 參數

Java 版 `ChatManagerListener#chatCreated(Chat chat, boolean createdLocally)` 有兩個參數，但書中唯一的實作（`FakeAuctionServer.java`）沒有讀取 `createdLocally`：

```java
public void chatCreated(Chat chat, boolean createdLocally) {
  currentChat = chat;
  chat.addMessageListener(messageListener);
}
```

TS 版的 `ChatCreatedListener` 型別因此省略這個參數（`(chat: XMPPChat) => void`），`XMPPChatManager.createChat()`/`dispatch()` 內部也不再區分「主動建立」跟「被動建立」，只呼叫同一個不帶參數的通知函式。完整查證依據見 [`smack-chatmanager-internals.md`](smack-chatmanager-internals.md#messagelistenerchatmanagerlistener-介面)。

## 差異 5：型別定義依賴社群維護的 DefinitelyTyped 套件

Java（含 Smack）本身是靜態型別語言，方法簽章本來就是原始碼的一部分；xmpp.js 的 TypeScript 型別則是社群維護的 `@types/xmpp__client`（含一串 `@types/xmpp__*` 相依套件），不是 `@xmpp/client` 自己發佈的（已用 `npm view`/查看 `package.json` 直接確認無 `types` 欄位）。這是 [ADR-0011](adr/ADR-0011-xmpp-client-library-selection-xmpp-js.md) 已知並接受的取捨，這裡列出只是為了完整記錄「跟 Java 版用起來哪裡不一樣」。

## 未涵蓋的檔案

`tools/fake-auction-xmpp.ts` 沒有 Java 對應物（書中只有測試用的 `FakeAuctionServer.java`，見 README「專案結構比較」表格「手動模擬拍賣現場工具」一列），但實作上一樣重用 `XMPPConnection`/`XMPPChatManager`/`XMPPChat`/`XMPPMessage`，維持全專案只有一套「怎麼跟 Prosody 對話」的抽象。
