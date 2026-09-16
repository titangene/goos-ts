export class XMPPMessage {
  constructor(private readonly body?: string) {}

  getBody(): string | undefined {
    return this.body;
  }
}
