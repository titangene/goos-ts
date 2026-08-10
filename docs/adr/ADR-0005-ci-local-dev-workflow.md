# ADR-0005: 本機/CI 開發流程改用 Docker Service Container 模式

**Status:** Accepted
**Date:** 2026-08-10
**Author:** titangene

## Context

在決定 [ADR-0002: 拍賣協定改用 MQTT（Mosquitto）取代 Redis Pub/Sub](ADR-0002-mqtt-replaces-redis.md) 的過程中，曾針對「broker 要用 Aedes（Node.js library）還是 Mosquitto（Docker）」討論過兩種讓 broker 在開發/CI 環境可用的模式：

- **背景啟動 process + `wait-on`**（原本針對 Aedes 獨立 Node.js process 設計）：CI 用 `wait-on` 輪詢 port 就緒，本機用 `concurrently` 同時啟動 broker 與 dev server；優點是不需要維護 Dockerfile，缺點是沒有原生 healthcheck、需要自行管理 process 生命週期（例如避免忘記 kill 導致 port 殘留）。
- **Docker service container**（比照現有 Redis 的 `redis:7-alpine` CI 模式）：GitHub Actions 原生支援 service container healthcheck，broker ready 前不會跑測試；缺點是需要維護 Dockerfile。

因為 [ADR-0002](ADR-0002-mqtt-replaces-redis.md) 最終選定 Mosquitto（Docker 部署，非 Aedes/Node.js），CI 端需要對應調整：原本針對 Aedes 設計的 `wait-on` 背景啟動模式不再適用於一個以 Docker image 形式提供的 broker。

## Decision Outcome

CI（GitHub Actions）使用 **Docker service container** 執行 Mosquitto，沿用現有 `redis:7-alpine` 的 service container 設定方式（含 GitHub Actions 原生的 healthcheck 機制）。

本機開發使用 `concurrently` 將 `docker run ... eclipse-mosquitto` 跟 `nuxt dev` 一起啟動（包進 `npm run dev`），並額外提供一個可手動單獨啟動 broker 的 npm script，供不想每次都跟 dev server 綁在一起啟動的情境使用（例如只想跑測試、不需要 dev server）。

Non-goals：不引入 `wait-on` 或任何自訂的「輪詢 port 就緒」邏輯——Docker service container 的原生 healthcheck 機制已經涵蓋這個需求。

## Consequences

**Positive:**
- CI 設定方式跟現有 Redis 模式完全一致，維護心智模型統一，不需要為 MQTT 學一套新的 CI 模式。
- GitHub Actions 原生的 service container healthcheck，比自行撰寫等待邏輯更穩定，降低 flaky test 風險。

**Negative:**
- 需要撰寫並在 CI 設定中引用一份 Mosquitto 專用的設定檔（或直接使用官方 image 的預設設定），跟現有 Redis service container 需要的設定量相近。
- 本機開發者需要先安裝 Docker（或 Mosquitto 本身），不像純 Node.js 腳本那樣零額外安裝——但這跟現有 Redis 的本機開發需求（也需要 Docker 或本機安裝 Redis）一致，非新增的負擔。

## Compliance

1. **CI 使用 Service Container**：CI MUST 使用 Docker service container 執行 Mosquitto，MUST NOT 依賴背景啟動的 process 加上自訂輪詢（`wait-on` 或類似機制）等待 broker 就緒。
2. **本機雙重啟動方式**：本機開發流程 MUST 同時提供（a）可獨立手動啟動 broker 的 npm script，以及（b）透過 `concurrently` 一次啟動 broker 與 dev server 的整合方式，兩者 MUST 共用同一份 broker 啟動設定（Dockerfile/設定檔），MUST NOT 分岔維護兩套設定。

## Alternatives Considered

- **背景啟動 Node.js process + `wait-on`**：這是原本針對 Aedes（Node.js library）設計的模式，若 [ADR-0002](ADR-0002-mqtt-replaces-redis.md) 選擇 Aedes 而非 Mosquitto，這會是正確的選擇；但因為 Mosquitto 是 Docker image 而非 Node.js 套件，這個模式不適用，改採 Docker service container 模式。
