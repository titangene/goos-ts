# ADR-0002: 拍賣協定的 XMPP server 選型與身分識別——Prosody

**Status:** Accepted
**Date:** 2026-08-16
**Author:** titangene

## Context

依照 [ADR-0001: 建立拍賣協定重構的決策準則與優先順序](ADR-0001-decision-principles.md)（「練習 GOOS 精神下的 TDD」），goos-ts 的拍賣協定比照書中架構，用真正的 XMPP 當拍賣現場（`tools/fake-auction.ts`、`test/e2e/FakeAuctionServer.ts`）與 Sniper（`server/auctionsniper/xmpp/*`）之間的 broker。本 ADR 處理「該用哪個 XMPP server」以及「帳號/身分識別怎麼建立」這兩個緊密相關的子決定。

書中選 XMPP 的實際機制已經逐檔核對過 [sf105/goos-code](https://github.com/sf105/goos-code) 原始碼：`XMPPConnection` 原生 TCP 連線、`connection.login(username, password, resource)` 的 SASL/legacy 密碼登入、`ChatManager`/`MessageListener` 的 1:1 Chat 語意、純文字 SOL 訊息格式（見下方「訊息格式」）。已直接查證 `XMPPAuctionHouse.java`/`AuctionMessageTranslator.java`，確認應用層本身完全沒有額外的身分驗證邏輯：`connect(hostname, username, password)` 把帳密原封不動交給 XMPP server 的 `connection.login()` 驗證，驗證 100% 委託給外部系統。書中也明確表示安全性/驗證強度不在其設計目標內：「XMPP is neither reliable nor secure, and so is unsuitable for transactions. Ensuring any of those qualities is outside our scope.」

書中第 11 章原文「our test script starts up the Openfire server, creates accounts for the Sniper and the auction」交代了測試前要自動建立帳號，但完全沒有交代建帳號的技術手段（已查證書中前後文，也查過 goos-code 公開 repo 的 `tools/`、`build.xml`，都沒有對應程式碼）——這代表选型時「帳號建立機制」是可以自由決定的，只要保持自動化、不引入原書沒有的手動操作即可。

## Considered Options

- Prosody（Lua）
- ejabberd（Erlang）
- Openfire（Java）
- Tigase（Java）
- MongooseIM（Erlang）

## Decision Outcome

Chosen option: "Prosody"，因為它在 RAM 用量（~25–50MB）上比 Openfire、ejabberd 輕一個數量級以上，官方提供 `prosodyctl register` CLI 可以完全自動化建立帳號（不需要引入 Playwright 之類的瀏覽器自動化去模擬 GUI 操作，比 Openfire 更貼近書中「test script creates accounts」的自動化語感），且已透過 [`poc/docs/deploy.md`](../deploy.md) 實際部署驗證：WebSocket handshake 成功、XMPP 子協定正確協商、下方三個白名單帳號皆自動建立成功。

本決定不涉及：

- **部署平台選型**——見 [ADR-0004: XMPP 佈署平台選型——Render](ADR-0004-xmpp-deployment-platform.md)。
- **前端 client library 選型**——見 [ADR-0003: XMPP client library 選型——xmpp.js](ADR-0003-xmpp-client-library-selection.md)。

### 訊息格式

拍賣協定 payload（`server/auctionsniper/xmpp/*` 的 `commands`/`events`，即 JOIN/BID/PRICE/CLOSE）採用書中純文字 SOL 格式（`Field: Value;` 分號分隔），不使用 JSON 或其他結構化序列化格式——這樣才能原汁原味練習對應 `AuctionMessageTranslator` 的 parsing 邏輯，這是本次重構想練習的 TDD 情境之一。

瀏覽器 UI 推播（WebSocket/`SnapshotsMessage`，見 `server/routes/ws.ts`）是完全獨立於拍賣協定的另一個關注點——它對應書中 `SwingThreadSniperListener` 的角色，不是拍賣協定 broker 扮演的角色，**維持 JSON 格式不變**，兩者刻意不共用同一個 serializer/parser 模組。

### 身分識別

拍賣協定的連線層**不提供使用者自行設定/管理密碼的介面**。合法帳號是 Prosody 上以 `prosodyctl register` 事先靜態註冊好的一組固定帳號（`sniper`/`sniper`、`auction-item-54321`/`auction`、`auction-item-65432`/`auction`，見 `docker/xmpp/register-and-start.sh`），密碼是跟帳號綁死的已知常數，不對外暴露輸入介面——瀏覽器端 `/api/join` 只接受 `itemId`/`stopPrice`（見 `server/api/join.post.ts`），sniperId 本身是伺服器啟動時的設定值（`NUXT_SNIPER_ID`），對應的密碼由 `server/utils/sniper-registry.ts` 內建帶入，不是使用者輸入。

SASL 驗證本身仍然 100% 委託給 Prosody 這個真實的第三方系統：帳密不在已註冊清單內時，`XMPPConnection.connect()` 會拋出底層例外（例如密碼錯誤丟出的 `SASLError`），不直接拋出 `XMPPAuctionException`——包裝成 `XMPPAuctionException` 是 `XMPPAuctionHouse.connect()` 外層 try/catch 的責任，不是連線本身的責任，對應 Java 版 `connection.login()` 拋出 Smack 底層 `XMPPException`、由呼叫端包裝的兩層結構一致。這也保留了「connect 可能失敗、失敗要包裝成自訂例外」這個書中既有的錯誤處理結構，即使書中 `test/integration/.../XMPPAuctionHouseTest.java` 本身沒有測試連線失敗的案例，這個結構在 Java 原始碼中完全支援、只是沒被測試覆蓋到。

帳號本身的持久化完全交給 Prosody 自己的帳號系統負責，Nuxt server 這一側不另外儲存任何帳密資料，也不提供任何動態新增白名單或使用者自助註冊的機制。

## Consequences

**Positive:**

- `server/auctionsniper/xmpp/*` 可以逐檔對照 Java 版 `src/auctionsniper/xmpp/*.java`，`docs/differences-from-java.md` 記錄了兩者之間刻意保留的差異。
- 帳號建立完全腳本化（`prosodyctl register`），不需要維護 Playwright 這類瀏覽器自動化腳本，也不需要任何額外的帳號管理介面（註冊、密碼重設等）。
- CI（`.github/workflows/ci.yml`）直接 build/run `docker/xmpp/` 這個 Prosody image，讓整合測試/e2e 測試都能在 CI 跑真實的 XMPP 連線，不需要額外的相容層或 mock broker。
- 保留了「連線可能因未知身分而失敗」這個可測試的錯誤路徑，維持跟書中 `XMPPAuctionException` 對應的錯誤處理練習價值。

**Negative:**

- Prosody 需要外部部署（見 [ADR-0004](ADR-0004-xmpp-deployment-platform.md)），CI 環境要多一個 build/run Docker image 的步驟。
- 未來若需要新增合法帳號，需要重新執行 `prosodyctl register`（或修改 `docker/xmpp/register-and-start.sh` 重新部署），不像真實帳號系統可以動態自助註冊。

## Compliance

1. **XMPP server 唯一性**：拍賣協定實作 MUST 使用 Prosody 作為 broker，MUST NOT 使用 Openfire、ejabberd、Tigase、MongooseIM 或本 ADR 已評估並否決的其他 XMPP server，除非有新 ADR 明確取代本決定。
2. **帳號建立自動化**：XMPP 帳號建立（含 CI、部署環境）MUST 透過 `prosodyctl register` 或等價的官方 CLI/API 完成，MUST NOT 使用瀏覽器自動化（例如 Playwright）模擬 Admin Console 操作來建立帳號。
3. **訊息格式一致**：拍賣協定 payload MUST 使用書中 SOL 純文字格式（`Field: Value;` 分號分隔），MUST NOT 使用 JSON 或其他結構化序列化格式；`server/routes/ws.ts` 的 `SnapshotsMessage` MUST 維持 JSON 格式，MUST NOT 為了跟拍賣協定統一格式而改動；兩者的序列化/反序列化邏輯 MUST NOT 共用同一個 serializer/parser 模組。
4. **不提供使用者自訂密碼**：拍賣協定連線層 MUST NOT 提供任何讓使用者自行設定、輸入或管理密碼的介面；密碼 MUST 是跟帳號綁死的固定已知值，僅用來滿足 XMPP SASL 協定本身需要密碼欄位這件事。
5. **帳號清單固定且靜態**：合法帳號 MUST 是 Prosody 上以 `prosodyctl register`（或等價的官方 CLI/API）預先靜態註冊好的固定清單，MUST NOT 開放使用者自行註冊新帳號、或提供任何動態新增白名單的機制。
6. **失敗需在外層包裝例外**：帳密不在已註冊清單內、或 SASL 驗證失敗時，底層例外 MUST 在拍賣協定連線的最外層（對應 Java 版 `XMPPAuctionHouse.connect()`）被攔截並包裝成 `XMPPAuctionException`，MUST NOT 讓底層錯誤未經包裝直接往呼叫端拋。
7. **帳號持久化交給 Prosody**：MUST NOT 在 Nuxt server 這一側額外儲存、快取或管理任何帳密資料，帳號的持久化與驗證完全交給 Prosody 自己的帳號系統負責。

## Pros and Cons of the Options

### Prosody（Chosen）

Lua 撰寫的輕量 XMPP server，官方文件形容為「Lightweight XMPP server」。

- Good, because RAM 用量約 25–50MB，是所有候選中最輕量的（[xmpp.org 官方介紹](https://xmpp.org/software/prosody-im/)、[部署實測紀錄](https://voxelmanip.se/2025/06/25/setting-up-an-xmpp-server-with-prosody/)）。
- Good, because 官方 CLI `prosodyctl register <user> <host> <password>` 可以單行指令批次註冊帳號，直接可腳本化（[官方文件](https://prosody.im/doc/creating_accounts)）。
- Good, because 內建 `mod_websocket`（0.10 版起已內建，非外掛），已實測 WebSocket handshake 成功並正確協商 `xmpp` 子協定。
- Good, because 有官方維護的 Docker image（`prosodyim/prosody`），已實測用它部署成功（見 [`deploy.md`](../deploy.md)）。
- Neutral, because 明文 HTTP 介面（用來服務 `mod_websocket`）預設只監聽 localhost（`http_interfaces = { "127.0.0.1", "::1" }`），這是 Prosody 官方刻意的安全預設，不是 bug；部署到需要明文 HTTP 對外開放的平台時（例如在邊界做 TLS termination 的 PaaS）需要額外設定 `http_interfaces`（詳見 [`deploy.md`](../deploy.md)「Prosody 設定要點」）。

### ejabberd

Erlang 撰寫的 XMPP server，業界廣泛使用於企業級/需要叢集擴展的場景。

- Good, because 官方 GitHub repo 活躍度高（6700+ stars，查證當下最後一次 push 是查證當天）。
- Good, because 也有官方 CLI（`ejabberdctl register`）跟官方 Docker image（`ejabberd/ecs`）。
- Bad, because RAM 用量約 400MB–1GB，比 Prosody 重一個數量級以上（[ejabberd 官方論壇](https://www.ejabberd.im/forum/25347/issues-installing-over-1gb-ram-centos-7-ejabberd-minimum-requirements/index.html)）。
- Bad, because 定位偏企業級/叢集擴展，設定選項與管理複雜度明顯高於 Prosody，對這個小型 poc 專案的規模是過度設計。

### Openfire

Java(JVM) 撰寫的 XMPP server，書中原始架構實際使用的伺服器。

- Good, because 跟書中架構完全對應。
- Bad, because JVM heap 官方社群建議至少 512MB、常見設定上限 1024MB（僅 heap，不含 JVM 本身開銷），是所有候選中最重的（[Ignite Realtime 社群討論串](https://discourse.igniterealtime.org/t/increasing-java-memory/49582)）。
- Bad, because 沒有內建 CLI 建帳號，需要另外安裝 REST API plugin 才能腳本化建立帳號（[官方 REST API plugin](https://github.com/igniterealtime/openfire-restAPI-plugin)）。

### Tigase

Java 撰寫、強調高度優化的 XMPP server。

- Bad, because 仍是 JVM 應用，跟 Openfire 同一資源量級，官方文件本身也強調它是「Java 生態下少見有做效能優化的例子」，隱含承認 Java 生態的先天資源劣勢（[比較文章](https://pxe.gr/en/faqs-and-tips/communication-protocols/open-source-xmpp-servers-comparison-guide)）。
- Bad, because 查證中沒有找到具體的 RAM 用量數字可以跟 Prosody/ejabberd 做量化比較，資訊完整度不如其他候選。

### MongooseIM

Erlang 撰寫、定位為行動裝置/IoT 高併發場景的 XMPP server。

- Bad, because 跟 ejabberd 同屬 Erlang、同樣走叢集擴展路線，定位是「高訊息量的行動裝置 app」，跟這個小型 poc 專案的規模不符（[比較文章](https://pxe.gr/en/faqs-and-tips/communication-protocols/open-source-xmpp-servers-comparison-guide)）。
- Bad, because 沒有查到比 Prosody 更輕量的證據，排除理由與 ejabberd 相同。

### 使用者自行輸入/管理密碼

例如在畫面上加一個密碼欄位，串接真正可自助註冊的帳號系統。

- Good, because 更貼近一般應用程式的登入體驗。
- Bad, because 需要額外的註冊/密碼管理/重設流程，這些都是原書 `XMPPAuctionHouse`/`AuctionMessageTranslator` 完全沒有的邏輯，違反 [ADR-0001](ADR-0001-decision-principles.md) 準則 1（不增加多餘邏輯）的硬性限制，且不是這個練習 TDD 的 poc 專案需要的複雜度。

## More Information

- 部署可行性的完整設定與驗證過程記錄在 [`poc/docs/deploy.md`](../deploy.md)。
