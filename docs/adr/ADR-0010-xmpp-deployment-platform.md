# ADR-0010: XMPP 佈署平台選型——Render

**Status:** Accepted
**Date:** 2026-08-17
**Author:** titangene

## Context

[ADR-0008: 拍賣協定的 XMPP server 選型——Prosody](ADR-0008-xmpp-server-selection.md) 決定用 Prosody 當 XMPP broker。這裡要決定的是 Prosody 要佈署在哪個平台。

這次的 Prosody 部署不需要長期運作的伺服器。依 [ADR-0001: 建立拍賣協定重構的決策準則與優先順序](ADR-0001-decision-principles.md) 準則 4（簡單/低成本，只考慮免費部署方案），這次的用途明確是「練習 CI/CD、偶爾驗證」——只有在改完程式碼、重新部署後，需要確認佈署上去的 Nuxt server 跟 XMPP server 能否透過 `fake-auction.ts --remote` 完整模擬拍賣流程時才會用到，驗證完就不再使用，等到下一次修改再重新跑一次。這代表：

- 免費方案的閒置休眠、cold start 完全可以接受，不需要 always-on。
- 不需要信用卡是硬性偏好（poc 練習用途，不想在探索階段就綁定付款方式）。
- 需要支援 Docker 部署 Prosody（見 [ADR-0008](ADR-0008-xmpp-server-selection.md)）。
- 盡量跟現有 Nuxt server（見 [`deploy.md`](../deploy.md)）部署在同一個平台，減少多開帳號、多維護一套 CD 機制的心力。

## Considered Options

- Render（Web Service，Docker 部署）
- Back4app Containers
- Zeabur
- Koyeb
- Fly.io
- Miget
- Oracle Cloud Always Free（VM）
- GCP Always Free（VM）
- Northflank
- Replit

## Decision Outcome

Chosen option: "Render"，因為它同時滿足「免費、免信用卡、支援 Docker 部署、且已實際驗證 WebSocket 連線與完整 SASL 登入流程成功」，並且跟現有 Nuxt server 部署在同一個平台、同一組帳號，CD 可以直接沿用 [`deploy.md`](../deploy.md) 現有的 Render CLI 部署機制，不需要另外設計一套。完整部署設定與驗證方式記錄在 [`poc/docs/deploy.md`](../deploy.md)。

本決定不涉及：

- **XMPP server 選型**——見 [ADR-0008](ADR-0008-xmpp-server-selection.md)。
- **Client library 選型**——見 [ADR-0009: XMPP client library 選型——xmpp.js](ADR-0009-xmpp-client-library-selection.md)。
- **長期穩定佈署的保證**——Render 免費方案有閒置一段時間後 spin down 的限制，重新喚醒需要一點時間，這對本 ADR 描述的「用完即丟」使用模式是可接受的限制，不是本 ADR 要解決的問題。

## Consequences

**Positive:**

- 零額外費用、零信用卡綁定，符合 poc 練習階段的偏好。
- 跟 Nuxt server 部署在同一個平台、同一組帳號，不用多開一個帳號、多維護一份 Dashboard。
- CD 直接沿用 [`deploy.md`](../deploy.md) 現有的 Render CLI（`render deploys create --commit --wait --confirm`）機制，`cd.yml` 只需要多一個部署目標，不需要為了這個平台另外設計 CI-gating 的變通做法。
- 分配的網域是持久的 `<service-name>.onrender.com`，不會過期或改變，`PROSODY_VIRTUAL_HOSTS` 設定一次就穩定，不需要每次驗證前重新確認網域字串。
- 已有完整的部署設定與驗證紀錄（[`deploy.md`](../deploy.md)），未來重新部署時可以直接照著做，不用重新摸索。

**Negative:**

- Free 方案有閒置一段時間後 spin down 的限制，重新喚醒需要一點時間。

## Compliance

