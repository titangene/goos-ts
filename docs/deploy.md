# 部署（Render）

本專案部署在 [Render](https://render.com/)：

- **Web Service（`goos-ts`）**：跑 Nuxt server（`npm run build` 建置、`node .output/server/index.mjs` 啟動）
- **Web Service（`goos-ts-mosquitto`）**：跑 MQTT broker（Docker 建置，見 [ADR-0004](adr/ADR-0004-mqtt-broker-deployment.md)）

兩者都選在 Singapore region，同區內可用 internal URL 互連。CD 流程見 `.github/workflows/cd.yml`。

## 建立 Mosquitto Web Service

Render Dashboard → **New** → **Web Service**：

- **Source Code**：選同一個 GitHub repo
- **Name**：例如 `goos-ts-mosquitto`
- **Runtime**：**Docker**（不是 Node）
- **Branch**：跟 `goos-ts` 一樣，部署用的分支
- **Region**：Singapore
- **Root Directory**：`mosquitto`
- **Dockerfile Path**：`Dockerfile`（相對於上面設定的 Root Directory，實際路徑是 `mosquitto/Dockerfile`）
- **Docker Build Context Directory**：`.`（同樣相對於 Root Directory，實際路徑是 `mosquitto/`）
- **Instance Type**：選 **Free**
- 不要掛載任何 Disk / Persistent Volume（[ADR-0004](adr/ADR-0004-mqtt-broker-deployment.md) Compliance #4，Free 方案本來就不支援）

按 **Deploy Web Service**。建立完成後，該服務的公開網址（例如 `https://<mosquitto-service-name>.onrender.com`）就是 `MQTT_BROKER_URL` 要用的值（協定要換成 `wss://`），下一步會用到。

> **為什麼不是用 Render 私有網路內部 URL？**：原規劃是 Nuxt server 透過私有網路連 Mosquitto 的內部 1883 TCP listener（比照 Redis 時代的 internal URL 模式），但 Render 官方文件寫明 **Free web service 可以發起私有網路連線、但無法接收**——Mosquitto 服務本身是 Free 方案，完全無法接收私有網路的入站連線。因此 Nuxt server 改成跟 `fake-auction.ts --remote` 一樣，走 Mosquitto 對外公開的 `wss://` listener。細節見 [ADR-0004](adr/ADR-0004-mqtt-broker-deployment.md)「部署後修正」一節。

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
- **Environment Variables**：新增一筆
  - `MQTT_BROKER_URL` = 上一步 Mosquitto 服務的公開網址，協定換成 `wss://`（格式 `wss://<mosquitto-service-name>.onrender.com`）

  > 這個環境變數要 `server/utils/sniper-registry.ts` 有讀 `process.env.MQTT_BROKER_URL`（沒設定時預設回退 `mqtt://localhost:1883`）才會生效。

按 **Deploy Web Service**，Render 會自動 pull 該分支的 commit 並在雲端建置、啟動。

### 關閉 Auto-Deploy，交給 cd.yml 全權負責

Render Web Service 預設 **Auto-Deploy** 是 `On Commit`——每次 push 到該分支都會自動觸發部署。但部署現在要交給 `.github/workflows/cd.yml`（等 `ci.yml` 跑完且成功才部署，見下方「CD 流程」），所以要把 Render 內建的 Auto-Deploy 關掉，避免兩邊搶著部署：

進到該 Web Service 頁面 → **Settings** → **Deploy** 區塊 → **Auto-Deploy** 旁的 **Edit** → 選 **Off** → **Save changes**。

`goos-ts-mosquitto` 目前維持預設的 `On Commit`，沒有另外設 CD——它很少變動，直接讓 Render 對 push 自動重建即可，跟 `goos-ts` 用同一個 `cd.yml` 反而多一道不必要的複雜度。

### CD 流程

`.github/workflows/cd.yml` 用 [Render CLI](https://render.com/docs/cli) 觸發 `goos-ts`（Nuxt server）的部署：

- 觸發時機：`ci.yml`（`CI` 這個 workflow）跑完且結論是 `success` 時（`workflow_run` 事件），而不是每次 push 就跑，避免 CI 沒過還部署
- 用 `render deploys create <serviceID> --commit <sha> --wait --confirm` 部署該次觸發 CI 的 commit，`--wait` 是 CLI 原生支援的阻塞等待，部署失敗會讓這個 job 失敗（非 0 exit code）
- 需要的兩個 GitHub Actions secrets：`RENDER_API_KEY`（Render Account Settings → API Keys 產生）、`RENDER_SERVICE_ID`（`goos-ts` 這個 Web Service 的 ID，例如 `srv-xxxxx`）

> **`workflow_run` 生效的前提：GitHub repo 的預設分支要跟 CI/CD workflow 檔案所在的分支一致。**`workflow_run` 事件只會抓「repo 預設分支上的 workflow 檔案」，不是「觸發它的那個 workflow 執行所在的分支」。本專案的 `ci.yml`/`cd.yml` 只存在 `poc` 分支（`main` 分支目前只有初始 commit，沒有任何 CI/CD 設定），所以 **GitHub repo 的 Default branch 設定必須是 `poc`**，`cd.yml` 才抓得到、`workflow_run` 才會觸發。如果之後把 Default branch 改回 `main`（或建立正式的 `main` 開發流程），要記得把 `ci.yml`/`cd.yml` 也同步搬過去，否則 CD 會在完全沒有錯誤訊息的情況下悄悄失效——這正是本專案曾經踩過的坑：`ci.yml` 照常跑綠燈，但 `cd.yml` 完全不會被觸發，且沒有任何地方會報錯或提示原因。

## 針對已部署環境模擬（`--remote`）

如果要驗證部署到雲端的環境能不能跑完整拍賣流程，`tools/fake-auction.ts` 支援 `--remote` 參數，改連 `MQTT_BROKER_URL` 環境變數指定的 Mosquitto，而不是本機 Mosquitto：

**1. 複製 `.env.example` 成 `.env.local`，填入部署環境的 Mosquitto 連線字串**（就是上面「建立 Mosquitto Web Service」拿到的公開網址，協定用 `wss://`）：

```bash
cp .env.example .env.local
```

```
MQTT_BROKER_URL=wss://<mosquitto-service-name>.onrender.com
```

`.env.local` 已被 `.gitignore` 排除，不會進版控。跟 Redis 時代不同，這裡不需要另外設定 IP 白名單或帳密——Mosquitto 的對外 WS listener 本來就設計成公開連線（身分驗證交給應用層的 username 白名單，見 [ADR-0003](adr/ADR-0003-username-only-identity.md)）。

**2. 啟動假拍賣現場，連到部署環境的 Mosquitto：**

```bash
npm run fake-auction:remote -- item-54321
```

**3. 打開部署環境的網址**，後續操作跟 [`docs/fake-auction.md`](fake-auction.md) 步驟 3～8 完全一樣。

## 重置已部署環境的狀態

拍賣/sniper 的狀態（誰加入了哪些拍賣、目前 Winning/Losing 等）是存在 Nuxt server 那個 Node process 的記憶體裡（見 `server/utils/sniper-registry.ts` 的 `portfolio`/`tableModel`），不是存在 Mosquitto（Mosquitto 純粹是訊息 broker，沒有應用層狀態）。所以只要 process 沒重啟，狀態就會一直累積，畫面上的表格也不會清空。

要重置，直接在 Render Dashboard 重啟 `goos-ts` 這個 Web Service 的 process 即可：進到該服務頁面，右上角 **Manual Deploy** 下拉選單裡選 **Restart Service**（不會重新 build，幾秒內就重啟完成）。

## 舊有 Redis 資源（待清理）

拍賣協定從 Redis Pub/Sub 換成 MQTT 後（[ADR-0002](adr/ADR-0002-mqtt-replaces-redis.md)），程式碼裡的 `server/auctionsniper/redis/*` 已經整組移除，但 Render 上原本為它建立的資源還沒清：

- **Key Value 服務**（例如 `goos-ts-redis`）：已經沒有任何程式碼會連它，是孤兒資源。可以到該服務頁面 → **Settings** → 捲到最下面 **Delete Key Value** 刪除。
- **`goos-ts` Web Service 的 `REDIS_URL` 環境變數**：已經沒有程式碼讀它，留著不影響運作，但可以到 **Environment** 頁面一併刪掉。

這兩項都是刪除雲端資源的操作，故意留給你手動確認、手動執行。
