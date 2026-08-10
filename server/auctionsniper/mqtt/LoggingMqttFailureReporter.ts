import { appendFileSync } from 'node:fs';
import type { MqttFailureReporter } from './MqttFailureReporter.ts';

export const LOG_FILE_NAME = 'auction-sniper.log';

// 對應 Java 版 LoggingXMPPFailureReporter.MESSAGE_FORMAT。
const MESSAGE_FORMAT = '<%s> Could not translate message "%s" because "%s"';

function format(sniperId: string, failedMessage: string, exception: unknown): string {
  return MESSAGE_FORMAT.replace('%s', sniperId)
    .replace('%s', failedMessage)
    .replace('%s', String(exception));
}

function defaultWriteLine(line: string): void {
  appendFileSync(LOG_FILE_NAME, `${line}\n`);
}

// 對應 Java 版 LoggingXMPPFailureReporter（命名規則：Logging + 協定 +
// FailureReporter，這裡協定是 Mqtt，所以命名成 LoggingMqttFailureReporter，
// 不是單純的 LoggingFailureReporter）。
export class LoggingMqttFailureReporter implements MqttFailureReporter {
  constructor(private readonly writeLine: (line: string) => void = defaultWriteLine) {}

  cannotTranslateMessage(sniperId: string, failedMessage: string, exception: unknown): void {
    this.writeLine(format(sniperId, failedMessage, exception));
  }
}
