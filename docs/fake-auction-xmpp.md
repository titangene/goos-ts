# 手動模擬完整拍賣流程（XMPP 版）

`tools/fake-auction-xmpp.ts` 是 [`tools/fake-auction.ts`](../tools/fake-auction.ts)（Redis 版）的 XMPP 對應版本，用 xmpp.js 連 Prosody，扮演拍賣現場跟 `server/auctionsniper/xmpp/*` 手動對打，協定內容（SOL 純文字格式）跟 Redis 版完全一樣，差別只在身分識別的格式（見下方「Bidder 欄位的正確寫法」）。

輸入格式是 SOL 訊息本身的內容，只省略固定不變的 `SOLVersion: 1.1; ` 前綴（工具會自動幫你補上），例如輸入 `Event: CLOSE;` 實際發出的就是 `SOLVersion: 1.1; Event: CLOSE;`。

**這是實驗性路徑**（見 [ADR-0008](adr/ADR-0008-xmpp-server-selection.md)/[ADR-0011](adr/ADR-0011-xmpp-client-library-selection-xmpp-js.md)），要先把 app 的 production wiring 切到 XMPP（目前預設是 Redis，見 [ADR-0002](adr/ADR-0002-transport-selection.md)）才能照下面的步驟操作。

## Bidder 欄位的正確寫法

Redis 版的身分識別就是純登入字串（例如 `sniper`），XMPP 版則是**含 resource 的完整 JID**（例如 `sniper@localhost/Auction`）——這對照 Java 原始碼 `XMPPAuction.java` 的 `connection.getUser()`，兩者行為一致，不是 TS port 的落差。

模擬「別人喊價」時，`Bidder` 欄位可以隨便填一個不是你自己 JID 的字串（例如 `other bidder`）。但模擬「自己出的價成交」時，`Bidder` 欄位**必須填完整 JID**，格式是：

```
<你在 /api/join 或畫面上填的 sniperId>@<XMPP_DOMAIN>@Auction
```

本機預設（`XMPP_DOMAIN=localhost`）、sniperId 是 `sniper` 時就是：

```
sniper@localhost/Auction
```

只填 `sniper`（不含 `@localhost/Auction`）會被判定成別人出的價（`FromOtherBidder`），導致 sniper 誤判成 `Losing` 而不是預期的 `Winning`（`SniperSnapshot.losing()` 不會更新 `lastBid`，會沿用前一步 `bidding()` 算出的值，此時 `lastPrice` 跟 `lastBid` 會剛好相等，是這個誤判常見的識別特徵）。

## 步驟

**1. 確認本機 Prosody 已啟動**，且 app 已切到 XMPP wiring（見 [README](../README.md)「XMPP 實驗版本（poc）」）。

**2. 開一個新的終端機分頁，啟動假拍賣現場（扮演 `item-54321` 的賣家）：**

```bash
npm run fake-auction:xmpp -- item-54321
```

會印出 `Selling item item-54321 as auction-item-54321@localhost/Auction on ws://localhost:5280/xmpp-websocket. Waiting for a sniper to join...`

**3. 回到瀏覽器**，在 Item Id 欄位填 `item-54321`、Stop Price 欄位填一個數字（例如 `100`），按 **Join**。假拍賣現場那邊的終端機會印出 `Sniper joined: sniper@localhost/Auction`，代表連上了。畫面則會多一列，State 為 **Joining**。

**4. 模擬別人喊價**，在 `fake-auction:xmpp` 的終端機輸入：

```
Event: PRICE; CurrentPrice: 90; Increment: 5; Bidder: other bidder;
```

畫面 State 應該變成 **Bidding**（90 沒超過停止價 100，`AuctionSniper` 會自動幫你出價 `90+5=95`），終端機也會印出收到的訊息 `< received: Bid 95 from sniper@localhost/Auction`。

**5. 模擬你出的價成交**（把價格回報成你剛剛出的價、`Bidder` 標成你自己的完整 JID）：

```
Event: PRICE; CurrentPrice: 95; Increment: 10; Bidder: sniper@localhost/Auction;
```

State 應該變成 **Winning**。

**6. 模擬別人加價超過你的停止價，讓你輸掉：**

```
Event: PRICE; CurrentPrice: 105; Increment: 5; Bidder: other bidder;
```

105 超過停止價 100，`AuctionSniper` 不會再出價，State 會變 **Losing**。

**7. 結束拍賣：**

```
Event: CLOSE;
```

目前是 Winning 就會變 **Won**，是 Losing 就會變 **Lost**。

**8. 結束假拍賣現場：**

```
quit
```

想同時跑 `item-65432` 那組流程，開另一個終端機分頁執行 `npm run fake-auction:xmpp -- item-65432`，瀏覽器那邊也輸入對應的 item id 加入即可，兩組可以同時跑，互不影響。
