# 部署（Render）

本專案部署在 [Render](https://render.com/)：

- **Web Service（`goos-ts`）**：跑 Nuxt server（`npm run build` 建置、`node .output/server/index.mjs` 啟動），連線用的是 Redis（見 [ADR-0002](adr/ADR-0002-transport-selection.md)）。

`goos-ts` 需要連線的是一個 Redis 相容的服務（Render 的 **Key Value** 服務），選在 Singapore region、同區內可用 internal URL 互連。CD 流程見 `.github/workflows/cd.yml`。

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
  - `REDIS_URL` = Redis 服務（Render **Key Value** 服務）的連線字串

  > 這個環境變數要 `server/utils/sniper-registry.ts` 有讀 `process.env.REDIS_URL`（沒設定時預設回退 `redis://localhost:6379`）才會生效。

按 **Deploy Web Service**，Render 會自動 pull 該分支的 commit 並在雲端建置、啟動。

### 關閉 Auto-Deploy，交給 cd.yml 全權負責

Render Web Service 預設 **Auto-Deploy** 是 `On Commit`——每次 push 到該分支都會自動觸發部署。但部署現在要交給 `.github/workflows/cd.yml`（等 `ci.yml` 跑完且成功才部署，見下方「CD 流程」），所以要把 Render 內建的 Auto-Deploy 關掉，避免兩邊搶著部署：

進到該 Web Service 頁面 → **Settings** → **Deploy** 區塊 → **Auto-Deploy** 旁的 **Edit** → 選 **Off** → **Save changes**。

### CD 流程

`.github/workflows/cd.yml` 用 [Render CLI](https://render.com/docs/cli) 觸發 `goos-ts`（Nuxt server）的部署：

- 觸發時機：`ci.yml`（`CI` 這個 workflow）跑完且結論是 `success` 時（`workflow_run` 事件），而不是每次 push 就跑，避免 CI 沒過還部署
- 用 `render deploys create <serviceID> --commit <sha> --wait --confirm` 部署該次觸發 CI 的 commit，`--wait` 是 CLI 原生支援的阻塞等待，部署失敗會讓這個 job 失敗（非 0 exit code）
- 需要的兩個 GitHub Actions secrets：`RENDER_API_KEY`（Render Account Settings → API Keys 產生）、`RENDER_SERVICE_ID`（`goos-ts` 這個 Web Service 的 ID，例如 `srv-xxxxx`）

> **`workflow_run` 生效的前提：GitHub repo 的預設分支要跟 CI/CD workflow 檔案所在的分支一致。**`workflow_run` 事件只會抓「repo 預設分支上的 workflow 檔案」，不是「觸發它的那個 workflow 執行所在的分支」。本專案的 `ci.yml`/`cd.yml` 只存在 `poc` 分支（`main` 分支目前只有初始 commit，沒有任何 CI/CD 設定），所以 **GitHub repo 的 Default branch 設定必須是 `poc`**，`cd.yml` 才抓得到、`workflow_run` 才會觸發。如果之後把 Default branch 改回 `main`（或建立正式的 `main` 開發流程），要記得把 `ci.yml`/`cd.yml` 也同步搬過去，否則 CD 會在完全沒有錯誤訊息的情況下悄悄失效——這正是本專案曾經踩過的坑：`ci.yml` 照常跑綠燈，但 `cd.yml` 完全不會被觸發，且沒有任何地方會報錯或提示原因。

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

**1. 複製 `.env.example` 成 `.env.local`，填入部署環境的 Redis 連線字串**（就是上面「建立 Nuxt Web Service」設定的 `REDIS_URL`）：

```bash
cp .env.example .env.local
```

```
REDIS_URL=rediss://<redis-service-host>
```

`.env.local` 已被 `.gitignore` 排除，不會進版控。身分驗證交給應用層的 username 白名單（見 [ADR-0003](adr/ADR-0003-username-only-identity.md)），Redis 連線本身的存取控制（IP 白名單、帳密）依 Render Key Value 服務的預設設定為準。

**2. 啟動假拍賣現場，連到部署環境的 Redis：**

```bash
npm run fake-auction:remote -- item-54321
```

**3. 打開部署環境的網址**，後續操作跟 [`docs/fake-auction.md`](fake-auction.md) 步驟 3～8 完全一樣。

## 重置已部署環境的狀態

拍賣/sniper 的狀態（誰加入了哪些拍賣、目前 Winning/Losing 等）是存在 Nuxt server 那個 Node process 的記憶體裡（見 `server/utils/sniper-registry.ts` 的 `portfolio`/`tableModel`），不是存在 Redis（Redis 純粹是訊息 broker，沒有應用層狀態）。所以只要 process 沒重啟，狀態就會一直累積，畫面上的表格也不會清空。

要重置，直接在 Render Dashboard 重啟 `goos-ts` 這個 Web Service 的 process 即可：進到該服務頁面，右上角 **Manual Deploy** 下拉選單裡選 **Restart Service**（不會重新 build，幾秒內就重啟完成）。
