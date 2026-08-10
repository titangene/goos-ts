import { connectAsync } from 'mqtt';
import type { MqttClient } from 'mqtt';
import type { Bidder } from './Message.ts';
import { MqttChat } from './MqttChat.ts';
import type { MessageListener } from './MessageListener.ts';
import { commandsTopic, eventsTopic } from './Topic.ts';

const KNOWN_USERNAMES: readonly string[] = ['sniper'];

export class MqttConnection {
  client!: MqttClient;
  private sniperId!: Bidder;

  constructor(private readonly brokerUrl: string) {}

  async connect(): Promise<void> {
    this.client = await connectAsync(this.brokerUrl);
  }

  login(username: Bidder): void {
    if (!KNOWN_USERNAMES.includes(username)) {
      throw new Error(`Could not connect to auction: unknown account ${username}`);
    }
    this.sniperId = username;
  }

  getUser(): Bidder {
    return this.sniperId;
  }

  createChat(itemId: string, listener: MessageListener): MqttChat {
    return new MqttChat(this.client, commandsTopic(itemId), eventsTopic(itemId), listener);
  }

  async disconnect(): Promise<void> {
    await this.client.endAsync();
  }
}
