# Java 語言機制轉換筆記

這份文件記錄 Java 語言/執行環境本身的機制（不是協定或架構層級的決策）在轉譯成 TypeScript 時，單看兩邊原始碼**不容易直覺看出「為什麼長得不一樣」**的地方。跟 [`differences-from-java.md`](differences-from-java.md) 的分工是：那份文件講「拍賣協定/domain 層為什麼要這樣改」，這份文件講「Java 這個語法/機制本身，TypeScript 沒有對應物或運作方式完全不同，所以程式碼結構才會不一樣」。

## 1. Enum 的每個成員各自覆寫方法

Java 的 `enum` 可以讓每個常數各自提供不同的方法實作（等於是每個常數都是一個匿名子類別）。TypeScript 的 `enum` 純粹是值的集合，不能附加行為，更不可能讓每個成員各自覆寫方法。

**Java（`SniperState.java`）：**

```java
public enum SniperState {
  JOINING {
    @Override public SniperState whenAuctionClosed() { return LOST; }
  },
  BIDDING {
    @Override public SniperState whenAuctionClosed() { return LOST; }
  },
  WINNING {
    @Override public SniperState whenAuctionClosed() { return WON; }
  },
  LOSING {
    @Override public SniperState whenAuctionClosed() { return LOST; }
  },
  LOST, WON, FAILED;

  public SniperState whenAuctionClosed() {
    throw new Defect("Auction is already closed");
  }
}
```

呼叫端（`XMPPAuction`/`SniperSnapshot`）直接呼叫 `state.whenAuctionClosed()`，語法上完全看不出這是「查表」還是「多型分派」——這正是 Java enum 這個機制刻意提供的能力：呼叫端不用關心。

**TS（`SniperState.ts`）：**

```ts
export enum SniperState {
  JOINING,
  BIDDING,
  WINNING,
  LOSING,
  LOST,
  WON,
  FAILED
}

const CLOSE_TRANSITIONS: Partial<Record<SniperState, SniperState>> = {
  [SniperState.JOINING]: SniperState.LOST,
  [SniperState.BIDDING]: SniperState.LOST,
  [SniperState.WINNING]: SniperState.WON,
  [SniperState.LOSING]: SniperState.LOST
};

export function whenAuctionClosed(state: SniperState): SniperState {
  const next = CLOSE_TRANSITIONS[state];
  if (next === undefined) throw new Defect('Auction is already closed');
  return next;
}
```

