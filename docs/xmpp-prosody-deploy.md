# 部署 Prosody（Render）

本專案的 XMPP 實驗版本（[ADR-0008](adr/ADR-0008-xmpp-server-selection.md)/[ADR-0011](adr/ADR-0011-xmpp-client-library-selection-xmpp-js.md)）需要一個真實的 Prosody（XMPP server）當拍賣協定的 broker，部署在 [Render](https://render.com/)，跟 Nuxt server/Redis（見 [`deploy.md`](deploy.md)）同一個平台。決策過程見 [ADR-0010](adr/ADR-0010-xmpp-deployment-platform.md)。

- **Web Service（`goos-ts-xmpp-prosody`）**：跑 Prosody（Docker 部署，image 設定見 `poc/docker/xmpp/`），對外只提供 XMPP over WebSocket（呼應 [ADR-0011](adr/ADR-0011-xmpp-client-library-selection-xmpp-js.md) Compliance #1 選定的 xmpp.js）。

CD 流程見 `.github/workflows/cd.yml`，跟 Nuxt server 共用同一個 workflow、不同 job。

## 建立 XMPP Web Service

Render Dashboard → **New** → **Web Service**：

- **Source Code**：選 GitHub repo `titangene/goos-ts`（沿用 Nuxt server 已授權的 GitHub 連線）。
- **Name**：例如 `goos-ts-xmpp-prosody`
- **Language**：Docker
- **Branch**：部署用的分支
- **Region**：Singapore（跟 Nuxt server/Redis 同 region）
- **Root Directory**：留空
- **Dockerfile Path**：`docker/xmpp/Dockerfile`
- **Docker Build Context Directory**：`docker/xmpp`

  > `poc` 只是本機 git worktree 的目錄名稱（本專案是 bare repo + worktree 結構），**不是** repo 內的實際路徑前綴——`poc` 分支的 repo 根目錄本身就直接是 `docker/`、`server/` 等目錄。Dockerfile Path/Build Context Directory 不能加 `poc/` 前綴，否則 Render clone 下來後會找不到對應目錄。

- **Health Check Path**：`/`
- **Instance Type**：選 **Free**
- **Environment Variables**：
  - `PROSODY_ENABLE_MODULES` = `websocket`——啟用 `mod_websocket`（官方預設設定檔裡這個模組是註解掉的）。
  - `PORT` = `5280`——告訴 Render 要把對外流量轉發到 container 內部哪個 port（[Render 官方文件](https://render.com/docs/web-services)：`We recommend binding your HTTP server to the port defined by the PORT environment variable`，預設 `10000`），對應 Prosody 明文 HTTP port 的預設值。
  - `PROSODY_VIRTUAL_HOSTS` = 這個服務建立後 Render 分配的網域（從 Dashboard 的 **Settings** 頁面確認，而非手動輸入或推測——建立服務前不會知道最終網域，需要先建立、拿到網域後再回填這個環境變數並重新部署）。

按 **Deploy Web Service**，Render 會自動 pull 該分支的 commit 並在雲端建置、啟動。啟動時會自動註冊 [ADR-0003](adr/ADR-0003-username-only-identity.md) 白名單的三個帳號（`sniper`/`sniper`、`auction-item-54321`/`auction`、`auction-item-65432`/`auction`）。

### 關閉 Auto-Deploy，交給 cd.yml 全權負責

跟 Nuxt server 一樣（見 [`deploy.md`](deploy.md#關閉-auto-deploy交給-cdyml-全權負責)），把 Render 內建的 **Auto-Deploy** 關掉（Settings → Build → Auto-Deploy → **Off**），部署時機交給 `.github/workflows/cd.yml`，避免跟 CD 搶著部署。

### CD 流程

`.github/workflows/cd.yml` 用 [Render CLI](https://render.com/docs/cli) 部署，跟 Nuxt server 共用同一個 `deploy` job（以 `strategy.matrix` 區分要部署的服務），觸發時機、`--wait --confirm` 的阻塞語意都跟 Nuxt server 完全一致（見 [`deploy.md`](deploy.md#cd-流程)）。需要額外的 GitHub Actions secret：`RENDER_XMPP_SERVICE_ID`（`goos-ts-xmpp-prosody` 這個 Web Service 的 ID，例如 `srv-xxxxx`；`RENDER_API_KEY` 跟 Nuxt server 共用同一把）。

## 對外連線驗證

部署完成後，可以用以下方式確認服務正常：

**確認服務存活：**

```bash
curl -s -o /dev/null -w "%{http_code}" https://<服務網域>/
# 200
```

**確認 WebSocket handshake：**

```bash
curl -sv -N --http1.1 \
  -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  -H "Sec-WebSocket-Protocol: xmpp" \
  https://<服務網域>/xmpp-websocket
# < HTTP/1.1 101 Switching Protocols
# < Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
```

`Sec-WebSocket-Accept` 要正確對應送出的 `Sec-WebSocket-Key`，才能確認是 Prosody 的 `mod_websocket` 真的處理了 handshake，不是平台邊界隨便回應的頁面。

**確認完整 SASL 登入 + JOIN/CLOSE 流程：**

用本專案既有的整合測試對已部署服務跑一次（`test/e2e-xmpp/FakeAuctionServer.ts` 支援 `XMPP_SERVICE_URL`/`XMPP_DOMAIN` 環境變數覆寫連線目標）：

```bash
XMPP_SERVICE_URL=wss://<服務網域>/xmpp-websocket \
XMPP_DOMAIN=<服務網域> \
  npx vitest run --project integration-xmpp
```

這個測試涵蓋 `sniper`/`auction-item-54321` 兩個帳號的真實 SASL 登入、JOIN、CLOSE 事件收發，是比 WebSocket handshake 更完整的驗證。

## Prosody 設定要點

`poc/docker/xmpp/prosody.cfg.lua` 相對官方預設設定檔（[`prosody-13.0.cfg.lua`](https://github.com/prosody/prosody-docker/blob/master/configs/prosody-13.0.cfg.lua)）額外做了兩件事，兩者都是因為 Render（以及大多數 PaaS）在邊界做 TLS termination、用明文 HTTP 轉發到 container，所以 Prosody 實際收到的連線從自己的視角看永遠是「未加密連線」：

1. **`http_interfaces = { "0.0.0.0", "::" }`**：Prosody 從某個版本起，明文 HTTP（預設 5280）改成預設只監聽 localhost（`{ "127.0.0.1", "::1" }`），只有 HTTPS（5281）預設對外。這一行必須放在任何 `VirtualHost` 之前（Prosody 設定檔用「`VirtualHost` 之前的內容才是 global」這個規則），不能透過官方預設的 conf.d include（放在檔案最後面）加，那樣只會套用到最後一個 `VirtualHost`。
2. **`c2s_require_encryption = false` 與 `allow_unencrypted_plain_auth = true`**：Prosody 從 0.12 版起走「預設安全」路線，兩個設定都要放寬才能在未加密連線上完成登入，缺一個都不行——`c2s_require_encryption`（預設 `true`）沒放寬會讓 Prosody 直接拒絕未加密連線本身，連 stream feature 都不給；`allow_unencrypted_plain_auth`（預設 `false`）沒放寬則會讓 SASL 協商階段找不到可用機制。這是刻意放寬安全限制的決定，理由跟 [ADR-0003](adr/ADR-0003-username-only-identity.md) 一致：這是練習 TDD 用的 poc 專案，不是要打造安全的正式系統。

容器啟動時的 entrypoint（`poc/docker/xmpp/register-and-start.sh`）會自動用 `prosodyctl register` 註冊 [ADR-0003](adr/ADR-0003-username-only-identity.md) 白名單的三個帳號，取代官方 image 只能透過 `LOCAL`/`PASSWORD`/`DOMAIN` 三個環境變數註冊「單一」帳號的限制。

## 已知限制

- **Free plan 閒置休眠**：Render 免費方案閒置一段時間後會 spin down，重新喚醒需要一點時間，[ADR-0010](adr/ADR-0010-xmpp-deployment-platform.md) Context 描述的用途（練習 CI/CD、偶爾驗證）可以接受。
