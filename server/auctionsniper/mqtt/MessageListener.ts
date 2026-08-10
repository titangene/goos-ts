import type { MqttChat } from './MqttChat.ts';

// 對應 Java 版 org.jivesoftware.smack.MessageListener。
export interface MessageListener {
  processMessage(chat: MqttChat, messageBody: string): void;
}
