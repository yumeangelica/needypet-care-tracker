import { MAX_NEEDS_PER_DAY, needSchema } from '#shared/schemas/need';
import type { Need } from '#shared/types/domain';
import { compareDateOnly, todayInTimeZone } from '#shared/utils/date';
import { useDb } from '../../../../db';
import { toDomainNeed } from '../../../../utils/mappers';
import { countLiveNeedsOnDay, createNeedWithSchedule } from '../../../../utils/needSchedules';
import { requirePetOwner } from '../../../../utils/petAccess';
import { requireAppUser } from '../../../../utils/session';

export default defineEventHandler(async (event): Promise<Need> => {
  const user = await requireAppUser(event);
  const petId = getRouterParam(event, 'petId');
  if (!petId) {
    notFound('Pet not found');
  }
  const pet = await requirePetOwner(petId, user.id);
  const input = await readValidatedBodyOr422(event, needSchema);

  // requirePetOwner guarantees the requester IS the owner, so user.timezone
  // is the owner's timezone that defines the pet's care day.
  const ownerToday = todayInTimeZone(user.timezone);
  if (compareDateOnly(input.dateFor, ownerToday) < 0) {
    badRequest('Cannot add a need for a past day', 'errors.needPastDay');
  }

  const db = useDb();
  if ((await countLiveNeedsOnDay(db, pet.id, input.dateFor)) >= MAX_NEEDS_PER_DAY) {
    badRequest('Maximum number of needs for the day reached', 'needs.dayFull');
  }

  // `once` stays a schedule-less instance; anything else also creates the
  // rule (ADR-0015) anchored on dateFor.
  const { need, recurrence } = await createNeedWithSchedule(db, pet.id, input);

  setResponseStatus(event, 201);
  return toDomainNeed(need, recurrence);
});
