# goos-ts

參考 [GOOS（Growing Object-Oriented Software, Guided by Tests）](https://www.growing-object-oriented-software.com/) 書中的 Auction Sniper 範例，用 TypeScript + Nuxt 重新刻一次。

## TDD commit message 格式

照書中章節逐步先寫 test code 再寫 production code，commit message 用 Conventional Commits，格式：

```
test(<scope>): red - <紅燈描述> [<書中出處>]
feat(<scope>): green - <綠燈描述> [<書中出處>]
refactor(<scope>): <重構描述> [<書中出處>]
```

- `<scope>`：測試層級（`unit`/`integration`/`e2e`）或模組名（`ui`/`api`/`redis`...），哪個對這次改動更有辨識度就用哪個；跨很多模組時整個 scope 省略
- `<紅燈描述>`/`<綠燈描述>`：精簡描述這次紅燈/綠燈的重點，不是完整測試方法名稱（完整測試方法名稱長，放進 subject 容易超過 Conventional Commits 建議的 50～72 字元上限）
- `<書中出處>`：章節（`ch10`）、小節（`3.6`）、頁碼（`p42`）可以視情況組合，例如 `[3.6]`、`[p42]`、`[ch10 p85]`、`[3.6 p42]`，代表這個 commit 的內容涵蓋到書中這個章節/頁碼為止（不是精確定位在單一段落）

`test`/`feat` 的 commit body 一定要加一行 `Test case: <測試案例名稱>`，補上被 subject 省略的完整測試方法名稱：

```
Test case: sniperJoinsAuctionUntilAuctionCloses
```

範例：

```
test(e2e): red - missing "Lost" status on close [11.2.1 p96]

Test case: sniperJoinsAuctionUntilAuctionCloses
```

```
feat(e2e): green - shows "Lost" when auction closes [11.2.4 p102]

Test case: sniperJoinsAuctionUntilAuctionCloses
```

```
refactor(ui): extract AuctionEventListener [p42]
```

如果使用者貼了書中內文當補充說明，body 除了 `Test case:` 那行以外，不要照抄書中內文，改成精簡摘要，且**只能用英文，不能出現中文字**（避免混用中英文的怪 commit）。
