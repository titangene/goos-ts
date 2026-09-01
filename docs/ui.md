# UI（Production 端頁面）

## 頁面標題

對應 commit history（從新到舊）：

- goos-ts [`aa63d30`](https://github.com/titangene/goos-ts/commit/aa63d30d2fef6fa8aadbb9225b408448a9af9b09)（對應 goos-java [`810e207`](https://github.com/titangene/goos-java/commit/810e20747905b420a7bd5416778c1382e4ab657c)）`red` ［11.2.2 p97］
  - 決定頁面標題只用 `useHead()`，不用於 driver 斷言
    - `app/pages/index.vue` 用 `useHead({ title: 'Auction Sniper' })` 設定瀏覽器分頁標題，字串直接內嵌，沒有額外抽出常數，對應 `MainWindow.java` 建構子的 `super("Auction Sniper")`，屬於一般網頁良好實踐，跟 driver 和測試斷言無關
