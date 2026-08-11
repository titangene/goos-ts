# goos-ts

Auction Sniper — TypeScript + Nuxt + MQTT + WebSocket 版本，改寫自 [Growing Object-Oriented Software, Guided by Tests](https://www.growing-object-oriented-software.com/) 書中的 Java 範例。

## 與 Java 版本的比較

《GOOS》原書 Java 版原始碼：[sf105/goos-code](https://github.com/sf105/goos-code)（`master` 分支）。刻意的協定/domain 層差異見 [`docs/differences-from-java.md`](docs/differences-from-java.md)，Java 語言機制（enum 多型、巢狀類別、checked exception…）沒有 TS 對應物的部分見 [`docs/java-to-typescript-language-notes.md`](docs/java-to-typescript-language-notes.md)。

### 使用技術比較

| 項目              | 《GOOS》Java 版                                                         | goos-ts（本專案）                                                                                       |
| ----------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 語言              | Java                                                                    | TypeScript                                                                                              |
| UI                | Swing（桌面 GUI）                                                       | Vue 3 + Nuxt 4（瀏覽器）                                                                                |
| 拍賣訊息協定      | XMPP（Smack library，需搭配 Openfire server）                           | MQTT（`mqtt` client，需搭配 Mosquitto broker，見 [ADR-0002](docs/adr/ADR-0002-mqtt-replaces-redis.md)） |
| UI 即時更新機制   | `SwingThreadSniperListener`（`SwingUtilities.invokeLater` 切回 EDT）    | WebSocket（`server/routes/ws.ts` 推送到瀏覽器）                                                         |
| 建置工具          | Ant（`build.xml`）                                                      | npm scripts + Nuxt/Vite                                                                                 |
| 依賴管理          | 手動管理 `lib/` 下的 jar 檔                                             | npm（`package.json`）                                                                                   |
| 單元測試框架      | JUnit 4                                                                 | Vitest                                                                                                  |
| Mock/Stub         | jMock 2                                                                 | Vitest 內建 `vi.fn()` / `vi.spyOn()`                                                                    |
| Matcher           | Hamcrest                                                                | Vitest 內建 `expect`                                                                                    |
| 整合測試          | `test/integration`（Swing `MainWindow`、XMPP `XMPPAuctionHouse`）       | `test/integration`（Nuxt app、MQTT `MqttAuctionHouse`），另加 `test/integration/app`                    |
| End-to-end 測試   | `test/end-to-end`（`ApplicationRunner` + WindowLicker 驅動 Swing 元件） | `test/e2e`（Playwright 驅動瀏覽器）                                                                     |
| 假拍賣現場        | `FakeAuctionServer.java`（連 XMPP）                                     | `test/e2e/FakeAuctionServer.ts` + `tools/fake-auction.ts`（連 MQTT）                                    |
| CI 測試用依賴服務 | Openfire（XMPP server）                                                 | Mosquitto（CI 用自建 image 啟動，見 [ADR-0005](docs/adr/ADR-0005-ci-local-dev-workflow.md)）            |

### 專案結構比較

| 用途                 | 《GOOS》Java 版                                                                                   | goos-ts（本專案）                                                                                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 拍賣領域核心邏輯     | `src/auctionsniper/*.java`（`AuctionSniper`、`SniperState`、`SniperPortfolio`…）                  | `server/auctionsniper/*.ts`                                                                                                                                                                                |
| 使用者需求輸入       | `src/auctionsniper/UserRequestListener.java`                                                      | `server/auctionsniper/UserRequestListener.ts`                                                                                                                                                              |
| 程式進入點           | `src/auctionsniper/Main.java`                                                                     | `server/plugins/init-sniper-launcher.ts`（啟動）+ `server/routes/ws.ts`（即時通道）+ `server/api/*`（HTTP API）                                                                                            |
| UI 元件              | `src/auctionsniper/ui/*.java`（`MainWindow`、`SnipersTableModel`、`Column`）                      | `app/pages/index.vue`、`app/components/SnipersTable.vue`（畫面）；`server/auctionsniper/ui/*.ts`（`SnipersTableModel`、`Column`，跟 Java 同樣同目錄互相依賴）+ `shared/types.ts`（前後端共用的 wire 格式） |
| 訊息協定實作         | `src/auctionsniper/xmpp/*.java`（`XMPPAuction`、`XMPPAuctionHouse`、`AuctionMessageTranslator`…） | `server/auctionsniper/mqtt/*.ts`（`MqttAuction`、`MqttAuctionHouse`、`AuctionMessageTranslator`…，逐檔對照 Java 版，見 [`docs/differences-from-java.md`](docs/differences-from-java.md)）                  |
| 共用工具             | `src/auctionsniper/util/*.java`（`Announcer`、`Defect`）                                          | `server/auctionsniper/util/*.ts`                                                                                                                                                                           |
| 單元測試             | `test/unit/test/auctionsniper/**`                                                                 | `test/unit/**`                                                                                                                                                                                             |
| 整合測試             | `test/integration/test/integration/auctionsniper/**`                                              | `test/integration/**`                                                                                                                                                                                      |
| E2E 測試             | `test/end-to-end/test/endtoend/auctionsniper/**`                                                  | `test/e2e/**`                                                                                                                                                                                              |
| 手動模擬拍賣現場工具 | 無對應（僅有測試用的 `FakeAuctionServer.java`）                                                   | `tools/fake-auction.ts`（互動式，另見下方「手動模擬完整拍賣流程」）                                                                                                                                        |
| 建置設定             | `build.xml`（Ant）、`.classpath`（Eclipse）                                                       | `package.json`、`nuxt.config.ts`、`tsconfig.json`、`vite`（透過 Nuxt）                                                                                                                                     |

## 環境需求

- Node.js
- Mosquitto（本機或 Docker 皆可）

啟動 Mosquitto：

```bash
./mosquitto/start.sh
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
npm run test:integration    # 整合測試（接真實 Mosquitto）
npm run test:integration:app # UI 元件測試
npm run test:e2e            # e2e 測試（Playwright，需要真實 Mosquitto）
npm test                    # 全部跑一遍
```

## 手動模擬完整拍賣流程

用 `tools/fake-auction.ts` 互動式模擬拍賣現場、驗證完整拍賣流程，見 [`docs/fake-auction.md`](docs/fake-auction.md)。

## 部署

部署平台、CD 流程、針對已部署環境模擬（`--remote`）、重置已部署環境狀態等說明，見 [`docs/deploy.md`](docs/deploy.md)。
