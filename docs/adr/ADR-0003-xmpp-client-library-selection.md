# ADR-0003: XMPP client library 選型——xmpp.js

**Status:** Accepted
**Date:** 2026-08-16
**Author:** titangene

## Context

[ADR-0002: 拍賣協定的 XMPP server 選型與身分識別——Prosody](ADR-0002-xmpp-server-selection.md) 決定拍賣協定的 broker 選定 Prosody。要連線 Prosody，需要在 Node.js process 裡選一個 JS/TS 的 XMPP client library：`tools/fake-auction.ts`（扮演拍賣現場，對應 Java 版 `FakeAuctionServer.java`）與 `server/auctionsniper/xmpp/*`（Sniper 端，對應 Java 版 `src/auctionsniper/xmpp/*.java`）。瀏覽器不直接連 XMPP（維持既有的 Nuxt server 轉發架構，見 `server/routes/ws.ts`），這一端都是 Node.js process，因此本次選型只需要考慮 Node.js 環境下的表現，不需要特別考慮瀏覽器 bundle size 等前端專屬的取捨。

`server/auctionsniper/xmpp/*` 是跟 Nuxt SSR 同一個 Node.js process 內執行的程式碼（`server/utils/sniper-registry.ts` 在伺服器啟動時就建立連線）。這代表候選函式庫除了「跟 Smack 的 `XMPPConnection`/`ChatManager`/`Chat` 物件模型好不好對應」之外，還有一個容易被忽略、但會直接導致 crash 的篩選條件：**函式庫是否會對 Node.js 的 `globalThis` 造成副作用**。`vue-router` 用 `typeof document !== "undefined"` 判斷是否在瀏覽器環境執行（`node_modules/vue-router/dist/devtools-Bpr7ZAVB.js:10`），任何一個在載入時就把 `document`/`DOMParser`/`XMLSerializer` 等瀏覽器全域物件掛到 `globalThis` 上的函式庫，都會讓 `vue-router` 在 SSR 階段誤判成瀏覽器環境，接著存取 Node.js 裡本來就不存在的全域 `history` 物件而炸掉（`ReferenceError: history is not defined`，crash 位置在 `vue-router` 內部的 `createRouter()`）。這是 jsdom 官方 wiki 明確列為反模式的做法（"Don't stuff jsdom globals onto the Node global"）。

## Considered Options

- Strophe.js（不隔離）
- Strophe.js + worker_thread 隔離
- Strophe.js + child_process 隔離
- xmpp.js（`@xmpp/client`）

## Decision Outcome

Chosen option: "xmpp.js（`@xmpp/client`）"，因為已實測驗證 `import '@xmpp/client'` 對 `globalThis` **零污染**（`Globals added by importing @xmpp/client: []`）——它底層用的是輕量 XML 解析器 `ltx`，不像 Strophe.js 的 Node 建置版本內建一份 DOM 實作（實測確認：`import 'strophe.js'` 本身就會把 `document`、`DOMParser`、`XMLSerializer`、`navigator` 掛到 `globalThis` 上，見 Pros and Cons）。問題從根源消失，不需要任何 process/thread 隔離機制。

worker_thread/child_process 隔離作為讓 Strophe.js 能安全共存於同一個 process 的替代方案也一併評估過（詳見 Pros and Cons）：worker_thread 有獨立的 global scope，確實能隔離污染，但額外引入 Nitro 打包 server 端程式碼時會改寫 `import.meta.url`、讓「相對於目前檔案定位 Worker 進入點」的常見寫法在打包後指向錯誤路徑的問題；child_process 隔離程度更徹底，但預期會遇到類似的進入點定位問題，且多一層 IPC 序列化開銷。兩者共同的根本缺點是：即使解決了打包定位問題，也只解決了「不要讓污染波及主 process」，並不會讓污染本身消失——每個新開的 worker/child process 內部仍然是被污染的環境。改用 xmpp.js 是唯一從根源移除問題、且不新增架構複雜度的選項。

本決定不涉及：

- **XMPP server 選型**——見 [ADR-0002](ADR-0002-xmpp-server-selection.md)。
- **部署平台選型**——見 [ADR-0004](ADR-0004-xmpp-deployment-platform.md)。
- **瀏覽器直連 XMPP**——瀏覽器不直接使用任何 XMPP client library，維持既有的 Nuxt server 轉發架構（`server/routes/ws.ts`），若未來要脫離這個轉發架構、讓瀏覽器直連 XMPP，屬於更大的架構決策，須另開 ADR 討論，不可視為本 ADR 已預先核准。

