import { eq } from 'drizzle-orm';
import type { Pet } from '#shared/types/domain';
import { useDb } from '../../../db';
import { pets } from '../../../db/schema';
import { removeStoredImageQuietly } from '../../../utils/imageStorage';
import { toDomainPet } from '../../../utils/mappers';
import { requirePetOwner } from '../../../utils/petAccess';
import { requireAppUser } from '../../../utils/session';

/** Owner-only: removes the uploaded photo and reverts to the preset sticker. */
export default defineEventHandler(async (event): Promise<Pet> => {
  const user = await requireAppUser(event);
  const petId = getRouterParam(event, 'petId');
  if (!petId) {
    notFound('Pet not found');
  }
  const pet = await requirePetOwner(petId, user.id);

  if (pet.imageSource !== 'upload') {
    badRequest('This pet has no uploaded photo');
  }

  const updatedRows = await useDb()
    .update(pets)
    .set({
      imageSource: 'preset',
      imageUrl: null,
      imageStorageKey: null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(pets.id, pet.id))
    .returning();

  await removeStoredImageQuietly(pet.imageStorageKey);

  return toDomainPet(updatedRows[0]!);
});
