import { z } from 'zod';
import { isSupportedTimeZone } from '../utils/date';
import { USER_NAME_PATTERN } from '../utils/userName';

/**
 * Password strength rules (ported from the old app): min 10 chars with at
 * least one lowercase, one uppercase, one digit and one special character.
 * Exported as a list so the register form can render a live checklist.
 * `label` is an i18n key (app/i18n/{en,fi}.ts) resolved by the rendering page.
 */
export const PASSWORD_RULES: readonly { id: string; label: string; test: (pw: string) => boolean }[] = [
  { id: 'length', label: 'validation.passwordRuleLength', test: (pw) => pw.length >= 10 },
  { id: 'lowercase', label: 'validation.passwordRuleLowercase', test: (pw) => /[a-z]/.test(pw) },
  { id: 'uppercase', label: 'validation.passwordRuleUppercase', test: (pw) => /[A-Z]/.test(pw) },
  { id: 'digit', label: 'validation.passwordRuleDigit', test: (pw) => /[0-9]/.test(pw) },
  { id: 'special', label: 'validation.passwordRuleSpecial', test: (pw) => /[!@#$%^&*]/.test(pw) },
];

export function isStrongPassword(password: string): boolean {
  return PASSWORD_RULES.every((rule) => rule.test(password));
}

// Schema messages are stable i18n keys (app/i18n/{en,fi}.ts, validation.*):
// the same key travels through client-side parses and server 422 payloads and
// is translated at the display layer, so validation is localized everywhere.
export const strongPasswordSchema = z
  .string()
  .min(10, 'validation.passwordMin')
  .max(100, 'validation.passwordMax')
  .refine(isStrongPassword, { message: 'validation.passwordStrength' });

export const userNameSchema = z
  .string()
  .trim()
  .min(3, 'validation.userNameMin')
  .max(40, 'validation.userNameMax')
  .regex(USER_NAME_PATTERN, 'validation.userNameCharacters');

export const emailSchema = z
  .email('validation.email')
  .min(6, 'validation.emailMin')
  .max(100, 'validation.emailMax');

export const timezoneSchema = z
  .string()
  .refine(isSupportedTimeZone, { message: 'validation.timezone' });

export const localeSchema = z.enum(['en', 'fi']);

export const registerSchema = z.object({
  userName: userNameSchema,
  email: emailSchema,
  newPassword: strongPasswordSchema,
  timezone: timezoneSchema,
});

export const loginSchema = z.object({
  userName: userNameSchema,
  password: z.string().min(1, 'validation.passwordRequired'),
});

/**
 * Profile edits are gated by the current password. Its shape is only
 * "non-empty" — verification happens against the stored password hash, not the
 * strength rules (an older account may predate them).
 */
export const profileUpdateSchema = z.object({
  userName: userNameSchema,
  email: emailSchema,
  timezone: timezoneSchema,
  locale: localeSchema,
  digestOptIn: z.boolean(),
  currentPassword: z.string().min(1, 'validation.currentPasswordRequired'),
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, 'validation.currentPasswordRequired'),
  newPassword: strongPasswordSchema,
});

export const confirmEmailSchema = z.object({
  token: z.string().min(1, 'validation.tokenRequired'),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'validation.tokenRequired'),
  newPassword: strongPasswordSchema,
});

export const accountDeleteSchema = z.object({
  currentPassword: z.string().min(1, 'validation.currentPasswordRequired'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
export type PasswordChangeInput = z.infer<typeof passwordChangeSchema>;
export type ConfirmEmailInput = z.infer<typeof confirmEmailSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type AccountDeleteInput = z.infer<typeof accountDeleteSchema>;
