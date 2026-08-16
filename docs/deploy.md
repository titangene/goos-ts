# 部署（Render）

本專案部署在 [Render](https://render.com/)，有兩個 Web Service：

- **Nuxt server（`goos-ts`）**：跑 Nuxt server（`npm run build` 建置、`node .output/server/index.mjs` 啟動）。
- **XMPP server（`goos-ts-xmpp-prosody`）**：跑 Prosody（Docker 部署，image 設定見 `docker/xmpp/`），拍賣協定的 broker（見 [ADR-0002](adr/ADR-0002-xmpp-server-selection.md)/[ADR-0003](adr/ADR-0003-xmpp-client-library-selection.md)），對外只提供 XMPP over WebSocket（呼應 [ADR-0003](adr/ADR-0003-xmpp-client-library-selection.md) Compliance #1 選定的 xmpp.js）。

兩者都在 Singapore region，CD 流程共用同一個 `.github/workflows/cd.yml`（以 `strategy.matrix` 區分要部署的服務）。決策過程見 [ADR-0004](adr/ADR-0004-xmpp-deployment-platform.md)。

## 建立 Nuxt Web Service

Render Dashboard → **New** → **Web Service**：

- **Source Code**：選 GitHub repo（需先在 Credentials 授權 GitHub）。Render 會自動偵測到 Nuxt.js 並帶入部分預設值。
- **Name**：例如 `goos-ts`
- **Language**：Node
- **Branch**：部署用的分支
- **Region**：Singapore
- **Build Command**：自動帶的 `npm run generate` 是給純靜態站用的（`nuxt generate`），本專案有 server API 跟 WebSocket，**要手動改成**：
  ```
  npm ci && npm run build
  ```
- **Start Command**：自動帶的 `yarn start` 也要改，本專案沒有 `start` script、也不是用 yarn，**要手動改成**：
  ```
  node .output/server/index.mjs
  ```
- **Instance Type**：選 **Free**
- **Environment Variables**：新增兩筆
  - `XMPP_SERVICE_URL` = 已部署的 Prosody 服務網域（見下方「建立 XMPP Web Service」），格式 `wss://<Prosody 服務網域>/xmpp-websocket`
  - `XMPP_DOMAIN` = 同一個 Prosody 服務網域（不含協定/路徑）

  > 這兩個環境變數要 `server/utils/sniper-registry.ts` 有讀到（沒設定時預設回退 `ws://localhost:5280/xmpp-websocket`/`localhost`）才會生效。

按 **Deploy Web Service**，Render 會自動 pull 該分支的 commit 並在雲端建置、啟動。

### 關閉 Auto-Deploy，交給 cd.yml 全權負責

Render Web Service 預設 **Auto-Deploy** 是 `On Commit`——每次 push 到該分支都會自動觸發部署。但部署現在要交給 `.github/workflows/cd.yml`（等 `ci.yml` 跑完且成功才部署，見下方「CD 流程」），所以要把 Render 內建的 Auto-Deploy 關掉，避免兩邊搶著部署：

進到該 Web Service 頁面 → **Settings** → **Deploy** 區塊 → **Auto-Deploy** 旁的 **Edit** → 選 **Off** → **Save changes**。Prosody 服務也要同樣關掉。

### CD 流程

`.github/workflows/cd.yml` 用 [Render CLI](https://render.com/docs/cli) 觸發兩個服務的部署：

- 觸發時機：`ci.yml`（`CI` 這個 workflow）跑完且結論是 `success` 時（`workflow_run` 事件），而不是每次 push 就跑，避免 CI 沒過還部署
- 用 `render deploys create <serviceID> --commit <sha> --wait --confirm` 部署該次觸發 CI 的 commit，`--wait` 是 CLI 原生支援的阻塞等待，部署失敗會讓這個 job 失敗（非 0 exit code）
- 需要的 GitHub Actions secrets：`RENDER_API_KEY`（Render Account Settings → API Keys 產生，兩個服務共用同一把）、`RENDER_SERVICE_ID`（`goos-ts` 的 ID）、`RENDER_XMPP_SERVICE_ID`（`goos-ts-xmpp-prosody` 的 ID），格式都是 `srv-xxxxx`

> **`workflow_run` 生效的前提：GitHub repo 的預設分支要跟 CI/CD workflow 檔案所在的分支一致。**`workflow_run` 事件只會抓「repo 預設分支上的 workflow 檔案」，不是「觸發它的那個 workflow 執行所在的分支」。本專案的 `ci.yml`/`cd.yml` 只存在 `poc` 分支（`main` 分支目前只有初始 commit，沒有任何 CI/CD 設定），所以 **GitHub repo 的 Default branch 設定必須是 `poc`**，`cd.yml` 才抓得到、`workflow_run` 才會觸發。如果之後把 Default branch 改回 `main`（或建立正式的 `main` 開發流程），要記得把 `ci.yml`/`cd.yml` 也同步搬過去，否則 CD 會在完全沒有錯誤訊息的情況下悄悄失效——這正是本專案曾經踩過的坑：`ci.yml` 照常跑綠燈，但 `cd.yml` 完全不會被觸發，且沒有任何地方會報錯或提示原因。

## 建立 XMPP Web Service

Render Dashboard → **New** → **Web Service**：

- **Source Code**：選 GitHub repo `titangene/goos-ts`（沿用 Nuxt server 已授權的 GitHub 連線）。
- **Name**：例如 `goos-ts-xmpp-prosody`
- **Language**：Docker
- **Branch**：部署用的分支
- **Region**：Singapore（跟 Nuxt server 同 region）
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

按 **Deploy Web Service**，Render 會自動 pull 該分支的 commit 並在雲端建置、啟動。啟動時會自動註冊 [ADR-0002](adr/ADR-0002-xmpp-server-selection.md) 白名單的三個帳號（`sniper`/`sniper`、`auction-item-54321`/`auction`、`auction-item-65432`/`auction`）。

拿到 Prosody 的網域後，回頭把它填進 Nuxt Web Service 的 `XMPP_SERVICE_URL`/`XMPP_DOMAIN`（見上方「建立 Nuxt Web Service」）並重新部署。

## 對外連線驗證（Prosody）

部署完成後，可以用以下方式確認 Prosody 服務正常：

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

用本專案既有的整合測試對已部署服務跑一次：

```bash
XMPP_SERVICE_URL=wss://<服務網域>/xmpp-websocket \
XMPP_DOMAIN=<服務網域> \
  npx vitest run --project integration
```

這個測試涵蓋 `sniper`/`auction-item-54321` 兩個帳號的真實 SASL 登入、JOIN、CLOSE 事件收發，是比 WebSocket handshake 更完整的驗證。

## Prosody 設定要點

`docker/xmpp/prosody.cfg.lua` 相對官方預設設定檔（[`prosody-13.0.cfg.lua`](https://github.com/prosody/prosody-docker/blob/master/configs/prosody-13.0.cfg.lua)）額外做了兩件事，兩者都是因為 Render（以及大多數 PaaS）在邊界做 TLS termination、用明文 HTTP 轉發到 container，所以 Prosody 實際收到的連線從自己的視角看永遠是「未加密連線」：

1. **`http_interfaces = { "0.0.0.0", "::" }`**：Prosody 從某個版本起，明文 HTTP（預設 5280）改成預設只監聽 localhost（`{ "127.0.0.1", "::1" }`），只有 HTTPS（5281）預設對外。這一行必須放在任何 `VirtualHost` 之前（Prosody 設定檔用「`VirtualHost` 之前的內容才是 global」這個規則），不能透過官方預設的 conf.d include（放在檔案最後面）加，那樣只會套用到最後一個 `VirtualHost`。
2. **`c2s_require_encryption = false` 與 `allow_unencrypted_plain_auth = true`**：Prosody 從 0.12 版起走「預設安全」路線，兩個設定都要放寬才能在未加密連線上完成登入，缺一個都不行——`c2s_require_encryption`（預設 `true`）沒放寬會讓 Prosody 直接拒絕未加密連線本身，連 stream feature 都不給；`allow_unencrypted_plain_auth`（預設 `false`）沒放寬則會讓 SASL 協商階段找不到可用機制。這是刻意放寬安全限制的決定，理由跟 [ADR-0002](adr/ADR-0002-xmpp-server-selection.md) 一致：這是練習 TDD 用的 poc 專案，不是要打造安全的正式系統。

容器啟動時的 entrypoint（`docker/xmpp/register-and-start.sh`）會自動用 `prosodyctl register` 註冊 [ADR-0002](adr/ADR-0002-xmpp-server-selection.md) 白名單的三個帳號，取代官方 image 只能透過 `LOCAL`/`PASSWORD`/`DOMAIN` 三個環境變數註冊「單一」帳號的限制。

## 針對已部署環境模擬（`--remote`）

如果要驗證部署到雲端的環境能不能跑完整拍賣流程，`tools/fake-auction.ts` 支援 `--remote` 參數，改連 `XMPP_SERVICE_URL`/`XMPP_DOMAIN` 環境變數指定的 Prosody，而不是本機 Prosody：

**1. 複製 `.env.example` 成 `.env.local`，填入部署環境的連線字串**（就是上面「建立 Nuxt Web Service」設定的同一組值）：

```bash
cp .env.example .env.local
```

```
XMPP_SERVICE_URL=wss://<Prosody 服務網域>/xmpp-websocket
XMPP_DOMAIN=<Prosody 服務網域>
```

`.env.local` 已被 `.gitignore` 排除，不會進版控。

**2. 啟動假拍賣現場，連到部署環境的 Prosody：**

```bash
npm run fake-auction:remote -- item-54321
```

**3. 打開部署環境的網址**，後續操作跟 [`docs/fake-auction.md`](fake-auction.md) 步驟 3～8 完全一樣。

## 重置已部署環境的狀態

拍賣/sniper 的狀態（誰加入了哪些拍賣、目前 Winning/Losing 等）是存在 Nuxt server 那個 Node process 的記憶體裡（見 `server/utils/sniper-registry.ts` 的 `portfolio`/`tableModel`），不是存在 Prosody（Prosody 純粹是訊息 broker，沒有應用層狀態）。所以只要 process 沒重啟，狀態就會一直累積，畫面上的表格也不會清空。

要重置，直接在 Render Dashboard 重啟 `goos-ts` 這個 Web Service 的 process 即可：進到該服務頁面，右上角 **Manual Deploy** 下拉選單裡選 **Restart Service**（不會重新 build，幾秒內就重啟完成）。

## 已知限制

- **Free plan 閒置休眠**：Render 免費方案閒置一段時間後會 spin down，重新喚醒需要一點時間，[ADR-0004](adr/ADR-0004-xmpp-deployment-platform.md) Context 描述的用途（練習 CI/CD、偶爾驗證）可以接受。
