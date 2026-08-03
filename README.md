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

`tools/fake-auction.ts` 是一個互動式的假拍賣現場，用跟 `test/e2e/FakeAuctionServer.ts` 一樣的協定（Redis pub/sub + JSON）登入 `auction-<itemId>` 這個 topic，讓你在終端機手動打指令、即時觀察 app 畫面的反應。

**1. 確認 Redis 跟 app 都已啟動**（見上方「環境需求」「開發」或「建置與正式執行」）。

**2. 開一個新的終端機分頁，啟動假拍賣現場（扮演 `item-54321` 的賣家）：**

```bash
npm run fake-auction -- item-54321
```

會印出 `Logged in as auction-item-54321. Waiting for a sniper to join...`

**3. 回到瀏覽器**，在 Item Id 欄位填 `item-54321`、Stop Price 欄位填一個數字（例如 `100`），按 **Join**。假拍賣現場那邊的終端機會印出 `Sniper joined: sniper@localhost`，代表連上了。畫面則會多一列，State 為 **Joining**。

**4. 模擬別人喊價**，在 `fake-auction` 的終端機輸入：

```
price 90 5 other bidder
```

畫面 State 應該變成 **Bidding**（90 沒超過停止價 100，`AuctionSniper` 會自動幫你出價 `90+5=95`），終端機也會印出收到的訊息 `< received: Bid 95 from sniper@localhost`。

**5. 模擬你出的價成交**（把價格回報成你剛剛出的價、bidder 標成你自己）：

```
price 95 10 sniper@localhost
```

State 應該變成 **Winning**。

**6. 模擬別人加價超過你的停止價，讓你輸掉：**

```
price 105 5 other bidder
```

105 超過停止價 100，`AuctionSniper` 不會再出價，State 會變 **Losing**。

**7. 結束拍賣：**

```
close
```

目前是 Winning 就會變 **Won**，是 Losing 就會變 **Lost**。

**8. 結束假拍賣現場：**

```
quit
```

想同時跑 `item-65432` 那組流程，開另一個終端機分頁執行 `npm run fake-auction -- item-65432`，瀏覽器那邊也輸入對應的 item id 加入即可，兩組可以同時跑，互不影響。

### 針對已部署環境模擬（`--remote`）

如果要驗證部署到雲端（例如 Render）的環境能不能跑完整拍賣流程，`tools/fake-auction.ts` 支援 `--remote` 參數，改連 `REDIS_URL` 環境變數指定的 Redis，而不是本機 Redis：

**1. 複製 `.env.example` 成 `.env.local`，填入部署環境的 Redis 連線字串**（例如 Render Key Value 的 External Key Value URL）：

```bash
cp .env.example .env.local
```

```
REDIS_URL=rediss://<user>:<password>@<host>:<port>
```

`.env.local` 已被 `.gitignore` 排除，不會進版控。

**2. 啟動假拍賣現場，連到部署環境的 Redis：**

```bash
npm run fake-auction:remote -- item-54321
```

**3. 打開部署環境的網址**，後續操作跟上面「手動模擬完整拍賣流程」步驟 3～8 完全一樣。

> 若 Redis 服務有限制外部連線來源（例如 Render Key Value 預設關閉外部流量），需要先到該服務的 Networking 設定加入你的公網 IP 白名單，才能連得上。
