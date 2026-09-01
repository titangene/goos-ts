# E2E 測試基礎建設

## `AuctionSniperDriver` 不需要視窗標題

對應 commit history（從新到舊）：

- goos-ts [`28fec26d`](https://github.com/titangene/goos-ts/commit/28fec26d4fd3c31432c3925df489d28031d59677)（對應 goos-java [`1b295ee1`](https://github.com/titangene/goos-java/commit/1b295ee1288cb00a31dd9abda417ca4bda1ce88a)）`red` ［11.2.1 p96］
  - 決定 `AuctionSniperDriver` 不需要 `MAIN_WINDOW_NAME`、page title
    - Playwright 的 `page` 是直接參考，不像 Swing 需要在多視窗中搜尋比對，不需要用 page title 定位或斷言視窗
    - 頁面標題屬於一般網頁良好實踐，跟 driver 和測試斷言無關，實作記錄見 [`docs/ui.md`：頁面標題](./ui.md#頁面標題)（對應 goos-ts `aa63d30`，而非 `28fec26d`）
  - 決定不加 `expect(page).toHaveTitle(...)`，不為了重現 goos-java 在 `1b295ee1` 的兩個失敗訊息而加
    - 這兩個失敗其實是同一個原因：找不到 `Auction Sniper Main` 這個 JFrame，只是分別在測試主體與 `@After` 各自觸發一次例外，JUnit 的 `@After` 在測試失敗後仍然會執行，`ApplicationRunner.stop()` 也會再嘗試尋找同一個視窗，因此又失敗一次
    - Playwright 目前給的單一失敗（`toHaveText` 在 `getByTestId('sniper-status')` 逾時）已經足夠清楚指出這個 baby step 該做的下一件事，不需要為了湊數量另外加斷言

## page 由 test fixture 提供

對應 commit history（從新到舊）：

- goos-ts [`28fec26d`](https://github.com/titangene/goos-ts/commit/28fec26d4fd3c31432c3925df489d28031d59677)（對應 goos-java [`1b295ee1`](https://github.com/titangene/goos-java/commit/1b295ee1288cb00a31dd9abda417ca4bda1ce88a)）`red` ［11.2.1 p96］
  - 決定 `page` 由 `test.beforeEach(({ page }) => {...})` 提供
    - `page` 一律由 `@playwright/test` 的 `test` fixture 提供，不要自己呼叫 `context.newPage()`
    - Playwright Test Runner 會在每個測試前後自動建立/關閉對應的 `context`/`page`，不論測試成功或失敗都會關閉
    - `ApplicationRunner`（若採手動 spawn 管理 server）只需要處理 spawn 出來的 server process 的生命週期，不需要處理 browser/context/page 的關閉

## `ApplicationRunner` 的 server 生命週期管理

對應 commit history（從新到舊）：

- goos-ts [`28fec26d`](https://github.com/titangene/goos-ts/commit/28fec26d4fd3c31432c3925df489d28031d59677)（對應 goos-java [`1b295ee1`](https://github.com/titangene/goos-java/commit/1b295ee1288cb00a31dd9abda417ca4bda1ce88a)）`red` ［11.2.1 p96］
  - 決定手動 `spawn`/`kill` 管理 server process，而非 Playwright 內建 `webServer`
    - 理由：更貼近 Java 版 `ApplicationRunner` 逐測試管理 app 生命週期的結構
    - `playwright.config.ts` 不可另外設定 `webServer`，避免跟手動 spawn 的 server 搶同一個 port
  - 決定 spawn 指令用 `node .output/server/index.mjs` 直接執行 build 產物，不用 `npm run preview`
    - 理由：少一層 npm 包裝，行程結構更單純，符合 XP 簡單設計
  - 決定 spawn 時透過 `env` option 注入 `NUXT_PUBLIC_XMPP_SERVICE_URL`、`NUXT_XMPP_USERNAME`、`NUXT_XMPP_PASSWORD`、`PORT` 四個環境變數
    - 前三個語意上對應 Java 版把 `hostname`/`username`/`password` 當作 `Main.main()` 的 args 傳入
    - `PORT` 用來明確指定監聽的 port，不依賴 Nitro 的預設值（`node_modules/nitropack/dist/presets/node/runtime/node-server.mjs` 讀取 port 的邏輯是 `process.env.NITRO_PORT || process.env.PORT || 3000`）
  - 決定 `spawn` 暫時用 `stdio: 'inherit'` option
    - spawn 出來的 server process 的輸出直接顯示在終端機，方便目前開發階段直接看到 server 端的錯誤訊息除錯，之後可視情況改成 `'pipe'` 或 `'ignore'`
  - 決定 `ApplicationRunner` 的 `stop()` 用 `kill()`（預設 `SIGTERM`）結束 server process，不需要送 `SIGKILL`
    - 理由：這個 baby step 目前還沒有 WebSocket 連線，Nitro 的 graceful shutdown（`SIGTERM`/`SIGINT` 觸發）沒有連線需要等待，可以馬上結束
    - 日後接上 WebSocket 連線之後，這個決策需要重新檢視
  - 決定自己手刻 `waitUntilServerReady()`，不額外安裝 `wait-on` 套件
    - 附帶觀察：Java 版「等待非同步 UI 就緒」（`AWTEventQueueProber`）本身也是仰賴第三方函式庫（WindowLicker）而非讀者手刻，嚴格類比的話用 `wait-on` 反而更貼近書中 precedent，但這段邏輯規模小，手刻不違反任何業界慣例，純屬取捨

## nuxt build 與環境變數

對應 commit history（從新到舊）：

- goos-ts [`28fec26d`](https://github.com/titangene/goos-ts/commit/28fec26d4fd3c31432c3925df489d28031d59677)（對應 goos-java [`1b295ee1`](https://github.com/titangene/goos-java/commit/1b295ee1288cb00a31dd9abda417ca4bda1ce88a)）`red` ［11.2.1 p96］
  - 決定不需要在 `nuxt build` 時給 `--dotenv`，只需在啟動 server 時給 env
    - Nuxt 的 `runtimeConfig` 設計上是在 server 啟動當下讀取 `process.env`（`NUXT_*` 覆寫慣例），而不是在 `nuxt build` 執行的當下就把值固定下來，這是官方文件記載的「build once, configure per environment」設計目標

## npm run test:e2e 內建 npm run build

對應 commit history（從新到舊）：

- goos-ts [`28fec26d`](https://github.com/titangene/goos-ts/commit/28fec26d4fd3c31432c3925df489d28031d59677)（對應 goos-java [`1b295ee1`](https://github.com/titangene/goos-java/commit/1b295ee1288cb00a31dd9abda417ca4bda1ce88a)）`red` ［11.2.1 p96］
  - 決定 `test:e2e` 內建 `nuxt build`（例如 `"test:e2e": "npm run build && playwright test"`）
    - 理由：這是小專案，build 時間很短，不影響 TDD 節奏；保證每次都是最新 build，避免拿舊 build 跑測試
