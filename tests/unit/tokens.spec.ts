import { describe, expect, it } from 'vitest';
import { createToken, expiryFromNow, hashToken } from '../../server/utils/tokens';

describe('createToken', () => {
  it('returns a url-safe token and its sha256 hash', () => {
    const { token, tokenHash } = createToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes base64url
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).toBe(hashToken(token));
  });

  it('produces unique tokens', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => createToken().token));
    expect(tokens.size).toBe(50);
  });
});

describe('hashToken', () => {
  it('is deterministic', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
  });

  it('differs for different inputs', () => {
    expect(hashToken('abc')).not.toBe(hashToken('abd'));
  });
});

describe('expiryFromNow', () => {
  it('returns a future ISO timestamp that grows with hours', () => {
    const now = new Date().toISOString();
    const oneHour = expiryFromNow(1);
    const dayLater = expiryFromNow(24);
    expect(oneHour > now).toBe(true);
    expect(dayLater > oneHour).toBe(true);
    expect(Number.isNaN(Date.parse(oneHour))).toBe(false);
  });
});
