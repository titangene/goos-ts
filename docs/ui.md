# UI（Production 端頁面）

## 頁面標題

對應 commit history（從新到舊）：

- goos-ts [`aa63d30`](https://github.com/titangene/goos-ts/commit/aa63d30d2fef6fa8aadbb9225b408448a9af9b09)（對應 goos-java [`810e207`](https://github.com/titangene/goos-java/commit/810e20747905b420a7bd5416778c1382e4ab657c)）`red` ［11.2.2 p97］
  - 決定頁面標題只用 `useHead()`，不用於 driver 斷言
    - `app/pages/index.vue` 用 `useHead({ title: 'Auction Sniper' })` 設定瀏覽器分頁標題，字串直接內嵌，沒有額外抽出常數，對應 `MainWindow.java` 建構子的 `super("Auction Sniper")`，屬於一般網頁良好實踐，跟 driver 和測試斷言無關

## Sniper 狀態文字（STATUS_JOINING）

對應 commit history（從新到舊）：

- goos-ts [`38489e9`](https://github.com/titangene/goos-ts/commit/38489e964ea849a5a7a192c5002e1426f37e915f)（對應 goos-java [`57dc8ebc`](https://github.com/titangene/goos-java/commit/57dc8ebc518ed789b23b1ed87c007343138b9ed6)）`red` ［11.2.3 p98］
  - 決定 `STATUS_JOINING`（"Joining"）production 端與 test 端各自 inline，不建共用常數
    - production（Vue SFC）與 test（Playwright）是分開的 runtime，沒有 Java 靜態常數的共享機制
    - 沿用既有模式：頁面標題、`data-testid` 目前也都是兩處各自內嵌字面值，`test/e2e/ApplicationRunner.ts` 早在 11.2.1（[`28fec26d`](https://github.com/titangene/goos-ts/commit/28fec26d4fd3c31432c3925df489d28031d59677)）就已自行定義 `STATUS_JOINING`
