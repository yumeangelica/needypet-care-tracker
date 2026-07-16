import { describe, expect, it } from 'vitest';
import { resolvePublicOrigin } from '../../server/utils/siteUrl';

describe('resolvePublicOrigin', () => {
  it('uses the configured http(s) origin and removes paths and trailing slashes', () => {
    expect(
      resolvePublicOrigin(' https://app.example.com/base/ ', 'https://attacker.test', true),
    ).toBe('https://app.example.com');
  });

  it('rejects missing production configuration', () => {
    expect(() => resolvePublicOrigin('', 'https://attacker.test', true)).toThrow(
      'NUXT_SITE_URL must be configured in production',
    );
  });

  it('allows the request origin only outside production', () => {
    expect(resolvePublicOrigin('', 'http://localhost:3000', false)).toBe('http://localhost:3000');
  });

  it('requires HTTPS for a configured production origin', () => {
    expect(() =>
      resolvePublicOrigin('http://app.example.com', 'http://localhost:3000', true),
    ).toThrow('NUXT_SITE_URL must use HTTPS in production');
    expect(resolvePublicOrigin('http://localhost:3000', 'http://localhost:3000', false)).toBe(
      'http://localhost:3000',
    );
  });

  it.each(['javascript:alert(1)', 'https://user:secret@example.com'])(
    'rejects unsafe configured URL %s',
    (configured) => {
      expect(() => resolvePublicOrigin(configured, 'http://localhost:3000', true)).toThrow();
    },
  );
});
