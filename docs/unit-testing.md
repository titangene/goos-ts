# 單元測試

## 測試框架與 mock 工具選擇

對應 commit history（從新到舊）：

- goos-ts [`82adaf9`](https://github.com/titangene/goos-ts/commit/82adaf9f0946d7ce1362c36670821a255ce14499)（goos-java 無對應 commit，屬於工具鏈決策）
  - 決定用 `vitest-mock-extended` 的 `mock<T>()` 產生型別安全的 interface mock，取代 jMock 的 `context.mock(Interface.class)`
  - `expect(mock.method).toHaveBeenCalledExactlyOnceWith(...)` 對應 jMock `Expectations` 的 `oneOf(mock).method(...)`
- goos-ts [`34ede82`](https://github.com/titangene/goos-ts/commit/34ede824ca5fb86cd6607098e18619e2f549b882)（goos-java 無對應 commit，屬於工具鏈決策）
  - 決定用 Vitest 當 unit test 執行器，Playwright 只保留給 e2e
  - `vitest.config.ts` 用 `projects` 設一個 `unit` project，`include: ['test/unit/**/*.test.ts']`，對應 `npm run test:unit`
  - unit test 放在獨立的 `test/unit/` 目錄，路徑相對 `server/auctionSniper/` 鏡射來源檔案（例如 `server/auctionSniper/xmpp/AuctionMessageTranslator.ts` → `test/unit/xmpp/AuctionMessageTranslator.test.ts`），並設定 `#server` path alias，import production code 的方式跟 `test/e2e/` 一致
