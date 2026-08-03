import { appendFileSync } from 'node:fs';
import type { RedisFailureReporter } from './RedisFailureReporter.ts';

export const LOG_FILE_NAME = 'auction-sniper.log';

function defaultWriteLine(line: string): void {
  appendFileSync(LOG_FILE_NAME, `${line}\n`);
}

export class LoggingFailureReporter implements RedisFailureReporter {
  constructor(private readonly writeLine: (line: string) => void = defaultWriteLine) {}

  cannotTranslateMessage(sniperId: string, failedMessage: string, error: unknown): void {
    this.writeLine(
      `<${sniperId}> Could not translate message "${failedMessage}" because "${String(error)}"`,
    );
  }
}
