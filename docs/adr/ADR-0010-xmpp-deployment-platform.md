# ADR-0010: XMPP 佈署平台選型——Back4app Containers

**Status:** Accepted
**Date:** 2026-08-16
**Author:** titangene

## Context

[ADR-0008: 拍賣協定的 XMPP server 選型——Prosody](ADR-0008-xmpp-server-selection.md) 決定用 Prosody 當 XMPP broker。這裡要決定的是 Prosody 要佈署在哪個平台。

跟 [ADR-0004: Redis 部署為獨立的 Render Key Value 服務](ADR-0004-redis-deployment.md) 面對的情境不同：這次不需要長期運作的伺服器。依 [ADR-0001: 建立拍賣協定重構的決策準則與優先順序](ADR-0001-decision-principles.md) 準則 4（簡單/低成本，只考慮免費部署方案），這次的用途明確是「練習 CI/CD、偶爾驗證」——只有在改完程式碼、重新部署後，需要確認佈署上去的 Nuxt server 跟 XMPP server 能否透過 `fake-auction.ts --remote` 完整模擬拍賣流程時才會用到，驗證完就不再使用，等到下一次修改再重新跑一次。這代表：

- 免費方案的閒置休眠、cold start 完全可以接受，不需要 always-on。
- 不需要信用卡是硬性偏好（poc 練習用途，不想在探索階段就綁定付款方式）。
- 需要支援 Docker 部署 Prosody（見 [ADR-0008](ADR-0008-xmpp-server-selection.md)）。

## Considered Options

- Render（Web Service，Docker 部署）
- Zeabur
- Koyeb
- Fly.io
- Miget
- Oracle Cloud Always Free（VM）
- GCP Always Free（VM）
- Northflank
- Replit
- Back4app Containers

## Decision Outcome

Chosen option: "Back4app Containers"，因為它是這次查證中唯一同時滿足「免費、免信用卡、支援 Docker 部署、且已實際驗證 WebSocket 連線成功」的平台。完整部署驗證過程記錄在 [`poc/docs/xmpp-prosody-back4app-spike.md`](../xmpp-prosody-back4app-spike.md)。

本決定不涉及：

- **XMPP server 選型**——見 [ADR-0008](ADR-0008-xmpp-server-selection.md)。
- **Client library 選型**——見 [ADR-0009: XMPP client library 選型——Strophe.js](ADR-0009-xmpp-client-library-selection.md)。
- **長期穩定佈署的保證**——Back4app 免費方案給的是 Temporary URL（官方標示 60 分鐘後失效），這對本 ADR 描述的「用完即丟」使用模式是可接受的限制，不是本 ADR 要解決的問題。

## Consequences

**Positive:**

- 零額外費用、零信用卡綁定，符合 poc 練習階段的偏好。
- 已有完整的實測部署紀錄（[`xmpp-prosody-back4app-spike.md`](../xmpp-prosody-back4app-spike.md)），包含三個實測抓到的平台特性/bug 與修法，未來重新部署時可以直接照著做，不用重新摸索。

**Negative:**

- Temporary URL 60 分鐘後失效，每次要用 `fake-auction.ts --remote` 驗證前，都要重新確認目前的網域字串（可能因為 60 分鐘過期或容器被重新排程而改變）。
- Back4app Containers 只支援「連接 GitHub repo + repo 內要有 Dockerfile」，不支援直接指定 Docker Hub image，跟 Prosody 官方 Docker image 的其他佈署方式（例如 Zeabur/Koyeb 那種直接拉 image 的模式）相比，多了一道「把 Dockerfile 放進 repo 裡維護」的成本，但這個成本已經在 `poc/spikes/prosody-back4app/` 承擔過一次。
- 跟 [ADR-0004](ADR-0004-redis-deployment.md) 選的 Render 是不同平台，多維護一組帳號/Dashboard，不像 Redis 那樣直接沿用既有的 Render workspace。

## Compliance

