import type { MqttClient } from 'mqtt';

// 見 docs/differences-from-java.md #6、#7。
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
