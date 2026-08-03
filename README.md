# goos-ts

Auction Sniper — TypeScript + Nuxt + Redis + WebSocket 版本，改寫自 [Growing Object-Oriented Software, Guided by Tests](https://www.growing-object-oriented-software.com/) 書中的 Java 範例。

## 與 Java 版本的比較

《GOOS》原書 Java 版原始碼：[sf105/goos-code](https://github.com/sf105/goos-code)（`master` 分支）。

### 使用技術比較

| 項目              | 《GOOS》Java 版                                                         | goos-ts（本專案）                                                                      |
| ----------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 語言              | Java                                                                    | TypeScript                                                                             |
| UI                | Swing（桌面 GUI）                                                       | Vue 3 + Nuxt 4（瀏覽器）                                                               |
| 拍賣訊息協定      | XMPP（Smack library，需搭配 Openfire server）                           | Redis Pub/Sub（`redis` client）                                                        |
| UI 即時更新機制   | `SwingThreadSniperListener`（`SwingUtilities.invokeLater` 切回 EDT）    | WebSocket（`server/routes/ws.ts` 推送到瀏覽器）                                        |
| 建置工具          | Ant（`build.xml`）                                                      | npm scripts + Nuxt/Vite                                                                |
| 依賴管理          | 手動管理 `lib/` 下的 jar 檔                                             | npm（`package.json`）                                                                  |
| 單元測試框架      | JUnit 4                                                                 | Vitest                                                                                 |
| Mock/Stub         | jMock 2                                                                 | Vitest 內建 `vi.fn()` / `vi.spyOn()`                                                   |
| Matcher           | Hamcrest                                                                | Vitest 內建 `expect`                                                                   |
| 整合測試          | `test/integration`（Swing `MainWindow`、XMPP `XMPPAuctionHouse`）       | `test/integration`（Nuxt app、Redis `RedisAuctionHouse`），另加 `test/integration/app` |
| End-to-end 測試   | `test/end-to-end`（`ApplicationRunner` + WindowLicker 驅動 Swing 元件） | `test/e2e`（Playwright 驅動瀏覽器）                                                    |
| 假拍賣現場        | `FakeAuctionServer.java`（連 XMPP）                                     | `test/e2e/FakeAuctionServer.ts` + `tools/fake-auction.ts`（連 Redis pub/sub）          |
| CI 測試用依賴服務 | Openfire（XMPP server）                                                 | Redis（CI 用 `redis:7-alpine` service container）                                      |

### 專案結構比較

| 用途                 | 《GOOS》Java 版                                                                                   | goos-ts（本專案）                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 拍賣領域核心邏輯     | `src/auctionsniper/*.java`（`AuctionSniper`、`SniperState`、`SniperPortfolio`…）                  | `server/auctionsniper/*.ts`                                                                                                              |
| 使用者需求輸入       | `src/auctionsniper/UserRequestListener.java`                                                      | `server/auctionsniper/UserRequestListener.ts`                                                                                            |
| 程式進入點           | `src/auctionsniper/Main.java`                                                                     | `server/plugins/init-sniper-launcher.ts`（啟動）+ `server/routes/ws.ts`（即時通道）+ `server/api/*`（HTTP API）                          |
| UI 元件              | `src/auctionsniper/ui/*.java`（`MainWindow`、`SnipersTableModel`、`Column`）                      | `app/pages/index.vue`、`app/components/SnipersTable.vue`；`Column`／表格資料型別移到 `shared/Column.ts`、`shared/types.ts`（前後端共用） |
| 訊息協定實作         | `src/auctionsniper/xmpp/*.java`（`XMPPAuction`、`XMPPAuctionHouse`、`AuctionMessageTranslator`…） | `server/auctionsniper/redis/*.ts`（`RedisAuction`、`RedisAuctionHouse`、`AuctionMessageTranslator`…）                                    |
| 共用工具             | `src/auctionsniper/util/*.java`（`Announcer`、`Defect`）                                          | `server/auctionsniper/util/*.ts`                                                                                                         |
| 單元測試             | `test/unit/test/auctionsniper/**`                                                                 | `test/unit/**`                                                                                                                           |
| 整合測試             | `test/integration/test/integration/auctionsniper/**`                                              | `test/integration/**`                                                                                                                    |
| E2E 測試             | `test/end-to-end/test/endtoend/auctionsniper/**`                                                  | `test/e2e/**`                                                                                                                            |
| 手動模擬拍賣現場工具 | 無對應（僅有測試用的 `FakeAuctionServer.java`）                                                   | `tools/fake-auction.ts`（互動式，另見下方「手動模擬完整拍賣流程」）                                                                      |
| 建置設定             | `build.xml`（Ant）、`.classpath`（Eclipse）                                                       | `package.json`、`nuxt.config.ts`、`tsconfig.json`、`vite`（透過 Nuxt）                                                                   |

## 環境需求

- Node.js
- Redis（本機或 Docker 皆可）

啟動 Redis（例如用 Docker）：

```bash
docker run -d --name goos-redis -p 6379:6379 redis:7-alpine
```

## 安裝

```bash
npm install
```

## 開發

```bash
npm run dev
```

## 建置與正式執行

```bash
npm run build
node .output/server/index.mjs
```

## 測試

```bash
npm run test:unit           # 單元測試
npm run test:integration    # 整合測試（接真實 Redis）
npm run test:integration:app # UI 元件測試
npm run test:e2e            # e2e 測試（Playwright，需要真實 Redis）
npm test                    # 全部跑一遍
```

## 手動模擬完整拍賣流程

用 `tools/fake-auction.ts` 互動式模擬拍賣現場、驗證完整拍賣流程，見 [`docs/fake-auction.md`](docs/fake-auction.md)。

## 部署

部署平台、CD 流程、針對已部署環境模擬（`--remote`）、重置已部署環境狀態等說明，見 [`docs/deploy.md`](docs/deploy.md)。
