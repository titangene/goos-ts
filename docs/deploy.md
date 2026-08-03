# 部署（Render）

本專案部署在 [Render](https://render.com/)：

- **Web Service**：跑 Nuxt server（`npm run build` 建置、`node .output/server/index.mjs` 啟動）
- **Key Value（Redis）**：僅作為 pub/sub 訊息通道，不需要資料持久化

兩者都選在 Singapore region，同區內可用 internal URL 互連。CD 流程見 `.github/workflows/cd.yml`。

## 建立 Web Service 和 Key Value（Redis）

先建 Key Value，再建 Web Service（因為 Web Service 的環境變數要填 Key Value 的 internal URL）。

### 1. 建立 Key Value（Redis）

Render Dashboard → **New** → **Key Value**：

- **Name**：例如 `goos-ts-redis`
- **Region**：Singapore
- **Maxmemory Policy**：`allkeys-lru`（預設值即可，本專案只用 pub/sub，不受影響）
- **Instance Type**：選 **Free**（選了 Free 之後 Persistence Mode 會自動變成 `Off`——Free 方案本來就不支援持久化，剛好符合本專案「Redis 只做 pub/sub、不需要資料持久化」的需求）

按 **Create Key Value Instance**。建立完成後，到該服務頁面上方 **Connect** 下拉選單 → **Internal** 分頁，複製 **Internal Key Value URL**（格式 `redis://<service-id>:6379`），下一步要用。

### 2. 建立 Web Service

Render Dashboard → **New** → **Web Service**：

- **Source Code**：選 GitHub repo（需先在 Credentials 授權 GitHub）。Render 會自動偵測到 Nuxt.js 並帶入部分預設值。
- **Name**：例如 `goos-ts`
- **Language**：Node
- **Branch**：部署用的分支
- **Region**：選跟 Key Value 一樣的 Singapore（同 region 才能用 internal URL 互連，Render 會提示「You currently have services running in Singapore」）
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
  - `REDIS_URL` = 上一步複製的 Internal Key Value URL（`redis://<service-id>:6379`）

  > 這個環境變數要 `server/auctionsniper/redis/RedisAuctionHouse.ts` 有用 `createClient({ url: process.env.REDIS_URL })` 才讀得到——`createClient()` 沒帶參數時固定連 `localhost:6379`，不會自動讀環境變數。

按 **Deploy Web Service**，Render 會自動 pull 該分支的 commit 並在雲端建置、啟動。

### 關閉 Auto-Deploy，交給 cd.yml 全權負責

Render Web Service 預設 **Auto-Deploy** 是 `On Commit`——每次 push 到該分支都會自動觸發部署。但部署現在要交給 `.github/workflows/cd.yml`（等 `ci.yml` 跑完且成功才部署，見下方「CD 流程」），所以要把 Render 內建的 Auto-Deploy 關掉，避免兩邊搶著部署：

進到該 Web Service 頁面 → **Settings** → **Deploy** 區塊 → **Auto-Deploy** 旁的 **Edit** → 選 **Off** → **Save changes**。

### CD 流程

`.github/workflows/cd.yml` 用 [Render CLI](https://render.com/docs/cli) 觸發部署：

- 觸發時機：`ci.yml`（`CI` 這個 workflow）跑完且結論是 `success` 時（`workflow_run` 事件），而不是每次 push 就跑，避免 CI 沒過還部署
- 用 `render deploys create <serviceID> --commit <sha> --wait --confirm` 部署該次觸發 CI 的 commit，`--wait` 是 CLI 原生支援的阻塞等待，部署失敗會讓這個 job 失敗（非 0 exit code）
- 需要的兩個 GitHub Actions secrets：`RENDER_API_KEY`（Render Account Settings → API Keys 產生）、`RENDER_SERVICE_ID`（該 Web Service 的 ID，例如 `srv-xxxxx`）

## 開放 Redis 外部連線（IP 白名單）

Render 的 Key Value 免費方案預設**不允許外部流量**連入，只有同 workspace 內的 Render 服務可以透過 internal URL 存取。如果要從本機（例如跑 `npm run fake-auction:remote`）直接連到部署的 Redis，需要先把你的公網 IP 加入白名單：

**1. 查詢自己目前的公網 IP：**

```bash
curl -s https://api.ipify.org
```

**2. 到 Render Dashboard 該 Key Value 服務的頁面** → 左側 **Info** → 往下捲到 **Networking** → **Inbound IP Restrictions** → **Add source**。

**3. 點 `Use my IP address`**（Render 會自動偵測你目前連線的公網 IP 並帶入，通常會跟步驟 1 查到的一致），或手動輸入 `<你的公網 IP>/32`。**Save**。

**4. 到同一頁最上面的 `Connect` 下拉選單 → `External` 分頁**，即可看到 `External Key Value URL`（`rediss://user:password@host:6379` 格式，含 TLS）。之前顯示「External traffic not allowed」的話，白名單設定成功後就會改顯示實際連線字串。

> 公網 IP 若不是固定 IP（多數家用/公司網路都是動態配發），ISP 重新配發後白名單會失效，需要重跑一次上面的步驟更新 IP。
>
> 白名單是為了本機臨時除錯/模擬用；長期不需要對外開放的話，可以之後回到 Networking 設定把這條規則刪掉。

## 針對已部署環境模擬（`--remote`）

如果要驗證部署到雲端的環境能不能跑完整拍賣流程，`tools/fake-auction.ts` 支援 `--remote` 參數，改連 `REDIS_URL` 環境變數指定的 Redis，而不是本機 Redis：

**1. 複製 `.env.example` 成 `.env.local`，填入部署環境的 Redis 連線字串**（上面「開放 Redis 外部連線」拿到的 External Key Value URL）：

```bash
cp .env.example .env.local
```

```
REDIS_URL=rediss://<user>:<password>@<host>:<port>
```

`.env.local` 已被 `.gitignore` 排除，不會進版控。

**2. 啟動假拍賣現場，連到部署環境的 Redis：**

```bash
npm run fake-auction:remote -- item-54321
```

**3. 打開部署環境的網址**，後續操作跟 [`docs/fake-auction.md`](fake-auction.md) 步驟 3～8 完全一樣。

## 重置已部署環境的狀態

拍賣/sniper 的狀態（誰加入了哪些拍賣、目前 Winning/Losing 等）是存在 Nuxt server 那個 Node process 的記憶體裡（見 `server/utils/sniper-registry.ts` 的 `portfolio`／`tableModel`），不是存在 Redis（Redis 純粹是 pub/sub 訊息通道）。所以只要 process 沒重啟，狀態就會一直累積，畫面上的表格也不會清空。

要重置，直接在 Render Dashboard 重啟該 Web Service 的 process 即可：進到該服務頁面，右上角 **Manual Deploy** 下拉選單裡選 **Restart Service**（不會重新 build，幾秒內就重啟完成）。
