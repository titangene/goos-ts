# Redis Pub/Sub 與 MQTT 的實作對照

[ADR-0002](adr/ADR-0002-mqtt-replaces-redis.md) 已決定拍賣協定使用 MQTT + Mosquitto。這份文件在**實作層級**對照「同一段 Java 邏輯，換成 Redis Pub/Sub 或 MQTT 各自要怎麼寫」，重點是理解兩種 broker 在 client library API 形狀上的真實差異，而不是重複 ADR-0002 已經講過的選型理由。

**範圍說明**：以下 Redis 版程式碼，套用的是跟目前 `server/auctionsniper/mqtt/*`（下稱「MQTT 版」）一致的 Java-fidelity 準則（[ADR-0001](adr/ADR-0001-decision-principles.md) 及後續各篇 ADR），因此在 Connection 持有身分、Channel 實作 `MessageListener`、topic 拓樸、訊息格式等地方，寫法會跟 git 歷史紀錄裡曾經存在過的 `server/auctionsniper/redis/*` 不同——那個版本的設計早於 [ADR-0003](adr/ADR-0003-username-only-identity.md)、[ADR-0006](adr/ADR-0006-mqtt-topic-topology.md)、[ADR-0007](adr/ADR-0007-message-format.md)，因此有幾處跟 Java 版不必要的落差（例如沒有 Connection 包裝層、訊息用 JSON、單一 channel 雙向收發）。這裡呈現的是套用同一套準則後、能跟 MQTT 版公平對照的版本。

跟 [`differences-from-java.md`](differences-from-java.md) 的分工：那份文件講「MQTT 版跟 Java 版本身的刻意差異」，這份文件講「Redis 版跟 MQTT 版之間，純粹因為 broker 不同而必然不同的地方」。

## 1. 檔案對照總表

| Java（`goos-code`）                                                     | Redis Pub/Sub 版                 | MQTT 版（目前實作）             | 兩個 TS 版本是否相同                |
| ----------------------------------------------------------------------- | -------------------------------- | ------------------------------- | ----------------------------------- |
| `XMPPAuctionHouse.java`                                                 | `RedisAuctionHouse.ts`           | `MqttAuctionHouse.ts`           | 結構相同，只換型別名稱              |
| `XMPPConnection`（Smack）                                               | `RedisConnection.ts`             | `MqttConnection.ts`             | **不同**（見第 3、5 節）            |
| `XMPPAuction.java`                                                      | `RedisAuction.ts`                | `MqttAuction.ts`                | 結構相同，只換型別名稱              |
| `org.jivesoftware.smack.Chat`                                           | `RedisChannel.ts`                | `MqttChannel.ts`                | **不同**（見第 5 節）               |
| `org.jivesoftware.smack.MessageListener`                                | `MessageListener.ts`             | `MessageListener.ts`            | 結構相同，只換 `channel` 參數型別   |
| `AuctionMessageTranslator.java`                                         | `AuctionMessageTranslator.ts`    | `AuctionMessageTranslator.ts`   | 邏輯完全相同（見第 8 節）           |
| `XMPPAuctionException.java`                                             | `RedisAuctionException.ts`       | `MqttAuctionException.ts`       | 結構相同，只換型別名稱              |
| `XMPPFailureReporter.java`                                              | `RedisFailureReporter.ts`        | `MqttFailureReporter.ts`        | 結構相同，只換型別名稱              |
| `LoggingXMPPFailureReporter.java`                                       | `LoggingRedisFailureReporter.ts` | `LoggingMqttFailureReporter.ts` | 結構相同，只換型別名稱              |
| （訊息格式，[ADR-0007](adr/ADR-0007-message-format.md)）                | `Message.ts`                     | `Message.ts`                    | **完全相同**（見第 8 節）           |
| （topic/channel 拓樸，[ADR-0006](adr/ADR-0006-mqtt-topic-topology.md)） | `Topic.ts`（channel 命名）       | `Topic.ts`（topic 命名）        | 邏輯相同，命名慣例不同（見第 7 節） |

## 2. 先講結論：差異集中在哪一層

