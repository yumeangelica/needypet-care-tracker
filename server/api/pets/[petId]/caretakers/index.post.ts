import { and, eq } from 'drizzle-orm';
import { caretakerAddSchema } from '#shared/schemas/caretaker';
import type { PetCaretaker } from '#shared/types/domain';
import { instantToIso } from '#shared/utils/datetime';
import { Temporal } from '#shared/utils/temporal';
import { firstRow, useDb } from '../../../../db';
import { petCaretakers, users } from '../../../../db/schema';
import { requirePetOwner } from '../../../../utils/petAccess';
import { requireAppUser } from '../../../../utils/session';

/** Owner-only: invite another user to the pet's care team by username. */
export default defineEventHandler(async (event): Promise<PetCaretaker> => {
  const user = await requireAppUser(event);
  const petId = getRouterParam(event, 'petId');
  if (!petId) {
    notFound('Pet not found');
  }
  const pet = await requirePetOwner(petId, user.id);
  const input = await readValidatedBodyOr422(event, caretakerAddSchema);

  const db = useDb();
  const target = firstRow(
    await db
      .select({ id: users.id, userName: users.userName })
      .from(users)
      .where(eq(users.userName, input.userName)),
  );
  if (!target) {
    badRequest("We couldn't find a pet lover with that username", 'errors.caretakerNotFound');
  }
  if (target.id === pet.ownerId) {
    badRequest('You already take care of this pet as its owner', 'errors.caretakerIsOwner');
  }

  const existing = firstRow(
    await db
      .select({ petId: petCaretakers.petId })
      .from(petCaretakers)
      .where(and(eq(petCaretakers.petId, pet.id), eq(petCaretakers.userId, target.id))),
  );
  if (existing) {
    badRequest('That pet lover is already helping out', 'errors.caretakerAlreadyHelping');
  }

  await db
    .insert(petCaretakers)
    .values({ petId: pet.id, userId: target.id, createdAt: instantToIso(Temporal.Now.instant()) });

  setResponseStatus(event, 201);
  return target;
});
