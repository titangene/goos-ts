# ADR-0004: MQTT Broker 部署為獨立 Render Web Service

**Status:** Accepted
**Date:** 2026-08-10
**Author:** titangene

## Context

[ADR-0002: 拍賣協定改用 MQTT（Mosquitto）取代 Redis Pub/Sub](ADR-0002-mqtt-replaces-redis.md) 決定用 Mosquitto 作為 MQTT broker，且該 broker MUST 以獨立於 Nuxt server 的方式部署（見 ADR-0002 Compliance 第 2 條）。goos-ts 目前部署在 Render：Web Service 跑 Nuxt server，Key Value（Redis）僅作為 pub/sub 訊息通道。改用 MQTT 後，需要重新決定 broker 要部署在哪個平台、以及對外連線方式。

**Mosquitto 的實際資源需求**：不需要 persistent volume（沒有帳號要存，MQTT 沒有 Matrix 那種協定層強制持久化要求）、資源需求極輕（C binary，通常個位數到十幾 MB RAM）。這代表先前讓 Matrix/Synapse 在 Render Free 方案破局的硬限制（不支援 persistent disk、Synapse 建議 RAM 超過 Free 方案 512MB 上限）在 Mosquitto 這裡都不成立。

**已查證的各平台免費方案現況**（2026 年）：

- **Render**：Free Web Service 限制為 512MB RAM/0.1 CPU、不支援 persistent disk、15 分鐘閒置後會自動休眠（含 Key Value/Redis 免費方案，並非 Web Service 獨有）、單一 web service 只轉發一個公開 HTTP port，額外 port 只能走私有網路。
- **Oracle Cloud Always Free**：真實 VM（2026 年 6 月起降為 2 OCPU/12GB，先前為 4 OCPU/24GB），有真正 persistent disk、不會自動休眠，可直接開放原生 MQTT TCP port 對外，完全不需要 MQTT-over-WS 這層 workaround；缺點是需要自行維運 OS/Docker/防火牆，且 ARM 容量在熱門區域常搶不到。
- **Google Cloud Platform (GCP) Always Free**：同樣是真實 VM（e2-micro，約 1GB RAM），一樣有 persistent disk、不會自動休眠，可直接開放原生 MQTT TCP port 對外；資源比 Oracle Cloud 小很多，但實務上比 Oracle Cloud 的 Ampere ARM 容量更容易申請成功，同樣需要自行維運 OS/Docker/防火牆。
- **AWS**：2025-07-15 後新帳號已取消傳統 12 個月免費方案，改為一次性 $200 額度、6 個月內用完為限，非永久免費。
- **Azure**：免費 VM（B1S 等）僅 12 個月，之後需轉付費，非永久免費。
- **Cloudflare**：Containers（唯一支援長駐 process 的功能）僅 Workers Paid 方案才能用，免費方案完全不提供；即使付費，官方文件也表明目前用 ephemeral storage，不適合需要穩定長駐的服務。

MQTT-over-WS 這層 workaround 存在的唯一理由，是 Render 單一 HTTP port 限制；若改用 Oracle Cloud 這類真實 VM，可以完全不需要這層包裝。但依照 [ADR-0001: 建立拍賣協定重構的決策準則與優先順序](ADR-0001-decision-principles.md) 準則 4（盡量選擇簡單、佈署方便的方案），Render 維運成本最低（git push 即部署、自動 TLS），且 Mosquitto 需要的 workaround 成本很小（純設定檔，非自訂程式碼），兩相權衡後決定維持在 Render——這點跟 Matrix 評估時的結論不同：Matrix 在 Render Free 上完全不可行，而 Mosquitto 在 Render Free 上可行，只是需要接受一個小的 workaround。

## Considered Options

- Render（維持現況平台）
- Oracle Cloud Always Free
- Google Cloud Platform (GCP) Always Free
- AWS
- Azure
- Cloudflare

## Decision Outcome

