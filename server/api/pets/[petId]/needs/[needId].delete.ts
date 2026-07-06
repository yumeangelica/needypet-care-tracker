import { eq } from 'drizzle-orm';
import { firstRow, useDb } from '../../../../db';
import { needs } from '../../../../db/schema';
import { requirePetOwner } from '../../../../utils/petAccess';
import { requireAppUser } from '../../../../utils/session';

export default defineEventHandler(async (event) => {
  const user = await requireAppUser(event);
  const petId = getRouterParam(event, 'petId');
  const needId = getRouterParam(event, 'needId');
  if (!petId || !needId) {
    notFound('Need not found');
  }
  const pet = await requirePetOwner(petId, user.id);

  const db = useDb();
  const need = firstRow(
    await db.select({ id: needs.id, petId: needs.petId }).from(needs).where(eq(needs.id, needId)),
  );
  if (!need || need.petId !== pet.id) {
    notFound('Need not found');
  }

  // Archived needs are deletable too (legacy parity); records cascade.
  await db.delete(needs).where(eq(needs.id, need.id));

  return sendNoContent(event);
});
