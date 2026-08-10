# ADR-0005: 本機/CI 開發流程改用 Docker 容器執行 Broker

**Status:** Accepted
**Date:** 2026-08-10
**Author:** titangene

## Context

在決定 [ADR-0002: 拍賣協定改用 MQTT（Mosquitto）取代 Redis Pub/Sub](ADR-0002-mqtt-replaces-redis.md) 之後，需要決定本機開發與 CI 環境要怎麼啟動 Mosquitto。

**CI 端**：GitHub Actions 的 `services:` YAML 機制會在 checkout 之前就啟動容器，沒辦法掛載 repo 裡的檔案（例如 `mosquitto/mosquitto.conf`），因此不能直接沿用現有 Redis 那種 `services: redis: image: redis:7-alpine` 的寫法。

**本機端**：啟動 broker 需要跑 `docker`，而 `docker` 在很多環境下需要 `sudo` 才能執行。若把啟動指令包成 npm script，執行 `sudo npm run ...` 時會把 npm/node 底下整條依賴鏈的執行權限一起拉高，不是只有 `docker` 需要的那一小段，不符合最小權限原則。

## Decision Outcome

**CI**：在 `actions/checkout` 之後的一個獨立步驟裡，用 `docker build` + `docker run` 啟動 [ADR-0004](ADR-0004-mqtt-broker-deployment.md) 建立的自訂 Mosquitto image（設定檔已在 build 時 `COPY` 進 image），等待兩個 listener 都能連上後才繼續執行測試。

**本機開發**：用一支獨立的 shell script（`mosquitto/start.sh`）啟動 broker，**不透過 npm script**，讓 `docker` 需要的權限跟 npm/node 工具鏈的執行權限完全分開。broker 與 dev server（`npm run dev`）**各自在獨立的終端機分頁手動啟動**，不用 `concurrently` 或類似工具合併成一個指令——因為只要 `docker` 需要 `sudo`，合併指令就得在「幫 docker 設定免密碼的 sudoers 規則」或「對整個合併指令下 sudo（連帶拉高 `nuxt dev` 的權限）」之間二選一，兩者都不做，改用分開啟動換取設定單純。

## Consequences

**Positive:**
- 啟動 broker 用 Docker 容器，是有明確生命週期、可查詢狀態的獨立單位，比自行撰寫等待邏輯更穩定。
- `docker` 需要的權限完全不會波及 npm/node 工具鏈的任何一段程式碼。

**Negative:**
- CI 沒辦法直接沿用 Redis 那種單純的 `services:` YAML 設定，需要多寫一個「build → docker run → 等待就緒」的步驟。
- 本機開發者需要先安裝 Docker，且 broker 與 dev server 要開兩個終端機分頁分別啟動，沒有「一個指令啟動全部」的便利性。

## Compliance

1. **CI 啟動方式**：CI MUST 在 checkout 之後以獨立步驟啟動 Mosquitto 容器並等待其就緒後才執行測試，MUST NOT 依賴 Node.js 背景 process 加上應用層自訂輪詢（`wait-on` 或類似機制）等待 broker 就緒。
2. **本機啟動方式**：本機開發流程 MUST 提供一支可獨立手動執行、啟動 broker 的 shell script；broker 與 dev server MUST 各自在獨立的終端機/程序中啟動，MUST NOT 用 `concurrently` 或類似工具合併成一個指令一起啟動。
3. **Broker 啟動 MUST NOT 包成 npm script**：啟動 broker 的指令 MUST 是獨立於 npm/node 的 shell script，MUST NOT 定義成 `package.json` 的 `scripts` 欄位——避免執行 docker 所需的權限層級（可能需要 `sudo`）跟 npm/node 工具鏈的執行權限混在一起。

## Alternatives Considered

- **背景啟動 Node.js process + `wait-on`**：不需要維護 Dockerfile，但沒有原生 healthcheck，需要自行管理 process 生命週期（例如避免忘記 kill 導致 port 殘留），且 Mosquitto 是 Docker image 而非 Node.js 套件，這個模式本來就不適用。
- **CI 直接用 `services:` YAML 語法掛載 repo 設定檔**：`services:` 容器會在 checkout 之前就啟動，無法掛載 `mosquitto/mosquitto.conf` 這個 repo 檔案，技術上行不通。
- **CI 先在另一個 job 把自訂 image build/push 到 GitHub Container Registry，再讓 `services:` 引用該已發布的 image**：技術上可行、能沿用 `services:` 語法，但需要多一條 image 建置/發布的 CI 流程，比「checkout 之後手動 `docker run`」複雜很多，卻沒有對應的實質好處，違反 [ADR-0001](ADR-0001-decision-principles.md) 準則 4（盡量選擇簡單的方案）。
- **把 broker 啟動指令包成 npm script**：若本機 docker 需要 `sudo`，包成 npm script 代表要嘛把 `sudo` 寫死在 script 裡（沒有彈性、CI 環境通常不需要 `sudo` 反而會出錯），要嘛在外面用 `sudo npm run ...` 包住整個指令——後者會把 npm/node 底下所有套件的執行權限一起拉高，違反最小權限原則。
- **用 `concurrently` 把啟動 broker 的 shell script跟 `nuxt dev` 合併成一個指令**：只要 `docker` 需要互動輸入 `sudo` 密碼，就得在「幫 `docker` 設定免密碼的 sudoers 規則」（多一筆系統層級設定）或「對整個合併指令下 `sudo`」（重演 npm script 那個違反最小權限原則的問題，只是換 `nuxt dev` 被牽連）之間二選一，兩者都不理想，因此改採兩個終端機分頁分別手動啟動。
