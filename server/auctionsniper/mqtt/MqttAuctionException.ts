export class MqttAuctionException extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'MqttAuctionException';
  }
}
