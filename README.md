# goos-ts

## 環境需求

- Node.js
- Prosody（XMPP server，本機用 Docker）

啟動本機 Prosody（Docker）：

```bash
docker build -t goos-ts-prosody-local docker/xmpp
docker run -d -p 5280:5280 \
  -e PROSODY_ENABLE_MODULES=websocket \
  -e PROSODY_VIRTUAL_HOSTS=localhost \
  goos-ts-prosody-local
```

容器啟動時會自動註冊白名單的三個帳號（`sniper`/`sniper`、`auction-item-54321`/`auction`、`auction-item-65432`/`auction`），白名單決策見 poc 分支的 `docs/adr/ADR-0002-xmpp-server-selection.md`（main 分支目前尚未包含 ADR 文件）。

## 安裝

```bash
npm install
cp .env.example .env.dev.local
```

`.env.dev.local` 填本機 Prosody 的連線設定（跟上面「環境需求」建立的帳號對應）：

```
NUXT_PUBLIC_XMPP_SERVICE_URL=ws://localhost:5280/xmpp-websocket
NUXT_XMPP_USERNAME=sniper
NUXT_XMPP_PASSWORD=sniper
```

- `.env.dev.local` 已被 `.gitignore` 排除，不會進版控
- `npm run dev` 會讀此檔案
- 三個值都沒有內建預設值，沒建立此檔案 sniper 會連線失敗

## 開發

```bash
npm run dev
```
