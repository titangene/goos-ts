import { describe, expect, it, vi } from 'vitest';
import { LoggingFailureReporter } from '../../../server/auctionsniper/redis/LoggingFailureReporter.ts';

describe('LoggingFailureReporter', () => {
  it('writes message translation failure to log', () => {
    const writeLine = vi.fn();
    const reporter = new LoggingFailureReporter(writeLine);

    reporter.cannotTranslateMessage('auction id', 'bad message', new Error('an exception'));

    expect(writeLine).toHaveBeenCalledWith(
      '<auction id> Could not translate message "bad message" because "Error: an exception"',
    );
  });
});
