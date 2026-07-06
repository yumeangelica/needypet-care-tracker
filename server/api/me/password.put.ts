import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { passwordChangeSchema } from '#shared/schemas/user';
import { useDb } from '../../db';
import { users } from '../../db/schema';
import { requireAppUser } from '../../utils/session';

export default defineEventHandler(async (event) => {
  const user = await requireAppUser(event);
  const input = await readValidatedBodyOr422(event, passwordChangeSchema);

  if (!(await bcrypt.compare(input.currentPassword, user.passwordHash))) {
    unauthorized('Invalid current password');
  }

  await useDb()
    .update(users)
    .set({
      passwordHash: await bcrypt.hash(input.newPassword, 10),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(users.id, user.id));

  return { message: 'Password updated successfully' };
});
