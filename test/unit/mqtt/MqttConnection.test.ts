import { describe, expect, it } from 'vitest';
import { MqttConnection } from '../../../server/auctionsniper/mqtt/MqttConnection.ts';

describe('MqttConnection#login (ADR-0003: username-only whitelist, no password check)', () => {
  it('does not throw for a known username', () => {
    const connection = new MqttConnection('mqtt://unused');

    expect(() => connection.login('sniper')).not.toThrow();
  });

  it('throws for an unknown username', () => {
    const connection = new MqttConnection('mqtt://unused');

    expect(() => connection.login('someone-not-on-the-list')).toThrow();
  });

  it('includes the offending username in the error message', () => {
    const connection = new MqttConnection('mqtt://unused');

    expect(() => connection.login('someone-not-on-the-list')).toThrow(/someone-not-on-the-list/);
  });
});