`AuctionHouse`/`Auction`/`AuctionMessageTranslator`/`Message`/`Exception`/`FailureReporter` 這幾層完全不管底層是 Redis 還是 MQTT——因為它們對應的 Java 邏輯（連線建立的兩層例外包裝、`translatorFor(connection)`、SOL 純文字格式解析、身分白名單）本身就是 broker-agnostic 的，[ADR-0001](adr/ADR-0001-decision-principles.md)~[ADR-0003](adr/ADR-0003-username-only-identity.md)、[ADR-0007](adr/ADR-0007-message-format.md) 訂出的準則同樣適用於任何 broker。

真正因為 client library 形狀不同而必然不同的，只有 **Connection 層**跟 **Channel 層**：

| 面向                       | Redis Pub/Sub（`redis` v6，node-redis）                     | MQTT（`mqtt` v5，mqtt.js）                                  |
| -------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------- |
| 連線數量                   | 兩條連線（publisher + subscriber，見第 3 節）               | 一條連線可同時 publish/subscribe                            |
| 訊息監聽粒度               | `subscribe(channel, listener)`，per-channel 各自的 callback | `client.on('message', ...)`，整個 client 共用單一事件       |
| 因此需不需要手動過濾 topic | 不需要（見第 5 節）                                         | 需要（`MqttChannel` 得自己判斷 `topic === subscribeTopic`） |
| 循序保證                   | 單一 TCP 連線天生保證，不需設定（見第 6 節）                | 需要明確 `{ qos: 1 }`（見第 6 節，ADR-0002 Compliance #3）  |
| channel/topic 命名慣例     | `auction:<itemId>:commands`（`:` 分隔）                     | `auction/<itemId>/commands`（`/` 分隔）                     |
| 離線期間的訊息保留         | 無（subscriber 離線時發布的訊息直接遺失，無持久化）         | 依 broker session/QoS 設定，可能有限度保留                  |

## 3. Connection 層：身分怎麼存

Java 版身分存在 `XMPPConnection`，`XMPPAuction` 要用時現查 `connection.getUser()`：

```java
// XMPPAuctionHouse.java
public Auction auctionFor(Item item) {
  return new XMPPAuction(connection, auctionId(item.identifier, connection), failureReporter);
}
```

```java
// XMPPAuction.java
private AuctionMessageTranslator translatorFor(XMPPConnection connection) {
  return new AuctionMessageTranslator(connection.getUser(), auctionEventListeners.announce(), failureReporter);
}
```

`mqtt.js` 的 `MqttClient` 沒有 `getUser()`/`connect()`/`login()` 這種分階段流程（這是 Smack 自己提供的能力，不是協定本身的功能），MQTT 版因此包了一層 `MqttConnection`：

```ts
// MqttConnection.ts
const KNOWN_USERNAMES: readonly string[] = ['sniper'];

export class MqttConnection {
  client!: MqttClient;
  private sniperId!: string;

  constructor(private readonly brokerUrl: string) {}

  async connect(): Promise<void> {
    this.client = await connectAsync(this.brokerUrl);
  }

  login(username: string): void {
    if (!KNOWN_USERNAMES.includes(username)) {
      throw new Error(`Could not connect to auction: unknown account ${username}`);
    }
    this.sniperId = username;
  }

  getUser(): string {
    return this.sniperId;
  }

  createChannel(itemId: string, listener: MessageListener): MqttChannel {
    return new MqttChannel(this.client, commandsTopic(itemId), eventsTopic(itemId), listener);
  }

  async disconnect(): Promise<void> {
    await this.client.endAsync();
  }
}
```

`node-redis` 的 `RedisClientType` 同樣沒有身分概念，需要一樣的包裝層，但 Redis Pub/Sub 官方慣例是**訂閱用的連線跟一般命令用的連線要分開**——同一條連線一旦呼叫 `SUBSCRIBE`，就進入訂閱模式，無法再用同一條連線發 `PUBLISH` 等其他命令。這是 Redis 協定本身的限制，不是 TS 版自己加的邏輯，因此 `RedisConnection` 需要持有兩個 client：

