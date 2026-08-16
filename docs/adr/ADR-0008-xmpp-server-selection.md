# ADR-0008: 拍賣協定的 XMPP server 選型——Prosody

**Status:** Accepted
**Date:** 2026-08-16
**Author:** titangene

## Context

[ADR-0002: 拍賣協定的訊息傳輸機制選型——Redis Pub/Sub](ADR-0002-transport-selection.md) 選定 Redis Pub/Sub 取代書中的 XMPP，理由是「不增加多餘邏輯」與「簡單/低成本」在當時的候選比較中明顯占優。但 Redis Pub/Sub 是 channel 廣播模型，跟書中 XMPP 1:1 Chat 的實際運作機制有本質差異（見 [ADR-0006: Redis Channel 拓樸設計——分離 Commands/Events Channel](ADR-0006-channel-topology.md)），要重現書中 `ChatManager`/`MessageListener` 那種點對點語意，勢必得靠 channel 拆分等額外工程手段近似模擬。

poc 分支本身的目的是「練習 GOOS 精神下的 TDD」（見 [ADR-0001: 建立拍賣協定重構的決策準則與優先順序](ADR-0001-decision-principles.md)），因此決定額外實作一套真正的 XMPP 版本，跟現有 Redis 版本並行存在——這不是要推翻 ADR-0002 的結論，是在同一個 poc 分支上多驗證一條更貼近書中原始架構的路徑。兩個版本並存期間，ADR-0002 選定的 Redis 路徑（`server/auctionsniper/redis/*`）維持不動、繼續是預設/正式路徑；本 ADR 只處理「如果要走 XMPP，該用哪個 XMPP server」這個子決定。

