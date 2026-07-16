import { and, eq, ne, or } from 'drizzle-orm';
import { profileUpdateSchema } from '#shared/schemas/user';
import { instantToIso } from '#shared/utils/datetime';
import { Temporal } from '#shared/utils/temporal';
import { normalizeUserName } from '#shared/utils/userName';
import { type Db, firstRow, useDb } from '../db';
import { users } from '../db/schema';
import { confirmEmailMessage, sendMailBestEffort, useMailer } from '../utils/mailer';
import { verifyUserPassword } from '../utils/password';
import { checkRateLimit, resetRateLimit } from '../utils/rateLimit';
import { type UserRow, requireAppUser, toPublicUser } from '../utils/session';
import { publicOrigin } from '../utils/siteUrl';
import { createToken, expiryFromNow } from '../utils/tokens';

/**
 * Updates userName/email/timezone after verifying the current password.
 * Changing the email un-confirms it and sends a fresh confirmation link to
 * the NEW address; the account stays fully usable meanwhile.
 */
export default defineEventHandler(async (event) => {
  const user = await requireAppUser(event);
  const input = await readValidatedBodyOr422(event, profileUpdateSchema);
  const email = input.email.toLowerCase();
  const emailChanged = email !== user.email;
  const origin = emailChanged ? publicOrigin(event) : null;
  const mailer = emailChanged ? useMailer() : null;
  const passwordKey = `password:user:${user.id}`;
  await checkRateLimit(event, passwordKey, { max: 5, windowMs: 15 * 60_000 });

  if (!(await verifyUserPassword(input.currentPassword, user.passwordHash))) {
    unauthorized('Invalid current password', 'errors.invalidCurrentPassword');
  }
  await resetRateLimit(passwordKey);

  const db = useDb();
  const userNameKey = normalizeUserName(input.userName);
  const conflicts = await findUserConflicts(db, user.id, userNameKey, email);
  if (conflicts.length > 0) {
    rejectUserConflict(conflicts, userNameKey);
  }

  const confirm = emailChanged ? await createToken() : null;

  let updated: UserRow | undefined;
  try {
    updated = firstRow(
      await db
        .update(users)
        .set({
          userName: input.userName,
          userNameKey,
          email,
          timezone: input.timezone,
          locale: input.locale,
          digestOptIn: input.digestOptIn,
          ...(confirm
            ? {
                emailConfirmed: false,
                emailConfirmToken: confirm.tokenHash,
                emailConfirmExpiresAt: expiryFromNow(24),
              }
            : {}),
          updatedAt: instantToIso(Temporal.Now.instant()),
        })
        .where(eq(users.id, user.id))
        .returning(),
    );
  } catch (error) {
    const concurrentConflicts = await findUserConflicts(db, user.id, userNameKey, email);
    if (concurrentConflicts.length === 0) {
      throw error;
    }
    rejectUserConflict(concurrentConflicts, userNameKey);
  }
  if (!updated) {
    unauthorized('User not found');
  }

  // Re-issue the session so its cached userName stays fresh.
  await setUserSession(event, {
    user: {
      id: updated.id,
      userName: updated.userName,
      sessionVersion: updated.sessionVersion,
      locale: updated.locale as 'en' | 'fi',
    },
  });

  if (confirm && origin && mailer) {
    const confirmLink = `${origin}/confirm-email?token=${confirm.token}`;
    await sendMailBestEffort(
      mailer,
      confirmEmailMessage(email, confirmLink),
      'profile-email-change',
    );
  }

  return { message: 'User updated successfully', user: toPublicUser(updated) };
});

async function findUserConflicts(db: Db, userId: string, userNameKey: string, email: string) {
  return db
    .select({ userNameKey: users.userNameKey, email: users.email })
    .from(users)
    .where(
      and(
        ne(users.id, userId),
        or(eq(users.userNameKey, userNameKey), eq(users.email, email)),
      ),
    );
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
