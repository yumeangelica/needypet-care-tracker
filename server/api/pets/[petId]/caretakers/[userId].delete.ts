import { and, eq } from 'drizzle-orm';
import { firstRow, useDb } from '../../../../db';
import { petCaretakers, pets } from '../../../../db/schema';
import { requireAppUser } from '../../../../utils/session';

/**
 * Removes a caretaker link. Permitted for the pet's owner (remove anyone)
 * or for a caretaker removing themself. Custom permission logic, so the
 * shared access guards don't apply here.
 */
export default defineEventHandler(async (event) => {
  const user = await requireAppUser(event);
  const petId = getRouterParam(event, 'petId');
  const targetUserId = getRouterParam(event, 'userId');
  if (!petId || !targetUserId) {
    notFound('Caretaker not found');
  }

  const db = useDb();
  const pet = firstRow(await db.select().from(pets).where(eq(pets.id, petId)));
  if (!pet) {
    notFound('Pet not found');
  }
  if (pet.ownerId !== user.id && targetUserId !== user.id) {
    forbidden();
  }

  const link = firstRow(
    await db
      .select({ petId: petCaretakers.petId })
      .from(petCaretakers)
      .where(and(eq(petCaretakers.petId, pet.id), eq(petCaretakers.userId, targetUserId))),
  );
  if (!link) {
    notFound('Caretaker not found');
  }

  await db
    .delete(petCaretakers)
    .where(and(eq(petCaretakers.petId, pet.id), eq(petCaretakers.userId, targetUserId)));

  return sendNoContent(event);
});
