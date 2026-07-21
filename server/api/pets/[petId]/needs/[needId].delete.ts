import { eq } from 'drizzle-orm';
import { firstRow, useDb } from '../../../../db';
import { needs } from '../../../../db/schema';
import { deleteNeedWithSchedule } from '../../../../utils/needSchedules';
import { requirePetOwner } from '../../../../utils/petAccess';
import { requireAppUser } from '../../../../utils/session';

/**
 * Deletes a care task. A scheduled instance removes its rule and every live
 * sibling instance ("remove this task from now on" — ADR-0015); archived
 * history rows survive with schedule_id set NULL. Archived needs are
 * deletable too (legacy parity); records cascade.
 */
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
    await db
      .select({ id: needs.id, petId: needs.petId, scheduleId: needs.scheduleId, archived: needs.archived })
      .from(needs)
      .where(eq(needs.id, needId)),
  );
  if (!need || need.petId !== pet.id) {
    notFound('Need not found');
  }

  // An archived instance is frozen history: delete only that row, never its
  // rule (the rule moved on with the days).
  if (need.archived || !need.scheduleId) {
    await db.delete(needs).where(eq(needs.id, need.id));
  } else {
    await deleteNeedWithSchedule(db, need);
  }

  return sendNoContent(event);
});
