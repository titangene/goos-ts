# ADR-0003: 拍賣協定身分識別改用 Username-Only 白名單取代真實密碼驗證

**Status:** Accepted
**Date:** 2026-08-10
**Author:** titangene

## Context

已直接查證 [sf105/goos-code](https://github.com/sf105/goos-code) Java 原始碼（`XMPPAuctionHouse.java`、`AuctionMessageTranslator.java`），確認應用層本身完全沒有額外的身分驗證邏輯：

- `XMPPAuctionHouse.connect(hostname, username, password)` 把帳密原封不動交給 XMPP server 的 `connection.login()` 驗證，驗證 100% 委託給外部系統（`src/` 底下用 `grep` 確認只有這一個檔案出現 `password` 字樣）。
- `AuctionMessageTranslator` 裡的 `sniperId` 只是拿已登入的身分（`connection.getUser()`，即 JID）去跟訊息內容的 `Bidder` 欄位比對「這是我出的價還是別人出的」（`isFrom(sniperId)`），屬於業務邏輯比對，不是驗證邏輯。

書中也明確表示安全性/驗證強度不在其設計目標內：「XMPP is neither reliable nor secure, and so is unsuitable for transactions. Ensuring any of those qualities is outside our scope.」

依照 [ADR-0001: 建立拍賣協定重構的決策準則與優先順序](ADR-0001-decision-principles.md) 準則 1（不能新增原書中沒有的多餘邏輯，但可接受為了練習 TDD 而刪除不違背書中精神的實作），評估是否能移除真實密碼驗證。

## Decision Outcome

拍賣協定的連線層**不做真實密碼驗證**，改用一個 TS 常數陣列列出已知合法的 username。傳入的 username 若不在名單內，白名單比對本身只拋出一般的例外，不直接拋出對應 `XMPPAuctionException` 角色的自訂例外——對應 Java 版 `connection.login()` 拋出的是 Smack 底層的 `XMPPException`，包裝成 `XMPPAuctionException` 是 `XMPPAuctionHouse.connect()` 外層 try/catch 的責任，不是 `login()` 自己的責任。TS 版維持同樣的兩層結構。

這個替換只影響連線建立的邊界程式碼，MUST NOT 影響 `Auction`/`AuctionHouse` 介面以下的業務邏輯，且保留了「connect 可能失敗、失敗要包裝成自訂例外」這個書中既有的錯誤處理結構——因此仍能練習「處理第三方系統連線失敗」的 TDD 情境，即使書中 `test/integration/.../XMPPAuctionHouseTest.java` 本身沒有測試連線失敗的案例，這個結構在 Java 原始碼中完全支援、只是沒被測試覆蓋到。

Non-goals：本決定不涉及任何形式的密碼、token、或外部帳號系統整合；不做「開放註冊」；不引入任何持久化的使用者資料儲存。

## Consequences

**Positive:**

- 不需要任何持久化的帳號資料庫，簡化了部署（呼應 [ADR-0004: MQTT Broker 部署為獨立 Render Web Service](ADR-0004-mqtt-broker-deployment.md) 不需要 persistent volume 的結論）。
- 保留了「連線可能因未知身分而失敗」這個可測試的錯誤路徑，維持跟書中 `XMPPAuctionException` 對應的錯誤處理練習價值。

**Negative:**

- 未來若需要新增合法帳號，需要修改程式碼中的常數陣列並重新部署，不像真實帳號系統可以動態註冊。

## Compliance

1. **不做密碼驗證**：拍賣協定連線層 MUST NOT 對傳入的密碼做任何驗證邏輯。
2. **白名單比對**：傳入的 username MUST 對照一份靜態的已知名單（TS 常數陣列）比對，MUST NOT 引入外部帳號系統或資料庫查詢。
3. **失敗需在外層包裝例外**：username 不在名單內時，白名單比對本身 MUST 拋出例外；拍賣協定連線的最外層（對應 Java 版 `XMPPAuctionHouse.connect()`）MUST 攔截這個例外並包裝成對應 `XMPPAuctionException` 角色的自訂例外，MUST NOT 讓底層錯誤未經包裝直接往呼叫端拋。
4. **不持久化帳號資料**：合法 username 名單 MUST NOT 需要任何形式的持久化儲存或外部服務查詢。

## Alternatives Considered

- **真實密碼驗證**（維持現有 XMPP/Matrix 那種真帳密登入模式）：符合書中原貌，但需要引入外部帳號系統或客製化 auth provider，違反「不增加多餘邏輯」的硬性限制，且跟 [ADR-0002: 拍賣協定改用 MQTT（Mosquitto）取代 Redis Pub/Sub](ADR-0002-mqtt-replaces-redis.md) 選定的 MQTT 沒有內建帳密機制的事實不符——MQTT 本身沒有強制性的帳密驗證流程，比 XMPP/Matrix 更適合搭配這個決策。
