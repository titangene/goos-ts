import { connectAsync } from 'mqtt';
import type { MqttClient } from 'mqtt';
import { Message } from '../../server/auctionsniper/mqtt/Message.ts';
import type { Bidder } from '../../server/auctionsniper/mqtt/Message.ts';
import { MqttChat } from '../../server/auctionsniper/mqtt/MqttChat.ts';
import { commandsTopic, eventsTopic } from '../../server/auctionsniper/mqtt/Topic.ts';

// Java 版 FakeAuctionServer 從不解析收到的 JOIN/BID——它靠字串相等比對固定的
// XMPPAuction.JOIN_COMMAND_FORMAT/BID_COMMAND_FORMAT，送出者是誰則靠
// currentChat.getParticipant()（XMPP 連線層級的身分）另外檢查，完全不靠訊息
// 內容。MQTT 沒有這種連線層級身分，Bidder 只能放進訊息內容裡（見 Message.ts
// 開頭的說明），所以這裡沒辦法照 Java 做純字串相等比對，需要一個只服務這個
// 測試替身的最小解析（跟 AuctionMessageTranslator.ts 的 AuctionEvent 分開、
// 不共用程式碼，因為 Java 本來就沒有共用——它根本不解析 Command 方向）。
interface ReceivedCommand {
  command: string;
  bidder: Bidder;
  price?: number;
}

function parseCommand(messageBody: string): ReceivedCommand | undefined {
  const fields = new Map<string, string>();
  for (const field of messageBody.split(';')) {
    const trimmed = field.trim();
    if (!trimmed) continue;
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) continue;
    fields.set(trimmed.slice(0, colonIndex).trim(), trimmed.slice(colonIndex + 1).trim());
  }
  const command = fields.get('Command');
  const bidder = fields.get('Bidder');
  if (command === undefined || bidder === undefined) return undefined;
  const price = fields.get('Price');
  return { command, bidder, price: price === undefined ? undefined : Number(price) };
}

class BlockingQueue {
  private readonly commands: ReceivedCommand[] = [];

  push(command: ReceivedCommand): void {
    this.commands.push(command);
  }

  async waitForCommandFrom(bidder: Bidder): Promise<ReceivedCommand> {
    const deadline = Date.now() + 5000;

    while (Date.now() < deadline) {
      const command = this.commands.shift();

      if (command) {
        if (command.bidder === bidder) {
          return command;
        }
        continue;
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    throw new Error(`No message received from ${bidder} within timeout`);
  }
}

// MQTT 版的 test/e2e/FakeAuctionServer.ts，對照 goos-code 的
// test/end-to-end/.../FakeAuctionServer.java。跟 Java 版一樣，所有發送出去
// 的訊息都透過同一個 Chat（這裡是 MqttChat）送出——對應
// currentChat.sendMessage(...)。跟書中/Redis 版不同的地方：訂閱 commands
// topic（sniper 發佈 JOIN/BID）、發佈到 events topic（PRICE/CLOSE），跟
// MqttAuction 的發佈/訂閱方向相反，對應 ADR-0006 的 topic 拓樸。
export class MqttFakeAuctionServer {
  // 對應 Java 版 FakeAuctionServer.XMPP_HOSTNAME。
  static readonly BROKER_URL = process.env.MQTT_BROKER_URL ?? 'mqtt://localhost:1883';

  private client!: MqttClient;
  private chat!: MqttChat;
  private readonly messageQueue = new BlockingQueue();

  constructor(public readonly itemId: string) {}

  async startSellingItem(): Promise<void> {
    this.client = await connectAsync(MqttFakeAuctionServer.BROKER_URL);
    this.chat = new MqttChat(
      this.client,
      eventsTopic(this.itemId),
      commandsTopic(this.itemId),
      (rawMessage) => {
        const command = parseCommand(rawMessage);
        if (command) {
          this.messageQueue.push(command);
        }
      },
    );
  }

  async announceClosed(): Promise<void> {
    this.chat.sendMessage(Message.encode(Message.Close()));
  }

  async sendInvalidMessage(rawMessage: string): Promise<void> {
    this.chat.sendMessage(rawMessage);
  }

  async reportPrice(currentPrice: number, increment: number, bidder: Bidder): Promise<void> {
    this.chat.sendMessage(Message.encode(Message.Price(currentPrice, increment, bidder)));
  }

  async hasReceivedJoinRequestFrom(bidder: Bidder): Promise<void> {
    const command = await this.messageQueue.waitForCommandFrom(bidder);
    if (command.command !== 'JOIN') {
      throw new Error(`expected a JOIN message, got ${command.command}`);
    }
  }

  async hasReceivedBid(bid: number, bidder: Bidder): Promise<void> {
    const command = await this.messageQueue.waitForCommandFrom(bidder);
    if (command.command !== 'BID' || command.price !== bid) {
      throw new Error(`expected a BID message for ${bid}, got ${JSON.stringify(command)}`);
    }
  }

  async stop(): Promise<void> {
    if (this.client?.connected) {
      await this.client.endAsync();
    }
  }
}