1. **佈署平台唯一性**：Prosody（見 [ADR-0008](ADR-0008-xmpp-server-selection.md)）的實驗性佈署 MUST 使用 Back4app Containers 免費方案，MUST NOT 使用本 ADR 已評估並否決的其他平台，除非有新 ADR 明確取代本決定。
2. **部署方式**：MUST 透過「GitHub repo + repo 內含 Dockerfile」的方式部署，MUST NOT 依賴 Back4app 不支援的「直接指定 Docker Hub image」流程。
3. **對外連線協定**：對外連線 MUST 使用 WebSocket transport（呼應 [ADR-0009](ADR-0009-xmpp-client-library-selection.md) Compliance #1 選定的 Strophe.js），MUST NOT 嘗試使用原生 XMPP TCP（5222）——Back4app 邊界只對外開放標準 443 port，Dashboard 設定的「Port」欄位是內部轉發用的 port、不是直接對外開放的 port，這點已在 [`xmpp-prosody-back4app-spike.md`](../xmpp-prosody-back4app-spike.md) bug 1 實測確認。
4. **Prosody 網路介面設定**：部署到 Back4app 的 Prosody 設定檔 MUST 明確設定 `http_interfaces = { "0.0.0.0", "::" }`，MUST NOT 依賴官方預設的 localhost-only 設定（`{ "127.0.0.1", "::1" }`）——原因見 [`xmpp-prosody-back4app-spike.md`](../xmpp-prosody-back4app-spike.md) bug 2。
5. **虛擬主機網域**：`PROSODY_VIRTUAL_HOSTS` 環境變數 MUST 設成 Back4app 實際配發的網域（從 Dashboard 的 Domain 設定頁確認，而非手動輸入或從畫面截圖辨識），MUST NOT 使用推測或過期的網域字串——原因見 [`xmpp-prosody-back4app-spike.md`](../xmpp-prosody-back4app-spike.md) bug 3。
6. **未加密連線放寬**：部署到 Back4app 的 Prosody 設定檔 MUST 同時設定 `c2s_require_encryption = false` 與 `allow_unencrypted_plain_auth = true`，MUST NOT 只設定其中一個或依賴官方預設值（兩者依序預設為 `true`／`false`）——這是兩道獨立的擋修：`c2s_require_encryption` 沒放寬會讓 Prosody 直接拒絕未加密連線本身（連 stream feature 都不給），`allow_unencrypted_plain_auth` 沒放寬則會讓 SASL 協商階段找不到可用機制；Back4app 在邊界做 TLS termination，Prosody 實際收到的仍是未加密連線，兩者都要放寬才能完成登入，原因見 [`xmpp-prosody-back4app-spike.md`](../xmpp-prosody-back4app-spike.md) bug 4。

## Pros and Cons of the Options

### Back4app Containers（Chosen）

免費、免信用卡的 Docker 容器佈署平台。

- Good, because 已直接查證免信用卡（`No credit card required`）、免費方案是真正的 $0/月，且已實際部署驗證成功。
- Good, because 支援 monorepo 指定子目錄當 build context（`Root Directory` 設定），不需要拆成獨立 repo。
- Bad, because 只支援 GitHub repo + Dockerfile 部署，不支援直接指定 Docker Hub image。
- Bad, because 免費方案的網域是 Temporary URL，60 分鐘後失效。

### Render

本專案 Nuxt server + Redis（[ADR-0004](ADR-0004-redis-deployment.md)）現有的佈署平台。

