import { eq } from 'drizzle-orm';
import type { Need } from '#shared/types/domain';
import { instantToIso } from '#shared/utils/datetime';
import { Temporal } from '#shared/utils/temporal';
import { firstRow, useDb } from '../../../../../db';
import { needs } from '../../../../../db/schema';
import { toDomainNeed } from '../../../../../utils/mappers';
import { requirePetOwner } from '../../../../../utils/petAccess';
import { requireAppUser } from '../../../../../utils/session';

/** Pause/resume: a paused (isActive: false) need stays on its day but does
 * not roll forward to the next day. */
export default defineEventHandler(async (event): Promise<Need> => {
  const user = await requireAppUser(event);
  const petId = getRouterParam(event, 'petId');
  const needId = getRouterParam(event, 'needId');
  if (!petId || !needId) {
    notFound('Need not found');
  }
  const pet = await requirePetOwner(petId, user.id);

  const db = useDb();
  const need = firstRow(await db.select().from(needs).where(eq(needs.id, needId)));
  if (!need || need.petId !== pet.id) {
    notFound('Need not found');
  }
  if (need.archived) {
    badRequest('Need is archived', 'errors.needArchived');
  }

  const updatedRows = await db
    .update(needs)
    .set({ isActive: !need.isActive, updatedAt: instantToIso(Temporal.Now.instant()) })
    .where(eq(needs.id, need.id))
    .returning();

  return toDomainNeed(updatedRows[0]!);
});
