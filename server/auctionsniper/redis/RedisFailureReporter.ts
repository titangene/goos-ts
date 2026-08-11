export interface RedisFailureReporter {
  cannotTranslateMessage(sniperId: string, failedMessage: string, exception: Error): void;
}