```ts
// RedisConnection.ts
import { createClient } from 'redis';
import type { RedisClientType } from 'redis';
import { RedisChannel } from './RedisChannel.ts';
import type { MessageListener } from './MessageListener.ts';
import { commandsChannel, eventsChannel } from './Topic.ts';

const KNOWN_USERNAMES: readonly string[] = ['sniper'];

export class RedisConnection {
  readonly publisher: RedisClientType;
  readonly subscriber: RedisClientType;
  private sniperId!: string;

  constructor(private readonly redisUrl: string) {
    this.publisher = createClient({ url: this.redisUrl });
    this.subscriber = createClient({ url: this.redisUrl });
  }

  async connect(): Promise<void> {
    await Promise.all([this.publisher.connect(), this.subscriber.connect()]);
  }

  login(username: string): void {
    if (!KNOWN_USERNAMES.includes(username)) {
      throw new Error(`Could not connect to auction: unknown account ${username}`);
    }
    this.sniperId = username;
  }

  getUser(): string {
    return this.sniperId;
  }

  createChannel(itemId: string, listener: MessageListener): RedisChannel {
    return new RedisChannel(
      this.publisher,
      this.subscriber,
      commandsChannel(itemId),
      eventsChannel(itemId),
      listener,
    );
  }

  async disconnect(): Promise<void> {
    await Promise.all([this.publisher.quit(), this.subscriber.quit()]);
  }
}
```

`RedisAuctionHouse.connect()`/`MqttAuctionHouse.connect()` 因此可以維持一模一樣的三行呼叫順序，跟 Java 對應：

```java
// XMPPAuctionHouse.java
XMPPConnection connection = new XMPPConnection(hostname);
connection.connect();
connection.login(username, password, AUCTION_RESOURCE);
```

```ts
// RedisAuctionHouse.ts / MqttAuctionHouse.ts（除了型別名稱，程式碼一致）
const connection = new RedisConnection(redisUrl); // 或 new MqttConnection(brokerUrl)
await connection.connect();
connection.login(sniperId);
```

`RedisAuctionHouse`/`MqttAuctionHouse` 本身、`RedisAuction`/`MqttAuction` 的 `translatorFor(connection)` 因此也完全同構，只有型別名稱不同：

```ts
// RedisAuctionHouse.ts
import { appendFileSync } from 'node:fs';
import { RedisAuction } from './RedisAuction.ts';
import { RedisConnection } from './RedisConnection.ts';
import { LoggingRedisFailureReporter } from './LoggingRedisFailureReporter.ts';
import { RedisAuctionException } from './RedisAuctionException.ts';
import type { Logger } from './Logger.ts';
import type { AuctionHouse } from '../AuctionHouse.ts';
import type { Auction } from '../Auction.ts';
import type { Item } from '../UserRequestListener.ts';

export class RedisAuctionHouse implements AuctionHouse {
  static readonly LOG_FILE_NAME = 'auction-sniper.log';

  private readonly connection: RedisConnection;
  private readonly failureReporter: LoggingRedisFailureReporter;

  private constructor(connection: RedisConnection) {
    this.connection = connection;
    this.failureReporter = new LoggingRedisFailureReporter(this.makeLogger());
  }

  auctionFor(item: Item): Auction {
    return new RedisAuction(this.connection, item.identifier, this.failureReporter);
  }

  async disconnect(): Promise<void> {
    await this.connection.disconnect();
  }

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

  private makeLogger(): Logger {
    return {
      severe: (message) => appendFileSync(RedisAuctionHouse.LOG_FILE_NAME, `${message}\n`),
    };
  }
}
```

```ts
// RedisAuction.ts
import { Announcer } from '../util/Announcer.ts';
import { Message } from './Message.ts';
import type { RedisChannel } from './RedisChannel.ts';
import type { RedisConnection } from './RedisConnection.ts';
import { AuctionMessageTranslator } from './AuctionMessageTranslator.ts';
import type { AuctionEventListener, PriceSource } from '../AuctionEventListener.ts';
import type { RedisFailureReporter } from './RedisFailureReporter.ts';
import type { Auction } from '../Auction.ts';

export class RedisAuction implements Auction {
  private readonly auctionEventListeners = Announcer.to<AuctionEventListener>();
  private readonly channel: RedisChannel;
  private readonly failureReporter: RedisFailureReporter;
  private readonly sniperId: string;

  constructor(connection: RedisConnection, itemId: string, failureReporter: RedisFailureReporter) {
    this.failureReporter = failureReporter;
    this.sniperId = connection.getUser();
    const translator = this.translatorFor(connection);
    this.channel = connection.createChannel(itemId, translator);
    this.addAuctionEventListener(this.channelDisconnectorFor(translator));
  }

  bid(amount: number): void {
    this.sendMessage(Message.encode(Message.Bid(this.sniperId, amount)));
  }

  join(): void {
    this.sendMessage(Message.encode(Message.Join(this.sniperId)));
  }

  addAuctionEventListener(listener: AuctionEventListener): void {
    this.auctionEventListeners.addListener(listener);
  }

  private translatorFor(connection: RedisConnection): AuctionMessageTranslator {
    return new AuctionMessageTranslator(
      connection.getUser(),
      this.auctionEventListeners.announce(),
      this.failureReporter,
    );
  }

  private channelDisconnectorFor(translator: AuctionMessageTranslator): AuctionEventListener {
    return {
      auctionFailed: () => this.channel.removeMessageListener(translator),
      auctionClosed: () => {},
      currentPrice: (_price: number, _increment: number, _priceSource: PriceSource) => {},
    };
  }

  private sendMessage(message: string): void {
    try {
      this.channel.sendMessage(message);
    } catch (error) {
      console.error(error);
    }
  }
}
```

