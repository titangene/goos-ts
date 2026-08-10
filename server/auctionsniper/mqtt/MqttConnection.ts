import type { MqttClient } from 'mqtt';
import type { Bidder } from './Message.ts';

// 對應 Java 版 org.jivesoftware.smack.XMPPConnection：XMPPConnection 本身
// 知道「我是誰」（getUser()），MqttClient 沒有這種東西，所以包一層讓
// MqttAuction 可以用 connection.getUser() 取得 sniperId，跟 Java 版
// XMPPAuction.translatorFor(connection) 的用法一致，不用另外傳一個
// sniperId 參數。
export class MqttConnection {
  constructor(
    readonly client: MqttClient,
    private readonly sniperId: Bidder,
  ) {}

  getUser(): Bidder {
    return this.sniperId;
  }
}
