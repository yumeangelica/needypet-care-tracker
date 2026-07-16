import { eq, or } from 'drizzle-orm';
import { registerSchema } from '#shared/schemas/user';
import { instantToIso } from '#shared/utils/datetime';
import { Temporal } from '#shared/utils/temporal';
import { normalizeUserName } from '#shared/utils/userName';
import { type Db, useDb } from '../../db';
import { users } from '../../db/schema';
import { confirmEmailMessage, sendMailBestEffort, useMailer } from '../../utils/mailer';
import { hashUserPassword } from '../../utils/password';
import { checkRateLimit, rateLimitIp } from '../../utils/rateLimit';
import { publicOrigin } from '../../utils/siteUrl';
import { createToken, expiryFromNow } from '../../utils/tokens';

export default defineEventHandler(async (event) => {
  const origin = publicOrigin(event);
  const mailer = useMailer();

  // Registration sends mail, so it is also a spam vector.
  await checkRateLimit(event, `register:ip:${rateLimitIp(event)}`, {
    max: 5,
    windowMs: 60 * 60_000,
  });

  const input = await readValidatedBodyOr422(event, registerSchema);
  const db = useDb();
  const email = input.email.toLowerCase();
  const userNameKey = normalizeUserName(input.userName);

  const conflicts = await findUserConflicts(db, userNameKey, email);
  if (conflicts.length > 0) {
    rejectUserConflict(conflicts, userNameKey);
  }

  const now = instantToIso(Temporal.Now.instant());
  // Unconfirmed accounts stay fully usable — the confirmation link only
  // flips the badge in the profile. Only the token hash is stored.
  const confirm = await createToken();
  const user = {
    id: crypto.randomUUID(),
    userName: input.userName,
    userNameKey,
    email,
    passwordHash: await hashUserPassword(input.newPassword),
    emailConfirmed: false,
    emailConfirmToken: confirm.tokenHash,
    emailConfirmExpiresAt: expiryFromNow(24),
    timezone: input.timezone,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await db.insert(users).values(user);
  } catch (error) {
    const concurrentConflicts = await findUserConflicts(db, userNameKey, email);
    if (concurrentConflicts.length === 0) {
      throw error;
    }
    rejectUserConflict(concurrentConflicts, userNameKey);
  }

  const confirmLink = `${origin}/confirm-email?token=${confirm.token}`;

  // New accounts always start in English (the DB column defaults to 'en'); the
  // in-memory user object above never sets locale, so echo the literal here.
  await setUserSession(event, {
    user: { id: user.id, userName: user.userName, sessionVersion: 0, locale: 'en' },
  });
  await sendMailBestEffort(
    mailer,
    confirmEmailMessage(email, confirmLink),
    'register',
  );

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

async function findUserConflicts(db: Db, userNameKey: string, email: string) {
  return db
    .select({ userNameKey: users.userNameKey, email: users.email })
    .from(users)
    .where(or(eq(users.userNameKey, userNameKey), eq(users.email, email)));
}

function rejectUserConflict(
  conflicts: Array<{ userNameKey: string; email: string }>,
  userNameKey: string,
): never {
  if (conflicts.some((row) => row.userNameKey === userNameKey)) {
    badRequest('Username already exists', 'errors.userNameTaken');
  }
  badRequest('Email already exists', 'errors.emailTaken');
}
