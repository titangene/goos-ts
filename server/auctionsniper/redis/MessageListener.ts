import type { RedisChannel } from './RedisChannel.ts';

// 對應 Java 版 org.jivesoftware.smack.MessageListener。
export interface MessageListener {
  processMessage(channel: RedisChannel, messageBody: string): void;
}