跟目前的 `MqttAuctionHouse.ts`/`MqttAuction.ts`（見 [`server/auctionsniper/mqtt/`](../server/auctionsniper/mqtt/)）逐行比對，差異只有型別名稱（`Redis*` ↔ `Mqtt*`）跟 `connect()` 的第一個參數名稱（`redisUrl` ↔ `brokerUrl`），沒有結構性差異。

## 4. `connect()`/`login()` 只吃 URL + username，不是 Redis 或 MQTT 各自決定的

`RedisAuctionHouse.connect(redisUrl, sniperId)` 沒有直接在建構子裡讀 `process.env.REDIS_URL`，而是跟 `MqttAuctionHouse.connect(brokerUrl, sniperId)` 一樣把連線位址當成明確參數——這對應 Java `XMPPAuctionHouse.connect(hostname, username, password)` 把 `hostname` 當參數傳入的寫法（[ADR-0003](adr/ADR-0003-username-only-identity.md) 拿掉的只有 `password`，`hostname`/broker 位址仍是明確參數），讀環境變數是呼叫端（`server/utils/sniper-registry.ts`）的責任，不是 `RedisAuctionHouse`/`MqttAuctionHouse` 自己的責任。

## 5. Channel 層：pub/sub 語意的核心差異

Smack 的 `Chat` 物件，`addMessageListener()` 註冊的 listener 天生只會收到「這個 chat」的訊息：

```java
// XMPPAuctionHouse.java（片段）
Chat chat = connection.getChatManager().createChat(auctionId, translator);
```

