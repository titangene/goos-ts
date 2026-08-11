import type { RedisClientType } from 'redis';
import type { MessageListener } from './MessageListener.ts';

// 見 docs/redis-vs-mqtt-implementation.md 第 5 節：node-redis 的
// subscribe(channel, listener) 是 per-channel 各自的 callback，不像 mqtt.js
// 共用單一 client 級事件，因此不需要 MqttChannel 那段手動過濾 topic 的邏輯。
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