## Consequences

**Positive:**

- 從根源避免 globalThis 污染問題，不需要 worker_thread/child_process 隔離帶來的額外架構複雜度與 Nitro 打包定位問題。
- `@xmpp/client` 的 `start()` 在連線/驗證失敗時直接 reject Promise（實測驗證：錯誤密碼會丟出 `SASLError` 並讓 `start()` reject），`XMPPConnection.connect()`/`XMPPAuctionHouse.connect()` 因此不需要自己攤開一份「哪些狀態算失敗」的清單手動包 Promise。
- xmpp.js 沒有內建「per-conversation Chat」封裝，需要自建 `XMPPConnection`/`XMPPChatManager`/`XMPPChat`/`MessageListener` 抽象（見 Compliance #3），直接對應 Smack 的 `XMPPConnection`/`ChatManager`/`Chat`/`MessageListener`，呼叫方式（`connection.getChatManager().createChat(...)`、`chat.sendMessage(...)`、`chat.removeMessageListener(...)` 等）跟 Java 版逐字對照——完整對照與少數無法避免的差異記錄在 [`docs/differences-from-java.md`](../differences-from-java.md)。

**Negative:**

- `@xmpp/client` 的 TypeScript 型別不是原生的，是社群維護的 DefinitelyTyped 套件（`@types/xmpp__client`），這點在跟 Strophe.js 的 Pros and Cons 比較裡是 xmpp.js 相對的已知缺點，因為更關鍵的 SSR 相容性問題而接受這個取捨。
- `XMPPChatManager`「收到陌生 JID 訊息時自動建立 Chat」的行為是 TS 重建的，不是驗證過 Smack `ChatManager` 內部實作細節後照抄的——只保證跟 Java 版一致的外部可觀察行為，細節見 [`docs/differences-from-java.md`](../differences-from-java.md) 第 3 節。

## Compliance

1. **Client library 唯一性**：`tools/fake-auction.ts`、`server/auctionsniper/xmpp/*` 這兩個 Node.js 端 MUST 使用 xmpp.js（`@xmpp/client`）連線 Prosody，MUST NOT 使用 Strophe.js 或 StanzaJS，除非有新 ADR 明確取代本決定。
2. **瀏覽器不使用 XMPP client library**：MUST NOT 在瀏覽器端引入任何 XMPP client library 直接連線 Prosody；瀏覽器與拍賣協定之間的邊界維持既有的 Nuxt server 轉發架構（`server/routes/ws.ts`），若要改變這個邊界須另開 ADR。
3. **訊息路由分派方式**：依 `from` JID 區分不同對話的訊息時，MUST 透過 `XMPPConnection.getChatManager()` 回傳的 `XMPPChatManager` 建立/查找 `XMPPChat`（比照 Smack `connection.getChatManager()`），MUST NOT 在 `XMPPChatManager.dispatch()` 之外的地方（例如 `XMPPAuction`/`AuctionMessageTranslator`/測試替身）自行判斷 `stanza.attrs.from` 做路由。
4. **禁止用 process/thread 隔離繞過函式庫層級的 globalThis 污染**：MUST NOT 為了讓某個有 globalThis 副作用的函式庫能在 Nuxt server process 內使用，改用 worker_thread 或 child_process 隔離作為長期解法——這類方案只是把污染搬到另一個 process/thread，不是移除污染本身，且會引入額外的生命週期管理與訊息協定複雜度（見 Decision Outcome）。若未來要在 Nuxt server process 內引入新的第三方函式庫，MUST 先驗證該函式庫是否有等效的 globalThis 副作用。

## Pros and Cons of the Options

### xmpp.js（`@xmpp/client`）（Chosen）

模組化的 XMPP library，官方定位「runs everywhere JavaScript runs」，支援 Node.js、瀏覽器、React Native、Bun、Deno 等環境。已實測驗證 `import '@xmpp/client'` 對 `globalThis` 零污染。

