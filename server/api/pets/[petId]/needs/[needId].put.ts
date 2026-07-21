import { eq } from 'drizzle-orm';
import { needUpdateSchema } from '#shared/schemas/need';
import type { Need } from '#shared/types/domain';
import { firstRow, useDb } from '../../../../db';
import { needs } from '../../../../db/schema';
import { toDomainNeed } from '../../../../utils/mappers';
import { updateNeedWithSchedule } from '../../../../utils/needSchedules';
import { requirePetOwner } from '../../../../utils/petAccess';
import { requireAppUser } from '../../../../utils/session';

/**
 * Edits a care task. A payload without a measurement keeps the existing one
 * (legacy updateNeed behavior); completed/archived/isActive/dateFor are never
 * editable here. On a scheduled instance the edit applies to the RULE and is
 * mirrored onto this instance; `recurrence` reconciles the rule itself
 * (omitted = keep, `once` = detach, a rule = update/create + re-anchor on
 * change) — see server/utils/needSchedules.ts (ADR-0015).
 */
export default defineEventHandler(async (event): Promise<Need> => {
  const user = await requireAppUser(event);
  const petId = getRouterParam(event, 'petId');
  const needId = getRouterParam(event, 'needId');
  if (!petId || !needId) {
    notFound('Need not found');
  }
  const pet = await requirePetOwner(petId, user.id);
  const input = await readValidatedBodyOr422(event, needUpdateSchema);

  const db = useDb();
  const need = firstRow(await db.select().from(needs).where(eq(needs.id, needId)));
  if (!need || need.petId !== pet.id) {
    notFound('Need not found');
  }
  if (need.archived) {
    badRequest('Need is archived', 'errors.needArchived');
  }

  const updated = await updateNeedWithSchedule(db, need, input);
  return toDomainNeed(updated.need, updated.recurrence);
});
