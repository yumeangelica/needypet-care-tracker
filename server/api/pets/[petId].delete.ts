import { eq } from 'drizzle-orm';
import { useDb } from '../../db';
import { pets } from '../../db/schema';
import { removeStoredImageQuietly } from '../../utils/imageStorage';
import { requirePetOwner } from '../../utils/petAccess';
import { requireAppUser } from '../../utils/session';

/** Owner-only. Needs, care records and caretaker links cascade via FKs
 * (foreign_keys=ON); an uploaded photo is removed best-effort. */
export default defineEventHandler(async (event) => {
  const user = await requireAppUser(event);
  const petId = getRouterParam(event, 'petId');
  if (!petId) {
    notFound('Pet not found');
  }
  const pet = await requirePetOwner(petId, user.id);

  await useDb().delete(pets).where(eq(pets.id, pet.id));
  await removeStoredImageQuietly(pet.imageStorageKey);

  return sendNoContent(event);
});
