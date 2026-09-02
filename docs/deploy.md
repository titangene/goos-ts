# 部署（Render）

本專案部署在 [Render](https://render.com/)，有兩個 Web Service：

- **Nuxt server（`goos-ts-main`）**：跑 Nuxt server（`npm run build` 建置、`node .output/server/index.mjs` 啟動）。
- **XMPP server（`goos-ts-xmpp-prosody-main`）**：跑 Prosody（Docker 部署，image 設定見 `docker/xmpp/`），拍賣協定的 broker，對外只提供 XMPP over WebSocket。

兩者都在 Singapore region。

跟 poc 分支不同，main 分支的這兩個服務不是在 Render Dashboard 手動一步步建立的，而是用 repo 根目錄的 [`render.yaml`](../render.yaml)（[Render Blueprint](https://render.com/docs/infrastructure-as-code)）宣告式定義，Blueprint 欄位皆已依 [Render 官方 Blueprint spec](https://render.com/docs/blueprint-spec) 查證（查證日期 2026-09-02）。

## render.yaml 定義了什麼

`render.yaml` 定義兩個 `type: web` 服務：

- `goos-ts-main`：
  - `runtime: node`
  - `buildCommand: npm ci && npm run build`
  - `startCommand: node .output/server/index.mjs`
- `goos-ts-xmpp-prosody-main`：
  - `runtime: docker`
  - `dockerfilePath: docker/xmpp/Dockerfile`
  - `dockerContext: docker/xmpp`
  - `healthCheckPath: /`

兩者都設定：

- `region: singapore`、`plan: free`、`branch: main`
- `autoDeployTrigger: off`：部署交給 `.github/workflows/cd.yml` 全權負責（見下方「CD 流程」），不用 Render 內建的 Auto-Deploy，避免兩邊搶著部署。這個設定寫在 `render.yaml` 裡，套用 Blueprint 時就會直接生效，不需要再手動去 Dashboard 關閉。

環境變數裡，`sync: false` 的那幾筆（`NUXT_PUBLIC_XMPP_SERVICE_URL`、`PROSODY_VIRTUAL_HOSTS`）代表值不寫進版控，套用 Blueprint 時 Render 會提示手動輸入；這兩筆都依賴「XMPP 服務建立後才會知道的 Render 網域」，套用當下留空即可，建立後再回填（見下方）。

## 套用 Blueprint

Render Dashboard → **New** → **Blueprint Instance** → 選 GitHub repo `titangene/goos-ts` → Branch 選 **main**（不是預設帶入的 poc，下拉選單要手動切換）→ Render 會自動抓 repo 根目錄的 `render.yaml`，列出即將建立的兩個 Web Service。

`sync: false` 的環境變數欄位可以留空直接送出，兩個服務都會照 `render.yaml` 的設定建立、開始部署。

### 已知的一次性坑：首次 Blueprint 部署健康檢查卡住

因為 `PROSODY_VIRTUAL_HOSTS` 依賴服務建立後才知道的網域，套用 Blueprint 時一定是空的，所以第一次部署才會卡在「In progress」超過 10 分鐘、health check 一直不過（訊息顯示打的是 `<服務網域>:10000/`，不是 `render.yaml` 設定的 `PORT=5280`）。

解法：等服務建立、拿到網域後，先照下方「建立後回填網域相關環境變數」把 `PROSODY_VIRTUAL_HOSTS` 填上，接著 **Save and deploy** 存檔並觸發重新部署；接著回到 **Deploys** 頁面把那個卡住的第一次部署（trigger 是 `Blueprint`）**Cancel** 掉，讓填了 `PROSODY_VIRTUAL_HOSTS` 之後觸發的新部署（trigger 是 `Environment updated`）接手。因為 Docker image 不需要重新 build，這次重新部署大約 30 秒內就會轉為 Live。

## 建立後回填網域相關環境變數

`NUXT_PUBLIC_XMPP_SERVICE_URL`（Nuxt server 用）跟 `PROSODY_VIRTUAL_HOSTS`（XMPP server 用）都依賴 XMPP 服務建立後才知道的 Render 網域，套用 Blueprint 時留空，建立後要手動回填：

1. 到 `goos-ts-xmpp-prosody-main` 服務的 **Environment** 頁面，把 `PROSODY_VIRTUAL_HOSTS` 填成該服務的網域（例如 `goos-ts-xmpp-prosody-main.onrender.com`，實際值以 Dashboard 顯示的為準，**不要用命名規則自己推測**——服務名稱被佔用時 Render 可能會加亂數後綴）。
2. 到 `goos-ts-main` 服務的 **Environment** 頁面，把 `NUXT_PUBLIC_XMPP_SERVICE_URL` 填成 `wss://<上一步的網域>/xmpp-websocket`。
3. 兩邊都用 **Save and deploy** 存檔並觸發重新部署（Docker/Node 都不需要重新 build，只是套用新環境變數後重啟）。

## Nuxt server 如何讀取這些環境變數

`NUXT_PUBLIC_XMPP_SERVICE_URL` / `NUXT_XMPP_USERNAME` / `NUXT_XMPP_PASSWORD` 對應 `nuxt.config.ts` 的 `runtimeConfig.public.xmppServiceUrl` / `runtimeConfig.xmppUsername` / `runtimeConfig.xmppPassword`。

目前（main 分支現況）由 `server/routes/auction-sniper.ts` 的 WebSocket handler 在連線建立（`open`）時呼叫 `useRuntimeConfig()` 讀出這三個值，連同 URL 帶的 `itemId`，一起傳進 `Main.main()`（`server/auctionSniper/Main.ts`）建立這次連線的 sniper。三個值都沒有內建預設值，沒設定會讓連線失敗，不會悄悄 fallback 至 localhost。

## CD 流程

`.github/workflows/cd.yml` 用 [Render CLI](https://render.com/docs/cli) 觸發兩個服務的部署：

- 觸發時機：`ci.yml` 的 `ci` job（Lint/Format/Test/E2E）成功後，`deploy` job 用 `needs: ci` + `if: github.event_name == 'push' && github.ref == 'refs/heads/main'` 擋門檻，再用 `workflow_call` 直接呼叫 `cd.yml`，而不是每次 push 就跑，避免 CI 沒過還部署。
- 用 `render deploys create <serviceID> --commit <sha> --wait --confirm` 部署該次觸發 CI 的 commit，`--wait` 是 CLI 原生支援的阻塞等待，部署失敗會讓這個 job 失敗（非 0 exit code）。
- 需要的 GitHub Actions secrets：`RENDER_API_KEY`（跟 poc 分支共用同一把）、`RENDER_SERVICE_ID_MAIN`（`goos-ts-main` 的 ID）、`RENDER_XMPP_SERVICE_ID_MAIN`（`goos-ts-xmpp-prosody-main` 的 ID），格式都是 `srv-xxxxx`。

> **為什麼用 `workflow_call` 而不是 `workflow_run`：`workflow_run` 只認 repo 的 Default branch。**
>
> - 依 [GitHub 官方文件](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows)，`workflow_run` 事件只會在「repo 預設分支上的那份 workflow 檔案」有效，即使觸發 CI 的是別的分支，GitHub 判斷 `branches:` filter 時看的也是預設分支那份檔案的內容，不是實際觸發 CI 的分支上的檔案。
> - 本專案 `main` / `poc` 兩個分支都各自有一份 `ci.yml` / `cd.yml`，且 `branches:` filter 各自只 scope 到自己的分支。如果用 `workflow_run`，只有 Default branch 那一份會生效，另一個分支 push 後 CI 綠燈也不會觸發 CD，且不會有任何錯誤訊息提示。
> - 改用 `workflow_call` 後，`ci.yml` 的 `deploy` job 用 `uses: ./.github/workflows/cd.yml` 直接呼叫同一個 repo 的 `cd.yml`。`workflow_call` 用 `./` 相對路徑呼叫時，讀的是「呼叫端當下這次 commit」的檔案內容，不受 Default branch 影響，`main` / `poc` 才能真的各自獨立觸發自己的 CD，兩者互不干擾。

## 對外連線驗證（Prosody）

部署完成後，可以用以下方式確認 Prosody 服務正常：

**確認服務存活：**

```bash
curl -s -o /dev/null -w "%{http_code}" https://goos-ts-xmpp-prosody-main.onrender.com/
# 200
```

**確認 WebSocket handshake：**

```bash
curl -sv -N --http1.1 \
  -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  -H "Sec-WebSocket-Protocol: xmpp" \
  https://goos-ts-xmpp-prosody-main.onrender.com/xmpp-websocket
# < HTTP/1.1 101 Switching Protocols
# < Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
```

`Sec-WebSocket-Accept` 要正確對應送出的 `Sec-WebSocket-Key`，才能確認是 Prosody 的 `mod_websocket` 真的處理了 handshake，不是平台邊界隨便回應的頁面。

## Prosody 設定要點

`docker/xmpp/prosody.cfg.lua` 相對官方預設設定檔（[`prosody-13.0.cfg.lua`](https://github.com/prosody/prosody-docker/blob/master/configs/prosody-13.0.cfg.lua)）額外做了兩件事，兩者都是因為 Render（以及大多數 PaaS）在邊界做 TLS termination、用明文 HTTP 轉發到 container，所以 Prosody 實際收到的連線從自己的視角看永遠是「未加密連線」：

1. **`http_interfaces = { "0.0.0.0", "::" }`**：Prosody 從某個版本起，明文 HTTP（預設 5280）改成預設只監聽 localhost（`{ "127.0.0.1", "::1" }`），只有 HTTPS（5281）預設對外。這一行必須放在任何 `VirtualHost` 之前（Prosody 設定檔用「`VirtualHost` 之前的內容才是 global」這個規則），不能透過官方預設的 conf.d include（放在檔案最後面）加，那樣只會套用到最後一個 `VirtualHost`。
2. **`c2s_require_encryption = false` 與 `allow_unencrypted_plain_auth = true`**：Prosody 從 0.12 版起走「預設安全」路線，兩個設定都要放寬才能在未加密連線上完成登入，缺一個都不行：
   - `c2s_require_encryption`（預設 `true`）沒放寬，會讓 Prosody 直接拒絕未加密連線本身，連 stream feature 都不給。
   - `allow_unencrypted_plain_auth`（預設 `false`）沒放寬，則會讓 SASL 協商階段找不到可用機制。
   - 這是刻意放寬安全限制的決定：這是練習 TDD 用的專案，不是要打造安全的正式系統。

容器啟動時的 entrypoint（`docker/xmpp/register-and-start.sh`）會自動用 `prosodyctl register` 註冊三個帳號（`sniper` / `sniper`、`auction-item-54321` / `auction`、`auction-item-65432` / `auction`），取代官方 image 只能透過 `LOCAL` / `PASSWORD` / `DOMAIN` 三個環境變數註冊「單一」帳號的限制。

## 已知限制

- **Free plan 閒置休眠**：Render 免費方案閒置一段時間後會 spin down，重新喚醒需要一點時間，練習 CI/CD、偶爾驗證的用途可以接受。
- main 分支目前沒有 poc 分支已有的 `tools/fake-auction.ts --remote` 模擬工具、`test/integration` 測試層，因此暫時沒有對應的「已部署環境模擬」或「SASL 登入自動化驗證」章節；等 main 分支的 TDD 進度補上對應功能後再補充。
