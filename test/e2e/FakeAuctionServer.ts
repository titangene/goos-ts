import { MqttChat } from '../../server/auctionsniper/mqtt/MqttChat.ts';
import { MqttConnection } from '../../server/auctionsniper/mqtt/MqttConnection.ts';
import { Message } from '../../server/auctionsniper/mqtt/Message.ts';
import type { Bidder } from '../../server/auctionsniper/mqtt/Message.ts';
import type { MessageListener } from '../../server/auctionsniper/mqtt/MessageListener.ts';
import { commandsTopic, eventsTopic } from '../../server/auctionsniper/mqtt/Topic.ts';

export class FakeAuctionServer {
  static readonly BROKER_URL = process.env.MQTT_BROKER_URL ?? 'mqtt://localhost:1883';

  private readonly messageListener = new SingleMessageListener();
  private readonly connection: MqttConnection;
  private chat!: MqttChat;

  constructor(public readonly itemId: string) {
    this.connection = new MqttConnection(FakeAuctionServer.BROKER_URL);
  }

  async startSellingItem(): Promise<void> {
    await this.connection.connect();
    this.chat = new MqttChat(
      this.connection.client,
      eventsTopic(this.itemId),
      commandsTopic(this.itemId),
      this.messageListener,
    );
  }

  async sendInvalidMessageContaining(brokenMessage: string): Promise<void> {
    this.chat.sendMessage(brokenMessage);
  }

  async reportPrice(price: number, increment: number, bidder: Bidder): Promise<void> {
    this.chat.sendMessage(Message.encode(Message.Price(price, increment, bidder)));
  }

  async hasReceivedJoinRequestFrom(sniperId: Bidder): Promise<void> {
    await this.receivesAMessageMatching(Message.encode(Message.Join(sniperId)));
  }

  async hasReceivedBid(bid: number, sniperId: Bidder): Promise<void> {
    await this.receivesAMessageMatching(Message.encode(Message.Bid(sniperId, bid)));
  }

  private async receivesAMessageMatching(expectedMessage: string): Promise<void> {
    const messageBody = await this.messageListener.receivesAMessage();
    if (messageBody !== expectedMessage) {
      throw new Error(`expected message "${expectedMessage}", got "${messageBody}"`);
    }
  }

  async announceClosed(): Promise<void> {
    this.chat.sendMessage(Message.encode(Message.Close()));
  }

  async stop(): Promise<void> {
    if (this.connection.client) {
      await this.connection.disconnect();
    }
  }
}

class SingleMessageListener implements MessageListener {
  private readonly messages: string[] = [];

  processMessage(_chat: MqttChat, messageBody: string): void {
    this.messages.push(messageBody);
  }

  async receivesAMessage(): Promise<string> {
    const deadline = Date.now() + 5000;

    while (Date.now() < deadline) {
      const messageBody = this.messages.shift();
      if (messageBody !== undefined) {
        return messageBody;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    throw new Error('No message received within timeout');
  }
}
