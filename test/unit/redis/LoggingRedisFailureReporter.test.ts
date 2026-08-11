import { describe, expect, it, vi } from 'vitest';
import { LoggingRedisFailureReporter } from '../../../server/auctionsniper/redis/LoggingRedisFailureReporter.ts';
import type { Logger } from '../../../server/auctionsniper/redis/Logger.ts';

// 對照 goos-code 的
// test/unit/test/auctionsniper/xmpp/LoggingXMPPFailureReporterTest.java
// 的 writesMessageTranslationFailureToLog()。
describe('LoggingRedisFailureReporter', () => {
  it('writes message translation failure to log', () => {
    const logger: Logger = { severe: vi.fn() };
    const reporter = new LoggingRedisFailureReporter(logger);

    reporter.cannotTranslateMessage('auction id', 'bad message', new Error('an exception'));

    expect(logger.severe).toHaveBeenCalledWith(
      '<auction id> Could not translate message "bad message" because "Error: an exception"',
    );
  });
});
