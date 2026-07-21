import { eq } from 'drizzle-orm';
import { scheduleUpdateSchema } from '#shared/schemas/need';
import type { NeedSchedule } from '#shared/types/domain';
import { todayInTimeZone } from '#shared/utils/date';
import { firstRow, useDb } from '../../../../db';
import { needSchedules } from '../../../../db/schema';
import { toDomainSchedule } from '../../../../utils/mappers';
import { updateSchedule } from '../../../../utils/needSchedules';
import { requirePetOwner } from '../../../../utils/petAccess';
import { requireAppUser } from '../../../../utils/session';

/**
 * Rules-list edit (ADR-0015). Propagates fields to today's live instance,
 * re-anchors on a rule change, and materializes today's instance when the
 * rule just became due (400 needs.dayFull when the day is already full).
 * A schedule stays a rule — converting to a one-off happens on the instance
 * route (`recurrence: {type:'once'}`), not here.
 */
export default defineEventHandler(async (event): Promise<NeedSchedule> => {
  const user = await requireAppUser(event);
  const petId = getRouterParam(event, 'petId');
  const scheduleId = getRouterParam(event, 'scheduleId');
  if (!petId || !scheduleId) {
    notFound('Schedule not found');
  }
  const pet = await requirePetOwner(petId, user.id);
  const input = await readValidatedBodyOr422(event, scheduleUpdateSchema);

  const db = useDb();
  const schedule = firstRow(
    await db.select().from(needSchedules).where(eq(needSchedules.id, scheduleId)),
  );
  if (!schedule || schedule.petId !== pet.id) {
    notFound('Schedule not found');
  }

  // requirePetOwner guarantees the requester IS the owner, so user.timezone
  // is the owner's timezone that defines the pet's care day.
  const ownerToday = todayInTimeZone(user.timezone);
  const updated = await updateSchedule(db, schedule, input, ownerToday);
  return toDomainSchedule(updated);
});
