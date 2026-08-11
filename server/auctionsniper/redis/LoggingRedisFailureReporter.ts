import type { Logger } from './Logger.ts';
import type { RedisFailureReporter } from './RedisFailureReporter.ts';

export class LoggingRedisFailureReporter implements RedisFailureReporter {
  constructor(private readonly logger: Logger) {}

  cannotTranslateMessage(sniperId: string, failedMessage: string, exception: Error): void {
    this.logger.severe(
      `<${sniperId}> Could not translate message "${failedMessage}" because "${String(exception)}"`
    );
  }
}