Chosen option：**Render**，因為 Mosquitto 的資源需求已經小到 Render Free 方案完全撐得住（不像 Matrix 那樣被硬性限制擋死），維運成本（git push 即部署、自動 TLS、免自行管理 VM）明顯低於自架 VM 方案，且需要接受的 workaround（MQTT-over-WS）成本很小。

Mosquitto 部署為**獨立於 Nuxt server 的 Render Web Service**（Docker 建置），開兩個 listener：

1. **內部 MQTT TCP listener**（例如 1883 port）——本機開發、CI 用 `docker run`/`docker-compose` 直連。原規劃是部署後 Nuxt server 也透過 Render 私有網路連線（比照現有 `REDIS_URL` internal URL 模式），但實際建立服務後發現這條路徑在 Free 方案上不可行（見下方「部署後修正」），production 環境改用第 2 點的對外 listener。
2. **對外 MQTT-over-WS listener**——綁定 Render 的 `PORT` 環境變數。`tools/fake-auction.ts` 依照 [ADR-0002](ADR-0002-mqtt-replaces-redis.md) 改用 MQTT client（`mqtt.js`）後，本機加 `--remote` 參數執行時透過 `wss://` 連到這個對外 listener；部署後 Nuxt server 的 `MQTT_BROKER_URL` 也指向同一個 `wss://` 位址（見下方「部署後修正」）。此 listener 使用 Mosquitto 原生的 `protocol websockets` 設定（純設定檔，零程式碼），不與 `server/routes/ws.ts`（瀏覽器 UI 推播、使用 crossws）共用任何程式碼或連線機制——兩者是服務不同協定（MQTT binary framing vs. 應用層 JSON）的獨立端點。

### 部署後修正：Nuxt server 改連公開 `wss://`，不走私有網路

