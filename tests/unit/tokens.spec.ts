import { describe, expect, it } from 'vitest';
import { createToken, expiryFromNow, hashToken } from '../../server/utils/tokens';

describe('createToken', () => {
  it('returns a url-safe token and its sha256 hash', async () => {
    const { token, tokenHash } = await createToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes base64url
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).toBe(await hashToken(token));
  });

  it('produces unique tokens', async () => {
    const tokens = new Set(
      await Promise.all(Array.from({ length: 50 }, async () => (await createToken()).token)),
    );
    expect(tokens.size).toBe(50);
  });
});

describe('hashToken', () => {
  it('is deterministic', async () => {
    expect(await hashToken('abc')).toBe(await hashToken('abc'));
  });

  it('differs for different inputs', async () => {
    expect(await hashToken('abc')).not.toBe(await hashToken('abd'));
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
