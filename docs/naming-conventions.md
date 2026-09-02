# 命名慣例

## 基本規則

- 決定 class、enum、interface、Vue component 檔名用 PascalCase，對應匯出的型別/元件名稱
  - 對應 Java 版命名習慣，也是使用者的個人偏好
  - Vue component 這部分同時也是 Vue 官方風格指南列出的建議慣例之一
- 決定其餘 Nuxt 慣例上需要 `export default` 某個 function 的檔案（`composables`、`server/utils`、`plugins`、`middleware`）用 camelCase，對應匯出的函式名稱
  - 吻合 Nuxt/Vue 生態本身的慣例（例如 `composables/useX.ts` 匯出 `useX`）
- 決定盡量不使用 kebab-case，若某類檔案的業界慣例就是 kebab-case，而非 PascalCase/camelCase，要明講出來讓使用者決策，不能默默採用

## WebSocket route 檔名使用 kebab-case

對應 commit history（從新到舊）：

- goos-ts [`149d80a`](https://github.com/titangene/goos-ts/commit/149d80aa86c77de83e3942198003a0e7d66d1979)（對應 goos-java [`fba009d1`](https://github.com/titangene/goos-java/commit/fba009d197e0039b7a8a1845b56606cdde124568)）`red` ［11.2.4 p100］
  - 決定 WebSocket route 檔名使用 kebab-case
    - `server/routes/` 底下的檔名會直接對應 URL 路徑，一般 web/HTTP 慣例上 URL 路徑習慣用 kebab-case（小寫、連字號），這不是單純的 TS 語言命名風格問題，而是 URL 設計慣例
    - 已實作為 `server/routes/auction-sniper.ts`，優先滿足 URL 路徑業界慣例，屬於「基本規則」裡 kebab-case 例外的一種