實際在 Render Dashboard 建立 `goos-ts-mosquitto` 服務時，查證 [Render 私有網路文件](https://render.com/docs/private-network) 才發現：**Free web service 可以發起私有網路連線，但無法接收**（"Free web services can send private network requests, but they can't receive them"）。Mosquitto 服務本身是 Free 方案，代表它完全無法接收私有網路的入站連線——第 1 點原規劃的「Nuxt server 透過私有網路連內部 1883 listener」在 Free 方案組合下不成立，不是設定問題，是方案本身的硬限制。

依 [ADR-0001](ADR-0001-decision-principles.md) 準則 3（優先選免費部署方案），選擇讓 Nuxt server 也改用第 2 點的對外 `wss://` listener 連線（`MQTT_BROKER_URL=wss://<mosquitto-service-name>.onrender.com`），跟 `fake-auction.ts --remote` 走同一條路徑，而不是把 Mosquitto 升級成付費方案來換取私有網路收件能力。內部 TCP listener（1883）保留給本機/CI 用，不再是 production 唯一預期連線路徑。

## Consequences

**Positive:**

- 維運心力最少：延續現有 Render 部署流程（git push 觸發 CI/CD、自動 TLS、自訂網域），不需要新增自行管理 VM 的維運責任。
- Mosquitto 不需要 persistent volume，避開了先前讓 Matrix 破局的 Render Free 方案硬限制。

**Negative:**

- 需要撰寫並維護一份簡單的 Dockerfile（`FROM eclipse-mosquitto` + COPY 設定檔）。
- 本機用 `mqtt://`，部署環境（Nuxt server 跟 `--remote`）都用 `wss://`，連線字串不同；共用同一套 `mqtt.js` client 程式碼（`connectAsync(url)` 依 URL scheme 自動切換協定），不需要額外分支邏輯，只是 brokerUrl 的值來源不同（本機預設值 vs. `MQTT_BROKER_URL` 環境變數）。
- 需要在 Render Dashboard 額外建立一個新服務，並設定對應環境變數（例如 `MQTT_BROKER_URL`）。

**Neutral:**

- 若未來需要水平擴展多個 Nuxt server instance，或 Mosquitto 的資源需求意外超出預期，Oracle Cloud Always Free 是已評估過、可行的備案（見 More Information）。

## Compliance

1. **Broker 部署獨立性**：MQTT broker MUST 部署為獨立於 Nuxt server 的 Render 服務，MUST NOT 與 Nuxt server 共用同一個 container 或 process（呼應 [ADR-0002](ADR-0002-mqtt-replaces-redis.md) Compliance 第 2 條）。
2. **雙 Listener 架構**：Broker MUST 提供至少兩個 listener——一個內部 MQTT TCP listener（本機/CI 用，固定 port）、一個綁定公開 `PORT` 環境變數的 MQTT-over-WS listener。內部 listener MUST NOT 被假設為 Nuxt server 在 production 環境的連線路徑（見「部署後修正」，Free 方案的私有網路限制使其不可行）。
3. **WS Listener 隔離**：公開的 MQTT-over-WS listener MUST NOT 與 `server/routes/ws.ts`（瀏覽器 UI 推播）共用連線邏輯、程式碼路徑、或底層函式庫（crossws vs. broker 原生的 WS 支援須保持各自獨立）。
4. **不掛載 Persistent Disk**：MQTT broker 服務 MUST NOT 掛載 persistent disk，因應本決策不需要持久化任何帳號或訊息資料。

## Pros and Cons of the Options

### Render

- Good, because 維運成本最低（git push 即部署、自動 TLS、免自行管理 VM）。
- Good, because Mosquitto 資源需求足夠小，Free 方案的 512MB RAM/0.1 CPU 撐得住。
- Bad, because 單一 HTTP port 限制，需要額外設定 MQTT-over-WS 這層 workaround 才能讓 `--remote` 連到部署環境。

### Oracle Cloud Always Free

- Good, because 真實 VM，可直接開放原生 MQTT TCP port 對外，完全不需要 MQTT-over-WS 這層 workaround。
- Good, because 有真正的 persistent disk、不會自動休眠，且 2026 年 6 月降規後仍有 2 OCPU/12GB，資源遠超過 Mosquitto 的需求。
- Bad, because 需要自行維運 OS/Docker/防火牆，維運責任明顯高於 Render。
- Bad, because ARM Ampere 容量在熱門區域常常搶不到，有申請失敗、需要重試的風險。

### Google Cloud Platform (GCP) Always Free

- Good, because 真實 VM，一樣可直接開放原生 MQTT TCP port 對外，不需要 MQTT-over-WS。
- Good, because 相較 Oracle Cloud 常搶不到 Ampere 容量，GCP 的 e2-micro 實務上更容易申請成功。
- Bad, because 資源比 Oracle Cloud 小很多（約 1GB RAM），雖然對 Mosquitto 這種輕量需求足夠，但擴充空間有限。
- Bad, because 一樣需要自行維運 OS/Docker/防火牆，維運責任高於 Render。

### AWS

- Bad, because 2025-07-15 後新帳號的免費額度僅 6 個月或 $200 用完為限，非永久免費，不適合長期練習用途。

### Azure

- Bad, because 免費 VM 僅 12 個月，之後需要轉付費或遷移，非永久免費。

### Cloudflare

- Bad, because Containers（唯一支援長駐 process 的功能）不在免費方案內，免費方案完全不提供；即使付費，官方文件也表明目前架構不適合需要穩定長駐、有狀態的服務。

## More Information

- 若未來準則優先順序改變（例如更看重「架構完全不需要 workaround」勝過「維運成本最低」，見 [ADR-0001](ADR-0001-decision-principles.md)），Oracle Cloud Always Free 是已評估過、架構最乾淨的備案：可以把 Nuxt server 與 Mosquitto 部署在同一台 VM 上，兩者用 localhost 互連，只有 `--remote` 走公網，且完全不需要 MQTT-over-WS。
