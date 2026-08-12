import type { RedisClientType } from 'redis';

import type { MessageListener } from './MessageListener.ts';

// node-redis 的 subscribe(channel, listener) 是 per-channel 各自的 callback，
// 每次訂閱都拿到專屬的 callback，不需要自己判斷收到的訊息屬於哪個 channel。
export class RedisChannel {
  // subscribe() 要跟 Redis server 走一次 round trip 才算真的生效；呼叫端如果
  // 在 ready resolve 之前就對另一側 publish，訊息會直接遺失（Redis pub/sub
  // 不會 buffer 給還沒訂閱完成的人）。呼叫端只要等得起，就該 await 這個屬性。
  readonly ready: Promise<void>;

  constructor(
    private readonly publisher: RedisClientType,
    private readonly subscriber: RedisClientType,
    private readonly publishChannel: string,
    private readonly subscribeChannel: string,
    private readonly listener: MessageListener
  ) {
    this.ready = this.subscriber.subscribe(this.subscribeChannel, rawMessage =>
      this.listener.processMessage(this, rawMessage)
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
