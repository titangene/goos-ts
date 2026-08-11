# 手動模擬完整拍賣流程

`tools/fake-auction.ts` 是一個互動式的假拍賣現場，用跟 `test/e2e/RedisFakeAuctionServer.ts` 一樣的協定（Redis Pub/Sub + SOL 純文字格式）訂閱 `auction:<itemId>:commands`、發布到 `auction:<itemId>:events`，讓你在終端機手動打指令、即時觀察 app 畫面的反應。

**1. 確認 Redis 跟 app 都已啟動**（見 [README](../README.md)「環境需求」「開發」或「建置與正式執行」）。

**2. 開一個新的終端機分頁，啟動假拍賣現場（扮演 `item-54321` 的賣家）：**

```bash
npm run fake-auction -- item-54321
```

會印出 `Selling item item-54321 on redis://localhost:6379. Waiting for a sniper to join...`

**3. 回到瀏覽器**，在 Item Id 欄位填 `item-54321`、Stop Price 欄位填一個數字（例如 `100`），按 **Join**。假拍賣現場那邊的終端機會印出 `Sniper joined: sniper`，代表連上了。畫面則會多一列，State 為 **Joining**。

**4. 模擬別人喊價**，在 `fake-auction` 的終端機輸入：

```
price 90 5 other bidder
```

畫面 State 應該變成 **Bidding**（90 沒超過停止價 100，`AuctionSniper` 會自動幫你出價 `90+5=95`），終端機也會印出收到的訊息 `< received: Bid 95 from sniper`。

**5. 模擬你出的價成交**（把價格回報成你剛剛出的價、bidder 標成你自己）：

```
price 95 10 sniper
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
