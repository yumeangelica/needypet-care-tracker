import { eq } from 'drizzle-orm';
import { careRecordUpdateSchema } from '#shared/schemas/careRecord';
import type { Need } from '#shared/types/domain';
import { canMutateRecord, validateRecordMutation } from '#shared/utils/careRules';
import type { RecordMutationRejection } from '#shared/utils/careRules';
import { todayInTimeZone } from '#shared/utils/date';
import { instantToIso, zonedDateTimeToUtcIso } from '#shared/utils/datetime';
import { Temporal } from '#shared/utils/temporal';
import { firstRow, useDb, withTransaction } from '../../../../../../db';
import { careRecords, needs, users } from '../../../../../../db/schema';
import { recomputeNeedCompletion } from '../../../../../../utils/careRecords';
import { toDomainNeed, toMeasurementColumns } from '../../../../../../utils/mappers';
import { requirePetAccess } from '../../../../../../utils/petAccess';
import { requireAppUser } from '../../../../../../utils/session';

const REJECTION_MESSAGES: Record<RecordMutationRejection, { message: string; key: string }> = {
  'archived': { message: 'Care history for rolled-over days is frozen', key: 'errors.dayFrozen' },
  'measurement-mismatch': {
    message: 'Care record measurement must match need measurement',
    key: 'errors.measurementMismatch',
  },
};

/**
 * Edits a care record (amount, note, optional time correction). The owner may
 * edit any record; a caretaker only their own. Attribution (careTakerId),
 * audit timezone and createdAt never change. Completion is recomputed.
 */
export default defineEventHandler(async (event): Promise<Need> => {
  const user = await requireAppUser(event);
  const petId = getRouterParam(event, 'petId');
  const needId = getRouterParam(event, 'needId');
  const recordId = getRouterParam(event, 'recordId');
  if (!petId || !needId || !recordId) {
    notFound('Care record not found');
  }
  const pet = await requirePetAccess(petId, user.id);
  const input = await readValidatedBodyOr422(event, careRecordUpdateSchema);

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

  const rejection = validateRecordMutation(toDomainNeed(needRow), input);
  if (rejection) {
    badRequest(REJECTION_MESSAGES[rejection].message, REJECTION_MESSAGES[rejection].key);
  }

  const now = instantToIso(Temporal.Now.instant());

  // Manual time correction, wall-clock in the OWNER's timezone. Must stay
  // inside the record's care day and not move into the future.
  let recordDate = record.date;
  if (input.timeOfDay) {
    const owner = firstRow(
      await db.select({ timezone: users.timezone }).from(users).where(eq(users.id, pet.ownerId)),
    );
    const ownerTimezone = owner?.timezone ?? 'UTC';
    recordDate = zonedDateTimeToUtcIso(needRow.dateFor, input.timeOfDay, ownerTimezone);
    if (recordDate > now) {
      badRequest('Cannot log care in the future', 'errors.careInFuture');
    }
    if (todayInTimeZone(ownerTimezone, Temporal.Instant.from(recordDate)) !== needRow.dateFor) {
      badRequest('Time must fall within the care day', 'errors.timeOutsideCareDay');
    }
  }

  const updatedNeedRow = await withTransaction(async (tx) => {
    await tx
      .update(careRecords)
      .set({
        note: input.note,
        date: recordDate,
        ...toMeasurementColumns(input),
      })
      .where(eq(careRecords.id, record.id));

    return recomputeNeedCompletion(tx, needRow, now);
  });

  return toDomainNeed(updatedNeedRow);
});
