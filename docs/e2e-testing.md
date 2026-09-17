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

- goos-ts [`fbec61d`](https://github.com/titangene/goos-ts/commit/fbec61dbf909a35a0c40e5a98845766a733a17cd)（對應 goos-java [`f80ef84`](https://github.com/titangene/goos-java/commit/f80ef8420785b04f9ddc54b753d227b1d7cbbb3a)）`red` ［12.2.3 p110］
  - 已驗證：`stop()` 用 `kill()` 整個結束 server process，沒有重現 goos-java 這步在 `f80ef84` 遇到的 XMPP resource conflict(409)
    - goos-java 的 sniper XMPP 連線是在同一個 JVM 背景 Thread 建立，`ApplicationRunner.stop()` 只有 `driver.dispose()`（關 Swing 視窗），從未呼叫 `connection.disconnect()`，導致連續兩個測項用同一組帳號／resource 登入時互相衝突
    - goos-ts 每個測項都是獨立 spawn 一個 Node server process，`kill()` 會終止整個 process，連線生命週期比 Java 版乾淨，兩個測項之間沒有殘留連線衝突（已實際跑 Playwright 確認）
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

## FakeAuctionServer 訊息比對機制（receivesAMessage）

對應 commit history（從新到舊）：

- goos-ts [`fdba9f5`](https://github.com/titangene/goos-ts/commit/fdba9f5cfa0513c0d7ac4e462fa8db7e915d4f34)（對應 goos-java [`869b44c`](https://github.com/titangene/goos-java/commit/869b44cf7af68b2e14e2a4e4f49a565d2fe95161)）`red` ［12.2.2 p108］
  - 決定 `hasReceivedJoinRequestFromSniper()` 泛化成 `hasReceivedJoinRequestFrom(sniperId)`，改成比對訊息內容等於 `JOIN_COMMAND`，不再是「不管內容」
    - `joinAuction()` 目前還沒送出 `JOIN_COMMAND` 內容，這個變更理論上會讓原本綠燈的 `sniperJoinsAuctionUntilAuctionCloses` 也一併變紅，跟 goos-java 這個 commit 同時列出兩個 Test case 的意圖一致；但整體測試仍卡在 `npm run typecheck` 的 `TS2339` 錯誤（`ApplicationRunner.hasShownSniperIsBidding` 還不存在），這一步還無法實際執行驗證
  - 決定新增 private `receivesAMessageMatching(sniperId, assertBody)`，`hasReceivedJoinRequestFrom`／`hasReceivedBid` 共用，且先等訊息內容比對、再檢查 `getParticipant()`，順序特意反過來
    - 理由：`currentChat` 是收到第一則訊息時才由被動路徑建立，如果先檢查 `getParticipant()`，`hasReceivedJoinRequestFrom` 呼叫當下 `currentChat` 可能還是 `null`，會丟出執行期錯誤而非清楚的斷言失敗；實作對應 goos-java commit
  - 決定移除 [`bbe240d`](https://github.com/titangene/goos-ts/commit/bbe240dcdaa84fcecbf693081083997e1edb84c5) 新增的 `anything()` 空函式
    - `hasReceivedJoinRequestFrom` 現在要求精確比對 `JOIN_COMMAND`，不再需要「不檢查」這個語意
  - 決定 `Main.ts` 新增 `export const JOIN_COMMAND`、`export const bidCommand(price)`，取代 goos-java `Main.JOIN_COMMAND_FORMAT`／`Main.BID_COMMAND_FORMAT`（`String.format` 搭配 `%d` 佔位符）
    - `JOIN_COMMAND` 沒有動態值，直接維持字串常數
    - `BID_COMMAND_FORMAT` 有 `%d` 佔位符，改用函式 `bidCommand(price): string` 回傳組好的字串，共用「格式邏輯」而非「格式字串片段」
- goos-ts [`bbe240d`](https://github.com/titangene/goos-ts/commit/bbe240dcdaa84fcecbf693081083997e1edb84c5)（對應 goos-java [`ce2cb2f`](https://github.com/titangene/goos-java/commit/ce2cb2fd28225569708f953509bfe27d3a0afe43)）`red` ［12.2.2 p107］
  - 決定 `receivesAMessage()` 改成接收斷言 callback `(body: string | undefined) => void`，取代 Java 版 Hamcrest `Matcher<? super String>`
    - 目前只有兩種用法：
      - `hasReceivedJoinRequestFromSniper` 不比對內容，使用自行宣告的 `anything()` 空函式
      - `hasReceivedBid` 比對字串相等，使用 `expect().toBe()`
    - 不引入通用 matcher 型別，比對邏輯交給呼叫端自己寫，`receivesAMessage()` 本身只負責等訊息、把 body 交給 callback
  - 決定用自行宣告的 `anything(): void {}` 空函式表達 Hamcrest `is(anything())` 的「不檢查」語意，不用 Playwright 的 `expect.anything()`
    - 已核對 `node_modules/playwright/types/test.d.ts` 官方註解：`expect.anything()` 排除 `null`／`undefined`，但 Hamcrest `anything()` 連 `null` 都算通過，兩者不對等
    - 目前 join 訊息的 body 實際上就是 `undefined`（`Main.ts` 送出的 join 訊息沒有 body），若用 `expect.anything()` 會讓 `hasReceivedJoinRequestFromSniper` 誤判失敗，改用什麼都不斷言的空函式才是行為上正確的等價物

## npm run test:e2e 內建 npm run build

對應 commit history（從新到舊）：

- goos-ts [`28fec26d`](https://github.com/titangene/goos-ts/commit/28fec26d4fd3c31432c3925df489d28031d59677)（對應 goos-java [`1b295ee1`](https://github.com/titangene/goos-java/commit/1b295ee1288cb00a31dd9abda417ca4bda1ce88a)）`red` ［11.2.1 p96］
  - 決定 `test:e2e` 內建 `nuxt build`（例如 `"test:e2e": "npm run build && playwright test"`）
    - 理由：這是小專案，build 時間很短，不影響 TDD 節奏；保證每次都是最新 build，避免拿舊 build 跑測試
