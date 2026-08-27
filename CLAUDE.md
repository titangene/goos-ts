# goos-ts

參考 [GOOS（Growing Object-Oriented Software, Guided by Tests）](https://www.growing-object-oriented-software.com/) 書中的 Auction Sniper 範例，用 TypeScript + Nuxt 重新刻一次。

## TDD commit message 格式

照書中章節逐步先寫 test code 再寫 production code，commit message 用 Conventional Commits，格式：

```
test(<scope>): red - <測試案例名稱> [<書中出處>]
feat(<scope>): green - <測試案例名稱> [<書中出處>]
refactor(<scope>): <重構描述> [<書中出處>]
```

- `<scope>`：測試層級（`unit`/`integration`/`e2e`）或模組名（`ui`/`server`/`xmpp`...），哪個對這次改動更有辨識度就用哪個；跨很多模組時整個 scope 省略
- `<書中出處>`：章節（`ch10`）、小節（`3.6`）、頁碼（`p42`）可以視情況組合，例如 `[3.6]`、`[p42]`、`[ch10 p85]`、`[3.6 p42]`，代表這個 commit 的內容涵蓋到書中這個章節/頁碼為止（不是精確定位在單一段落）

範例：

```
test(e2e): red - sniperJoinsAuctionUntilAuctionCloses [3.6]
feat(e2e): green - sniperJoinsAuctionUntilAuctionCloses [3.6]
refactor(ui): extract AuctionEventListener [p42]
test(e2e): red - sniperJoinsAuctionUntilAuctionCloses [ch10 p85]
test(e2e): red - sniperJoinsAuctionUntilAuctionCloses [11.2.1 p96]
```

如果使用者貼了書中內文當補充說明，body 不要照抄，改成精簡摘要，且**只能用英文，不能出現中文字**（避免混用中英文的怪 commit）。
