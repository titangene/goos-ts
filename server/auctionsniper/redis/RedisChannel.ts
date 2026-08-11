import type { RedisClientType } from 'redis';
import type { MessageListener } from './MessageListener.ts';

// node-redis 的 subscribe(channel, listener) 是 per-channel 各自的 callback，
// 每次訂閱都拿到專屬的 callback，不需要自己判斷收到的訊息屬於哪個 channel。
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