- Good, because 跟現有 Nuxt server/Redis 部署在同一個平台，維運心力最低，不用多開一個帳號。
- Neutral, because 查證過程中一度依據 [Render 官方 feedback board 的一則使用者投訴](https://feedback.render.com/features/p/credit-card-required-for-free-plan)判斷「部署 Web Service 選免費方案仍需要信用卡」，因而排除；但這是**未經本專案親自驗證的第二手資料**——查證後發現與此矛盾的第一手事實：本專案作者先前已經用 Render 的 Key Value 服務部署 Redis、也用 Docker 部署過 Mosquitto，兩者都沒有綁定信用卡就成功免費部署。這代表「Render 免費方案需要信用卡」這個排除理由的證據力不足，Render 部署 Docker 化 Prosody 是否需要信用卡**目前沒有針對這個具體情境驗證過**，不能直接沿用那則社群投訴的結論。
- Bad, because 即使不需要信用卡，Render Free web service 只轉發單一公開 HTTP port（先前已查證的事實），跟 Back4app 一樣需要處理「明文 HTTP 對外綁定位址」這類問題，沒有查證過的優勢。

### Zeabur

- Bad, because 實測發現「Shared clusters are deprecated. Please rent a Server and use server-XXXXXXXX as the region code.」——免費 shared cluster 部署功能已被平台下架，現在必須先付費租用 Server 才能部署任何東西，這點在 `zeabur project create` 的 API 回應中直接確認，不是文件推測。

### Koyeb

- Bad, because 官方定價頁面查證當下沒有列出永久免費方案，只有付費方案跟資料庫的 5 小時免費試用；跟舊版文件描述的「有 free web service」矛盾，且矛盾點沒有查到官方說明，risk 太高不採用。

### Fly.io

- Bad, because 官方免費額度已停止提供給新帳號，只有舊帳號（Legacy Hobby plan）還保留。

### Miget

- Bad, because 官方文件明確寫死所有應用都被固定路由到 port 5000、走 Kubernetes Ingress controller，這是 L7/HTTP 層路由，非 HTTP 協定的 raw TCP passthrough 支援未經證實；雖然免費、免信用卡、甚至支援 `docker-compose.yml`，但 WebSocket（走 HTTP upgrade）是否能通過這個 Ingress 沒有實測驗證過。

### Oracle Cloud Always Free（VM）

- Bad, because 需要信用卡做身分驗證（雖然不會實際收費），不符合免信用卡的偏好。
- Bad, because ARM Ampere 容量在熱門區域常搶不到，第一次建立 VM 有申請失敗、需要重試的風險。

### GCP Always Free（VM）

- Bad, because 同樣需要信用卡做身分驗證。
- Neutral, because 相對 Oracle Cloud，沒有查到類似的容量搶不到的抱怨，若之後偏好改變（例如需要 docker-compose 原生支援），會是比 Oracle Cloud 摩擦更少的自架 VM 選項。

### Northflank

- Bad, because 官方文件明講「TCP and UDP ports cannot be made publicly directly」，需要額外的 Layer 4 Load Balancer 才能對外開 TCP/WS，這個功能是否包含在免費 Sandbox 方案內查證時無法確認（文件回傳 404）。

### Replit

- Bad, because 適合跑常駐服務的 Reserved VM Deployment 最低 $20/月，不在免費方案範圍內；Starter（免費）方案的部署能力查證後確認不涵蓋這個用途。

## More Information

- 完整部署過程與四個實測 bug 的細節記錄在 [`poc/docs/xmpp-prosody-back4app-spike.md`](../xmpp-prosody-back4app-spike.md)。
- Render 是否適合部署 Docker 化的 Prosody，是一個**未解決、值得之後補測的候選**——如果之後 Back4app 的 Temporary URL 60 分鐘限制造成實際困擾，Render（跟現有 Nuxt/Redis 部署平台一致）會是優先補測的對象，補測時應直接嘗試部署、以實測結果為準，不要重新採信那則未經驗證的社群投訴。

## Changelog

- 0.3 (2026-08-16): 修正 Compliance #6——原本只加 `allow_unencrypted_plain_auth`，實測發現這個設定不夠，`c2s_require_encryption`（Prosody 0.12 起預設 `true`）會在更早的階段就拒絕未加密連線，兩個設定都要放寬才能真正完成登入，見 bug 4 更新後的內容。
- 0.2 (2026-08-16): 補上 Compliance #6（`allow_unencrypted_plain_auth`）——原本只驗證到 WebSocket handshake 成功就判定部署可行，之後接上 `server/auctionsniper/xmpp` 整合測試才發現 SASL 認證階段會失敗（bug 4），這個決定本身（選 Back4app）沒有變，但 Prosody 設定需要多這一條規則。
- 0.1 (2026-08-16): Initial version
