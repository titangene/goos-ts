# ADR-0009: XMPP client library 選型——Strophe.js

**Status:** Accepted
**Date:** 2026-08-16
**Author:** titangene

## Context

[ADR-0008: 拍賣協定的 XMPP server 選型——Prosody](ADR-0008-xmpp-server-selection.md) 決定 poc 分支要額外實作一套 XMPP 版本，broker 選定 Prosody。要連線 Prosody，需要在兩個 Node.js process 裡選一個 JS/TS 的 XMPP client library：`tools/fake-auction.ts`（扮演拍賣現場，對應 Java 版 `FakeAuctionServer.java`）與 `server/auctionsniper/xmpp/*`（Sniper 端，對應 Java 版 `src/auctionsniper/xmpp/*.java`）。依照 [ADR-0007: 拍賣協定訊息格式維持書中 XMPP 純文字格式](ADR-0007-message-format.md) 既有的架構，瀏覽器不直接連 XMPP，兩端都是 Node.js process，因此本次選型只需要考慮 Node.js 環境下的表現，不需要特別考慮瀏覽器 bundle size 等前端專屬的取捨。

已核對 [xmpp.org 官方 library 清單](https://xmpp.org/software/?category=libraries)，對應到 JS/TS 生態主要是三個候選：`xmpp.js`（`@xmpp/client`）、`Strophe.js`、`StanzaJS`。三者都支援 Node.js 與 WebSocket transport。

書中 Java 版用 Smack library 的 `ChatManager`/`MessageListener` 提供「每個對話（chat）各自綁定一個 listener」的封裝：`XMPPAuction.java` 呼叫 `connection.getChatManager().createChat(auctionJID, translator)` 主動發起，`FakeAuctionServer.java` 用 `ChatManagerListener.chatCreated()` 被動接收。查證這三個候選的 API 設計後，發現沒有一個提供對等的「per-conversation Chat 物件」封裝，三者都是比 Smack 更底層的 event/handler 風格，都需要開發者自己在最外層的 handler 裡依 `from` JID 判斷是哪個對話。

## Considered Options

- xmpp.js（`@xmpp/client`）
- Strophe.js
- StanzaJS

## Decision Outcome

Chosen option: "Strophe.js"，因為它是三者中封裝需求最少、且 2026 年活躍度最高的選項：`addHandler(handler, ns, name, type, id, from, options)` 原生支援依 `from` JID 過濾，可以做到「每個 auction JID 各自註冊一個 handler」而不用自己在 handler body 裡寫 if 判斷路由，這是三者中唯一原生支援這個模式的；另外兩個候選（xmpp.js 的 `on("stanza", ...)`、StanzaJS 的 `on("chat", ...)`）都是單一全域 handler，收到所有對話的訊息，需要開發者自己判斷 `from`。

本決定不涉及：

- **XMPP server 選型**——見 [ADR-0008](ADR-0008-xmpp-server-selection.md)。
- **部署平台選型**——見 [ADR-0010: XMPP 佈署平台選型——Back4app Containers](ADR-0010-xmpp-deployment-platform.md)。
- **瀏覽器直連 XMPP**——目前架構下瀏覽器不直接使用任何 XMPP client library（見 [ADR-0007](ADR-0007-message-format.md)），若未來要脫離這個轉發架構、讓瀏覽器直連 XMPP，屬於更大的架構決策，須另開 ADR 討論，不可視為本 ADR 已預先核准。

## Consequences

**Positive:**

- `tools/fake-auction.ts`、`server/auctionsniper/xmpp/*` 的訊息路由邏輯可以直接用 `addHandler()` 的 `from` 參數過濾，不需要額外寫一層「依 from 判斷屬於哪個對話」的胶水程式碼。
- Strophe.js 原生 TypeScript（官方文件明講「Written in TypeScript, shipping type definitions」），型別定義由函式庫作者本人維護，不像 xmpp.js 依賴社群 DefinitelyTyped（`@types/xmpp__client`）可能滯後於實際版本。

**Negative:**

- Strophe.js 的 API 是「連線層/handler 層」的封裝，比 Smack 的 `ChatManager` 更底層，`server/auctionsniper/xmpp/*` 仍然需要自己實作一層對應 `AuctionMessageTranslator` 角色的訊息轉譯邏輯，這點三個候選都一樣，不是 Strophe.js 特有的成本。
- Strophe.js 剛在 2026 年 7 月完成全面 TypeScript 重寫（v4.1.0、v5.0.0），是相對新的版本，長期穩定性的實測資料比 xmpp.js（更早的既有版本）少。

## Compliance

1. **Client library 唯一性**：`tools/fake-auction.ts`、`server/auctionsniper/xmpp/*` 這兩個 Node.js 端 MUST 使用 Strophe.js 連線 Prosody，MUST NOT 使用 xmpp.js（`@xmpp/client`）或 StanzaJS，除非有新 ADR 明確取代本決定。
2. **瀏覽器不使用 XMPP client library**：MUST NOT 在瀏覽器端引入 Strophe.js 或任何 XMPP client library 直接連線 Prosody；瀏覽器與拍賣協定之間的邊界維持 [ADR-0007](ADR-0007-message-format.md) 既有的 Nuxt server 轉發架構，若要改變這個邊界須另開 ADR。
3. **訊息路由過濾方式**：依 `from` JID 區分不同對話的訊息時，MUST 使用 `addHandler()` 的 `from` 參數過濾，MUST NOT 在單一全域 handler 內自行寫 if/switch 判斷 `stanza` 來源——後者違反選擇 Strophe.js 的初衷（減少額外胶水程式碼）。

## Pros and Cons of the Options

### Strophe.js（Chosen）

JavaScript/TypeScript 撰寫的 XMPP library，支援 BOSH（XEP-0124/0206）與 WebSocket（RFC 7395）。

- Good, because `addHandler()` 原生支援依 `from` JID 過濾，是三者中封裝需求最少的。
- Good, because 原生 TypeScript，官方發佈型別定義，不依賴社群維護的型別套件。
- Good, because 2026 年活躍度高：v4.1.0（2026-07-07）完成 TS 全面重寫並加入 WebSocket Stream Management，v5.0.0（2026-07-21）加入 Node-only 的 external component transport，查證當下 GitHub 最後一次 push 就在查證當天。
- Neutral, because 剛完成大改版（TS 重寫），長期穩定性的實測資料比既有版本少。

### xmpp.js（`@xmpp/client`）

模組化的 XMPP library，官方定位「runs everywhere JavaScript runs」，支援 Node.js、瀏覽器、React Native、Bun、Deno 等環境。

- Good, because Node.js 端支援原生 TCP transport（`@xmpp/tcp`），跟書中 Smack 用的原生 `XMPPConnection` TCP 連線最接近。
- Good, because 官方套件依賴清單完整（`@xmpp/sasl-plain`、`@xmpp/sasl-anonymous`、`@xmpp/sasl-scram-sha-1`、`@xmpp/websocket` 等），SASL 機制支援完整。
- Bad, because TypeScript 型別不是原生的，是社群維護的 DefinitelyTyped 套件（`@types/xmpp__client`），直接查 npm registry 確認 `@xmpp/client` 本身的 `package.json` 沒有 `types` 欄位。
- Bad, because `on("stanza", ...)` 是單一全域 EventEmitter，收到所有進來的 stanza 不分寄件人，要自己在 handler 裡判斷 `stanza.attrs.from` 才能分辨是哪個對話。

### StanzaJS

把 XMPP stanza 包裝成 JSON API 的 library，官方定位「Modern XMPP in the browser, with a JSON API」。

- Good, because 同時支援 WebSocket 與 BOSH，且用 JSON 而非原始 XML 操作訊息內容。
- Bad, because `on("chat", ...)` 一樣是單一全域 handler，收到所有 `type="chat"` 的訊息，仍要自己判斷 `msg.from`。
- Bad, because 把一切轉成 JSON 是三個候選中離 Smack `Message` 物件（本質是 XML packet 的 OOP 包裝）語意最遠的一個。
- Bad, because GitHub 活躍度是三者中最低的（查證當下最後一次 push 是 2026-03-28，早於 xmpp.js 的 2026-04-13 與 Strophe.js 的查證當天）。

## More Information

三個候選的完整比較（含傳輸支援矩陣、SASL 機制、npm registry 直接查證的型別發佈狀態）在本 ADR 起草前的對話討論中已交叉核對，未逐一附上原始查證指令，但關鍵結論（`@xmpp/client` package.json 無 `types` 欄位、`@types/xmpp__client` 由 DefinitelyTyped 維護）已透過 `npm view`/`curl registry.npmjs.org` 直接查證，非憑印象推論。
