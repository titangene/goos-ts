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

    // 對應 Java 版 oneOf(logger).severe(...)——oneOf 是「剛好一次」，不是
    // toHaveBeenCalledWith() 單獨能表達的（後者只確認「有一次呼叫符合這些
    // 參數」，不排除呼叫更多次），要跟 toHaveBeenCalledTimes(1) 一起用。
    expect(logger.severe).toHaveBeenCalledTimes(1);
    expect(logger.severe).toHaveBeenCalledWith(
      '<auction id> Could not translate message "bad message" because "Error: an exception"'
    );
  });
});