呼叫端因此也從 `state.whenAuctionClosed()`（方法呼叫）變成 `whenAuctionClosed(state)`（獨立函式）——**這是宣告方式差異直接影響呼叫端寫法**的例子。`Column.java`/`Column.ts`（`ui/Column`）是同一個機制的另一個實例，但因為 `Column` 除了行為還要被當集合走訪（`Column.values`），TS 版改用 class + 具名靜態實例，不是查表，細節見 [`differences-from-java.md` 第 9 節](differences-from-java.md#9-domainutil-層的框架轉換差異)。

## 2. 巢狀類別/介面（Nested Types）

Java 的 class 可以在另一個 class/interface 裡面宣告巢狀型別，依有沒有 `static` 修飾詞分兩種，語意完全不同。TypeScript 的 class 不支援巢狀宣告 class/interface，全部都要拉成頂層宣告，用檔案或 module 邊界做「屬於誰」的分組。

### 2.1 `static` 巢狀類別/介面——純粹是命名空間

`static` 巢狀型別不持有外部類別的實例參照，本質上只是把型別名字掛在外部類別底下（`Outer.Inner`），純粹是命名空間整理，不是真的耦合。

**Java（`UserRequestListener.java`）：**

```java
public interface UserRequestListener extends EventListener {
  void joinAuction(Item item);

  public static class Item {
    public final String identifier;
    public final int stopPrice;
    public Item(String identifier, int stopPrice) { ... }
    public boolean allowsBid(int bid) { return bid <= stopPrice; }
  }
}
```

呼叫端要用 `UserRequestListener.Item`（完整路徑）或在 import 後直接用 `Item`。

**TS（`UserRequestListener.ts`）：** `Item` 直接拉成同檔案內的頂層 `export class`，跟 `UserRequestListener` 介面平行放，import 時就是 `import { Item } from './UserRequestListener.ts'`，不需要 `UserRequestListener.Item` 這種路徑寫法——因為 TS 沒有「掛在另一個型別底下」這個語法位置。

`SniperPortfolio.PortfolioListener` 是同樣的情況（`public interface PortfolioListener extends EventListener { ... }` 巢狀在 `SniperPortfolio` 裡），TS 版 `PortfolioListener` 一樣拉平成 `SniperPortfolio.ts` 裡的頂層 `export interface`。

### 2.2 非 `static` 內部類別（inner class）——隱含外部實例參照

沒有 `static` 修飾詞的內部類別，每個實例都隱含持有一個外部類別實例的參照（`Outer.this`），可以直接存取外部實例的欄位/方法，不需要顯式傳入。

**Java（`FakeAuctionServer.java`）：**

```java
public class FakeAuctionServer {
  private Chat currentChat;
  ...
  public class SingleMessageListener implements MessageListener {
    private final ArrayBlockingQueue<Message> messages = new ArrayBlockingQueue<Message>(1);
    public void processMessage(Chat chat, Message message) {
      messages.add(message);
    }
    ...
  }
}
```

`SingleMessageListener` 宣告成外部類別 `FakeAuctionServer` 的內部類別（雖然這個例子沒有真的用到 `FakeAuctionServer.this` 存取外部欄位，但語言層級上就是隱含可以這樣做）。要建立實例得先有外部實例：`fakeAuctionServer.new SingleMessageListener()`。

**TS（`test/e2e/FakeAuctionServer.ts`）：** `SingleMessageListener` 是同檔案內完全獨立的頂層 class，跟 `FakeAuctionServer` 沒有任何隱含連結，`new SingleMessageListener()` 不需要先有 `FakeAuctionServer` 實例——TS 沒有「內部類別隱含持有外部實例」這個語言機制，需要存取外部狀態的話，只能透過建構子明確傳入參照或閉包捕獲（見下一節）。

### 2.3 `private static` 巢狀類別——封裝實作細節

Java 用 `private static class` 把只給類別內部使用的輔助資料結構藏起來，外部完全看不到、也拿不到這個型別。

**Java（`AuctionMessageTranslator.java`）：**

```java
public class AuctionMessageTranslator implements MessageListener {
  ...
  private static class AuctionEvent {
    private final Map<String, String> fields = new HashMap<String, String>();
    ...
    static AuctionEvent from(String messageBody) { ... }
  }
  private static class MissingValueException extends Exception {
    public MissingValueException(String fieldName) {
      super("Missing value for " + fieldName);
    }
  }
}
```

**TS（`server/auctionsniper/redis/AuctionMessageTranslator.ts`）：** `AuctionEvent`、`MissingValueException` 都拉成同檔案內**沒有 `export`** 的頂層 class——沒有 `export` 就等於這個模組外部完全 import 不到，達到跟 Java `private static class` 一樣的封裝效果，只是機制從「巢狀 + `private`」變成「模組邊界（沒有 `export`）」。

## 3. 匿名類別（Anonymous Classes）

Java 常常在呼叫某個方法時，直接就地建立一個實作特定介面/繼承特定類別的匿名類別實例，當作 callback 傳進去——這是 Java 8 lambda 普及之前，表達「一段行為」最主要的手段。TypeScript/JavaScript 從一開始就有 function 是一等公民、閉包，不需要用 class 語法表達「一段可以傳來傳去的行為」。

**Java（`XMPPAuction.java`）：**

```java
private AuctionEventListener chatDisconnectorFor(final AuctionMessageTranslator translator) {
  return new AuctionEventListener() {
    public void auctionFailed() { chat.removeMessageListener(translator); }
    public void auctionClosed() { }
    public void currentPrice(int price, int increment, PriceSource priceSource) { }
  };
}
```

**TS（`RedisAuction.ts`）：**

```ts
private channelDisconnectorFor(translator: AuctionMessageTranslator): AuctionEventListener {
  return {
    auctionFailed: () => this.channel.removeMessageListener(translator),
    auctionClosed: () => {},
    currentPrice: (_price: number, _increment: number, _priceSource: PriceSource) => {},
  };
}
```

TS 版用物件字面量（object literal）取代匿名類別——因為 TypeScript 是結構型別，一個物件只要「長得像」`AuctionEventListener`（有同樣簽章的三個方法）就會被當成 `AuctionEventListener` 使用，不需要用 `class X implements AuctionEventListener` 這種名義型別（nominal typing）語法明確宣告「這是一個 AuctionEventListener」。

方法名稱從 `chatDisconnectorFor` 改成 `channelDisconnectorFor`（`chat` 欄位也改成 `channel`），是這份文件少數**刻意**不逐字沿用 Java 名稱的地方——原因見 [`differences-from-java.md` 第 7 節](differences-from-java.md#7-redischannel-沿用-node-redis-的-per-channel-callback-機制)，`Chat` 這個名字底下會誤導讀者以為有 Smack `Chat` 那種協定天生的點對點保證。

其他同樣模式的例子（Java 用匿名類別，對應的 TS 檔案改用物件字面量或箭頭函式）：

- `FakeAuctionServer.java` 的 `connection.getChatManager().addChatListener(new ChatManagerListener() { ... })`——這段邏輯本身在 TS 版因為 `RedisConnection.createChannel()` 直接建構 `RedisChannel`（不需要「等對方建立 chat 才能拿到」這個非同步通知），整段被省略，細節見 [`differences-from-java.md` 第 4 節](differences-from-java.md#4-redisclienttype-沒有-getuser所以包了一個-redisconnection)。
- `Main.java` 的 `SwingUtilities.invokeAndWait(new Runnable() { public void run() { ... } })`、`ui.addWindowListener(new WindowAdapter() { ... })`——這兩處都沒有 TS 對應物，因為 `Main.java` 整個檔案的職責（啟動 Swing UI、視窗關閉時斷線）被 Nuxt 的 plugin 生命週期（`server/plugins/init-sniper-launcher.ts`）取代，不是逐行對應的翻譯關係。這裡列出來只是作為「Java 匿名類別 → TS 箭頭函式/物件字面量」這個一般性模式的示範。

## 4. Checked Exception（受檢例外）

Java 的方法簽章可以宣告 `throws SomeCheckedException`，編譯器會強制呼叫端要嘛 `try/catch` 處理、要嘛在自己的簽章也宣告 `throws` 往外傳——這是編譯期強制的契約。TypeScript/JavaScript **完全沒有受檢例外**：任何函式都可能拋出任何東西，型別簽章上完全看不出來，呼叫端要不要 `try/catch`全憑自己判斷，編譯器不會檢查也不會提示。

**Java（`XMPPAuctionHouse.java`）：**

```java
public static XMPPAuctionHouse connect(String hostname, String username, String password)
    throws XMPPAuctionException {
  XMPPConnection connection = new XMPPConnection(hostname);
  try {
    connection.connect();
    connection.login(username, password, AUCTION_RESOURCE);
    return new XMPPAuctionHouse(connection);
  } catch (XMPPException xmppe) {
    throw new XMPPAuctionException("Could not connect to auction: " + connection, xmppe);
  }
}
```

`connect()` 簽章上的 `throws XMPPAuctionException` 是**呼叫端看得到、編譯器會檢查**的契約——呼叫 `XMPPAuctionHouse.connect(...)` 的地方，不處理這個例外的話根本編譯不過。

**TS（`RedisAuctionHouse.ts`）：**

```ts
static async connect(redisUrl: string, sniperId: string): Promise<RedisAuctionHouse> {
  const connection = new RedisConnection(redisUrl);
  try {
    await connection.connect();
    connection.login(sniperId);
    return new RedisAuctionHouse(connection);
  } catch (cause) {
    throw new RedisAuctionException(`Could not connect to auction: ${String(cause)}`, cause);
  }
}
```

函式內部的 try/catch 包裝邏輯逐行對應，但 `Promise<RedisAuctionHouse>` 這個回傳型別完全沒有「這個函式可能 reject 成 `RedisAuctionException`」的資訊——呼叫端得自己讀程式碼或文件才知道要接。這是 TypeScript/JavaScript 本身的限制，不是這個專案的取捨。

同樣道理，`AuctionEvent.get(fieldName)` 在 Java 宣告 `throws MissingValueException`（`AuctionMessageTranslator.AuctionEvent`），TS 版的 `get(fieldName)` 就是普通的 `throw new MissingValueException(fieldName)`，簽章上不會出現 `: never` 或任何「這個方法會拋例外」的型別標記。

## 5. `final`/effectively final——匿名類別捕獲區域變數的限制

Java 的匿名類別（見第 3 節）要存取外層方法的區域變數，該變數必須宣告成 `final`（Java 8 之後可以省略關鍵字，只要「事實上沒有被重新賦值」即可，稱 effectively final）——這是 Java 編譯器對閉包捕獲施加的限制，不是任意設計選擇。

**Java（`XMPPAuction.java`）：**

```java
private AuctionEventListener chatDisconnectorFor(final AuctionMessageTranslator translator) {
  return new AuctionEventListener() {
    public void auctionFailed() { chat.removeMessageListener(translator); }
    ...
  };
}
```

參數 `translator` 之所以要標 `final`，純粹是因為它被底下的匿名類別捕獲使用——如果拿掉 `final`（且方法內有重新賦值 `translator`的行為），Java 編譯不過。

TypeScript/JavaScript 的閉包沒有這個限制：**任何**區域變數，不管是 `const` 還是 `let`，都可以被內層函式自由捕獲，不需要任何特殊標記：

```ts
private channelDisconnectorFor(translator: AuctionMessageTranslator): AuctionEventListener {
  return {
    auctionFailed: () => this.channel.removeMessageListener(translator),
    ...
  };
}
```

所以 TS 版看到的 Java `final` 參數/區域變數，大多數情況下**不代表**「這是一個特別重要、要強調不可變的值」，只是「這個變數被匿名類別捕獲了，Java 語法規定一定要標」——這是為什麼這個專案的 TS 程式碼沒有刻意到處加 `readonly`/`const` 去對應 Java 每一個 `final`（欄位宣告的 `readonly` 例外，那是對應 Java 欄位的 `final` 語意，不是這裡講的閉包捕獲限制）。

## 6. Static Factory + Private Constructor

Java 沒有「具名建構子」（named constructor）這個語言特性，所有建構子都只能叫 `ClassName(...)`，沒辦法像某些語言一樣寫 `ClassName.joining(...)`、`ClassName.bidding(...)` 這種語意化名稱的建構子。慣用手法是把建構子標成 `private`，另外提供 `public static` 工廠方法。

**Java（`SniperSnapshot.java`）：**

```java
public class SniperSnapshot {
  public SniperSnapshot(String itemId, int lastPrice, int lastBid, SniperState state) { ... }

  public static SniperSnapshot joining(String itemId) {
    return new SniperSnapshot(itemId, 0, 0, SniperState.JOINING);
  }
}
```

（這裡建構子本身其實還是 `public`，`SniperSnapshot` 兩種建構方式並存；但 `AuctionMessageTranslator.AuctionEvent` 就是真的把建構子標 `private`，只能透過 `static from(...)` 建立實例。）

**TS 對應（`SniperSnapshot.ts`、`AuctionMessageTranslator.ts` 的 `AuctionEvent`）：** 直接照抄同樣的 `private constructor()` + `static from(...)`/`static joining(...)` 寫法——雖然 TypeScript 其實也沒有「具名建構子」，但這個 static-factory 模式本身在 TS 也通用，用同一種寫法保留跟 Java 一致的閱讀體感，是刻意選擇貼齊 Java 風格，不是語言限制逼出來的（跟前面幾節「Java 有、TS 沒有對應機制」的情況不同，這節是「兩邊都能表達，選擇用一樣的寫法」）。

## 7. 繼承具體的 UI 框架類別（`extends AbstractTableModel`）

Java 的 `SnipersTableModel` 除了 `implements SniperListener, PortfolioListener` 兩個介面，還 `extends javax.swing.table.AbstractTableModel`——這是 Swing 框架要求的：只有繼承 `AbstractTableModel`（或實作 `TableModel` 介面）的類別，才能被 `JTable` 接受當作資料來源，`AbstractTableModel` 本身提供 `addTableModelListener()`/`fireTableRowsInserted()` 等內建的通知機制實作，子類別只需要覆寫 `getRowCount()`/`getColumnCount()`/`getValueAt()` 等少數方法。

```java
public class SnipersTableModel extends AbstractTableModel implements SniperListener, PortfolioListener {
  ...
}
```

TypeScript 沒有一個等價於 `AbstractTableModel` 的框架基底類別可以繼承（`SnipersTableModel.ts` 也不需要真的被某個 UI 框架的元件接受），`SnipersTableModel.ts` 因此是一個完全獨立的 class，`getColumnCount()`/`getRowCount()`/`getColumnName()`/`getValueAt()` 都是自己刻的方法（對應 Java 覆寫 `AbstractTableModel` 的部分），但監聽者註冊機制（`addListener()`/`SnipersTableListener`）也要自己刻——Java 版這部分是繼承 `AbstractTableModel` 免費拿到的，TS 版沒有可以繼承的對象，只能自己補。細節見 [`differences-from-java.md` 第 9 節](differences-from-java.md#9-domainutil-層的框架轉換差異)。

## 8. 建構子多載（Constructor Overloading）

Java 支援同一個 class 宣告多個同名但參數列不同的建構子。TypeScript 的 class 語法上也支援多個建構子「簽章」宣告，但**實作只能有一個**（多個簽章 + 一個實作本體，簽章之間用 union/optional 參數表達差異），不是 Java 那種每個多載各自獨立實作。

**Java（`util/Defect.java`）：**

```java
public class Defect extends RuntimeException {
  public Defect() { super(); }
  public Defect(String message, Throwable cause) { super(message, cause); }
  public Defect(String message) { super(message); }
  public Defect(Throwable cause) { super(cause); }
}
```

四個建構子多載，但整個 `goos-code` 原始碼裡唯一實際用到的只有 `new Defect(String message)` 這個版本（`SniperState.java`、`ui/SnipersTableModel.java` 都只用這個）。

**TS（`util/Defect.ts`）：**

```ts
export class Defect extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'Defect';
  }
}
```

只保留實際被使用的那個版本，沒有多載其餘三個 Java 有但從未被呼叫過的建構子——這不是語言能力的限制（TS 要多載簽章也做得到），是刻意不新增書中原始碼裡從未真正用到的 API 表面積。

## 9. 程式進入點（`public static void main`）

Java 應用程式的進入點是 `public static void main(String[] args)`，JVM 啟動時直接呼叫這個方法，`args` 是命令列參數陣列。

```java
public static void main(String... args) throws Exception {
  Main main = new Main();
  XMPPAuctionHouse auctionHouse = XMPPAuctionHouse.connect(args[ARG_HOSTNAME], args[ARG_USERNAME], args[ARG_PASSWORD]);
  main.disconnectWhenUICloses(auctionHouse);
  main.addUserRequestListenerFor(auctionHouse);
}
```

`goos-ts` 沒有等價於 `main()` 的單一進入點——Nuxt/Nitro 的伺服器啟動模型是「插件（plugin）在伺服器啟動時被自動執行」，對應的是 `server/plugins/init-sniper-launcher.ts`；設定值（對應 Java 的命令列參數 `args[ARG_HOSTNAME]` 等）改用環境變數（`REDIS_URL`）搭配 Nuxt `runtimeConfig`（`nuxt.config.ts` 的 `sniperId`），不是啟動時傳入的參數陣列。這是 Node.js/Nuxt 應用程式的啟動模型本身跟 JVM 命令列應用程式不同造成的，README 的「程式進入點」比較表已有記錄，這裡補充說明差異的根源。

## 10. Getter 方法 vs 直接公開欄位

Java 慣用手法是把欄位宣告成 `private`，另外提供 `public` 的 getter 方法存取——即使欄位值建構後就不會再變。這個專案的 domain 類別（`SniperSnapshot`、`UserRequestListener.Item`）其實大多直接用 `public final` 欄位，沒有走 getter，但測試用的 `FakeAuctionServer.java` 用了這個模式：

```java
public class FakeAuctionServer {
  private final String itemId;
  ...
  public String getItemId() {
    return itemId;
  }
}
```

呼叫端要用 `auctionServer.getItemId()`（方法呼叫）。

**TS（`test/e2e/FakeAuctionServer.ts`）：**

```ts
export class FakeAuctionServer {
  constructor(public readonly itemId: string) { ... }
}
```

呼叫端對應改成 `auctionServer.itemId`（直接存取欄位，沒有 `()`）——TypeScript 用建構子參數屬性（constructor parameter property）`public readonly` 直接把參數宣告成一個唯讀公開欄位，不需要另外寫 getter 方法，因為 TS 沒有 Java 那種「即使不可變也要包一層方法」的封裝慣例，唯讀公開欄位本身就已經表達了「外部只能讀、不能寫」。

## 11. 執行緒（Thread）——兩種不同用途

Java 的 `Thread` 在這個專案裡有兩種完全不同的用途，TS 版都沒有對應物，但原因不一樣：

- **`SwingThreadSniperListener`**：把通知轉派到 Swing 的 Event Dispatch Thread，見 [`differences-from-java.md` 第 9 節](differences-from-java.md#9-domainutil-層的框架轉換差異)。
- **`test/end-to-end/ApplicationRunner.java` 的 `startSniper()`**：在**背景執行緒**啟動整個應用程式（`Main.main(...)`），讓測試主執行緒可以繼續往下執行、用 WindowLicker 的 `AWTEventQueueProber` 輪詢等待 UI 準備好：

  ```java
  private void startSniper() {
    logDriver.clearLog();
    Thread thread = new Thread("Test Application") {
      @Override public void run() {
        try {
          Main.main(XMPP_HOSTNAME, SNIPER_ID, SNIPER_PASSWORD);
        } catch (Exception e) {
          e.printStackTrace();
        }
      }
    };
    thread.setDaemon(true);
    thread.start();
    ...
    driver = new AuctionSniperDriver(1000);
    driver.hasTitle(MainWindow.APPLICATION_TITLE);
    driver.hasColumnTitles();
  }
  ```

  `goos-ts` 的對應方法 `ApplicationRunner.ts` 的 `startSniper()` 完全不需要背景執行緒：Playwright 的 `page.goto('/')`（`AuctionSniperDriver.goto()`）本身就是非同步、不會阻塞——瀏覽器頁面載入跟測試程式碼**本來就是兩個獨立的執行環境**（頁面在瀏覽器 process 裡跑，測試程式碼在 Node process 裡跑），不需要像 Java 那樣手動開一個執行緒把應用程式跟測試斷開。

## 12. `@Override` 註解

Java 的 `@Override` 是編譯期檢查用的 annotation：標了它、但方法簽章其實沒有真的覆寫任何父類別/介面方法的話，編譯器會報錯，純粹是防呆用途，不影響執行期行為。TypeScript 有一個語意類似的 `override` 關鍵字（TS 4.3+），但只用在 class 繼承另一個 class 的情境；這個專案的 TS 版幾乎都是「implements 介面」而非「extends 類別」，介面實作在 TypeScript 是純結構比對，不需要、也沒有語法可以標註「這個方法是在實作某個介面」，因此 Java 原始碼裡大量的 `@Override` 在 TS 版對應的方法上完全不會出現任何標記——不是漏寫，是 TS 的結構型別本來就不需要。

## 13. 其他已在 `differences-from-java.md` 記錄的語言/機制差異

以下幾個語言機制轉換已經在 [`differences-from-java.md` 第 9 節](differences-from-java.md#9-domainutil-層的框架轉換差異)詳細說明，這裡只列出條目、不重複內容：

- **Marker interface（`extends java.util.EventListener`）**沒有 TS 對應物——TS 結構型別不需要顯式標記「這是一個 listener」。
- **`java.lang.reflect.Proxy` 動態代理**改用 JS 原生 `Proxy`（`Announcer`）。
- **Apache Commons 反射式 `equals()`/`hashCode()`/`toString()`**（`EqualsBuilder`/`HashCodeBuilder`/`ToStringBuilder`）整組省略，改用 Vitest `toEqual()` 做深度結構比較。
- **執行緒轉派**（`SwingThreadSniperListener`/`SwingUtilities.invokeLater()`）在 TS 版整個刪除——Node.js 單執行緒事件迴圈沒有「必須轉派到特定執行緒才能安全更新 UI」這個問題。
