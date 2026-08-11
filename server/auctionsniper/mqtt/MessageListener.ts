import type { MqttChannel } from './MqttChannel.ts';

// 對應 Java 版 org.jivesoftware.smack.MessageListener。
export interface MessageListener {
  processMessage(channel: MqttChannel, messageBody: string): void;
}
