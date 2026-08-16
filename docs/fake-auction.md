# 手動模擬完整拍賣流程

`tools/fake-auction.ts` 是一個互動式的假拍賣現場，用 xmpp.js 連 Prosody，扮演拍賣現場跟 `server/auctionsniper/xmpp/*` 手動對打。

輸入格式是 SOL 訊息本身的內容，只省略固定不變的 `SOLVersion: 1.1; ` 前綴（工具會自動幫你補上），例如輸入 `Event: CLOSE;` 實際發出的就是 `SOLVersion: 1.1; Event: CLOSE;`。

## Bidder 欄位的正確寫法

身分識別是**含 resource 的完整 JID**（例如 `sniper@localhost/Auction`）——這對照 Java 原始碼 `XMPPAuction.java` 的 `connection.getUser()`，兩者行為一致，不是 TS port 的落差。

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

**1. 確認本機 Prosody 已啟動**（見 [README](../README.md)「環境需求」「開發」或「建置與正式執行」）。

**2. 開一個新的終端機分頁，啟動假拍賣現場（扮演 `item-54321` 的賣家）：**

```bash
npm run fake-auction -- item-54321
```

會印出 `Selling item item-54321 as auction-item-54321@localhost/Auction on ws://localhost:5280/xmpp-websocket. Waiting for a sniper to join...`

**3. 回到瀏覽器**，在 Item Id 欄位填 `item-54321`、Stop Price 欄位填一個數字（例如 `100`），按 **Join**。假拍賣現場那邊的終端機會印出 `Sniper joined: sniper@localhost/Auction`，代表連上了。畫面則會多一列，State 為 **Joining**。

**4. 模擬別人喊價**，在 `fake-auction` 的終端機輸入：

```
Event: PRICE; CurrentPrice: 90; Increment: 5; Bidder: other bidder;
```

畫面 State 應該變成 **Bidding**（90 沒超過停止價 100，`AuctionSniper` 會自動幫你出價 `90+5=95`），終端機也會印出收到的訊息 `< received: Bid 95 from sniper@localhost/Auction`。

**5. 模擬你出的價成交**（把價格回報成你剛剛出的價、`Bidder` 標成你自己的完整 JID）：

```
Event: PRICE; CurrentPrice: 95; Increment: 10; Bidder: sniper@localhost/Auction;
```

State 應該變成 **Winning**。

用 `npm run fake-auction:remote`（見 [`deploy.md`](deploy.md)「針對已部署環境模擬」）連已部署的 Prosody 時，JID 的 domain 要換成 `.env.local` 裡的 `XMPP_DOMAIN`，不是 `localhost`。例如 `XMPP_DOMAIN=goos-ts-xmpp-prosody.onrender.com` 時：

```
Event: PRICE; CurrentPrice: 95; Increment: 10; Bidder: sniper@goos-ts-xmpp-prosody.onrender.com/Auction;
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

想同時跑 `item-65432` 那組流程，開另一個終端機分頁執行 `npm run fake-auction -- item-65432`，瀏覽器那邊也輸入對應的 item id 加入即可，兩組可以同時跑，互不影響。
