import { eq, or } from 'drizzle-orm';
import { registerSchema } from '#shared/schemas/user';
import { firstRow, useDb } from '../../db';
import { users } from '../../db/schema';
import { confirmEmailMessage, useMailer } from '../../utils/mailer';
import { hashUserPassword } from '../../utils/password';
import { checkRateLimit, rateLimitIp } from '../../utils/rateLimit';
import { createToken, expiryFromNow } from '../../utils/tokens';

export default defineEventHandler(async (event) => {
  // Registration sends mail, so it is also a spam vector.
  checkRateLimit(event, `register:ip:${rateLimitIp(event)}`, { max: 5, windowMs: 60 * 60_000 });

  const input = await readValidatedBodyOr422(event, registerSchema);
  const db = useDb();
  const email = input.email.toLowerCase();

  const existing = firstRow(
    await db
      .select({ userName: users.userName, email: users.email })
      .from(users)
      .where(or(eq(users.userName, input.userName), eq(users.email, email))),
  );
  if (existing) {
    badRequest(existing.userName === input.userName ? 'Username already exists' : 'Email already exists');
  }

  const now = new Date().toISOString();
  // Unconfirmed accounts stay fully usable — the confirmation link only
  // flips the badge in the profile. Only the token hash is stored.
  const confirm = createToken();
  const user = {
    id: crypto.randomUUID(),
    userName: input.userName,
    email,
    passwordHash: await hashUserPassword(input.newPassword),
    emailConfirmed: false,
    emailConfirmToken: confirm.tokenHash,
    emailConfirmExpiresAt: expiryFromNow(24),
    timezone: input.timezone,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(users).values(user);

  const confirmLink = `${getRequestURL(event).origin}/confirm-email?token=${confirm.token}`;
  await useMailer().send(confirmEmailMessage(email, confirmLink));

  // New accounts always start in English (the DB column defaults to 'en'); the
  // in-memory user object above never sets locale, so echo the literal here.
  await setUserSession(event, { user: { id: user.id, userName: user.userName, locale: 'en' } });

  setResponseStatus(event, 201);
  return {
    message: 'Welcome to the pack! 🐾',
    user: {
      id: user.id,
      userName: user.userName,
      email: user.email,
      emailConfirmed: user.emailConfirmed,
      timezone: user.timezone,
    },
  };
});
