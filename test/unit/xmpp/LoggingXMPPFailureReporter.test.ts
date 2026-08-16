import { describe, expect, it, vi } from 'vitest';

import type { Logger } from '@server/auctionsniper/xmpp/Logger.ts';
import { LoggingXMPPFailureReporter } from '@server/auctionsniper/xmpp/LoggingXMPPFailureReporter.ts';

// 對照 goos-code 的
// test/unit/test/auctionsniper/xmpp/LoggingXMPPFailureReporterTest.java
// 的 writesMessageTranslationFailureToLog()。
describe('LoggingXMPPFailureReporter', () => {
  it('writes message translation failure to log', () => {
    const logger: Logger = { severe: vi.fn() };
    const reporter = new LoggingXMPPFailureReporter(logger);

    reporter.cannotTranslateMessage('auction id', 'bad message', new Error('an exception'));

    expect(logger.severe).toHaveBeenCalledWith(
      '<auction id> Could not translate message "bad message" because "Error: an exception"'
    );
  });
});
