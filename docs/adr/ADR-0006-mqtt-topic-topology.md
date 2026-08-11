# ADR-0006: MQTT Topic 拓樸設計——分離 Commands/Events Topic

**Status:** Accepted
**Date:** 2026-08-10
**Author:** titangene

## Context

書中 XMPP 版本，Sniper 對 Auction House 是各自獨立的 1:1 Chat session：JOIN/BID 這類 sniper 發出的命令，天生只有 Auction House 看得到，其他 sniper 看不到；PRICE/CLOSE 這類 Auction House 發出的事件，則會送給每一個已加入的 sniper（拍賣領域本身的需求，每個 bidder 都要知道最新價格才能判斷要不要跟進），且書中 `AuctionMessageTranslator`/`AuctionEvent.isFrom(sniperId)` 已經有「比對 `Bidder` 欄位判斷是不是自己出的價」的邏輯。

「PRICE/CLOSE 事件送給每一個已加入的 sniper」這個前提，是拍賣領域本身的需求推論，不是從書中原始碼查證出的 XMPP 廣播機制——書中從未實作過真正會服務多個 sniper 的 Auction House，`FakeAuctionServer.java` 只有單一 `currentChat` 欄位（見 [`differences-from-java.md` 第 4 節](../differences-from-java.md#4-mqttclient-沒有-getuser所以包了一個-mqttconnection)），一次只處理一個 sniper 的 chat session，從未展示過「同時維護多個 sniper、逐一廣播」的實際做法。

[ADR-0002: 拍賣協定改用 MQTT（Mosquitto）取代 Redis Pub/Sub](ADR-0002-mqtt-replaces-redis.md) 選定的 MQTT 是 topic 廣播模型：若把 JOIN/BID/PRICE/CLOSE 全部塞進同一個 topic 雙向收發，會導致其他 sniper 也看到彼此的 BID 命令——這是 XMPP 1:1 chat 模型沒有的洩漏。若要在應用層擋掉這個洩漏，需要撰寫額外的過濾邏輯，違反 [ADR-0001: 建立拍賣協定重構的決策準則與優先順序](ADR-0001-decision-principles.md) 準則 1（不能新增原書中沒有的多餘邏輯）。

## Decision Outcome

採用**兩個獨立 topic**，透過訂閱關係本身（誰訂閱什麼）取代額外的過濾程式碼：

- `auction/<itemId>/commands`——sniper 發佈 JOIN/BID，**只有 Auction House 訂閱**，sniper 自己不訂閱這個 topic。
- `auction/<itemId>/events`——Auction House 發佈 PRICE/CLOSE，**所有已加入的 sniper 訂閱**。

PRICE 事件中「這是我出的價還是別人出的」的判斷，沿用書中既有的 `isFrom(sniperId)` 邏輯（比對訊息內容中的 `Bidder` 欄位），不需要新增任何額外的過濾邏輯。

## Consequences

**Positive:**

- 訊息可見範圍跟 XMPP 1:1 chat 模型對等（sniper 之間互相看不到彼此的命令），且零額外過濾程式碼。
- PRICE/CLOSE 事件的廣播語意（所有 bidder 都看到最新價格）符合拍賣領域本身的真實需求，不需要特殊處理。

**Negative:**

- `RedisAuctionHouse`/`RedisAuction` 對應的 MQTT 版本實作，需要維護兩個 topic 名稱常數而非一個 topic。
- `tools/fake-auction.ts` 也要對應調整訂閱/發佈的 topic（訂閱 `commands`、發佈到 `events`）。

## Compliance

1. **Commands Topic 訂閱限制**：sniper 端程式碼 MUST NOT 訂閱 `commands` topic；Auction House（`fake-auction.ts` 或未來的替代實作）MUST 是 `commands` topic 的唯一訂閱者。
2. **Events Topic 發佈限制**：只有 Auction House MUST 發佈到 `events` topic；sniper 端 MUST NOT 發佈到 `events` topic。
3. **禁止額外過濾邏輯**：MUST NOT 為了阻擋 sniper 看到其他 sniper 的命令而在應用層新增訊息過濾邏輯——此隔離 MUST 只透過訂閱關係（topic 拓樸）達成。

## Alternatives Considered

- **單一 topic 雙向收發**（所有訊息類型共用一個 `auction/<itemId>` topic）：實作最簡單，跟現有 Redis Pub/Sub 版本的 topic 設計一致，但會導致 sniper 之間互相看到彼此的 BID 命令，且若要修正這個洩漏，需要新增額外的應用層過濾邏輯，違反 [ADR-0001](ADR-0001-decision-principles.md) 準則 1。
- **點對點（per-sniper 私有 events topic，更貼近 XMPP 1:1 chat 的實際機制）**：每個已加入的 sniper 各自訂閱一個專屬 topic（例如 `auction/<itemId>/sniper/<sniperId>/events`），Auction House 對每個 PRICE/CLOSE 事件逐一 publish 給每個已加入的 sniper。這個設計比 commands/events 雙 topic 更貼近 XMPP 端點對點 chat 的實際機制（見 Context），但要求 Auction House 自行維護一份「已加入 sniper 名單」並逐一發布，這段邏輯在書中原始碼從未出現過（真正的多 sniper 廣播機制未被實作），違反 [ADR-0001](ADR-0001-decision-principles.md) 準則 1（硬性限制：不能新增原書中沒有的多餘邏輯）。

## More Information

Topic 廣播模型的選擇不是為了貼近 XMPP 的機制而選——就 XMPP 端點對點 chat 的實際運作方式而言，topic 廣播（一個 channel、多個訂閱者自動收到同一份訊息）反而比點對點模型更偏離 XMPP 機制。選它純粹是因為 Redis Pub/Sub 與 MQTT 在協定層都只提供 topic/channel 廣播這一種原語，用它不需要任何額外程式碼，滿足 [ADR-0001](ADR-0001-decision-principles.md) 準則 1（硬性限制）；付出的代價則是要另外處理 XMPP 1:1 chat 模型沒有的洩漏問題（見 Decision Outcome 的雙 topic 設計）。
