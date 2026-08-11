# ADR-0004: Redis 部署為獨立的 Render Key Value 服務

**Status:** Accepted
**Date:** 2026-08-11
**Author:** titangene

## Context

[ADR-0002](ADR-0002-transport-selection.md) Compliance #2 要求 Redis MUST 以獨立於 Nuxt server 的 process/服務運行，MUST NOT 內嵌於應用程式自身的 Node.js process 中。goos-ts 目前部署在 Render，需要決定這個獨立的 Redis 服務要部署在哪個平台。

Redis 在這裡純粹扮演 Pub/Sub 訊息通道的角色（見 [ADR-0002](ADR-0002-transport-selection.md)），沒有任何需要持久化的資料——不需要 persistent volume，也不需要考慮資料備份/還原，這點大幅簡化了平台選型的考量。

**已查證的各平台免費方案現況（2026 年）**：

- **Render**：提供官方託管的 **Key Value**（Redis 相容）服務，不需要自己建 Docker image 或維護任何設定檔。Free 方案限制為 512MB RAM/0.1 CPU、不支援 persistent disk（這裡用不到）、15 分鐘閒置後會自動休眠；同 region 內的其他 Render 服務可直接用 internal URL 連線，不需要對外暴露連線位址。
- **Oracle Cloud Always Free**：真實 VM（2026 年 6 月起降為 2 OCPU/12GB，先前為 4 OCPU/24GB），需要自行安裝、維運 Redis（Docker 或原生套件），且要自行管理防火牆規則才能對外開放連線；不會自動休眠，但 ARM 容量在熱門區域常搶不到。
- **Google Cloud Platform (GCP) Always Free**：同樣是真實 VM（e2-micro，約 1GB RAM），一樣需要自行安裝、維運 Redis，資源比 Oracle Cloud 小很多，但實務上比 Oracle Cloud 的 Ampere ARM 容量更容易申請成功。
- **AWS**：2025-07-15 後新帳號已取消傳統 12 個月免費方案，改為一次性 $200 額度、6 個月內用完為限，非永久免費。
- **Azure**：免費 VM（B1S 等）僅 12 個月，之後需轉付費，非永久免費。
- **Cloudflare**：Containers（唯一支援長駐 process 的功能）僅 Workers Paid 方案才能用，免費方案完全不提供。

## Considered Options

- Render Key Value（官方託管服務）
- Oracle Cloud Always Free（自架 Redis）
- Google Cloud Platform (GCP) Always Free（自架 Redis）
- AWS
- Azure
- Cloudflare

## Decision Outcome

Chosen option：**Render Key Value**，因為它是官方託管服務，不需要撰寫或維護任何 Dockerfile、設定檔或部署腳本，同 region 內可直接用 internal URL 跟 Nuxt server 互連，維運成本（git push 即部署、自動 TLS、免自行管理 VM）明顯低於所有需要自架的方案。這裡不需要持久化任何資料，Free 方案的容量限制完全不構成問題。

## Consequences

**Positive:**

- 零部署程式碼：不需要 Dockerfile、設定檔、或任何自訂映像檔，Render 原生支援。
- 同 region 內可用 internal URL 互連，不需要對外暴露連線位址，也不需要考慮防火牆規則。
- 維運心力最少：延續現有 Render 部署流程（git push 觸發 CI/CD、自動 TLS、自訂網域）。
- 不需要 persistent volume，因為 Redis 在這裡純粹是訊息通道，沒有需要持久化的資料。

**Negative:**

- Free 方案有 15 分鐘閒置自動休眠的限制，重新喚醒需要一點時間。

**Neutral:**

- 若未來需要水平擴展多個 Nuxt server instance，或有更高的可用性/效能需求，Oracle Cloud/GCP Always Free 是已評估過、可行的自架備案（見 Pros and Cons）。

## Compliance

1. **Broker 部署獨立性**：Redis MUST 部署為獨立於 Nuxt server 的 Render 服務，MUST NOT 與 Nuxt server 共用同一個 container 或 process（呼應 [ADR-0002](ADR-0002-transport-selection.md) Compliance #2）。
2. **不掛載 Persistent Disk**：Redis 服務 MUST NOT 掛載 persistent disk，因應本決策不需要持久化任何資料。
3. **同 region 部署**：Redis 服務 MUST 跟 Nuxt server 部署在同一個 Render region，以便使用 internal URL 互連。

## Pros and Cons of the Options

### Render Key Value

- Good, because 官方託管服務，不需要維護任何 Dockerfile 或自訂映像檔。
- Good, because 同 region 內可用 internal URL 互連。
- Good, because 維運成本最低，延續現有 Render 部署流程。
- Bad, because Free 方案有 15 分鐘閒置自動休眠的限制。

### Oracle Cloud Always Free

- Good, because 真實 VM，有真正的 persistent disk、不會自動休眠（雖然這裡用不到持久化）。
- Bad, because 需要自行安裝、維運 Redis，且要自行管理防火牆才能對外開放連線，維運責任明顯高於官方託管服務。
- Bad, because ARM Ampere 容量在熱門區域常常搶不到，有申請失敗、需要重試的風險。

### Google Cloud Platform (GCP) Always Free

- Good, because 真實 VM，同樣不會自動休眠。
- Good, because 相較 Oracle Cloud 常搶不到 Ampere 容量，GCP 的 e2-micro 實務上更容易申請成功。
- Bad, because 一樣需要自行安裝、維運 Redis，維運責任高於官方託管服務。
- Bad, because 資源比 Oracle Cloud 小很多（約 1GB RAM），擴充空間有限。

### AWS

- Bad, because 2025-07-15 後新帳號的免費額度僅 6 個月或 $200 用完為限，非永久免費，不適合長期練習用途。

### Azure

- Bad, because 免費 VM 僅 12 個月，之後需要轉付費或遷移，非永久免費。

### Cloudflare

- Bad, because Containers（唯一支援長駐 process 的功能）不在免費方案內，免費方案完全不提供。

## More Information

若未來準則優先順序改變（例如更看重「完全自主掌控基礎設施」勝過「維運成本最低」，見 [ADR-0001](ADR-0001-decision-principles.md)），Oracle Cloud Always Free 是已評估過、資源最充足的自架備案。