1. **佈署平台唯一性**：Prosody（見 [ADR-0008](ADR-0008-xmpp-server-selection.md)）MUST 使用 Render 免費方案，MUST NOT 使用本 ADR 已評估並否決的其他平台，除非有新 ADR 明確取代本決定。
2. **部署方式**：MUST 透過「GitHub repo + repo 內含 Dockerfile」的方式部署（`poc/docker/xmpp/`），比照 Nuxt server 既有的部署方式（見 [`deploy.md`](../deploy.md)），維持一致的 CD 流程。
3. **對外連線協定**：對外連線 MUST 使用 WebSocket transport（呼應 [ADR-0009](ADR-0009-xmpp-client-library-selection.md) Compliance #1 選定的 xmpp.js），MUST NOT 嘗試使用原生 XMPP TCP（5222）——Render Web Service 只轉發單一對外 HTTP port，不支援 TCP passthrough，這點已在 [`deploy.md`](../deploy.md) 實測確認。
4. **Prosody 網路介面設定**：部署到 Render 的 Prosody 設定檔 MUST 明確設定 `http_interfaces = { "0.0.0.0", "::" }`，MUST NOT 依賴官方預設的 localhost-only 設定（`{ "127.0.0.1", "::1" }`）——原因見 [`deploy.md`](../deploy.md)「Prosody 設定要點」。
5. **虛擬主機網域**：`PROSODY_VIRTUAL_HOSTS` 環境變數 MUST 設成 Render 實際配發的網域（從 Dashboard 的 Settings 頁面確認，而非手動輸入或推測），MUST NOT 使用推測的網域字串。
6. **未加密連線放寬**：部署到 Render 的 Prosody 設定檔 MUST 同時設定 `c2s_require_encryption = false` 與 `allow_unencrypted_plain_auth = true`，MUST NOT 只設定其中一個或依賴官方預設值（兩者依序預設為 `true`/`false`）——這是兩道獨立的擋修：`c2s_require_encryption` 沒放寬會讓 Prosody 直接拒絕未加密連線本身（連 stream feature 都不給），`allow_unencrypted_plain_auth` 沒放寬則會讓 SASL 協商階段找不到可用機制；Render 在邊界做 TLS termination，Prosody 實際收到的仍是未加密連線，兩者都要放寬才能完成登入，原因見 [`deploy.md`](../deploy.md)「Prosody 設定要點」。

## Pros and Cons of the Options

### Render（Chosen）

本專案 Nuxt server（見 [`deploy.md`](../deploy.md)）現有的佈署平台，這次也用來部署 Prosody。

- Good, because 跟現有 Nuxt server 部署在同一個平台，維運心力最低，不用多開一個帳號。
- Good, because 已查證免信用卡即可部署 Docker 化的 Web Service，且已實際部署驗證成功（WebSocket handshake、完整 SASL 登入 + JOIN/CLOSE 流程皆通過，見 [`deploy.md`](../deploy.md)）。
- Good, because 支援 monorepo 指定子目錄當 Docker build context（`Root Directory`/`Docker Build Context Directory` 設定），不需要拆成獨立 repo。
- Good, because 分配的網域是持久網域，不會過期或改變。
- Good, because CD 可以直接沿用 Nuxt server 既有的 Render CLI 部署機制（`render deploys create --commit --wait --confirm`），不需要額外設計 CI-gating 的變通做法。
- Bad, because 只轉發單一對外 HTTP port，不支援原生 XMPP TCP，只能用 WebSocket transport——但這跟 [ADR-0009](ADR-0009-xmpp-client-library-selection.md) 選定的 xmpp.js WebSocket transport 完全相容，不構成額外犧牲。
- Bad, because 免費方案有閒置一段時間後 spin down 的限制，重新喚醒需要一點時間。

### Back4app Containers

免費、免信用卡的 Docker 容器佈署平台，實測部署驗證成功過（WebSocket handshake、`http_interfaces`/加密放寬等 Prosody 設定皆已驗證可行），但最終沒有採用，理由如下：

- Good, because 已直接查證免信用卡（`No credit card required`）、免費方案是真正的 $0/月，且已實際部署驗證 WebSocket 連線成功。
- Good, because 支援 monorepo 指定子目錄當 build context（`Root Directory` 設定），不需要拆成獨立 repo。
- Bad, because 免費方案的網域是 Temporary URL，官方標示 60 分鐘後失效——這對「用完即丟」的驗證模式本身還好，但一旦有其他服務（例如 Nuxt server）需要引用這個網域當 `XMPP_SERVICE_URL`/`XMPP_DOMAIN`，網域失效就會連帶讓依賴它的部署設定跟著過期，每次要驗證前都得重新確認、重新部署，維護成本比表面上高。
- Bad, because 查證當下沒有找到官方文件、CLI 或 API 支援「指定 commit 觸發部署並等待結果」這種機制，只確認到「監聽 GitHub push 事件、自動部署」一種路徑，跟本專案既有的「CI 通過才部署」CD 設計（`cd.yml` 搭配 Render CLI `deploys create --commit --wait --confirm`，見 [`deploy.md`](../deploy.md)）不相容，要沿用同等的 CI-gating 保護需要額外設計 workaround（例如另開一條 deploy 分支），複雜度明顯高於直接跟 Nuxt server 共用 Render 既有機制。
- Bad, because 跟 Nuxt server 所在的 Render 是不同平台，需要多維護一組帳號/Dashboard，不像 Render 那樣可以直接沿用既有 workspace。

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

完整部署設定步驟、實測過程與驗證方式記錄在 [`poc/docs/deploy.md`](../deploy.md)。

## Changelog

- 0.2 (2026-08-17): 補上 Back4app Containers 的 Pros and Cons——這是本 ADR 重寫前實際部署驗證過、一度採用的平台，這次補充記錄後來改選 Render 的具體理由（Temporary URL 時效性、CD 機制與現有 Render CI-gating 流程不相容、需要多維護一組帳號），讓「為什麼不是 Back4app」有明確依據可查，不是只有 Render 單方面的優點陳述。
- 0.1 (2026-08-17): Initial version