- Good, because 從根源移除 globalThis 污染問題，不需要任何 process/thread 隔離。
- Good, because `start()` 連線/驗證失敗時直接 reject Promise，不需要手動攤開 status 判斷清單。
- Good, because Node.js 端支援原生 TCP transport（`@xmpp/tcp`），跟書中 Smack 用的原生 `XMPPConnection` TCP 連線最接近；官方套件依賴清單完整（`@xmpp/sasl-plain`、`@xmpp/sasl-anonymous`、`@xmpp/sasl-scram-sha-1`、`@xmpp/websocket` 等），SASL 機制支援完整。
- Neutral, because 沒有內建「per-conversation Chat」封裝，需要自建 `XMPPConnection`/`XMPPChatManager`/`XMPPChat` 補上 Smack `ChatManager` 原生提供的「依對話分派」能力，讓 XMPP 實作的分層結構逐字對照 Java 版的 Smack `XMPPConnection`/`ChatManager`/`Chat`，見 [`docs/differences-from-java.md`](../differences-from-java.md)。
- Bad, because TypeScript 型別不是原生的，是社群維護的 DefinitelyTyped 套件（`@types/xmpp__client`），直接查 npm registry 確認 `@xmpp/client` 本身的 `package.json` 沒有 `types` 欄位。

### Strophe.js（不隔離）

成熟、社群使用久的 XMPP client library。

- Good, because 文件完整、社群案例多。
- Bad, because Node.js 底下的建置版本，`import 'strophe.js'` 這個動作本身就會把 `document`、`DOMParser`、`XMLSerializer`、`navigator` 掛到 `globalThis` 上（實測確認：`Globals added by importing strophe.js: ['XMLSerializer', 'document', 'DOMParser', ...]`），讓 `vue-router` 在 Nuxt SSR 階段誤判成瀏覽器環境並 crash（見 Context）。
- Bad, because 手動刪除這些全域變數會讓 Strophe.js 自己壞掉——`new DOMParser()`/`document.implementation.createDocument(...)` 是在每次解析 stanza 時才重新讀取全域，不是在模組載入時快取一份區域參照，砍不掉。

### Strophe.js + worker_thread 隔離

已實際建過完整原型（`server/auctionsniper/xmpp/worker/*`）並手動驗證過。

- Good, because worker_thread 有獨立的 global scope，實測確認隔離後主 process 不再出現 `history is not defined`。
- Good, because 完整拍賣流程（join → PRICE 事件 → 自動出價 → UI 更新）在隔離後確實跑通過一次。
- Bad, because Nitro 打包 server 端程式碼會改寫 `import.meta.url`，讓「相對於目前檔案定位 Worker 進入點」的常見寫法在打包後失效，只找到 dev-mode-only 的權宜解法（`process.cwd()` 組路徑），production build 是否可行沒有驗證過。
- Bad, because 新增一整層 process/thread 生命週期管理與跨邊界訊息協定，架構複雜度明顯高於直接換函式庫。
- Bad, because 只是把污染搬到 worker 自己的 global scope，不是移除污染，任何未來要在同一個 worker 內引入的其他函式庫都要重新評估是否會跟 Strophe.js 的污染互相干擾。

### Strophe.js + child_process 隔離

只在討論階段評估過，沒有實際建原型驗證。

- Good, because child_process 有完全獨立的 V8 instance，隔離程度比 worker_thread 更徹底。
- Bad, because 預期會遇到跟 worker_thread 版本類似的「進入點檔案在 Nitro 打包後定位失效」問題，且沒有驗證過是否有更簡單的解法。
- Bad, because 跨 process 通訊只能用序列化過的 IPC channel，比 worker_thread 的 `postMessage`（仍可傳結構化資料）多一層序列化/反序列化開銷與複雜度。
- Bad, because 同樣只是把污染搬到另一個 process，不是移除污染本身。

## More Information

關鍵的空污染驗證（`Globals added by importing @xmpp/client: []`）與 `start()` reject 行為（密碼錯誤丟 `SASLError`、連線失敗丟底層錯誤）已用 scratch 腳本直接對本機 Prosody 實測，非憑函式庫文件或訓練記憶推論。

`server/auctionsniper/xmpp/*` 的物件模型（`XMPPConnection`/`XMPPChatManager`/`XMPPChat`）跟 Java 版 Smack 的 `XMPPConnection`/`ChatManager`/`Chat` 逐字對照的完整說明、以及少數無法避免的差異，記錄在 [`docs/differences-from-java.md`](../differences-from-java.md)。
