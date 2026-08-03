export interface RedisFailureReporter {
  cannotTranslateMessage(sniperId: string, failedMessage: string, error: unknown): void;
}
