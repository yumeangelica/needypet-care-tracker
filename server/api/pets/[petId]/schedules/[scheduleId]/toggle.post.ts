import { eq } from 'drizzle-orm';
import type { NeedSchedule } from '#shared/types/domain';
import { todayInTimeZone } from '#shared/utils/date';
import { firstRow, useDb } from '../../../../../db';
import { needSchedules } from '../../../../../db/schema';
import { toDomainSchedule } from '../../../../../utils/mappers';
import { toggleSchedule } from '../../../../../utils/needSchedules';
import { requirePetOwner } from '../../../../../utils/petAccess';
import { requireAppUser } from '../../../../../utils/session';

/**
 * Rules-list pause/resume (ADR-0015). Pausing stops future instances (and
 * mirrors onto today's live instance); resuming re-activates — materializing
 * today's instance when the rule is due today and missing (400
 * needs.dayFull when the day is already full).
 */
export default defineEventHandler(async (event): Promise<NeedSchedule> => {
  const user = await requireAppUser(event);
  const petId = getRouterParam(event, 'petId');
  const scheduleId = getRouterParam(event, 'scheduleId');
  if (!petId || !scheduleId) {
    notFound('Schedule not found');
  }
  const pet = await requirePetOwner(petId, user.id);

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
  const toggled = await toggleSchedule(db, schedule, ownerToday);
  return toDomainSchedule(toggled);
});
