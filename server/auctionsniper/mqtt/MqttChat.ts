import type { MqttClient } from 'mqtt';

// 對應 Java 版 Smack 的 org.jivesoftware.smack.Chat：sendMessage() 只認
// 純文字（Smack 的 Chat.sendMessage(String) 也是如此，訊息物件要怎麼變成
// 字串是呼叫端的事，Chat 本身不知道），這樣 MqttAuction、
// test/e2e/MqttFakeAuctionServer.ts 才能共用同一個 Chat 抽象，跟
// Java 版 XMPPAuction/FakeAuctionServer 都是透過 currentChat.sendMessage(...)
// 送訊息一致。
// ADR-0006：publishTopic/subscribeTopic 分開，讓每一方只發佈到自己該發佈的
// topic、只訂閱自己該訂閱的 topic——用訂閱關係本身做到 XMPP 1:1 chat 天生
// 具備的隔離，不需要額外的訊息過濾邏輯。
// ADR-0002 Compliance #3：QoS 1，維持訊息循序保證。
export class MqttChat {
  private readonly onMessage: (topic: string, payload: Buffer) => void;

  constructor(
    private readonly client: MqttClient,
    private readonly publishTopic: string,
    private readonly subscribeTopic: string,
    receive: (rawMessage: string) => void,
  ) {
    this.onMessage = (topic, payload) => {
      if (topic === this.subscribeTopic) {
        receive(payload.toString());
      }
    };
    this.client.on('message', this.onMessage);
    this.client.subscribe(this.subscribeTopic, { qos: 1 });
  }

  sendMessage(rawMessage: string): void {
    this.client.publish(this.publishTopic, rawMessage, { qos: 1 });
  }

  unsubscribe(): void {
    this.client.unsubscribe(this.subscribeTopic);
    this.client.removeListener('message', this.onMessage);
  }
}
