# ADR-0002: 拍賣協定的訊息傳輸機制選型——Redis Pub/Sub

**Status:** Accepted
**Date:** 2026-08-11
**Author:** titangene

## Context

Redis Pub/Sub 目前扮演書中 XMPP 的「broker」角色，連接 `tools/fake-auction.ts`（扮演拍賣現場）跟 Nuxt server（Sniper 邏輯所在）。已核實《GOOS》書中選擇 XMPP 的理由，共五項：

1. 去中心化、支援 Federation Architecture——「Anyone may run an XMPP server that hosts users and lets them communicate among themselves and with users hosted by other XMPP servers on the network.」
2. 既有開放標準（IETF）——被提交給 IETF 核准為網路標準。
3. JID 帳號登入即身分識別——「The server can tell who is bidding from the identity of the caller, assuming the accounts have been set up beforehand.」
4. Chat 語意天生契合拍賣 domain——把每個拍賣品當成一個可以「開始聊天」的 user。
5. 真實存在、非同步的第三方基礎設施，適合示範對它做 TDD——這是最核心的理由，作者明確表示這不是務實架構，選 XMPP 純粹是為了有真實基礎設施可以練習整合測試技巧。

已直接查證 [sf105/goos-code](https://github.com/sf105/goos-code) Java 原始碼（`XMPPAuctionHouse.java`、`FakeAuctionServer.java`、`ApplicationRunner.java`），並核實書中原文（「At the start of every test run, our test script starts up the Openfire server, creates accounts for the Sniper and the auction, and then runs the tests.」「The Sniper and fake auction in our end-to-end tests...will communicate through this server.」），確認書中實際實作中 **Sniper 與 Auction House 全部連到同一台 `localhost` XMPP server**，原始碼裡沒有任何多 server/federation 邏輯。第一項「去中心化、支援 Federation」的性質雖然是 XMPP 協定本身具備的，但書中範例從未實際使用，因此不列入本次選型的判斷依據。

依照 [ADR-0001: 建立拍賣協定重構的決策準則與優先順序](ADR-0001-decision-principles.md) 的判準（不增加多餘邏輯是硬性限制；貼近書中精神優先於開發便利性）重新評估拍賣協定的實作方式時，進一步查證發現第 2 項（開放標準）跟第 3 項（內建身分識別）在本次選型中同樣不構成決定性依據：

- 開放標準與否不影響「不增加多餘邏輯」這項硬性限制本身，一個候選是不是被 IETF/OASIS 等標準組織核准，跟它需不需要應用層額外程式碼是兩件獨立的事。
- 第 3 項（帳號登入即身分識別）因為 [ADR-0003: 拍賣協定身分識別改用 Username-Only 白名單取代真實密碼驗證](ADR-0003-username-only-identity.md) 已經決定拍賣協定改用 username-only 白名單、不做真實密碼驗證，不需要協定層天生提供身分識別能力——MQTT 與 Redis Pub/Sub 在這點上其實打平，兩者都沒有內建帳密機制。

排除這兩項後，本次選型實際上只剩第 4、5 項（Chat 語意契合拍賣 domain；真實非同步第三方基礎設施）具有決定性，而 Redis Pub/Sub 現況本身就符合這兩項。

## Considered Options

- Redis Pub/Sub（沿用現有實作）
- 真正的 XMPP（Openfire）
- Matrix（Synapse/Dendrite homeserver）
- MQTT + Aedes（內嵌於 Nuxt server 同一 process）
- MQTT + Aedes（獨立 Node.js process）
- MQTT + Mosquitto（Docker，獨立服務）
- AMQP/RabbitMQ
- NATS
- Apache Kafka
- 託管即時服務（Pusher/Ably/PubNub）
- WebSocket（原生）
- Socket.IO

## Decision Outcome

Chosen option：**Redis Pub/Sub（沿用現況）**。排除掉不構成決定性依據的 Federation、開放標準、內建身分識別之後，Redis Pub/Sub 與 MQTT + Mosquitto 在「貼近書中精神」（[ADR-0001](ADR-0001-decision-principles.md) 準則 2、3）上其實旗鼓相當——兩者都不是 XMPP 點對點 Chat 模型的天生對應，都得靠 topic/channel 廣播模型加上額外的 topic 拆分工程出等效效果（見 [ADR-0006](ADR-0006-channel-topology.md)），沒有一方明顯比較貼近 XMPP 的實際運作機制。而在「不增加多餘邏輯」（準則 1，硬性限制）與「簡單/低成本」（準則 4）這兩項上，Redis Pub/Sub 明顯占優：

- **循序保證免費取得**：Redis publisher/subscriber 各自透過單一 TCP 連線跟 Redis server 通訊，訊息循序天生保證，不需要像 MQTT 那樣額外設定 QoS 才能重現書中「訊息依發送順序抵達」的保證（Ch.12）。
- **零遷移成本**：Redis Pub/Sub 是現況實作，已驗證可行、已部署過，不需要額外的 Dockerfile、CI service container 替換、或改寫 `tools/fake-auction.ts` 訊息序列化邏輯等一次性遷移工作。

拍賣協定的訊息傳輸與訂閱/發佈機制維持使用 Redis Pub/Sub，**不引入 MQTT 作為可切換的協定選項**。

## Consequences

**Positive:**

- broker 是真正的第三方系統（獨立 process，非 app 自己寫的 wrapper），滿足「跟不可控外部系統整合」這個書中核心的 TDD 練習情境（見 [ADR-0001](ADR-0001-decision-principles.md) 準則 3）。
- 循序保證、連線模型都不需要額外程式碼或設定，是所有候選裡在準則 1（不增加多餘邏輯）上表現最好的選項之一。
- 不需要額外部署、遷移既有服務，維運心力最低。

**Negative:**

- 沒有連線層級的身分識別，JOIN/BID 訊息需要額外帶一個 `Bidder` 欄位才能讓接收端判斷是誰送出的（見 [`differences-from-java.md`](../differences-from-java.md) 第 2 節）。
- `server/auctionsniper/redis/*` 需要依 [ADR-0003](ADR-0003-username-only-identity.md)、[ADR-0006](ADR-0006-channel-topology.md)、[ADR-0007: 拍賣協定訊息格式維持書中 XMPP 純文字格式](ADR-0007-message-format.md) 訂出的準則實作 Connection 抽象、訊息格式、channel 拓樸，不是單純的薄包裝。

## Compliance

1. **協定唯一性**：拍賣協定（sniper ↔ auction house）MUST 透過 Redis Pub/Sub 進行，MUST NOT 使用 MQTT、XMPP、Matrix 或本 ADR 已評估並否決的其他協定，除非有新 ADR 明確取代本決定。
2. **Broker 獨立性**：Redis MUST 以獨立於 Nuxt server 的 process/服務運行，MUST NOT 內嵌於應用程式自身的 Node.js process 中。
3. **訊息循序保證**：Redis publisher/subscriber MUST 各自透過單一連線循序收發（不並行多個 in-flight），以重現書中「we expect it to ensure that messages between a bidder and an auction arrive in the same order in which they were sent」（Ch.12）這個依賴的循序送達保證；這個保證由單一 TCP 連線天生提供，MUST NOT 額外撰寫排序緩衝邏輯來補償，也不需要像 MQTT 那樣設定 QoS。
4. **測試分層**：Unit test MUST NOT 依賴真實 Redis，MUST 透過 fake 的 `Auction`/`AuctionHouse` 介面測試；只有 integration/e2e 測試才可以連接真實 Redis，延續書中 Java 版的測試分層方式。
5. **訊息格式**：拍賣協定 payload MUST 使用書中 SOL 純文字格式（`Field: Value;` 分號分隔），MUST NOT 使用 JSON 或其他結構化序列化格式（見 [ADR-0007](ADR-0007-message-format.md)）——這項要求跟 broker 選擇無關。
6. **Commands/Events channel 拆分**：拍賣協定 MUST 分成 `commands`/`events` 兩個獨立 channel，理由見 [ADR-0006](ADR-0006-channel-topology.md)——channel 廣播模型天生會讓其他 sniper 看到彼此的命令，MUST 只透過訂閱關係本身隔離，MUST NOT 新增應用層過濾邏輯。
7. **不保留 MQTT 作為備援**：拍賣協定實作 MUST NOT 保留 MQTT 作為可透過設定切換的備援機制或相容層。

## Pros and Cons of the Options

### Redis Pub/Sub（現況，Chosen）

goos-ts 目前的實作，用 Redis 的 PUBLISH/SUBSCRIBE 機制連接 `tools/fake-auction.ts` 與 Nuxt server。

- Good, because 已驗證可行、已部署過，零遷移風險。
- Good, because 保留了「真實非同步第三方基礎設施」這個核心教學意圖。
- Good, because 訊息循序保證由單一 TCP 連線天生提供，不需要額外設定（不像 MQTT 需要顯式 QoS）。
- Bad, because 不支援 Federation Architecture、不是開放標準（是特定產品的 de facto 規格）——但這兩項已在 Context 中確認不構成本次選型的決定性依據。
- Bad, because 無內建身分識別——但 [ADR-0003](ADR-0003-username-only-identity.md) 已決定不需要協定層身分識別，MQTT 在這點上並無優勢。

### 真正的 XMPP（Openfire）

用 `@xmpp/client`（Node.js 官方 XMPP client）連接自架的 Openfire server，跟書中 Java 版 1:1 對應。

- Good, because 跟書中架構完全對應，訊息格式（純文字 SOL 格式）也天生一致。
- Good, because XMPP 原生支援 SASL ANONYMOUS，理論上可以規避帳號持久化問題。
- Bad, because Openfire 是 JVM 應用，維運成本高（啟動慢、資源需求較重），需要 persistent volume 才能保留帳號設定。
- Bad, because 業界現在很少人在用這個技術了，長期維護風險偏高。

### Matrix（Synapse/Dendrite homeserver）

曾深入評估為「跟書中 XMPP 性質最接近」的候選：支援 Federation Architecture、開放標準（Matrix.org Foundation 治理）、JID 式 user ID（`@localpart:domain`）、room/event 模型，四項都有官方文件依據。

- Good, because 官方文件確認的 Federation Architecture、開放標準、身分識別、room/event 語意，是所有候選裡跟書中 XMPP 性質對應最完整的。
- Bad, because 官方查證後發現「Matrix 是 XMPP 精神繼承者」的說法查無依據（`matrix-org/matrix-spec` 完全沒提到 XMPP），兩者是平行獨立設計，先前的判斷依據有一部分是錯誤推論。
- Bad, because 部署在 Render Free 方案會卡在沒有 persistent disk（Free 方案不支援）、Synapse 建議 RAM（1GB+）超過 Free 方案 512MB 上限。
- Bad, because Dendrite（較輕量的替代實作）官方 README 已明確聲明進入 maintenance mode，只做安全性修補，不算「活躍維護的真實基礎設施」。
- Bad, because Matrix event 是強制結構化 JSON schema（`m.room.message` 等），無法直接發送純文字 SOL 格式訊息，需要額外包裝。
- Bad, because Matrix 的帳號系統是協定核心的強制部分，要做到「username-only 免密碼」（見 [ADR-0003](ADR-0003-username-only-identity.md)）需要客製化，違反不增加多餘邏輯的硬性限制。

### MQTT + Aedes（內嵌於 Nuxt server 同一 process）

Aedes 是純 JavaScript 實作的 MQTT broker，可直接 `require` 進 Node.js process 內執行。

- Good, because 對本機/CI 的 TDD 開發回饋循環最友善，不需要任何外部服務或 Docker。
- Bad, because 內嵌等於把「第三方基礎設施」變成應用程式自己的一個模組，直接抽掉了書中選 XMPP 最根本的理由——需要一個練習者不完全掌控生命週期的外部系統，違反 [ADR-0001](ADR-0001-decision-principles.md) 準則 2（貼近書中精神優先於開發便利性）。

### MQTT + Aedes（獨立 Node.js process）

同樣的 Aedes library，改成用一支獨立的啟動腳本（`node broker.js`）跑成單獨的 OS process。

- Good, because 恢復了「獨立 process、真實 TCP 連線」這個關鍵屬性，改善了內嵌版本的核心問題。
- Good, because 部署成本低，不需要額外的 Docker image，可直接用專案既有的 Node.js runtime 執行。
- Bad, because Aedes 的 MQTT-over-WS 支援需要自己寫橋接程式碼（把 `ws` 收到的訊息轉接成 `aedes.handle()` 預期的 Node.js Duplex stream），這是額外的自訂邏輯，違反 [ADR-0001](ADR-0001-decision-principles.md) 準則 1（不增加原書沒有的多餘邏輯）。
- Bad, because Aedes 終究是練習者自己選、自己寫的 wrapper，不是真正現成的第三方二進位檔，跟 Openfire/Redis 的「真實第三方系統」屬性有落差。
- Bad, because npm 生態規模較小（查證時約 157 個套件依賴 aedes），長期維護風險需要留意。

### MQTT + Mosquitto（Docker，獨立服務）

Eclipse Mosquitto，最主流的開源 MQTT broker 參考實作，C 語言撰寫，官方提供 Docker image。

- Good, because WebSocket 支援純粹是設定檔（`listener` + `protocol websockets`），零程式碼，完全符合「不增加多餘邏輯」的硬性限制，這點在所有候選中表現最好。
- Good, because 是業界最主流、貨真價實的現成二進位檔，最貼近 Openfire/Redis 在書中扮演的「真實第三方系統」角色。
- Good, because 資源需求比 Aedes 更輕（C binary，通常個位數到十幾 MB），維護風險也最低（業界最廣泛使用的 MQTT 實作）。
- Bad, because MQTT 沒有天生的訊息循序保證，需要客戶端明確設定 `{ qos: 1 }` 且限制單一 in-flight 才能重現書中「訊息依發送順序抵達」的保證——Redis Pub/Sub 跟 XMPP 一樣，靠單一 TCP 連線天生就有這個保證，不需要額外設定。
- Bad, because 需要維護一份 Dockerfile（雖然通常只需 `FROM eclipse-mosquitto` + COPY 設定檔，成本很小）。
- Bad, because 本機開發需要額外安裝 Mosquitto 或跑 Docker，不像 Redis 現況那樣已經是既有基礎設施，需要額外的一次性遷移工作。

### AMQP/RabbitMQ

- Good, because 也是開放標準（OASIS），路由能力（topic exchange）比 MQTT 更強。
- Bad, because 對這個題目（單純 auction 訂閱/廣播）而言明顯偏重，沒有內嵌/輕量部署方案，維運成本比 MQTT 高卻沒有對應的額外好處。

### NATS

- Good, because 效能好、部署輕量，是現代雲原生/微服務圈常見的選擇。
- Bad, because 協定本身是特定開源專案定義的規格，不是標準組織核准的規格，這點跟 Redis 現況的短板類似，且沒有 Node.js 生態下類似 Aedes 那種內嵌等級的原生實作。

### Apache Kafka

- Good, because 事件驅動架構的業界主流標準，吞吐量與持久化能力最強。
- Bad, because 對這種輕量即時競標通知的需求明顯過度設計，log/partition 語意跟「訂閱單一拍賣、即時收發訊息」完全不搭，維運複雜度也最高。

### 託管即時服務（Pusher/Ably/PubNub）

- Good, because 業界對「即時廣播給多個瀏覽器 client」這個需求的常見實務選擇，內建 per-client auth token、channel-based pub/sub 天然契合 auction-id。
- Bad, because 依賴一個外部雲端帳號/API key，本地/CI 測試需要打真實外部網路（或自行包一層 mock），跟「TDD 要能快速、可控地重現測試環境」的目標有摩擦。
- Bad, because 完全集中式、不支援 Federation Architecture，且是廠商私有 API，非公開標準協定，有 vendor lock-in 疑慮與長期費用。

### WebSocket（原生）

用瀏覽器/Node.js 原生的 WebSocket API，讓 `tools/fake-auction.ts` 跟 Nuxt server 直接建立連線。

- Good, because 開放標準（RFC 6455），瀏覽器與 Node.js 都原生支援，不需要額外函式庫。
- Bad, because 本質上是點對點連線，沒有 broker、沒有 topic/pub-sub 語意。`tools/fake-auction.ts` 要嘛直接連到 Nuxt server 本身（等於讓兩者緊密耦合，彼此都要知道對方位址，失去現在透過共用 broker 解耦的架構），要嘛自己再刻一層訊息路由與多方訂閱機制——等於自己重新發明一個 pub/sub broker，直接違反 [ADR-0001](ADR-0001-decision-principles.md) 準則 1（不增加原書沒有的多餘邏輯）。
- Bad, because 沒有內建身分識別、沒有現成的第三方 broker 二進位檔可用，跟書中選 XMPP「真實第三方基礎設施」的性質完全不符。

### Socket.IO

在原生 WebSocket 之上包一層框架，提供 room/broadcast、自動重連等機制。

- Good, because 比原生 WebSocket 多了 room/broadcast 語意，比較接近 pub/sub 的使用體驗。
- Bad, because 不是開放標準協定，是特定框架自訂的 wire protocol，跟書中 XMPP「開放標準、任何語言的獨立實作都能互通」的性質不符——要接進來的任何一方（例如未來想用其他語言寫拍賣現場）都得綁定 Socket.IO 這個特定函式庫。
- Bad, because room/broadcast 預設只在單一 server process 內有效；官方文件明確要求多個 server instance 之間要同步事件，需要另外加裝 `@socket.io/redis-adapter`，而這個 adapter 底層本身就是靠 Redis Pub/Sub 實作。
- Bad, because 一樣沒有內建帳號系統，這點跟 Redis/MQTT 打平；但 Redis/MQTT 都有多語言、多廠商的成熟 broker 可選，Socket.IO 的 broker 端實作選擇少很多、且高度綁定 Node.js 生態圈。

## More Information

### Federation Architecture 的定義

本 ADR 多處提到的 Federation Architecture，指多個各自獨立管理的 server 節點，彼此透過共同協定互相溝通，形成一個沒有單一中心、但整體可以互通的網路——類似 email：Gmail 的使用者能寄信給 Outlook 的使用者，兩邊 mail server 完全獨立管理，但透過 SMTP 這個共同協定互通。XMPP 與 Matrix 都採用這種模型：任何人都能自架 server，不同 server 上的使用者仍能互相通訊，不需要透過單一集中式的中介系統。Redis Pub/Sub、MQTT（含 Mosquitto）、AMQP、NATS、Kafka 等候選方案，都是「單一 broker（或你自己管理的叢集）」模型，不具備這種去中心化互通能力。

### 後續重新評估的參考方向

- 若未來 [ADR-0001](ADR-0001-decision-principles.md) 的準則優先順序改變（例如更看重開發便利性勝過貼近書中精神，或需要 Redis Pub/Sub 不具備的 QoS/持久化保證），本決定應重新評估。
- 若拍賣協定需要在 Node.js process 之外的其他語言/平台間互通，Redis Pub/Sub 的生態廣度不如 MQTT，屆時 MQTT + Mosquitto 會是最可能的替代結論。

## Changelog

- 0.2 (2026-08-16): [ADR-0008: 拍賣協定的 XMPP server 選型——Prosody](ADR-0008-xmpp-server-selection.md) 起，poc 分支新增一條與本 ADR 並行的實驗性 XMPP 實作路徑（`server/auctionsniper/xmpp/*`），用來額外驗證更貼近書中原始架構的做法。本 ADR 的 Status 維持 Accepted、Compliance #1（MUST 使用 Redis Pub/Sub、MUST NOT 使用 XMPP）文字不變，Redis 依然是預設/正式協定；ADR-0008 Compliance #3 明確約束新路徑 MUST NOT 取代或移除本 ADR 選定的 Redis 路徑。此附註純粹避免日後只讀本 ADR 的人誤以為 XMPP 已被完全排除。
- 0.1 (2026-08-11): Initial version
