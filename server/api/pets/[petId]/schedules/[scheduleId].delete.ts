import { eq } from 'drizzle-orm';
import { firstRow, useDb } from '../../../../db';
import { needSchedules } from '../../../../db/schema';
import { deleteSchedule } from '../../../../utils/needSchedules';
import { requirePetOwner } from '../../../../utils/petAccess';
import { requireAppUser } from '../../../../utils/session';

/**
 * Rules-list delete (ADR-0015): removes the rule and its live instances;
 * archived history rows survive with schedule_id set NULL by the FK.
 */
export default defineEventHandler(async (event) => {
  const user = await requireAppUser(event);
  const petId = getRouterParam(event, 'petId');
  const scheduleId = getRouterParam(event, 'scheduleId');
  if (!petId || !scheduleId) {
    notFound('Schedule not found');
  }
  const pet = await requirePetOwner(petId, user.id);

  const db = useDb();
  const schedule = firstRow(
    await db
      .select({ id: needSchedules.id, petId: needSchedules.petId })
      .from(needSchedules)
      .where(eq(needSchedules.id, scheduleId)),
  );
  if (!schedule || schedule.petId !== pet.id) {
    notFound('Schedule not found');
  }

  await deleteSchedule(db, schedule.id);
  return sendNoContent(event);
});
