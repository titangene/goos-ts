# 手動模擬 Sniper 加入拍賣、拍賣結束

`tools/fake-auction.ts` 是一個互動式的假拍賣工具，用 xmpp.js 連 Prosody（`npm run fake-auction` 連本機，`npm run fake-auction:remote` 連已部署的服務），扮演賣家跟 `server/auctionSniper/xmpp/smack/*` 手動互動。

## 目前的實作範圍

main 分支目前只做到 Ch11（11.2.4）：sniper 送出的 JOIN 訊息、fake auction 送回的訊息都沒有內容（`XMPPMessage` 是空殼 class），sniper 端也還沒解析訊息內容，只要收到任何一則訊息就會顯示 `Lost`（見 [`docs/xmpp.md`：Smack 相容介面封裝](./xmpp.md#smack-相容介面封裝)）。

因此這支工具目前只支援兩個指令：

- `close`：模擬拍賣結束，讓 sniper 顯示 `Lost`
- `quit`：中斷連線並結束程式

還沒有 SOL 訊息解析、`Item Id`/`Stop Price` 表單欄位、`PRICE` 出價、`Won`/`Winning`/`Bidding`/`Losing` 等狀態，等 main 分支的 TDD 進度補上對應功能後再擴充本文件與這支工具的指令。

## 步驟

**1. 確認本機 Prosody 已啟動**（見 [README](../README.md)「環境需求」）。

**2. 開一個新的終端機分頁，啟動假拍賣工具（扮演 `item-54321` 的賣家）：**

要連本機的 Prosody 執行：

```bash
npm run fake-auction -- item-54321
```

會印出：

```
> fake-auction
> tsx --env-file=.env.dev.local tools/fake-auction.ts item-54321

Selling item item-54321 as auction-item-54321 on ws://localhost:5280/xmpp-websocket.
Waiting for a sniper to join...

Commands:
  "close" (end the auction, sniper shows "Lost")
  "quit" (disconnect and exit)
```

要連已部署到 Render 的 Prosody（見 [`docs/deploy.md`](deploy.md)）而不是本機，改用：

```bash
npm run fake-auction:remote -- item-54321
```

`tools/fake-auction.ts` 一律讀取 `process.env.NUXT_PUBLIC_XMPP_SERVICE_URL`（跟 Nuxt server production 用的是同一個環境變數，見 [`docs/deploy.md`：Nuxt server 如何讀取這些環境變數](deploy.md#nuxt-server-如何讀取這些環境變數)），兩個 npm script 各自讀不同的 env 檔：

- `fake-auction`：`--env-file=.env.dev.local`
- `fake-auction:remote`：`--env-file=.env.production.local`

**3. 另開一個終端機分頁啟動 Nuxt server：**

```bash
npm run dev
```

**4. 用瀏覽器打開** `http://localhost:3000/?itemId=item-54321`（目前畫面沒有 `Item Id` 輸入欄位，`itemId` 要直接帶在網址上，見 [`app/pages/index.vue`](../app/pages/index.vue)）。

畫面會顯示 `Joining`，`fake-auction` 的終端機會印出 `> Sniper joined the auction.`，代表 sniper 已經送出 JOIN 訊息並連上了。

**5. 模擬拍賣結束**，在 `fake-auction` 的終端機輸入：

```
close
```

畫面應該會變成 `Lost`，終端機也會印出 `> sent: auction closed`。

**6. 結束假拍賣工具：**

```
quit
```

以下是跑過 `npm run fake-auction` 以上流程的 console：

```
$ npm run fake-auction -- item-54321

> fake-auction
> tsx --env-file=.env.dev.local tools/fake-auction.ts item-54321

Selling item item-54321 as auction-item-54321 on ws://localhost:5280/xmpp-websocket.
Waiting for a sniper to join...

Commands:
  "close" (end the auction, sniper shows "Lost")
  "quit" (disconnect and exit)

> Sniper joined the auction.

>>> close
> sent: auction closed

>>> quit
```
