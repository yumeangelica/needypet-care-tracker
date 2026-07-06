import { z } from 'zod';
import { isSupportedTimeZone } from '../utils/date';

/**
 * Password strength rules (ported from the old app): min 10 chars with at
 * least one lowercase, one uppercase, one digit and one special character.
 * Exported as a list so the register form can render a live checklist.
 */
export const PASSWORD_RULES: readonly { id: string; label: string; test: (pw: string) => boolean }[] = [
  { id: 'length', label: 'At least 10 characters', test: (pw) => pw.length >= 10 },
  { id: 'lowercase', label: 'One lowercase letter', test: (pw) => /[a-z]/.test(pw) },
  { id: 'uppercase', label: 'One uppercase letter', test: (pw) => /[A-Z]/.test(pw) },
  { id: 'digit', label: 'One number', test: (pw) => /[0-9]/.test(pw) },
  { id: 'special', label: 'One special character (!@#$%^&*)', test: (pw) => /[!@#$%^&*]/.test(pw) },
];

export function isStrongPassword(password: string): boolean {
  return PASSWORD_RULES.every((rule) => rule.test(password));
}

export const strongPasswordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(100, 'Password must be at most 100 characters')
  .refine(isStrongPassword, {
    message:
      'Password must include lowercase, uppercase, a number and a special character (!@#$%^&*)',
  });

export const userNameSchema = z
  .string()
  .min(3, 'Username must be at least 3 characters')
  .max(40, 'Username must be at most 40 characters');

export const emailSchema = z
  .email('A valid email is required')
  .min(6, 'Email must be at least 6 characters')
  .max(100, 'Email must be at most 100 characters');

export const timezoneSchema = z
  .string()
  .refine(isSupportedTimeZone, { message: 'Invalid timezone' });

export const registerSchema = z.object({
  userName: userNameSchema,
  email: emailSchema,
  newPassword: strongPasswordSchema,
  timezone: timezoneSchema,
});

export const loginSchema = z.object({
  userName: userNameSchema,
  password: z.string().min(1, 'Password is required'),
});

/**
 * Profile edits are gated by the current password. Its shape is only
 * "non-empty" — verification happens against the bcrypt hash, not the
 * strength rules (an older account may predate them).
 */
export const profileUpdateSchema = z.object({
  userName: userNameSchema,
  email: emailSchema,
  timezone: timezoneSchema,
  currentPassword: z.string().min(1, 'Current password is required'),
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: strongPasswordSchema,
});

export const confirmEmailSchema = z.object({
  token: z.string().min(1, 'Token is required'),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  newPassword: strongPasswordSchema,
});

export const accountDeleteSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
export type PasswordChangeInput = z.infer<typeof passwordChangeSchema>;
export type ConfirmEmailInput = z.infer<typeof confirmEmailSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type AccountDeleteInput = z.infer<typeof accountDeleteSchema>;
