import type { Client as XMPPClient } from '@xmpp/client';
import { client as createXMPPClient } from '@xmpp/client';

import { XMPPChatManager } from './XMPPChatManager.ts';

export class XMPPConnection {
  private readonly chatManager: XMPPChatManager;

  private constructor(private readonly xmppClient: XMPPClient) {
    this.chatManager = new XMPPChatManager(xmppClient);
  }

  static async connect(
    serviceUrl: string,
    username: string,
    password: string,
    resource: string
  ): Promise<XMPPConnection> {
    const xmppClient = createXMPPClient({
      service: serviceUrl,
      username,
      password,
      resource
    });
    const connection = new XMPPConnection(xmppClient);
    await xmppClient.start();
    return connection;
  }

  getChatManager(): XMPPChatManager {
    return this.chatManager;
  }

  getServiceName(): string {
    return this.xmppClient.jid!.domain;
  }

  async disconnect(): Promise<void> {
    await this.xmppClient.stop();
  }
}
