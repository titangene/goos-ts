import { describe, expect, it } from 'vitest';
import { assertKnownUsername } from '../../../server/auctionsniper/mqtt/Identity.ts';
import { MqttAuctionException } from '../../../server/auctionsniper/mqtt/MqttAuctionException.ts';

describe('assertKnownUsername (ADR-0003: username-only whitelist, no password check)', () => {
  it('does not throw for a known username', () => {
    expect(() => assertKnownUsername('sniper')).not.toThrow();
  });

  it('throws a MqttAuctionException for an unknown username', () => {
    expect(() => assertKnownUsername('someone-not-on-the-list')).toThrow(MqttAuctionException);
  });

  it('includes the offending username in the exception message', () => {
    expect(() => assertKnownUsername('someone-not-on-the-list')).toThrow(/someone-not-on-the-list/);
  });
});
