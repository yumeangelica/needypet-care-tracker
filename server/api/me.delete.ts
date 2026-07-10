import { eq } from 'drizzle-orm';
import { accountDeleteSchema } from '#shared/schemas/user';
import { useDb } from '../db';
import { pets, users } from '../db/schema';
import { removeStoredImageQuietly } from '../utils/imageStorage';
import { verifyUserPassword } from '../utils/password';
import { requireAppUser } from '../utils/session';

/**
 * Deletes the account after a current-password confirmation. FKs handle the
 * fallout: own pets cascade (needs, records, caretaker links included),
 * caretakerships on other pets are removed, and records logged on OTHER
 * people's pets keep their audit row with careTakerId nulled.
 */
export default defineEventHandler(async (event) => {
  const user = await requireAppUser(event);
  const input = await readValidatedBodyOr422(event, accountDeleteSchema);

  if (!(await verifyUserPassword(input.currentPassword, user.passwordHash))) {
    unauthorized('Invalid current password', 'errors.invalidCurrentPassword');
  }

  const db = useDb();
  // Collect owned pets' photo keys before the cascade removes the rows.
  const ownedImages = await db
    .select({ imageStorageKey: pets.imageStorageKey })
    .from(pets)
    .where(eq(pets.ownerId, user.id));

  await db.delete(users).where(eq(users.id, user.id));

  for (const owned of ownedImages) {
    await removeStoredImageQuietly(owned.imageStorageKey);
  }

  await clearUserSession(event);
  return sendNoContent(event);
});
