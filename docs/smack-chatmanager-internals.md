# Smack `ChatManager` 內部機制筆記

這份文件記錄 Java 版《GOOS》書中使用的 Smack 3.1.0（`~/project/clone/goos-code/lib/deploy/smack_3_1_0.jar`）的 `ChatManager`/`Chat`/`Message` 內部實作細節，供理解 Java 版 `XMPPAuction.java`/`FakeAuctionServer.java` 的行為，以及對照 [`xmpp-ts-vs-java-differences.md`](xmpp-ts-vs-java-differences.md) 說明 TS 版哪些地方需要對應實作、哪些不需要。

**查證方式**：用 IntelliJ 內建的 Fernflower 反編譯器（`java-decompiler.jar`）把 `smack_3_1_0.jar` 反編譯成可讀 Java 原始碼，直接讀取 `ChatManager`/`Chat`/`Message`/`Packet`/`MessageListener`/`ChatManagerListener`/`XMPPConnection`/`StringUtils` 這幾個 class，不是憑印象或訓練記憶推論。以下原始碼片段都是反編譯結果的逐字引用（變數名稱可能因反編譯而跟原始原始碼略有差異，但邏輯與方法簽章跟編譯進 jar 裡的完全一致）。

## ChatManager 如何建立 Chat：主動與被動兩種路徑

```java
public Chat createChat(String userJID, MessageListener listener) {
   String threadID;
   do {
      threadID = nextID();
   } while(this.threadChats.get(threadID) != null);
   return this.createChat(userJID, threadID, listener);
}

private Chat createChat(String userJID, String threadID, boolean createdLocally) {
   Chat chat = new Chat(this, userJID, threadID);
   this.threadChats.put(threadID, chat);
   this.jidChats.put(userJID, chat);
   for (ChatManagerListener listener : this.chatManagerListeners) {
      listener.chatCreated(chat, createdLocally);
   }
   return chat;
}
```

- **主動建立**（`XMPPAuction.java` 呼叫 `connection.getChatManager().createChat(auctionJID, translator)`）：產生一個隨機 `threadID`（`prefix + 遞增計數器`，`prefix` 是連線層級的隨機字串），同時把 `Chat` 存進兩張表：`threadChats[threadID]` 與 `jidChats[userJID]`（`userJID` 是呼叫端傳進來的**原始字串，不會被裁成 bare JID**）。建立完成後對所有已註冊的 `ChatManagerListener` 呼叫 `chatCreated(chat, true)`（`createdLocally=true`）。
- **被動建立**（`FakeAuctionServer.java` 收到陌生人主動傳來的第一則訊息時）：連線層級的 `PacketListener` 攔截所有 `Message` 封包，先嘗試用 thread ID/bare JID 找現有的 `Chat`（見下一節），找不到才呼叫 `createChat(message)`：

```java
private Chat createChat(Message message) {
   String threadID = message.getThread();
   if (threadID == null) {
      threadID = nextID();
   }
   String userJID = message.getFrom();
   return this.createChat(userJID, threadID, false);
}
```

被動建立時，`threadID` 直接沿用**對方訊息裡帶的 thread**（如果有），`userJID` 用 `message.getFrom()`（伺服器回報的寄件人，一定是含 resource 的完整 JID），`createdLocally=false`。

## 訊息路由比對規則：thread ID 優先，bare JID 其次

連線層級的 `PacketListener`（`ChatManager` 建構子裡註冊）收到訊息時的完整比對邏輯：

```java
connection.addPacketListener(new PacketListener() {
   public void processPacket(Packet packet) {
      Message message = (Message)packet;
      Chat chat;
      if (message.getThread() == null) {
         chat = ChatManager.this.getUserChat(StringUtils.parseBareAddress(message.getFrom()));
      } else {
         chat = ChatManager.this.getThreadChat(message.getThread());
         if (chat == null) {
            chat = ChatManager.this.getUserChat(StringUtils.parseBareAddress(message.getFrom()));
         }
      }
      if (chat == null) {
         chat = ChatManager.this.createChat(message);
      }
      ChatManager.this.deliverMessage(chat, message);
   }
}, filter);
```

比對優先序：

1. **訊息有 `thread`** → 先用 `getThreadChat(thread)`（`threadChats` 這張表，key 是 thread ID 字串）查，查到就用。
2. **查不到（或訊息根本沒有 `thread`）** → 退回用 `getUserChat(StringUtils.parseBareAddress(message.getFrom()))`（`jidChats` 這張表，但查詢的 key 是**去掉 resource 的 bare JID**）。
3. **兩者都查不到** → 呼叫 `createChat(message)` 被動建立一個新 `Chat`（見上一節）。

