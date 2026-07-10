import { eq } from 'drizzle-orm';
import { petSchema } from '#shared/schemas/pet';
import type { Pet } from '#shared/types/domain';
import { isFutureDateOnly } from '#shared/utils/date';
import { instantToIso } from '#shared/utils/datetime';
import { Temporal } from '#shared/utils/temporal';
import { useDb } from '../../db';
import { pets } from '../../db/schema';
import { removeStoredImageQuietly } from '../../utils/imageStorage';
import { toDomainPet } from '../../utils/mappers';
import { requirePetOwner } from '../../utils/petAccess';
import { requireAppUser } from '../../utils/session';

/** Full replace of the editable pet fields (the edit form always submits the
 * whole object). Caretaker management is a later slice. */
export default defineEventHandler(async (event): Promise<Pet> => {
  const user = await requireAppUser(event);
  const petId = getRouterParam(event, 'petId');
  if (!petId) {
    notFound('Pet not found');
  }
  const pet = await requirePetOwner(petId, user.id);
  const input = await readValidatedBodyOr422(event, petSchema);

  // requirePetOwner guarantees the requester is the owner.
  if (input.birthday && isFutureDateOnly(input.birthday, user.timezone)) {
    badRequest('Birthday cannot be in the future', 'errors.birthdayInFuture');
  }

  const updatedRows = await useDb()
    .update(pets)
    .set({
      name: input.name,
      species: input.species,
      breed: input.breed,
      description: input.description,
      birthday: input.birthday ?? null,
      // An omitted image keeps the current one (uploads included). Choosing a
      // preset replaces an uploaded photo, so the upload columns are cleared.
      ...(input.image
        ? {
            imageSource: input.image.source,
            imageKey: input.image.key,
            imageUrl: null,
            imageStorageKey: null,
          }
        : {}),
      updatedAt: instantToIso(Temporal.Now.instant()),
    })
    .where(eq(pets.id, pet.id))
    .returning();

  if (input.image && pet.imageStorageKey) {
    await removeStoredImageQuietly(pet.imageStorageKey);
  }

  return toDomainPet(updatedRows[0]!);
});
