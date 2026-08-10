export interface MqttFailureReporter {
  cannotTranslateMessage(sniperId: string, failedMessage: string, exception: Error): void;
}