`mqtt.js` 沒有這種按訂閱各自建立獨立 listener 的機制，`client.on('message', ...)` 是**整個 client 共用**的單一事件，訂閱多個 topic 時所有 topic 的訊息都觸發同一個 handler，`MqttChannel` 因此得自己判斷 `topic === this.subscribeTopic` 才轉呼叫（見 [`differences-from-java.md` 第 7 節](differences-from-java.md#7-mqttchannel-要自己過濾-topicsmack-的-chat-天生只收自己的訊息)）：

```ts
// MqttChannel.ts
export class MqttChannel {
  private readonly onMessage: (topic: string, payload: Buffer) => void;

  constructor(
    private readonly client: MqttClient,
    private readonly publishTopic: string,
    private readonly subscribeTopic: string,
    private readonly listener: MessageListener,
  ) {
    this.onMessage = (topic, payload) => {
      if (topic === this.subscribeTopic) {
        this.listener.processMessage(this, payload.toString());
      }
    };
    this.client.on('message', this.onMessage);
    this.client.subscribe(this.subscribeTopic, { qos: 1 });
  }

  sendMessage(rawMessage: string): void {
    this.client.publish(this.publishTopic, rawMessage, { qos: 1 });
  }

  removeMessageListener(listener: MessageListener): void {
    if (listener === this.listener) {
      this.client.unsubscribe(this.subscribeTopic);
      this.client.removeListener('message', this.onMessage);
    }
  }
}
```

`node-redis` 的 `subscribe(channel, listener)` 反而是**每次訂閱各自帶一個專屬 callback**，語意上比 mqtt.js 更接近 Smack 的 per-`Chat` 模型——`RedisChannel` 因此完全不需要 `MqttChannel` 那段手動過濾 topic 的邏輯，也不需要額外的 `removeListener('message', handler)` 步驟（沒有共用事件可清）：

```ts
// RedisChannel.ts
import type { RedisClientType } from 'redis';
import type { MessageListener } from './MessageListener.ts';

export class RedisChannel {
  constructor(
    private readonly publisher: RedisClientType,
    private readonly subscriber: RedisClientType,
    private readonly publishChannel: string,
    private readonly subscribeChannel: string,
    private readonly listener: MessageListener,
  ) {
    void this.subscriber.subscribe(this.subscribeChannel, (rawMessage) =>
      this.listener.processMessage(this, rawMessage),
    );
  }

  sendMessage(rawMessage: string): void {
    void this.publisher.publish(this.publishChannel, rawMessage);
  }

  removeMessageListener(listener: MessageListener): void {
    if (listener === this.listener) {
      void this.subscriber.unsubscribe(this.subscribeChannel);
    }
  }
}
```

`void` 前綴是因為 `node-redis` 的 `subscribe()`/`publish()`/`unsubscribe()` 都回傳 `Promise`（非同步 client），呼叫端沒有需要等待結果，故意不 `await`；`mqtt.js` 的 `client.subscribe()`/`client.publish()` 不是 promise-based API，不需要這個處理——這是兩個 library 本身的 API 風格差異，不是刻意選擇的結果。

`MessageListener.ts` 兩版結構相同，只差 `channel` 參數的型別：

```ts
// RedisChannel 版
import type { RedisChannel } from './RedisChannel.ts';

// 對應 Java 版 org.jivesoftware.smack.MessageListener。
export interface MessageListener {
  processMessage(channel: RedisChannel, messageBody: string): void;
}
```

## 6. 循序保證：QoS 設定 vs 天生保證

書中原文（Ch.12）：「we expect it to ensure that messages between a bidder and an auction arrive in the same order in which they were sent」。這個保證在 XMPP 是**單一 TCP 連線天生就有**的，不需要額外設定（見 [`differences-from-java.md` 第 6 節](differences-from-java.md#6-循序保證要靠明確設定-qos不是天生就有)）。

Redis Pub/Sub 跟 XMPP 一樣，publisher/subscriber 各自透過**單一 TCP 連線**跟 Redis server 通訊，同一條連線上的訊息順序天生保證，`RedisChannel.sendMessage()`/訂閱都不需要任何額外設定就能重現書中的循序保證。

MQTT 沒有這個天生保證，[ADR-0002](adr/ADR-0002-mqtt-replaces-redis.md) Compliance #3 因此要求 `MqttChannel` 的所有 publish/subscribe 都明確帶 `{ qos: 1 }`，才能重現同等的循序保證——這是 MQTT 協定設計本身需要額外設定的地方，Redis Pub/Sub 不需要對應的設定。

## 7. Channel/Topic 拓樸與命名慣例

[ADR-0006](adr/ADR-0006-mqtt-topic-topology.md) 的推論（單一 topic 雙向收發會讓其他 sniper 看到彼此的 BID 命令）是針對「topic 廣播模型」本身的問題，Redis 的 `PUBLISH`/`SUBSCRIBE` 一樣是「同一 channel 底下所有訂閱者都收到同一份訊息」的廣播模型，因此**同一個理由同樣適用於 Redis**：分成 `commands`/`events` 兩個 channel，透過訂閱關係本身隔離，不需要額外過濾邏輯。

```ts
// Topic.ts（MQTT 版，ADR-0006）
export function commandsTopic(itemId: string): string {
  return `auction/${itemId}/commands`;
}

export function eventsTopic(itemId: string): string {
  return `auction/${itemId}/events`;
}
```

```ts
// Topic.ts（Redis 版，同樣的拓樸邏輯）
export function commandsChannel(itemId: string): string {
  return `auction:${itemId}:commands`;
}

export function eventsChannel(itemId: string): string {
  return `auction:${itemId}:events`;
}
```

命名慣例上的差異（`/` 分隔 vs `:` 分隔）純粹是兩個生態系各自的慣例：MQTT topic 用 `/` 表達階層是協定規格本身的慣例（wildcard `+`/`#` 也是按 `/` 切分階層），Redis key/channel 命名慣例則普遍用 `:` 分隔命名空間（例如 `user:1000:profile` 這種寫法），兩者都是各自生態圈的業界慣例，不是刻意做出的差異化選擇。

## 8. 訊息格式與 `AuctionMessageTranslator`：兩者完全相同

[ADR-0007](adr/ADR-0007-message-format.md) 的決策判準是「不管底層協定是否為開放標準，都要使用跟書中 XMPP 一樣的訊息格式」——這個判準本身不涉及 broker 選擇，MQTT payload 用純文字 SOL 格式（`Field: Value;`），若 Redis 是最終選型，同一個判準下也應該採用同樣的格式，不會因為 broker 換成 Redis 就改用 JSON。

因此 `Message.ts`（SOL 格式的 `encode()`）與 `AuctionMessageTranslator.ts`（`AuctionEvent` 的 `Field: Value;` 解析邏輯）在 Redis 版與 MQTT 版是**完全相同的程式碼**，唯一的差異只有 `AuctionMessageTranslator implements MessageListener` 裡 `processMessage(channel: RedisChannel, ...)` 的 `channel` 參數型別（對應第 5 節的 `MessageListener.ts`）：

```ts
// AuctionMessageTranslator.ts（Redis 版，跟 MQTT 版邏輯逐行相同）
import { PriceSource } from '../AuctionEventListener.ts';
import type { AuctionEventListener } from '../AuctionEventListener.ts';
import type { RedisChannel } from './RedisChannel.ts';
import type { MessageListener } from './MessageListener.ts';
import type { RedisFailureReporter } from './RedisFailureReporter.ts';

export class AuctionMessageTranslator implements MessageListener {
  private readonly listener: AuctionEventListener;
  private readonly sniperId: string;
  private readonly failureReporter: RedisFailureReporter;

  constructor(
    sniperId: string,
    listener: AuctionEventListener,
    failureReporter: RedisFailureReporter,
  ) {
    this.sniperId = sniperId;
    this.listener = listener;
    this.failureReporter = failureReporter;
  }

  processMessage(_channel: RedisChannel, messageBody: string): void {
    try {
      this.translate(messageBody);
    } catch (parseException) {
      this.failureReporter.cannotTranslateMessage(
        this.sniperId,
        messageBody,
        parseException as Error,
      );
      this.listener.auctionFailed();
    }
  }

  private translate(messageBody: string): void {
    const event = AuctionEvent.from(messageBody);
    const eventType = event.type();
    if (eventType === 'CLOSE') {
      this.listener.auctionClosed();
    }
    if (eventType === 'PRICE') {
      this.listener.currentPrice(
        event.currentPrice(),
        event.increment(),
        event.isFrom(this.sniperId),
      );
    }
  }
}

// AuctionEvent、MissingValueException 兩個 class 與 MQTT 版完全相同，省略。
```

## 9. Exception / FailureReporter / Logging 層

三者都是純粹的型別名稱替換，程式碼結構跟 Java 版、MQTT 版一致：

```ts
// RedisAuctionException.ts
export class RedisAuctionException extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'RedisAuctionException';
  }
}
```

```ts
// RedisFailureReporter.ts
export interface RedisFailureReporter {
  cannotTranslateMessage(sniperId: string, failedMessage: string, exception: Error): void;
}
```

```ts
// LoggingRedisFailureReporter.ts
import type { Logger } from './Logger.ts';
import type { RedisFailureReporter } from './RedisFailureReporter.ts';

export class LoggingRedisFailureReporter implements RedisFailureReporter {
  constructor(private readonly logger: Logger) {}

  cannotTranslateMessage(sniperId: string, failedMessage: string, exception: Error): void {
    this.logger.severe(
      `<${sniperId}> Could not translate message "${failedMessage}" because "${String(exception)}"`,
    );
  }
}
```

`Logger.ts`（`severe(message: string): void`，對應 Java `java.util.logging.Logger.severe(String)`）兩版共用同一份，不需要重複實作。

## 10. 套件與部署面的差異

| 項目                     | Redis Pub/Sub             | MQTT                  |
| ------------------------ | ------------------------- | --------------------- |
| npm 套件                 | `redis`（v6，node-redis） | `mqtt`（v5，mqtt.js） |
| broker 二進位檔          | Redis server              | Eclipse Mosquitto     |
| 連線位址環境變數（範例） | `REDIS_URL`               | `MQTT_BROKER_URL`     |

其餘部署面（Docker image、CI service container、Render 部署拓樸等）不屬於實作層級的差異，已記錄在 [ADR-0002](adr/ADR-0002-mqtt-replaces-redis.md)、[ADR-0004](adr/ADR-0004-mqtt-broker-deployment.md)、[ADR-0005](adr/ADR-0005-ci-local-dev-workflow.md)，這裡不重複。
