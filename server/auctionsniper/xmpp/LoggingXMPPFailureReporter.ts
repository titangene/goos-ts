import type { Logger } from './Logger.ts';
import type { XMPPFailureReporter } from './XMPPFailureReporter.ts';

// 對應 Java 版 auctionsniper.xmpp.LoggingXMPPFailureReporter。
export class LoggingXMPPFailureReporter implements XMPPFailureReporter {
  constructor(private readonly logger: Logger) {}

  cannotTranslateMessage(auctionId: string, failedMessage: string, exception: Error): void {
    this.logger.severe(
      `<${auctionId}> Could not translate message "${failedMessage}" because "${String(exception)}"`
    );
  }
}
