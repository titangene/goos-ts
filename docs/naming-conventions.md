# 命名慣例

## 基本規則

- 決定 class、enum、interface、Vue component 檔名用 PascalCase，對應匯出的型別/元件名稱
  - 對應 Java 版命名習慣，也是使用者的個人偏好
  - Vue component 這部分同時也是 Vue 官方風格指南列出的建議慣例之一
- 決定其餘 Nuxt 慣例上需要 `export default` 某個 function 的檔案（`composables`、`server/utils`、`plugins`、`middleware`）用 camelCase，對應匯出的函式名稱
  - 吻合 Nuxt/Vue 生態本身的慣例（例如 `composables/useX.ts` 匯出 `useX`）
- 決定盡量不使用 kebab-case，若某類檔案的業界慣例就是 kebab-case，而非 PascalCase/camelCase，要明講出來讓使用者決策，不能默默採用
