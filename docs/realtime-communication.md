# 即時通訊（WebSocket）

## itemId 傳遞方式

對應 commit history（從新到舊）：

- goos-ts [`149d80a`](https://github.com/titangene/goos-ts/commit/149d80aa86c77de83e3942198003a0e7d66d1979)（對應 goos-java [`fba009d1`](https://github.com/titangene/goos-java/commit/fba009d197e0039b7a8a1845b56606cdde124568)）`red` ［11.2.4 p100］
  - 決定 itemId 走 URL query string，不走 runtime config
    - runtime config 是整個 server process 共用的靜態設定，itemId 是這個連線/這個 session 各自不同的值，放進共用設定會在並發連線下互相衝突
    - itemId 透過 URL query string 傳遞：
      - Vue page 用 `useRoute().query.itemId` 讀出來，建立 WebSocket 連線時帶在 URL query 上
      - server 端的 WebSocket handler 從這個連線自己的 request URL 取得 itemId
    - 之所以選 URL 而非其他機制：itemId 未來會被 UI 輸入框取代，URL 是跟這個未來方向同一個層級的機制，不需要屆時整個搬家

## WebSocket route 設計

對應 commit history（從新到舊）：

- goos-ts [`149d80a`](https://github.com/titangene/goos-ts/commit/149d80aa86c77de83e3942198003a0e7d66d1979)（對應 goos-java [`fba009d1`](https://github.com/titangene/goos-java/commit/fba009d197e0039b7a8a1845b56606cdde124568)）`red` ［11.2.4 p100］
  - 決定 `Main.ts` 對應邏輯放在 `server/routes/` 的 WebSocket handler，而非 `server/plugins`
    - 理由：`nuxt.config.ts` 已開啟 `nitro.experimental.websocket`；WebSocket 的 `open(peer)` hook 每次新連線觸發一次，時機上對應 Java 版「每次啟動一個 sniper 實例 = 每個 session 各自建立一次連線」的語意，不對應「整個 server 開機做一次」的 `server/plugins`
    - 已實作為 `server/routes/auction-sniper.ts`：`open(peer)` 內用 `useRuntimeConfig()` 讀 XMPP credentials，用 `new URL(peer.request.url).searchParams.get('itemId')` 讀這次連線帶的 itemId
    - 檔名/路徑使用 kebab-case，見 [`docs/naming-conventions.md`：WebSocket route 檔名使用 kebab-case](./naming-conventions.md#websocket-route-檔名使用-kebab-case)

## Vue 端連接 WebSocket 的方式

對應 commit history（從新到舊）：

- goos-ts [`149d80a`](https://github.com/titangene/goos-ts/commit/149d80aa86c77de83e3942198003a0e7d66d1979)（對應 goos-java [`fba009d1`](https://github.com/titangene/goos-java/commit/fba009d197e0039b7a8a1845b56606cdde124568)）`red` ［11.2.4 p100］
  - 決定 Vue page 在 `<script setup>` 頂層用 VueUse 的 `useWebSocket()` 建立連線，不手動包 `onMounted()`
    - Vue page 用 `useRoute().query.itemId` 讀自己頁面 URL 上的 itemId，組成帶 itemId query 的 WS URL 傳給 `useWebSocket()`
    - 已核對 `node_modules/@vueuse/core/dist/index.js`：`useWebSocket()` 內部 `open()` 一開始就檢查 `if (!isClient && !isWorker) return`，才會執行 `new WebSocket(...)`，本身已是 SSR 安全，不需要像原生 `WebSocket` 那樣額外包 `onMounted()`
    - 因為 itemId 跟著這次連線的 URL 走，不是共用狀態，所以每次頁面掛載 = 每次新建 WebSocket 連線 = server 端每次都是新的 `open(peer)` 呼叫 = 每次都會建立新的 XMPP 連線，天然滿足「每次開啟網頁都建立新連線」的需求，不需要額外的機制

## 缺少 itemId 時的處理

對應 commit history（從新到舊）：

- goos-ts [`149d80a`](https://github.com/titangene/goos-ts/commit/149d80aa86c77de83e3942198003a0e7d66d1979)（對應 goos-java [`fba009d1`](https://github.com/titangene/goos-java/commit/fba009d197e0039b7a8a1845b56606cdde124568)）`red` ［11.2.4 p100］
  - 決定此階段不實作缺少 itemId 的防呆
    - `peer.close(code, "Missing itemId")` 這類防呆屬於超前於目前 baby step 的工程，且未來會被刪除，不符合 XP 簡單設計
    - 已實作為 `server/routes/auction-sniper.ts` 用 `searchParams.get('itemId')!` non-null assertion，不做額外檢查
