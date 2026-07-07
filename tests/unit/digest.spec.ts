import { describe, expect, it } from 'vitest';
import { shouldSendDigestNow } from '../../shared/utils/digest';

const BASE = {
  digestOptIn: true,
  emailConfirmed: true,
  localDate: '2026-07-07',
  localHour: 18,
  lastDigestDate: null as string | null,
  sendHour: 18,
};

describe('shouldSendDigestNow', () => {
  it('sends for an opted-in, confirmed user past the hour with no prior send', () => {
    expect(shouldSendDigestNow(BASE)).toBe(true);
  });

  it('does not send when opted out', () => {
    expect(shouldSendDigestNow({ ...BASE, digestOptIn: false })).toBe(false);
  });

  it('does not send when the email is unconfirmed', () => {
    expect(shouldSendDigestNow({ ...BASE, emailConfirmed: false })).toBe(false);
  });

  it('does not send before the send hour', () => {
    expect(shouldSendDigestNow({ ...BASE, localHour: 17 })).toBe(false);
  });

  it('sends exactly at the send hour', () => {
    expect(shouldSendDigestNow({ ...BASE, localHour: 18 })).toBe(true);
  });

  it('does not send twice on the same local day', () => {
    expect(shouldSendDigestNow({ ...BASE, lastDigestDate: '2026-07-07' })).toBe(false);
  });

  it('sends again on the next local day', () => {
    expect(shouldSendDigestNow({ ...BASE, lastDigestDate: '2026-07-06' })).toBe(true);
  });
});
