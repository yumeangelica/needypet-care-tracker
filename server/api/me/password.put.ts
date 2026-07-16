import { and, eq, sql } from 'drizzle-orm';
import { passwordChangeSchema } from '#shared/schemas/user';
import { instantToIso } from '#shared/utils/datetime';
import { Temporal } from '#shared/utils/temporal';
import { firstRow, useDb } from '../../db';
import { users } from '../../db/schema';
import { hashUserPassword, verifyUserPassword } from '../../utils/password';
import { checkRateLimit, resetRateLimit } from '../../utils/rateLimit';
import { requireAppUser } from '../../utils/session';

export default defineEventHandler(async (event) => {
  const user = await requireAppUser(event);
  const input = await readValidatedBodyOr422(event, passwordChangeSchema);
  const passwordKey = `password:user:${user.id}`;
  await checkRateLimit(event, passwordKey, { max: 5, windowMs: 15 * 60_000 });

  if (!(await verifyUserPassword(input.currentPassword, user.passwordHash))) {
    unauthorized('Invalid current password', 'errors.invalidCurrentPassword');
  }
  await resetRateLimit(passwordKey);

  const updated = firstRow(
    await useDb()
      .update(users)
      .set({
        passwordHash: await hashUserPassword(input.newPassword),
        sessionVersion: sql`${users.sessionVersion} + 1`,
        updatedAt: instantToIso(Temporal.Now.instant()),
      })
      .where(and(eq(users.id, user.id), eq(users.sessionVersion, user.sessionVersion)))
      .returning(),
  );
  if (!updated) {
    await clearUserSession(event);
    unauthorized('Session expired');
  }

  // Preserve this device while every previously issued cookie becomes stale.
  await setUserSession(event, {
    user: {
      id: updated.id,
      userName: updated.userName,
      sessionVersion: updated.sessionVersion,
      locale: updated.locale as 'en' | 'fi',
    },
  });

  return { message: 'Password updated successfully' };
});
