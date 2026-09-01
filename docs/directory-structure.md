# 目錄結構

## 目錄結構

```
server/
  auctionSniper/
    main.ts
    xmpp/
      smack/
        ...（Smack 相容介面 wrapper，見 docs/xmpp.md：Smack 相容介面封裝）
  routes/
    auction-sniper.ts（WebSocket route，見 docs/naming-conventions.md：WebSocket route 檔名使用 kebab-case）
```

對應 commit history（從新到舊）：

- goos-ts [`28fec26d`](https://github.com/titangene/goos-ts/commit/28fec26d4fd3c31432c3925df489d28031d59677)（goos-java 無對應 commit，屬於架構方向決策）`red` ［11.2.1 p96］
  - 決定 `server/auctionSniper/` 為主要目錄，不建立 `shared/`
    - `server/auctionSniper/` 資料夾使用 camelCase
    - 理由：大部分實作只由 server side 使用，client side 不會用到
    - 例外：goos-code 的 [`src/auctionsniper/ui/`](https://github.com/titangene/goos-code/blob/312167f704c202527a3dbdf2ed6892d293d9bc04/src/auctionsniper/ui) 這類 UI 層，未來若真的需要 client/server 共用，屆時再視需要調整目錄結構
    - 相關：[`docs/xmpp.md`：Smack 相容介面封裝](./xmpp.md#smack-相容介面封裝)、[`docs/naming-conventions.md`：WebSocket route 檔名使用 kebab-case](./naming-conventions.md#websocket-route-檔名使用-kebab-case)

## 對 poc 既有結構的分析

- 符合業界慣例之處：依領域分資料夾（vertical slice / package-by-feature）、一個檔案一個職責
- 需要重新評估之處：`smack/` 底下複刻 Smack 類別命名這件事，原本評估為「不必要地複刻另一個函式庫的物件模型」，但依 [`docs/xmpp.md`：Smack 相容介面封裝](./xmpp.md#smack-相容介面封裝) 記錄的決策，若 `poc` 這麼做的動機同樣是做一層 Smack 相容 shim，方向其實是合理的，只是實際內容仍不可直接沿用，需要依 skill 方法論重新推導
