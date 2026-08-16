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

拍賣協定的連線層**不提供使用者自行設定/管理密碼的介面或流程**。合法帳號是 Prosody 上以 `prosodyctl register` 事先靜態註冊好的一組固定帳號（`sniper`/`sniper`、`auction-item-54321`/`auction`、`auction-item-65432`/`auction`，見 `poc/docker/xmpp/register-and-start.sh`），密碼是跟帳號綁死的已知常數，不對外暴露輸入介面——瀏覽器端 `/api/join` 只接受 `itemId`/`stopPrice`（見 `server/api/join.post.ts`），sniperId 本身是伺服器啟動時的設定值（`NUXT_SNIPER_ID`），對應的密碼由 `server/utils/sniper-registry.ts` 內建帶入，不是使用者輸入。

SASL 驗證本身仍然 100% 委託給 Prosody 這個真實的第三方系統：帳密不在已註冊清單內時，`XMPPConnection.connect()` 會拋出底層例外（例如密碼錯誤丟出的 `SASLError`），不直接拋出 `XMPPAuctionException`——包裝成 `XMPPAuctionException` 是 `XMPPAuctionHouse.connect()` 外層 try/catch 的責任，不是連線本身的責任，對應 Java 版 `connection.login()` 拋出 Smack 底層 `XMPPException`、由呼叫端包裝的兩層結構一致。TS 版維持同樣的兩層結構，也因此仍保留了「connect 可能失敗、失敗要包裝成自訂例外」這個書中既有的錯誤處理結構，即使書中 `test/integration/.../XMPPAuctionHouseTest.java` 本身沒有測試連線失敗的案例，這個結構在 Java 原始碼中完全支援、只是沒被測試覆蓋到。

Non-goals：本決定不涉及使用者自行註冊、動態新增帳號、或任何形式的密碼重設/管理流程；帳號本身的持久化完全交給 Prosody 自己的帳號系統負責，Nuxt server 這一側不另外儲存任何帳密資料。

## Consequences

**Positive:**

- 不需要任何額外的帳號管理介面（註冊、密碼重設等），簡化了應用層。
- 保留了「連線可能因未知身分而失敗」這個可測試的錯誤路徑，維持跟書中 `XMPPAuctionException` 對應的錯誤處理練習價值。

**Negative:**

- 未來若需要新增合法帳號，需要重新執行 `prosodyctl register`（或修改 `poc/docker/xmpp/register-and-start.sh` 重新部署），不像真實帳號系統可以動態自助註冊。

## Compliance

1. **不提供使用者自訂密碼**：拍賣協定連線層 MUST NOT 提供任何讓使用者自行設定、輸入或管理密碼的介面；密碼 MUST 是跟帳號綁死的固定已知值，僅用來滿足 XMPP SASL 協定本身需要密碼欄位這件事。
2. **帳號清單固定且靜態**：合法帳號 MUST 是 Prosody 上以 `prosodyctl register`（或等價的官方 CLI/API）預先靜態註冊好的固定清單，MUST NOT 開放使用者自行註冊新帳號、或提供任何動態新增白名單的機制。
3. **失敗需在外層包裝例外**：帳密不在已註冊清單內、或 SASL 驗證失敗時，底層例外 MUST 在拍賣協定連線的最外層（對應 Java 版 `XMPPAuctionHouse.connect()`）被攔截並包裝成 `XMPPAuctionException`，MUST NOT 讓底層錯誤未經包裝直接往呼叫端拋。
4. **帳號持久化交給 Prosody**：MUST NOT 在 Nuxt server 這一側額外儲存、快取或管理任何帳密資料，帳號的持久化與驗證完全交給 Prosody 自己的帳號系統負責。

## Alternatives Considered

- **由使用者自行輸入/管理密碼**（例如在畫面上加一個密碼欄位，串接真正可自助註冊的帳號系統）：更貼近一般應用程式的登入體驗，但需要額外的註冊/密碼管理/重設流程，這些都是原書 `XMPPAuctionHouse`/`AuctionMessageTranslator` 完全沒有的邏輯，違反 [ADR-0001](ADR-0001-decision-principles.md) 準則 1（不增加多餘邏輯）的硬性限制，且不是這個練習 TDD 的 poc 專案需要的複雜度。
