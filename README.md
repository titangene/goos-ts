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
```

## 開發

```bash
npm run dev
```
