import { and, eq } from 'drizzle-orm';
import { caretakerAddSchema } from '#shared/schemas/caretaker';
import type { PetCaretaker } from '#shared/types/domain';
import { instantToIso } from '#shared/utils/datetime';
import { Temporal } from '#shared/utils/temporal';
import { normalizeUserName } from '#shared/utils/userName';
import { firstRow, useDb } from '../../../../db';
import { petCaretakers, users } from '../../../../db/schema';
import { requirePetOwner } from '../../../../utils/petAccess';
import { checkRateLimit } from '../../../../utils/rateLimit';
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
  await checkRateLimit(event, `caretaker-add:user:${user.id}`, {
    max: 20,
    windowMs: 60 * 60_000,
  });

  const db = useDb();
  const target = firstRow(
    await db
      .select({ id: users.id, userName: users.userName })
      .from(users)
      .where(eq(users.userNameKey, normalizeUserName(input.userName))),
  );
  if (!target) {
    rejectCaretakerAdd();
  }
  if (target.id === pet.ownerId) {
    rejectCaretakerAdd();
  }

  const existing = firstRow(
    await db
      .select({ petId: petCaretakers.petId })
      .from(petCaretakers)
      .where(and(eq(petCaretakers.petId, pet.id), eq(petCaretakers.userId, target.id))),
  );
  if (existing) {
    rejectCaretakerAdd();
  }

  try {
    await db
      .insert(petCaretakers)
      .values({ petId: pet.id, userId: target.id, createdAt: instantToIso(Temporal.Now.instant()) });
  } catch (error) {
    const concurrentDuplicate = firstRow(
      await db
        .select({ petId: petCaretakers.petId })
        .from(petCaretakers)
        .where(and(eq(petCaretakers.petId, pet.id), eq(petCaretakers.userId, target.id))),
    );
    if (!concurrentDuplicate) {
      throw error;
    }
    rejectCaretakerAdd();
  }

  setResponseStatus(event, 201);
  return target;
});

function rejectCaretakerAdd(): never {
  badRequest(
    "That username can't be added as a caretaker for this pet",
    'errors.caretakerAddFailed',
  );
}
