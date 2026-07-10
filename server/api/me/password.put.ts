import { eq } from 'drizzle-orm';
import { passwordChangeSchema } from '#shared/schemas/user';
import { instantToIso } from '#shared/utils/datetime';
import { Temporal } from '#shared/utils/temporal';
import { useDb } from '../../db';
import { users } from '../../db/schema';
import { hashUserPassword, verifyUserPassword } from '../../utils/password';
import { requireAppUser } from '../../utils/session';

export default defineEventHandler(async (event) => {
  const user = await requireAppUser(event);
  const input = await readValidatedBodyOr422(event, passwordChangeSchema);

  if (!(await verifyUserPassword(input.currentPassword, user.passwordHash))) {
    unauthorized('Invalid current password', 'errors.invalidCurrentPassword');
  }

  await useDb()
    .update(users)
    .set({
      passwordHash: await hashUserPassword(input.newPassword),
      updatedAt: instantToIso(Temporal.Now.instant()),
    })
    .where(eq(users.id, user.id));

  return { message: 'Password updated successfully' };
});
