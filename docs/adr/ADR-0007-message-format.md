# ADR-0007: 拍賣協定訊息格式維持書中 XMPP 純文字格式

**Status:** Accepted
**Date:** 2026-08-10
**Author:** titangene

## Context

書中 XMPP 版本用純文字格式傳遞拍賣協定訊息（例如 `SOLVersion: 1.1; Command: BID; Price: %d;`），由 `AuctionMessageTranslator`/`AuctionEvent` 解析 `Field: Value;` 這種以分號分隔的格式。目前 Redis Pub/Sub 版本用 JSON（`Message.Price()`、`Message.Close()` 產生 JSON 字串）。

依照 [ADR-0001: 建立拍賣協定重構的決策準則與優先順序](ADR-0001-decision-principles.md) 準則 2（盡量貼近書中精神），決策判準是：不管底層協定（[ADR-0002: 拍賣協定改用 MQTT（Mosquitto）取代 Redis Pub/Sub](ADR-0002-mqtt-replaces-redis.md) 選定的 MQTT）是否為開放標準，都要使用跟書中 XMPP 一樣的訊息格式，這樣才能盡量原汁原味練習對應 `AuctionMessageTranslator` 的 parsing 邏輯。

但瀏覽器 UI 推播（WebSocket/`SnapshotsMessage`，見 `server/routes/ws.ts`）是完全獨立於拍賣協定的另一個關注點——它對應書中 `SwingThreadSniperListener` 的角色，不是 XMPP/MQTT 扮演的角色——沒有必要為了統一格式而改動。

## Decision Outcome

MQTT payload 採用書中純文字 SOL 格式（`Field: Value;` 分號分隔），`server/auctionsniper/redis/Message.ts` 對應的 MQTT 版本 helper 需要重寫為輸出純文字格式而非 JSON。

`server/routes/ws.ts` 推播給瀏覽器的 `SnapshotsMessage` **維持 JSON 格式不變**。拍賣協定與 UI 推播使用不同訊息格式是刻意的設計決定。

## Consequences

**Positive:**
- 能原汁原味練習對應 Java 版 `AuctionMessageTranslator`/`AuctionEvent` 的純文字 parsing 邏輯，這是本次重構想練習的 TDD 情境之一。

**Negative:**
- `tools/fake-auction.ts` 的訊息建構/解析邏輯需要從 `JSON.parse`/`JSON.stringify` 改寫為純文字格式的 parse/format。
- 拍賣協定與 UI 推播不共用序列化邏輯，未來維護者需要理解這是有意為之的設計決定，不是不一致的疏漏（本 ADR 即為該說明的落地依據）。

## Compliance

1. **拍賣協定格式**：MQTT payload（`commands`/`events` topic，見 [ADR-0006: MQTT Topic 拓樸設計——分離 Commands/Events Topic](ADR-0006-mqtt-topic-topology.md)）MUST 使用書中 SOL 純文字格式（`Field: Value;` 分號分隔），MUST NOT 使用 JSON 或其他結構化序列化格式。
2. **UI 推播格式**：`server/routes/ws.ts` 的 `SnapshotsMessage` MUST 維持 JSON 格式，MUST NOT 為了跟拍賣協定統一格式而改動。
3. **序列化邏輯不共用**：拍賣協定與 UI 推播的序列化/反序列化邏輯 MUST NOT 共用同一個 serializer/parser 模組。

## Alternatives Considered

- **MQTT payload 沿用現有 JSON 格式**（維持 Redis Pub/Sub 版本的訊息格式，只換底層協定）：實作改動最小，但無法練習到書中 `AuctionMessageTranslator` 的純文字 parsing 邏輯，違反 [ADR-0001](ADR-0001-decision-principles.md) 準則 2（盡量貼近書中精神）。
