import { eq } from 'drizzle-orm';
import { loginSchema } from '#shared/schemas/user';
import { normalizeUserName } from '#shared/utils/userName';
import { firstRow, useDb } from '../../db';
import { users } from '../../db/schema';
import { hashUserPassword, passwordNeedsRehash, verifyUserPassword } from '../../utils/password';
import { checkRateLimit, rateLimitIp, resetRateLimit } from '../../utils/rateLimit';
import { toPublicUser } from '../../utils/session';

const LOGIN_WINDOW_MS = 15 * 60_000;

export default defineEventHandler(async (event) => {
  // IP backstop counts every attempt; the per-account counter is stricter
  // but clears on success so a real owner never locks themselves out.
  await checkRateLimit(event, `login:ip:${rateLimitIp(event)}`, {
    max: 20,
    windowMs: LOGIN_WINDOW_MS,
  });

  const input = await readValidatedBodyOr422(event, loginSchema);
  const userNameKey = normalizeUserName(input.userName);
  const accountKey = `login:user:${userNameKey}`;
  await checkRateLimit(event, accountKey, { max: 5, windowMs: LOGIN_WINDOW_MS });

  const user = firstRow(await useDb().select().from(users).where(eq(users.userNameKey, userNameKey)));
  // Generic message on both misses: don't leak which accounts exist.
  if (!user || !(await verifyUserPassword(input.password, user.passwordHash))) {
    unauthorized('Invalid credentials', 'errors.invalidCredentials');
  }

  // Upgrade legacy bcrypt hashes to argon2id on a successful sign-in.
  if (passwordNeedsRehash(user.passwordHash)) {
    await useDb()
      .update(users)
      .set({ passwordHash: await hashUserPassword(input.password) })
      .where(eq(users.id, user.id));
  }

  await resetRateLimit(accountKey);
  await setUserSession(event, {
    user: {
      id: user.id,
      userName: user.userName,
      sessionVersion: user.sessionVersion,
      locale: user.locale as 'en' | 'fi',
    },
  });

  return { message: 'Login successful', user: toPublicUser(user) };
});
