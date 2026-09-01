# UI（Production 端頁面）

## 頁面標題

尚未實作的決策：

- goos-ts 尚未實作（對應 goos-java [`1b295ee1`](https://github.com/titangene/goos-java/commit/1b295ee1288cb00a31dd9abda417ca4bda1ce88a)）`red` ［11.2.1 p96］
  - 決定 `APPLICATION_TITLE` 只用於 `useHead()`，不用於 driver 斷言
    - `APPLICATION_TITLE` 常數搭配 `useHead({ title: APPLICATION_TITLE })` 設定瀏覽器分頁標題，屬於一般網頁良好實踐，跟 driver/測試斷言無關

對應 commit history（從新到舊）：

- （尚無 goos-ts commit）
