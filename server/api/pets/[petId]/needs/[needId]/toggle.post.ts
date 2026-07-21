import { eq } from 'drizzle-orm';
import type { Need } from '#shared/types/domain';
import { firstRow, useDb } from '../../../../../db';
import { needs } from '../../../../../db/schema';
import { toDomainNeed } from '../../../../../utils/mappers';
import { toggleNeedWithSchedule } from '../../../../../utils/needSchedules';
import { requirePetOwner } from '../../../../../utils/petAccess';
import { requireAppUser } from '../../../../../utils/session';

/**
 * Pause/resume. A scheduled instance pauses/resumes its RULE (paused rules
 * produce no new instances until resumed — ADR-0015) and mirrors the state
 * onto this instance; a one-off keeps the legacy instance-only flip. A
 * paused instance stays on its day and still accepts records.
 */
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

  const toggled = await toggleNeedWithSchedule(db, need);
  return toDomainNeed(toggled.need, toggled.recurrence);
});