`StringUtils.parseBareAddress()` 的實作：

```java
public static String parseBareAddress(String XMPPAddress) {
   if (XMPPAddress == null) return null;
   int slashIndex = XMPPAddress.indexOf("/");
   if (slashIndex < 0) return XMPPAddress;
   return slashIndex == 0 ? "" : XMPPAddress.substring(0, slashIndex);
}
```

單純字串操作：找第一個 `/`，切掉之後的部分（resource）。

## 為什麼 thread ID 對 Smack 來說不是可有可無的最佳化

關鍵矛盾點：`createChat(userJID, listener)` 主動建立時，`jidChats` 存的 key 是**呼叫端傳入的原始字串**（可能含 resource），但上面第 2 步的 bare JID fallback 查詢時，key 是**去掉 resource 的字串**。這兩者不一定相等。

用書中實際的呼叫方式驗證這個矛盾是否真的會發生：

- `XMPPAuctionHouse.java`：`AUCTION_ID_FORMAT = ITEM_ID_AS_LOGIN + "@%s/" + AUCTION_RESOURCE`，也就是 `"auction-%s@%s/Auction"`——**含 resource**。`XMPPAuction.java` 建立 chat 時傳的 `auctionJID` 因此是完整 JID（例如 `auction-item-54321@localhost/Auction`），`jidChats` 存的 key 就是這個完整字串。
- 如果 Smack 沒有 thread ID 機制、只能靠 bare JID fallback：sniper 收到拍賣現場回覆時，`message.getFrom()` 也是完整 JID（`auction-item-54321@localhost/Auction`），bare JID fallback 會用 `parseBareAddress(...)` 把它裁成 `auction-item-54321@localhost` 去查 `jidChats`——但 `jidChats` 存的 key 是**沒裁過的完整字串**，兩者不相等，**查詢會失敗**。

**所以 thread ID 比對不是效能最佳化，而是這個「主動建立時用完整 JID 當 key、被動 fallback 卻用 bare JID 查」的自我不一致的真正解方**：因為 `Chat.sendMessage()`（見下一節）會讓每一則透過該 Chat 送出的訊息都自動帶上同一個 thread ID，所以只要通訊雙方有一方先用 `createChat()` 建立過 Chat，之後的每一輪回覆都會先命中 thread ID 比對（第 1 步），根本不會走到會失敗的 bare JID fallback（第 2 步）。

## `Chat.sendMessage()` 如何讓每則訊息自動帶上 thread ID

```java
public void sendMessage(String text) throws XMPPException {
   Message message = new Message(this.participant, Message.Type.chat);
   message.setThread(this.threadID);
   message.setBody(text);
   this.chatManager.sendMessage(this, message);
}

void deliver(Message message) {
   message.setThread(this.threadID);
   for (MessageListener listener : this.listeners) {
      listener.processMessage(this, message);
   }
}
```

`sendMessage(String)`（書中 `chat.sendMessage(JOIN_COMMAND_FORMAT)` 這種呼叫方式唯一用到的多載）**每次呼叫都會把該 `Chat` 自己的 `threadID` 蓋到送出的 `Message` 上**，呼叫端完全不用手動處理。`deliver()` 也會在轉交給 listener 前重新設定 thread（確保收到的 `Message` 物件上的 thread 欄位跟這個 `Chat` 一致，即使伺服器回傳的原始訊息因故沒帶 thread）。

`Chat` 的 `equals()` 也印證 thread ID 是 Chat 身分的一部分，不只是 JID：

```java
public boolean equals(Object obj) {
   return obj instanceof Chat
       && this.threadID.equals(((Chat)obj).getThreadID())
       && this.participant.equals(((Chat)obj).getParticipant());
}
```

## 這個比對規則在 TS 版是否需要對應實作

**結論：不需要**，原因記錄在 [`xmpp-ts-vs-java-differences.md`](xmpp-ts-vs-java-differences.md) 差異 2，這裡展開完整推理。

TS 版 `XMPPChatManager.dispatch()` 只用 stanza 的 `from` 屬性（完整 JID，含 resource）當唯一的比對 key，沒有 thread ID 這一層。這在 Smack 裡會出問題（前一節已證明），但在 TS 版裡不會出問題，因為：

