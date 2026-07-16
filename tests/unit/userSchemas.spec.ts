import { describe, expect, it } from 'vitest';
import {
  confirmEmailSchema,
  forgotPasswordSchema,
  passwordChangeSchema,
  profileUpdateSchema,
  resetPasswordSchema,
  userNameSchema,
} from '../../shared/schemas/user';
import { normalizeUserName } from '../../shared/utils/userName';

describe('userNameSchema', () => {
  it('accepts supported Unicode and rejects control or unsupported characters', () => {
    expect(userNameSchema.safeParse('Paws-42').success).toBe(true);
    expect(userNameSchema.safeParse('Änne').success).toBe(true);
    expect(userNameSchema.safeParse('李雷').success).toBe(false);
    expect(userNameSchema.safeParse('李雷三').success).toBe(true);
    expect(userNameSchema.safeParse('line\nbreak').success).toBe(false);
    expect(userNameSchema.safeParse('Paws🐾').success).toBe(false);
  });

  it('trims display input and normalizes canonical case variants to one key', () => {
    expect(userNameSchema.parse('  Mäyrä  ')).toBe('Mäyrä');
    expect(normalizeUserName('MÄYRÄ')).toBe(normalizeUserName('Mäyrä'));
    expect(normalizeUserName('A\u030Asa')).toBe(normalizeUserName('Åsa'));
  });
});

describe('profileUpdateSchema', () => {
  const valid = {
    userName: 'demo',
    email: 'demo@example.com',
    timezone: 'Europe/Helsinki',
    locale: 'en',
    digestOptIn: false,
    currentPassword: 'DemoPaws123!',
  };

  it('accepts a valid profile update', () => {
    expect(profileUpdateSchema.safeParse(valid).success).toBe(true);
  });

  it('requires the current password', () => {
    expect(profileUpdateSchema.safeParse({ ...valid, currentPassword: '' }).success).toBe(false);
  });

  it('does not apply strength rules to the current password (older accounts)', () => {
    expect(profileUpdateSchema.safeParse({ ...valid, currentPassword: 'x' }).success).toBe(true);
  });

  it('requires a boolean digestOptIn', () => {
    const { digestOptIn: _omit, ...withoutFlag } = valid;
    expect(profileUpdateSchema.safeParse(withoutFlag).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ ...valid, digestOptIn: 'yes' }).success).toBe(false);
  });

  it('rejects an invalid timezone', () => {
    expect(profileUpdateSchema.safeParse({ ...valid, timezone: 'Not/AZone' }).success).toBe(false);
  });

  it('rejects an invalid email', () => {
    expect(profileUpdateSchema.safeParse({ ...valid, email: 'not-an-email' }).success).toBe(false);
  });

  it('rejects a too-short username', () => {
    expect(profileUpdateSchema.safeParse({ ...valid, userName: 'ab' }).success).toBe(false);
  });

  it('accepts the supported locales and rejects anything else', () => {
    expect(profileUpdateSchema.safeParse({ ...valid, locale: 'en' }).success).toBe(true);
    expect(profileUpdateSchema.safeParse({ ...valid, locale: 'fi' }).success).toBe(true);
    expect(profileUpdateSchema.safeParse({ ...valid, locale: 'de' }).success).toBe(false);
    const { locale: _omit, ...withoutLocale } = valid;
    expect(profileUpdateSchema.safeParse(withoutLocale).success).toBe(false);
  });
});

describe('passwordChangeSchema', () => {
  it('accepts a strong new password', () => {
    const result = passwordChangeSchema.safeParse({
      currentPassword: 'old-whatever',
      newPassword: 'NewPaws123!',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a weak new password with the strength message key', () => {
    const result = passwordChangeSchema.safeParse({
      currentPassword: 'old-whatever',
      newPassword: 'weakpassword',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      // Schema messages are i18n keys, translated at the display layer
      // (see tests/unit/i18n.spec.ts for the localized copy).
      const messages = result.error.issues.map((issue) => issue.message).join(' ');
      expect(messages).toMatch(/validation\.passwordStrength/);
    }
  });

  it('rejects a too-short new password', () => {
    expect(
      passwordChangeSchema.safeParse({ currentPassword: 'old', newPassword: 'Aa1!' }).success,
    ).toBe(false);
  });

  it('requires the current password', () => {
    expect(
      passwordChangeSchema.safeParse({ currentPassword: '', newPassword: 'NewPaws123!' }).success,
    ).toBe(false);
  });
});

describe('confirmEmailSchema', () => {
  it('accepts a non-empty token', () => {
    expect(confirmEmailSchema.safeParse({ token: 'abc123' }).success).toBe(true);
  });

  it('rejects an empty token', () => {
    expect(confirmEmailSchema.safeParse({ token: '' }).success).toBe(false);
  });
});

describe('forgotPasswordSchema', () => {
  it('accepts a valid email', () => {
    expect(forgotPasswordSchema.safeParse({ email: 'demo@example.com' }).success).toBe(true);
  });

  it('rejects an invalid email', () => {
    expect(forgotPasswordSchema.safeParse({ email: 'not-an-email' }).success).toBe(false);
  });
});

describe('resetPasswordSchema', () => {
  it('accepts a token with a strong password', () => {
    expect(
      resetPasswordSchema.safeParse({ token: 'abc123', newPassword: 'NewPaws123!' }).success,
    ).toBe(true);
  });

  it('rejects a weak new password', () => {
    expect(
      resetPasswordSchema.safeParse({ token: 'abc123', newPassword: 'weakpassword' }).success,
    ).toBe(false);
  });

  it('rejects a missing token', () => {
    expect(resetPasswordSchema.safeParse({ newPassword: 'NewPaws123!' }).success).toBe(false);
  });
});
