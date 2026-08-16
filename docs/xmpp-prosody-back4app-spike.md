# XMPP 佈署 spike：Back4app Containers + Prosody

這份文件記錄實際把 Prosody（XMPP server）部署到 [Back4app Containers](https://containers.back4app.com/) 免費方案、驗證 WebSocket 連線可行的完整過程，包含途中實測抓到的三個 bug 與修法。目的是驗證 [ADR-0010](adr/ADR-0010-xmpp-deployment-platform.md) 選擇 Back4app 的可行性，這是一次性的驗證紀錄，不是常態維護的部署文件（常態部署文件見 [`deploy.md`](deploy.md)，那份記錄的是 Nuxt server + Redis 在 Render 的部署）。

檔案放在 `poc/spikes/prosody-back4app/`，跟 `server/`、`tools/` 等正式程式碼目錄分開，因為這是佈署平台可行性驗證，不是應用程式邏輯本身。

## 前提

- 帳號：Back4app（免信用卡）、GitHub（授權 Back4app 讀取 repo）。
- 這次驗證的目標只有「Prosody 能不能在 Back4app 免費方案上跑起來、外部能不能透過 WebSocket 連上」，不含完整的帳號白名單模型或 Nuxt server 整合——那些留給 [ADR-0008](adr/ADR-0008-xmpp-server-selection.md) 之後的正式實作。

## 部署設定

### `Dockerfile`

沿用官方 `prosodyim/prosody:13.0` image，只做兩件事：

1. 覆寫 `/etc/prosody/prosody.cfg.lua`（見下方「bug 2」）。
2. 覆寫 entrypoint，在啟動時自動註冊 [ADR-0003](adr/ADR-0003-username-only-identity.md) 白名單的三個帳號（`sniper`/`sniper`、`auction-item-54321`/`auction`、`auction-item-65432`/`auction`），取代官方 image 只能透過 `LOCAL`/`PASSWORD`/`DOMAIN` 三個環境變數註冊「單一」帳號的限制。

### Back4app Dashboard 設定

- **Deployment 方式**：Back4app Containers 只支援「連接 GitHub repo + repo 裡要有 Dockerfile」，不支援直接指定 Docker Hub image（跟 Zeabur/Koyeb 不同）。
- **Root Directory**：`spikes/prosody-back4app`（Back4app 支援 monorepo 指定子目錄當 build context）。
- **Port**：`5280`（見下方「bug 2」，這不是原生 XMPP TCP port，是 Prosody 的明文 HTTP port）。
- **Environment Variables**：
  - `PROSODY_ENABLE_MODULES=websocket`——啟用 `mod_websocket`（官方預設設定檔裡這個模組是註解掉的）。
  - `PROSODY_VIRTUAL_HOSTS=<Back4app 配的網域>`——見下方「bug 3」。

## 實測抓到的三個 bug

### bug 1：Back4app 的「Port」設定不是直接對外開放的 port

一開始以為 Back4app Dashboard 的「Port」欄位是「對外開放這個 port」，於是設成 Prosody 的 HTTPS port（5281）。結果部署健康檢查一直卡在：

```
CHECKING HEALTH...
trying to hit the 5281 port using http
it looks that no process is listening to the 5281 port using http
```

用 `curl`/`openssl s_client` 直接連 `<domain>:5281` 完全連不上（連線 timeout），但連 `<domain>:443`（預設 port）可以正常握手、拿到 `CN=*.b4a.run` 的憑證。

**結論**：Back4app（像大多數 PaaS）自己在邊界用 CloudFront 做 TLS termination，公開網域只對外開放 443；Dashboard 設定的「Port」是「他們的 reverse proxy 用明文 HTTP 連到 container 內部哪個 port」，不是把那個 port 直接開放給外部連線。所以健康檢查本身也是用明文 HTTP 打這個內部 port，不是 HTTPS。改成指向 Prosody 的明文 HTTP port（5280）才對。

### bug 2：Prosody 明文 HTTP 介面預設只綁 localhost

改成 Port 5280 後，健康檢查一樣失敗。查 container 日誌：

```
portmanager error Failed to open server port 5280 on ::1, Cannot assign requested address
portmanager info Activated service 'http' on [127.0.0.1]:5280
portmanager info Activated service 'https' on [::]:5281, [*]:5281
```

`http`（5280）只綁 `127.0.0.1`（IPv4 loopback），`https`（5281）綁的是萬用位址 `[*]:5281`。查證 [Prosody 官方文件](https://prosody.im/doc/ports)確認這是**刻意的安全預設**：

> The HTTP port... now listens on localhost by default, because it is unencrypted... `http_interfaces = { "127.0.0.1", "::1" }`

要對外開放明文 HTTP，需要在設定檔的 global 區塊（任何 `VirtualHost` 之前）明確加：

```lua
http_interfaces = { "0.0.0.0", "::" }
```

官方 image 預設的 conf.d include 機制（`Include (ENV_PROSODY_EXTRA_CONFIG or "/etc/prosody/conf.d/*.cfg.lua")`）放在設定檔**最後面**，且 Prosody 設定檔用「`VirtualHost` 之前的內容才是 global」這個規則，透過 conf.d 加這行不會生效（只會套用到最後一個 VirtualHost）。因此改成自己完整覆寫 `prosody.cfg.lua`，把這行放在正確位置（複製官方預設檔案結構，只插入這一行）。

### bug 3：`PROSODY_VIRTUAL_HOSTS` 一開始設錯網域

修完 bug 1、2 後部署變成 `Ready`/`Available`，但外部連線回應 Back4app 自己的 404 頁面，內文是 `Unknown host: <domain>`——這不是 CloudFront 的邊界錯誤（那種是 `x-cache: Error from cloudfront`），是 Back4app 自己的路由層不認得這個 hostname。

原因：一開始從 Dashboard 截圖手動讀網域字串時看錯了（`goos-xmpp-prosody-w7d3bb2.b4a.run` vs 實際的 `goosxmppprosody-w7d3ibt2.b4a.run`，中間有無連字號、後綴都不一樣），導致 `PROSODY_VIRTUAL_HOSTS` 設成一個不存在的網域，Prosody 的 `VirtualHost`/`http_host` 跟 Back4app 路由層實際配的網域對不上。改成從 Dashboard 的 Domain 設定頁**直接讀 `href` 屬性**（而非用截圖讀文字）確認正確網域字串後，問題解決。

### bug 4：Prosody 不在未加密連線上提供 SASL 機制，連線卡在 "Server did not offer a supported authentication mechanism"

前三個 bug 只驗證到 WebSocket handshake 成功（見下方「驗證結果」），沒有實際跑過完整的登入流程。等 `server/auctionsniper/xmpp` 的整合測試接上本機 Prosody 後才發現：WebSocket 連線本身沒問題（"Websocket open"），但 SASL 協商階段直接失敗，Strophe.js 回報 `Server did not offer a supported authentication mechanism`。

查證 [Prosody 官方 `mod_saslauth` 文件](https://prosody.im/doc/modules/mod_saslauth)，確認 `allow_unencrypted_plain_auth` 預設是 `false`：Prosody 不會在「未加密」連線上提供 PLAIN/LOGIN 這類機制，避免密碼用明文傳輸。這裡的「未加密」是從 Prosody 自己的視角判斷，不是看使用者最終走的是不是 HTTPS：

- 本機測試直接用 `ws://`，Prosody 視角本來就沒有 TLS。
- Back4app 部署也一樣中招——雖然使用者看到的公開網址是 `https://.../xmpp-websocket`，但 Back4app 在邊界（CloudFront）就把 TLS 卸載掉了，轉發給 container 內部 Prosody 的是明文 HTTP（呼應 bug 1），所以 Prosody 收到的仍然是「未加密」連線。這代表**上一輪只驗證 WebSocket handshake 成功，並不足以證明部署上去的 Prosody 真的能完成登入**，是這次補測才發現的缺口。

修法：在 `prosody.cfg.lua` 的 global 區塊加一行 `allow_unencrypted_plain_auth = true`，明確放寬這個限制（跟 [ADR-0003](adr/ADR-0003-username-only-identity.md) 一樣，是刻意為了 poc 練習目的放寬安全限制，不是要打造正式系統）。

## 驗證結果

修完三個 bug、重新部署後：

```bash
$ curl -s -o /dev/null -w "%{http_code}" https://goosxmppprosody-w7d3ibt2.b4a.run/
200

$ curl -sv -N --http1.1 \
  -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  -H "Sec-WebSocket-Protocol: xmpp" \
  https://goosxmppprosody-w7d3ibt2.b4a.run/xmpp-websocket
< HTTP/1.1 101 Switching Protocols
< upgrade: websocket
< sec-websocket-protocol: xmpp
< sec-websocket-accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
```

`sec-websocket-accept` 的值有正確對應到送出的 `Sec-WebSocket-Key`，確認不是隨便回應，是 Prosody 的 `mod_websocket` 正確處理了 handshake。Container 日誌也確認三個 [ADR-0003](adr/ADR-0003-username-only-identity.md) 白名單帳號成功建立：

```
usermanager info User account created: sniper@goosxmppprosody-w7d3ibt2.b4a.run
usermanager info User account created: auction-item-54321@goosxmppprosody-w7d3ibt2.b4a.run
usermanager info User account created: auction-item-65432@goosxmppprosody-w7d3ibt2.b4a.run
```

這次驗證只做到 WebSocket handshake 成功（HTTP 101 + 正確協商 `xmpp` 子協定），**沒有**進一步測試完整的 SASL 登入流程；真正的登入/收發訊息驗證會在 `server/auctionsniper/xmpp` 的整合測試裡進行。

## 已知限制

- Back4app Containers 免費方案的網域是「Temporary URL」，官方標示 60 分鐘後會失效，需要升級付費方案才能拿到永久網域——這對 [ADR-0010](adr/ADR-0010-xmpp-deployment-platform.md) 描述的用途（只在改完程式碼後跑一次 `fake-auction.ts --remote` 驗證，用完即丟）是可接受的限制，但每次要驗證前都要重新確認網域字串沒變。
- 免費方案容器閒置會休眠，跟 [ADR-0010](adr/ADR-0010-xmpp-deployment-platform.md) 的短時間使用模式相容。