1. **TS 版的 `XMPPChat` 儲存 key 用的也是完整 JID**——`XMPPAuction.ts` 呼叫 `connection.getChatManager().createChat(auctionJID, translator)` 的 `auctionJID` 就是完整 JID（`auction-${itemId}@${domain}/Auction`，跟 Java 版 `AUCTION_ID_FORMAT` 格式一致）。
2. **TS 版的比對永遠用完整 JID，沒有 bare JID fallback 這條路徑**——不像 Smack 主動建立用完整 JID 存、被動 fallback 卻用 bare JID 查，TS 版兩邊（存與查）都是完整 JID，天生一致，不會出現 Smack 需要 thread ID 補救的那種自我矛盾。
3. **本專案的使用情境本來就是嚴格 1:1**——一個 `XMPPAuction` 實例從頭到尾只跟一個固定的 `auctionJID` 對話，一個 `FakeAuctionServer` 實例從頭到尾只跟第一個主動聯繫它的 sniper 對話。Smack 的 thread ID 機制是為了讓「同一組使用者，同時開多個不同主題的對話視窗」這種泛用聊天情境也能正確分流，這個需求在拍賣協定裡不存在。

因此 TS 版沒有 `getThreadID()`、`threadChats` 這張表、也沒有在 `Message`/stanza 上處理 `thread` 欄位——這是刻意省略，不是遺漏。

## `Message`/`Packet` 的完整欄位，跟書中實際用到的部分

`Message extends Packet`，`Packet` 提供 `getFrom()`/`setFrom()`/`getTo()`/`setTo()`/`getPacketID()`；`Message` 自己額外提供 `getType()`/`setType()`（`Type` 列舉：`normal`/`chat`/`groupchat`/`headline`/`error`）、`getSubject()`/`setSubject()`、`getBody()`/`setBody()`/`getBody(String language)`（多語系版本）、`getBodies()`/`addBody()`/`removeBody()`、`getThread()`/`setThread()`。

查過書中所有 XMPP 相關原始碼（`XMPPAuction.java`、`AuctionMessageTranslator.java`、`FakeAuctionServer.java`、`XMPPAuctionHouse.java`），`Message` 物件實際只被呼叫過 `getBody()`（`AuctionMessageTranslator.processMessage(Chat chat, Message message)` 裡的 `message.getBody()`，以及測試用的 Hamcrest `hasProperty("body", matcher)` 透過反射呼叫同一個 getter）。`getType()`/`getSubject()`/`getBody(String language)`/`getThread()`/`getPacketID()`/`getFrom()`/`getTo()` 都沒有被書中程式碼直接呼叫過（`getFrom()`/`getThread()`/`setThread()` 只在 Smack 內部的 `ChatManager`/`Chat` 自己使用，見前面幾節）。TS 版的 `XMPPMessage.ts` 因此只實作 `getBody()`。

## `MessageListener`/`ChatManagerListener` 介面

```java
public interface MessageListener {
   void processMessage(Chat var1, Message var2);
}

public interface ChatManagerListener {
   void chatCreated(Chat var1, boolean var2);
}
```

兩個都是單一方法的介面，簽章跟前面幾節描述的呼叫方式一致。`ChatManagerListener#chatCreated()` 的 `boolean createdLocally` 參數，查過書中所有實作（`FakeAuctionServer.java` 是書中唯一實作 `ChatManagerListener` 的地方）都沒有讀取這個參數：

```java
connection.getChatManager().addChatListener(new ChatManagerListener() {
  public void chatCreated(Chat chat, boolean createdLocally) {
    currentChat = chat;
    chat.addMessageListener(messageListener);
  }
});
```

TS 版的 `ChatCreatedListener` 型別因此省略這個參數（`(chat: XMPPChat) => void`），見 [`xmpp-ts-vs-java-differences.md`](xmpp-ts-vs-java-differences.md)。

## `XMPPConnection` 相關方法簽章

書中實際用到的子集（用 `javap`/反編譯直接核對過，`XMPPConnection.java` 本身有上百個方法，這裡只列書中用到的）：

```java
public XMPPConnection(String serviceName)
public void connect() throws XMPPException
public synchronized void login(String username, String password, String resource) throws XMPPException
public String getUser()
public synchronized ChatManager getChatManager()
public void disconnect()
```

`XMPPConnection` 建構子/`connect()`/`login()` 是三個分開的呼叫，TS 版 `XMPPConnection.connect()` 把這三步合併成一個 async factory，原因見 [`xmpp-ts-vs-java-differences.md`](xmpp-ts-vs-java-differences.md) 差異 1（xmpp.js 本身的 API 設計就是這樣，不是 TS port 隨意合併）。