書中選 XMPP 的實際機制已經逐檔核對過 [sf105/goos-code](https://github.com/sf105/goos-code) 原始碼：`XMPPConnection` 原生 TCP 連線、`connection.login(username, password, resource)` 的 SASL/legacy 密碼登入、`ChatManager`/`MessageListener` 的 1:1 Chat 語意、純文字 SOL 訊息格式（已由 [ADR-0007: 拍賣協定訊息格式維持書中 XMPP 純文字格式](ADR-0007-message-format.md) 對應）。書中第 11 章原文「our test script starts up the Openfire server, creates accounts for the Sniper and the auction」交代了測試前要自動建立帳號，但完全沒有交代建帳號的技術手段（已用 NotebookLM 查證書中前後文，也查過 goos-code 公開 repo 的 `tools/`、`build.xml`，都沒有對應程式碼）——這代表选型時「帳號建立機制」是可以自由決定的，只要保持自動化、不引入原書沒有的手動操作即可。

## Considered Options

- Prosody（Lua）
- ejabberd（Erlang）
- Openfire（Java，ADR-0002 已否決的對象）
- Tigase（Java）
- MongooseIM（Erlang）

## Decision Outcome

Chosen option: "Prosody"，因為它在 RAM 用量（~25–50MB）上比 Openfire、ejabberd 輕一個數量級以上，官方提供 `prosodyctl register` CLI 可以完全自動化建立帳號（不需要引入 Playwright 之類的瀏覽器自動化去模擬 GUI 操作，比 Openfire 更貼近書中「test script creates accounts」的自動化語感），且已透過 [`poc/docs/xmpp-prosody-back4app-spike.md`](../xmpp-prosody-back4app-spike.md) 實際部署驗證：WebSocket handshake 成功、XMPP 子協定正確協商、三個 [ADR-0003: 拍賣協定身分識別改用 Username-Only 白名單取代真實密碼驗證](ADR-0003-username-only-identity.md) 白名單帳號皆自動建立成功。

本決定不涉及：

- **部署平台選型**——見 [ADR-0010: XMPP 佈署平台選型——Back4app Containers](ADR-0010-xmpp-deployment-platform.md)。
- **前端 client library 選型**——見 [ADR-0009: XMPP client library 選型——xmpp.js](ADR-0009-xmpp-client-library-selection.md)。
- **訊息格式**——沿用 [ADR-0007](ADR-0007-message-format.md) 既有的 SOL 純文字格式規則，不因換成真正的 XMPP server 而改變。
- **取代 Redis 路徑**——[ADR-0002](ADR-0002-transport-selection.md) 選定的 Redis Pub/Sub 路徑維持不變、繼續是預設/正式路徑，兩者並存。

## Consequences

**Positive:**

- 補上 ADR-0002 決策過程中提到的缺口：能同時練到「跟不可控外部系統整合的 TDD」（真正的 XMPP server）與「快速紅綠燈循環的 TDD」（Redis 版本），呼應 [ADR-0001](ADR-0001-decision-principles.md) 準則 3。
- `server/auctionsniper/xmpp/*` 可以逐檔對照 Java 版 `src/auctionsniper/xmpp/*.java`，比 `server/auctionsniper/redis/*` 更貼近書中原始碼結構，`docs/differences-from-java.md` 需要新增這條路徑的對照說明。
- 帳號建立完全腳本化（`prosodyctl register`），不需要維護 Playwright 這類瀏覽器自動化腳本。

**Negative:**

- 兩套協定實作（Redis、XMPP）需要並行維護，`server/auctionsniper/` 底下會同時存在 `redis/` 與 `xmpp/` 兩個實作、`tools/fake-auction.ts` 可能需要支援切換連線的協定。
- Prosody 需要外部部署（見 [ADR-0010](ADR-0010-xmpp-deployment-platform.md)），CI 環境要跑 XMPP 相關整合測試時，需要額外的 service 設定（比照現有 CI 用 `services:` 啟動 Redis 的做法）。

## Compliance

1. **XMPP server 唯一性**：poc 分支的 XMPP 拍賣協定實作 MUST 使用 Prosody 作為 broker，MUST NOT 使用 Openfire、ejabberd、Tigase、MongooseIM 或本 ADR 已評估並否決的其他 XMPP server，除非有新 ADR 明確取代本決定。
2. **帳號建立自動化**：XMPP 帳號建立（含 CI、部署環境）MUST 透過 `prosodyctl register` 或等價的官方 CLI/API 完成，MUST NOT 使用瀏覽器自動化（例如 Playwright）模擬 Admin Console 操作來建立帳號。
3. **與 Redis 路徑並存**：本 ADR MUST NOT 被解讀為取代或否決 [ADR-0002](ADR-0002-transport-selection.md)；`server/auctionsniper/redis/*` MUST 維持可運作、不因新增 XMPP 實作而被移除或停止維護，直到有新 ADR 明確裁決兩者取捨。
4. **訊息格式一致**：XMPP 拍賣協定 payload MUST 遵循 [ADR-0007](ADR-0007-message-format.md) Compliance #1 規定的 SOL 純文字格式，MUST NOT 因為換成真正的 XMPP server 就改用其他序列化格式。
5. **身分識別模型一致**：XMPP 版本的帳號白名單 MUST 沿用 [ADR-0003](ADR-0003-username-only-identity.md) 決定的 username-only 模型（`sniper`/`sniper`、`auction-item-<id>`/`auction`），MUST NOT 為 XMPP 版本另外設計一套不同的身分識別機制。

## Pros and Cons of the Options

### Prosody（Chosen）

Lua 撰寫的輕量 XMPP server，官方文件形容為「Lightweight XMPP server」。

- Good, because RAM 用量約 25–50MB，是所有候選中最輕量的（[xmpp.org 官方介紹](https://xmpp.org/software/prosody-im/)、[部署實測紀錄](https://voxelmanip.se/2025/06/25/setting-up-an-xmpp-server-with-prosody/)）。
- Good, because 官方 CLI `prosodyctl register <user> <host> <password>` 可以單行指令批次註冊帳號，直接可腳本化（[官方文件](https://prosody.im/doc/creating_accounts)）。
- Good, because 內建 `mod_websocket`（0.10 版起已內建，非外掛），已實測 WebSocket handshake 成功並正確協商 `xmpp` 子協定。
- Good, because 有官方維護的 Docker image（`prosodyim/prosody`），已實測用它部署到 Back4app Containers 成功。
- Neutral, because 明文 HTTP 介面（用來服務 `mod_websocket`）預設只監聽 localhost（`http_interfaces = { "127.0.0.1", "::1" }`），這是 Prosody 官方刻意的安全預設，不是 bug；部署到需要明文 HTTP 對外開放的平台時（例如 Back4app 這種在邊界做 TLS termination 的 PaaS）需要額外設定 `http_interfaces`（詳見 [`xmpp-prosody-back4app-spike.md`](../xmpp-prosody-back4app-spike.md) bug 2）。

### ejabberd

Erlang 撰寫的 XMPP server，業界廣泛使用於企業級/需要叢集擴展的場景。

- Good, because 官方 GitHub repo 活躍度高（6700+ stars，查證當下最後一次 push 是查證當天）。
- Good, because 也有官方 CLI（`ejabberdctl register`）跟官方 Docker image（`ejabberd/ecs`）。
- Bad, because RAM 用量約 400MB–1GB，比 Prosody 重一個數量級以上（[ejabberd 官方論壇](https://www.ejabberd.im/forum/25347/issues-installing-over-1gb-ram-centos-7-ejabberd-minimum-requirements/index.html)）。
- Bad, because 定位偏企業級/叢集擴展，設定選項與管理複雜度明顯高於 Prosody，對這個小型 poc 專案的規模是過度設計——跟 [ADR-0002](ADR-0002-transport-selection.md) 否決 AMQP/RabbitMQ、Kafka 的理由（「對這個題目而言明顯偏重，維運複雜度高但沒有對應好處」）性質相同。

### Openfire

Java(JVM) 撰寫的 XMPP server，書中原始架構實際使用的伺服器。

- Good, because 跟書中架構完全對應，是 [ADR-0002](ADR-0002-transport-selection.md) 原本評估過的選項。
- Bad, because JVM heap 官方社群建議至少 512MB、常見設定上限 1024MB（僅 heap，不含 JVM 本身開銷），是所有候選中最重的（[Ignite Realtime 社群討論串](https://discourse.igniterealtime.org/t/increasing-java-memory/49582)）。
- Bad, because 沒有內建 CLI 建帳號，需要另外安裝 REST API plugin 才能腳本化建立帳號（[官方 REST API plugin](https://github.com/igniterealtime/openfire-restAPI-plugin)），這正是 [ADR-0002](ADR-0002-transport-selection.md) 當初否決它的理由之一。

### Tigase

Java 撰寫、強調高度優化的 XMPP server。

- Bad, because 仍是 JVM 應用，跟 Openfire 同一資源量級，官方文件本身也強調它是「Java 生態下少見有做效能優化的例子」，隱含承認 Java 生態的先天資源劣勢（[比較文章](https://pxe.gr/en/faqs-and-tips/communication-protocols/open-source-xmpp-servers-comparison-guide)）。
- Bad, because 查證中沒有找到具體的 RAM 用量數字可以跟 Prosody/ejabberd 做量化比較，資訊完整度不如其他候選。

### MongooseIM

Erlang 撰寫、定位為行動裝置/IoT 高併發場景的 XMPP server。

- Bad, because 跟 ejabberd 同屬 Erlang、同樣走叢集擴展路線，定位是「高訊息量的行動裝置 app」，跟這個小型 poc 專案的規模不符（[比較文章](https://pxe.gr/en/faqs-and-tips/communication-protocols/open-source-xmpp-servers-comparison-guide)）。
- Bad, because 沒有查到比 Prosody 更輕量的證據，排除理由與 ejabberd 相同。

## More Information

- 部署可行性的完整實測過程（含三個實測抓到的 bug 與修法）記錄在 [`poc/docs/xmpp-prosody-back4app-spike.md`](../xmpp-prosody-back4app-spike.md)。
- 若未來 Redis 路徑與 XMPP 路徑需要二選一（例如維護成本超出負荷），應重新評估並建立新 ADR 明確裁決，而不是任由兩套實作各自演化。

## Changelog

- 0.2 (2026-08-16): Non-goals 的 client library 交叉引用文字更新——[ADR-0009](ADR-0009-xmpp-client-library-selection.md) 選定的函式庫從 Strophe.js 改為 xmpp.js，交叉引用的目標 ADR 編號不變。本 ADR 選定的 Prosody 本身不受影響，Status 維持 Accepted。
- 0.1 (2026-08-16): Initial version
