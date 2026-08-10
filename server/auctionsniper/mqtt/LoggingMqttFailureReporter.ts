import type { Logger } from './Logger.ts';
import type { MqttFailureReporter } from './MqttFailureReporter.ts';

export class LoggingMqttFailureReporter implements MqttFailureReporter {
  constructor(private readonly logger: Logger) {}

  cannotTranslateMessage(sniperId: string, failedMessage: string, exception: Error): void {
    this.logger.severe(
      `<${sniperId}> Could not translate message "${failedMessage}" because "${String(exception)}"`,
    );
  }
}
