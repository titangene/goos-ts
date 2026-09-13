# 手動模擬 Sniper 加入拍賣、拍賣結束

`tools/fake-auction.ts` 是一個互動式的假拍賣工具，用 xmpp.js 連本機 Prosody，扮演賣家跟 `server/auctionSniper/xmpp/smack/*` 手動互動。

## 目前的實作範圍

main 分支目前只做到 Ch11（11.2.4）：sniper 送出的 JOIN 訊息、fake auction 送回的訊息都沒有內容（`XMPPMessage` 是空殼 class），sniper 端也還沒解析訊息內容，只要收到任何一則訊息就會顯示 `Lost`（見 [`docs/xmpp.md`：Smack 相容介面封裝](./xmpp.md#smack-相容介面封裝)）。

因此這支工具目前只支援兩個指令：

- `close`：模擬拍賣結束，讓 sniper 顯示 `Lost`
- `quit`：中斷連線並結束程式

還沒有 SOL 訊息解析、`Item Id`/`Stop Price` 表單欄位、`PRICE` 出價、`Won`/`Winning`/`Bidding`/`Losing` 等狀態，等 main 分支的 TDD 進度補上對應功能後再擴充本文件與這支工具的指令。

## 步驟

**1. 確認本機 Prosody 已啟動**（見 [README](../README.md)「環境需求」）。

**2. 開一個新的終端機分頁，啟動假拍賣工具（扮演 `item-54321` 的賣家）：**

```bash
npm run fake-auction -- item-54321
```

會印出：

```
Selling item item-54321 as auction-item-54321 on ws://localhost:5280/xmpp-websocket.
Waiting for a sniper to join...

Commands:
  "close" (end the auction, sniper shows "Lost")
  "quit" (disconnect and exit)
```

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
> tsx tools/fake-auction.ts item-54321

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
