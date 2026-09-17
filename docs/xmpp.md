# XMPP

## AuctionMessageTranslator 設計

對應 commit history（從新到舊）：

- goos-ts [`da15b9e`](https://github.com/titangene/goos-ts/commit/da15b9eb8f60bb63d56ffcd69513a7bd8eac54d0)（對應 goos-java [`831e925`](https://github.com/titangene/goos-java/commit/831e925385245bd5f57e5b5526a73101c4b364bc)）`refactor` ［12.3.4 p118］
  - 決定 `Main` 的 `peer` 改用建構子注入（`constructor(private readonly peer: Peer)`），取代原本 `joinAuction()` 的參數
    - `AuctionEventListener.auctionClosed(): void` 沒有參數，需要在方法內部存取 `peer`，因此提升成 instance field，對應 Java 版 `this.ui` 的角色
    - 賦值時機跟 Java 版不同：Java 在建構子內呼叫 `startUserInterface()` 內部建立 `ui`，TS 版的 `peer` 是外部呼叫 `Main.main()` 時就已經拿到的值，改用建構子參數直接注入，不用另外呼叫方法賦值
- goos-ts [`744277e`](https://github.com/titangene/goos-ts/commit/744277e2508c1ef313f2d75937f620688b18fcce)（對應 goos-java [`4098f83`](https://github.com/titangene/goos-java/commit/4098f83411c2c08d6655b8f372dce557cf047e9e)）`green` ［12.3.2 p116］
  - 決定 `AuctionMessageTranslator` 建構子改用 `#server/...` path alias import `AuctionEventListener`，不用相對路徑 `../AuctionEventListener.ts`
    - production code 之間互相 import 原本都用相對路徑（例如 `./smack/XMPPChat.ts`），這裡改用跟 `test/e2e/`／`test/unit/` 一致的 `#server/...` 別名，是本步驟實際採用的寫法
  - 決定 `processMessage()` 不管參數內容，收到任何訊息就呼叫 `listener.auctionClosed()`，跟 goos-java 這步「先證明兩者有接上，還不解析內容」的刻意簡化一致
- goos-ts [`671b553`](https://github.com/titangene/goos-ts/commit/671b553aa08a90a3347ff9e55e9a70c4e275e5ae)（對應 goos-java [`504d7ff`](https://github.com/titangene/goos-java/commit/504d7ff03461c8fbf2dbb75b22e1f30b67c2e6fa)）`red` ［12.3.2 p116］
  - 決定 `UNUSED_CHAT` 用 `null as unknown as XMPPChat`，不用 `null!` non-null assertion
    - 理由：明確表達「刻意的不安全轉型」，不是遺漏的 null 檢查
  - 相關議題：[`docs/unit-testing.md`：測試框架與 mock 工具選擇](./unit-testing.md#測試框架與-mock-工具選擇)

## XMPP 連線參數

對應 commit history（從新到舊）：

- goos-ts [`1b21fb5`](https://github.com/titangene/goos-ts/commit/1b21fb565ffa29d5edb6d02a4c6d08ddbd9e839b)（對應 goos-java [`ad9b7e5`](https://github.com/titangene/goos-java/commit/ad9b7e5d997a1ce5dc1631223c14fdd8845463eb)）`red` ［12.2.1 p106］
  - 決定 `FakeAuctionServer` 新增 `static get XMPP_HOSTNAME()` getter，從既有 `XMPP_SERVICE_URL` 動態解析 domain，不另存一份字面常數
    - goos-java 的 `FakeAuctionServer.java` 有獨立的 `XMPP_HOSTNAME = "localhost"` 常數，`ApplicationRunner.SNIPER_XMPP_ID = SNIPER_ID + "@" + XMPP_HOSTNAME + "/Auction"` 直接引用它
    - goos-ts 在 `149d80a`（見下方）已決定用完整的 `XMPP_SERVICE_URL` 取代分離的 hostname，沒有現成常數可用；用 `new URL(XMPP_SERVICE_URL).hostname` 動態解析，維持「只有一個 XMPP 連線設定來源」，避免 `XMPP_SERVICE_URL` 跟另一個獨立 hostname 常數未來改值時互相不同步
    - getter 命名沿用 `XMPP_HOSTNAME`，跟 goos-java 的常數名稱一致，即使底層實作方式不同（衍生值 vs. 獨立常數）
  - 決定 `ApplicationRunner.ts` 新增 `export const SNIPER_XMPP_ID`，resource 沿用 goos-java 寫死的字面 `"Auction"`，不引用 `FakeAuctionServer.AUCTION_RESOURCE`
- goos-ts [`149d80a`](https://github.com/titangene/goos-ts/commit/149d80aa86c77de83e3942198003a0e7d66d1979)（對應 goos-java [`fba009d1`](https://github.com/titangene/goos-java/commit/fba009d197e0039b7a8a1845b56606cdde124568)）`red` ［11.2.4 p100］
  - 決定 production 端用 `public.xmppServiceUrl` 取代 `hostname`
    - 使用 `@xmpp/client`（xmpp.js）的 `service` 參數取代 Java 版 Smack 的 `hostname`，`client({ service, username, password })` 的 `service` 直接對應
    - 沿用 `nuxt.config.ts` 既有的 `runtimeConfig` schema：`xmppUsername`、`xmppPassword`（private，只有 server-side 讀得到）、`public.xmppServiceUrl`（public，client 也讀得到），不需要另外新增 `xmppHostname` 欄位
- goos-ts [`28fec26d`](https://github.com/titangene/goos-ts/commit/28fec26d4fd3c31432c3925df489d28031d59677)（對應 goos-java [`1b295ee1`](https://github.com/titangene/goos-java/commit/1b295ee1288cb00a31dd9abda417ca4bda1ce88a)）`red` ［11.2.1 p96］
  - 決定 `FakeAuctionServer.ts` 的 XMPP 連線設定不透過 Nuxt runtimeConfig
    - `FakeAuctionServer.ts`（測試輔助用的假拍賣伺服器，不是 Nuxt production code 的一部分）直接用一般 TS 常數或 `process.env` 讀值即可

## Smack 相容介面封裝

對應 commit history（從新到舊）：

- goos-ts [`bbe240d`](https://github.com/titangene/goos-ts/commit/bbe240dcdaa84fcecbf693081083997e1edb84c5)（對應 goos-java [`ce2cb2f`](https://github.com/titangene/goos-java/commit/ce2cb2fd28225569708f953509bfe27d3a0afe43)）`red` ［12.2.2 p107］
  - 決定 `XMPPMessage` 補上 `body` 欄位與 `getBody()`，取代原本的空殼 class
    - 對應 Smack `Message.getBody()`；已核對 `Message.java`：沒設定過 body 就回傳 `null`，`toXML()` 不會產生 `<body/>` 元素
  - 決定 `XMPPChat` 新增 `getParticipant()`，回傳建構時存的 JID
    - 對應 Smack `Chat.getParticipant()`；已核對 `Chat.java`：直接回傳建構子存的 `participant` 欄位，沒有其他邏輯
  - 決定 `XMPPChat.sendMessage()` 參數改成 `text?: string`，取代原本忽略內容的 `XMPPMessage` 參數
    - 對應 Smack `Chat.sendMessage(String)` 這個 convenience overload；已核對 `Chat.java`：內部等同 `new Message(); message.setBody(text); chat.sendMessage(message)`
    - `text` 為 `undefined` 時不附加 `<body>` 元素，模擬 Smack `sendMessage(new Message())`（沒呼叫 `setBody()`）的行為，讓 `announceClosed()`／`Main.ts` 的 join 訊息維持原本「沒有 body」的語意
    - 已核對 `node_modules/ltx/src/createElement.d.ts`：`children` 型別是 `Node[]`（`Node = Element | string`），不包含 `undefined`，即使 runtime 的 `append()` 會忽略 `undefined` child，型別宣告仍不允許直接傳入，因此改用 `Element.append()` 依條件附加 `<body>`，而不是把三元運算式的結果當成 `xml()` 的參數傳入
  - 決定 `XMPPChat.deliver()` 改成接收 `body: string | undefined` 參數，`XMPPChatManager` 從實際的 stanza 取出 body 傳入
    - 已核對 `node_modules/ltx/src/Element.js`：`Element.getChildText(name)` 取不到對應子節點時回傳 `null`，呼叫端轉成 `undefined` 跟專案內其他 wrapper 檔案的慣例一致
  - 連動修正：`server/auctionSniper/Main.ts`、`tools/fake-auction.ts` 呼叫 `sendMessage()` 的地方改成不帶參數，移除沒用到的 `XMPPMessage` import
    - 已核對 `Main.ts` 的 `processMessage: () => {...}` 是零參數箭頭函式，不會用到 `chat`／`message` 參數，`XMPPMessage`／`XMPPChat` 簽名變動不影響它的行為
- goos-ts [`149d80a`](https://github.com/titangene/goos-ts/commit/149d80aa86c77de83e3942198003a0e7d66d1979)（對應 goos-java [`fba009d1`](https://github.com/titangene/goos-java/commit/fba009d197e0039b7a8a1845b56606cdde124568)）`red` ［11.2.4 p100］
  - 新增 `XMPPChatManager.createChat(peerJid, listener)`，補上 `ChatManager.createChat(userJID, listener)` 主動建立 `Chat` 的路徑（先前只有被動 fallback）
  - 新增 `XMPPConnection.getServiceName()`，對應 Smack `XMPPConnection.getServiceName()`，用 `@xmpp/client` 的 `xmppClient.jid.domain` 實作
- goos-ts [`28fec26d`](https://github.com/titangene/goos-ts/commit/28fec26d4fd3c31432c3925df489d28031d59677)（goos-java 尚無對應 commit，屬於架構方向決策）`red` ［11.2.1 p96］
  - 決定將 `@xmpp/client` 封裝成跟 Smack 相同介面的 wrapper，放在 `server/auctionSniper/xmpp/smack/`（詳見 [`docs/directory-structure.md`：目錄結構](./directory-structure.md#目錄結構)）
    - 目的：讓 goos-ts 接近 goos-code 的架構
    - 不完整實作 Smack 機制，只求符合 goos-code 實際的使用方式，並遵守 XP 簡單設計，做到讓對應測項變綠燈即可
    - wrapper 要涵蓋 Smack 介面裡的哪些方法/類別，隨逐步移植的 commit 增量決定，不會一次做出完整的 Smack API surface
    - 與 `poc` 分支既有結構的關係：`poc` 的 `server/auctionsniper/` 內層的 `smack/` 底下複刻了 Smack 類別命名（`XMPPPacketFilter`、`XMPPPacketListener` 等），方向合理，但實際內容仍依 skill 方法論重新推導，不直接沿用
    - 所有跟 Smack 行為有關的查證，一律解壓縮 goos-code 內建的 Smack 3.1.0 官方原始碼核對，不是憑訓練記憶：[`lib/develop/smack_src_3_1_0.zip`](https://github.com/titangene/goos-code/blob/312167f704c202527a3dbdf2ed6892d293d9bc04/lib/develop/smack_src_3_1_0.zip)，核對過 `ChatManager.java` / `Chat.java` / `XMPPConnection.java`
    - 已在 `28fec26d` 實作最小化版本：`XMPPConnection`、`XMPPChatManager`、`XMPPChat`、`XMPPMessage`、`XMPPMessageListener`、`XMPPChatManagerListener` 共 6 個檔案，只做 `FakeAuctionServer.ts` 實際呼叫到的方法子集，已核對每個檔案的實際內容如下：
      - `XMPPConnection` 用 `private constructor` + `static async connect(serviceUrl, username, password, resource)` 取代 Smack `new XMPPConnection(hostname)` + `connect()` + `login()` 三段式：`@xmpp/client` 的 `client()` 工廠函式在建立當下就要求帳密，沒辦法先建立連線物件、之後才單獨補上帳密，這是 xmpp.js 本身的技術限制，不是刻意合併三步驟的設計選擇
      - `XMPPConnection` 建構子直接建立 `XMPPChatManager`，不是 lazy：已查證真實 Smack `getChatManager()` 是第一次呼叫才 lazy 建立（`XMPPConnection.java:573-577`），這裡不是推翻那個查證結果，是刻意簡化成「連線建立時就開始監聽」，跟 Smack 行為不同，特別記錄避免以後誤以為兩者一致
      - 沒有 `addPacketListener` / `sendPacket` 這層分派機制：`XMPPChatManager` 直接拿到 `xmppClient` 自己訂閱 `'stanza'`，`XMPPChat` 直接拿到 `xmppClient` 自己 `send()`，不透過 `XMPPConnection` 中介
      - `XMPPChatManager` 建構子直接 `xmppClient.on('stanza', ...)`，filter 條件內嵌在同一個 callback 裡：`stanza.is('message') && !!stanza.attrs.from`，不再檢查 `type` 是否為 `groupchat` / `headline`（已查證 Smack 原版 `ChatManager.java:88-96` 有檢查），因為目前唯一會走到這條路徑的測項不會產生這類訊息
      - `XMPPChatManager` 只用一個 `chat: XMPPChat | undefined` 欄位記住唯一一個對話對象，不是 `Map`，沒有 thread ID 路由：Smack 需要 thread ID 是因為它自己「`createChat()` 主動建立時用完整 JID 當 key 存，但被動 fallback 卻用 bare JID 查」這個內部不一致，TS 版目前只有被動路由、只有一個對話對象，這個矛盾不存在
      - `XMPPChatManager.addChatListener`、`XMPPChat.addMessageListener` 都只存單一 listener（不是 `Set`）：目前只有一個消費者會註冊
      - `XMPPChat` 轉交訊息的方法命名為 `deliver()`，對應已查證的 Smack `Chat.deliver()`（`Chat.java:162`），但這個版本不接收 `stanza` 參數，內部直接 `new XMPPMessage()`
      - `XMPPMessage` 目前是空殼 class（沒有欄位），`XMPPChat.sendMessage(message)` 完全忽略參數內容，只送出空的 `<message>` stanza：對應這個 baby step 的 goos-java `1b295ee1`，`FakeAuctionServer.java` 的 `announceClosed()` 當時也只是 `currentChat.sendMessage(new Message())`，沒有內容
      - 命名慣例：wrapper 的 class / interface 全部加 `XMPP` 前綴，跟 Smack 原始類別名稱做區隔，也方便在 import 列表裡辨識
      - 依 XP 簡單設計移除的機制：`addPacketListener(listener, filter)` 通用分派層、`getChatManager()` 的 lazy 初始化、`Map` 追蹤多個對話對象、`Set` 儲存多個 listener、自訂錯誤轉譯層。這些都依 Smack 原始碼查證過對應行為，等真的出現第二個消費者、第二個同時進行的對話，或需要跟 Smack 行為完全一致時，再依當時的查證結果決定要不要恢復
