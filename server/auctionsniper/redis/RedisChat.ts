import type { RedisClientType } from 'redis';

type RedisClient = RedisClientType;

export class RedisChat {
  constructor(
    private readonly publisher: RedisClient,
    private readonly subscriber: RedisClient,
    private readonly topic: string,
    onMessage: (rawMessage: string) => void,
  ) {
    void subscriber.subscribe(topic, onMessage);
  }

  sendMessage(message: unknown): void {
    void this.publisher.publish(this.topic, JSON.stringify(message));
  }

  unsubscribe(): void {
    void this.subscriber.unsubscribe(this.topic);
  }
}
