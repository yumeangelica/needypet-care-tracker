import bcrypt from 'bcryptjs';
import { and, eq, ne, or } from 'drizzle-orm';
import { profileUpdateSchema } from '#shared/schemas/user';
import { firstRow, useDb } from '../db';
import { users } from '../db/schema';
import { confirmEmailMessage, useMailer } from '../utils/mailer';
import { requireAppUser, toPublicUser } from '../utils/session';
import { createToken, expiryFromNow } from '../utils/tokens';

/**
 * Updates userName/email/timezone after verifying the current password.
 * Changing the email un-confirms it and sends a fresh confirmation link to
 * the NEW address; the account stays fully usable meanwhile.
 */
export default defineEventHandler(async (event) => {
  const user = await requireAppUser(event);
  const input = await readValidatedBodyOr422(event, profileUpdateSchema);

  if (!(await bcrypt.compare(input.currentPassword, user.passwordHash))) {
    unauthorized('Invalid current password');
  }

  const db = useDb();
  const email = input.email.toLowerCase();
  const taken = firstRow(
    await db
      .select({ userName: users.userName, email: users.email })
      .from(users)
      .where(
        and(ne(users.id, user.id), or(eq(users.userName, input.userName), eq(users.email, email))),
      ),
  );
  if (taken) {
    badRequest(taken.userName === input.userName ? 'Username already exists' : 'Email already exists');
  }

  const emailChanged = email !== user.email;
  const confirm = emailChanged ? createToken() : null;

  const updatedRows = await db
    .update(users)
    .set({
      userName: input.userName,
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
      updatedAt: new Date().toISOString(),
    })
    .where(eq(users.id, user.id))
    .returning();
  const updated = updatedRows[0]!;

  if (confirm) {
    const confirmLink = `${getRequestURL(event).origin}/confirm-email?token=${confirm.token}`;
    await useMailer().send(confirmEmailMessage(email, confirmLink));
  }

  // Re-issue the session so its cached userName stays fresh.
  await setUserSession(event, {
    user: { id: updated.id, userName: updated.userName, locale: updated.locale as 'en' | 'fi' },
  });

  return { message: 'User updated successfully', user: toPublicUser(updated) };
});
