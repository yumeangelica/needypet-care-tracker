import { eq } from 'drizzle-orm';
import { canMutateRecord, validateRecordMutation } from '#shared/utils/careRules';
import { instantToIso } from '#shared/utils/datetime';
import { Temporal } from '#shared/utils/temporal';
import { firstRow, useDb, withTransaction } from '../../../../../../db';
import { careRecords, needs } from '../../../../../../db/schema';
import { recomputeNeedCompletion } from '../../../../../../utils/careRecords';
import { toDomainCareRecord, toDomainNeed } from '../../../../../../utils/mappers';
import { requirePetAccess } from '../../../../../../utils/petAccess';
import { requireAppUser } from '../../../../../../utils/session';

/**
 * Removes a care record (undo an accidental log). The owner may remove any
 * record; a caretaker only their own. Un-completes the need when the summed
 * records drop below the target. Rolled-over (archived) days are frozen.
 */
export default defineEventHandler(async (event) => {
  const user = await requireAppUser(event);
  const petId = getRouterParam(event, 'petId');
  const needId = getRouterParam(event, 'needId');
  const recordId = getRouterParam(event, 'recordId');
  if (!petId || !needId || !recordId) {
    notFound('Care record not found');
  }
  const pet = await requirePetAccess(petId, user.id);

  const db = useDb();
  const record = firstRow(await db.select().from(careRecords).where(eq(careRecords.id, recordId)));
  if (!record || record.needId !== needId || record.petId !== pet.id) {
    notFound('Care record not found');
  }
  const needRow = firstRow(await db.select().from(needs).where(eq(needs.id, needId)));
  if (!needRow) {
    notFound('Need not found');
  }

  if (!canMutateRecord(record, user.id, pet.ownerId === user.id)) {
    forbidden();
  }

  // Same gate as PATCH: only an archived (frozen) day blocks the mutation.
  // The record already matches its need, so passing its own shape keeps the
  // measurement check a no-op and leaves 'archived' as the sole rejection.
  if (validateRecordMutation(toDomainNeed(needRow), toDomainCareRecord(record, null)) === 'archived') {
    badRequest('Care history for rolled-over days is frozen', 'errors.dayFrozen');
  }

  const now = instantToIso(Temporal.Now.instant());
  await withTransaction(async (tx) => {
    await tx.delete(careRecords).where(eq(careRecords.id, record.id));
    await recomputeNeedCompletion(tx, needRow, now);
  });

  return sendNoContent(event);
});
