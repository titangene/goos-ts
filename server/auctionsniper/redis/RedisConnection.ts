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
