# ADR-0001: 建立拍賣協定重構的決策準則與優先順序

**Status:** Accepted
**Date:** 2026-08-10
**Author:** titangene

## Context

goos-ts 是改寫自《Growing Object-Oriented Software, Guided by Tests》(GOOS) 書中 Java Auction Sniper 範例的 TypeScript 練習專案，目的是練習 TDD 開發流程，而不是打造一套正式的拍賣系統。書中 Java 版用 XMPP + Openfire 當拍賣協定，goos-ts 比照書中架構，用 xmpp.js 連線 Prosody（見 [ADR-0002](ADR-0002-xmpp-server-selection.md)/[ADR-0003](ADR-0003-xmpp-client-library-selection.md)），WebSocket 取代 Swing 的 UI 推播機制。

書中選擇 XMPP 的理由：作者需要「一個真實存在、非同步、第三方的基礎設施，用來示範如何對它做 TDD」，且明確承認這不是務實的正式架構（"This isn't a realistic architecture: XMPP is neither reliable nor secure, and so is unsuitable for transactions... Ensuring any of those qualities is outside our scope."）。

在評估拍賣協定實作細節（XMPP server 選型、client library 選型、部署平台等，見 [ADR-0002](ADR-0002-xmpp-server-selection.md)/[ADR-0003](ADR-0003-xmpp-client-library-selection.md)/[ADR-0004](ADR-0004-xmpp-deployment-platform.md)）的過程中，反覆浮現同一組判準，且各篇 ADR 都會引用這組判準來解釋取捨，因此需要獨立記錄，避免每篇 ADR 重複解釋一次同樣的優先順序邏輯。

## Decision Outcome

採用以下四項準則作為後續所有拍賣協定相關 ADR 的共同判準，並訂出明確優先順序：

1. **不能新增原書中沒有的多餘邏輯，這是絕對不可接受的硬性限制**——但可以接受「替代方案」，也可以接受「為了練習 TDD 而刪除不違背書中精神的實作」（例如拿掉真實密碼驗證，但保留「連線可能失敗、失敗要包成自訂例外」這個結構）。
2. **盡量貼近《GOOS》書中 XMPP 的精神**，優先於單純的開發便利性。
3. **目標是同時練到「跟不可控外部系統整合的 TDD」和「快速紅綠燈循環的 TDD」**，接近 ATDD 精神，也是 GOOS 整本書的核心觀念。
4. **盡量選擇簡單、佈署方便的方案，若能減少佈署服務成本更好，只考慮免費部署方案。**

優先順序：準則 1（不增加多餘邏輯）是硬性限制，優先於一切；準則 2（貼近書中精神）與準則 3（雙軌 TDD 練習）明確優先於單純的開發便利性；準則 4（簡單/低成本）在前述準則都滿足的前提下，作為次要篩選條件。

## Consequences

**Positive:**

- 後續每篇 ADR 的 Context/Decision 可以直接引用本 ADR，不需要重複解釋一次判斷邏輯。
- 未來若有人質疑某個技術選擇「為什麼不選更方便的 X」，可以直接對照本 ADR 的優先順序回答。

**Negative:**

- 若準則的優先順序本身有爭議或需要調整，會牽動已經依此判斷做出的所有下游決策，需要重新評估 [ADR-0002: 拍賣協定的 XMPP server 選型與身分識別——Prosody](ADR-0002-xmpp-server-selection.md)、[ADR-0003: XMPP client library 選型——xmpp.js](ADR-0003-xmpp-client-library-selection.md)、[ADR-0004: XMPP 佈署平台選型——Render](ADR-0004-xmpp-deployment-platform.md) 等已接受的結論。

## Compliance

1. **優先順序裁決**：任何影響拍賣協定實作方式、broker 選型、或部署方式的決策，MUST 依照本 ADR 訂出的優先順序（不增加多餘邏輯 > 貼近書中精神/雙軌 TDD 練習 > 簡單/低成本）裁決衝突。
2. **變更準則需要新 ADR**：若新決策的判斷準則與本 ADR 衝突或需要調整優先順序，MUST 建立新的 ADR 明確取代或修正本 ADR，MUST NOT 在其他 ADR 內默默改變優先順序而不留下紀錄。
