import { eq } from 'drizzle-orm';
import { careRecordSchema } from '#shared/schemas/careRecord';
import type { Need } from '#shared/types/domain';
import { validateRecordAgainstNeed } from '#shared/utils/careRules';
import type { RecordRejection } from '#shared/utils/careRules';
import { todayInTimeZone } from '#shared/utils/date';
import { zonedDateTimeToUtcIso } from '#shared/utils/datetime';
import { firstRow, useDb, withTransaction } from '../../../../../db';
import { careRecords, needs, users } from '../../../../../db/schema';
import { recomputeNeedCompletion } from '../../../../../utils/careRecords';
import { toDomainNeed, toMeasurementColumns } from '../../../../../utils/mappers';
import { requirePetAccess } from '../../../../../utils/petAccess';
import { requireAppUser } from '../../../../../utils/session';

const REJECTION_MESSAGES: Record<RecordRejection, string> = {
  'completed': 'Need is already completed',
  'archived': 'Need is archived',
  'measurement-mismatch': 'Care record measurement must match need measurement',
  'not-today': 'Need date is not the same as the current date',
};

/** Owner or caretaker logs care; the need auto-completes once the summed
 * record values reach the need's target. */
export default defineEventHandler(async (event): Promise<Need> => {
  const user = await requireAppUser(event);
  const petId = getRouterParam(event, 'petId');
  const needId = getRouterParam(event, 'needId');
  if (!petId || !needId) {
    notFound('Need not found');
  }
  const pet = await requirePetAccess(petId, user.id);
  const input = await readValidatedBodyOr422(event, careRecordSchema);

  const db = useDb();
  const needRow = firstRow(await db.select().from(needs).where(eq(needs.id, needId)));
  if (!needRow || needRow.petId !== pet.id) {
    notFound('Need not found');
  }

  // The care day is defined by the OWNER's timezone even when a caretaker in
  // another timezone logs the record.
  const owner = firstRow(
    await db.select({ timezone: users.timezone }).from(users).where(eq(users.id, pet.ownerId)),
  );
  const ownerTimezone = owner?.timezone ?? 'UTC';
  const ownerToday = todayInTimeZone(ownerTimezone);

  const need = toDomainNeed(needRow);
  const rejection = validateRecordAgainstNeed(need, input, ownerToday);
  if (rejection) {
    badRequest(REJECTION_MESSAGES[rejection]);
  }

  const now = new Date().toISOString();

  // A manual time is wall-clock in the OWNER's timezone; the resulting
  // instant must stay inside the care day and not in the future.
  let recordDate = now;
  if (input.timeOfDay) {
    recordDate = zonedDateTimeToUtcIso(needRow.dateFor, input.timeOfDay, ownerTimezone);
    if (recordDate > now) {
      badRequest('Cannot log care in the future');
    }
    if (todayInTimeZone(ownerTimezone, new Date(recordDate)) !== needRow.dateFor) {
      badRequest('Time must fall within the care day');
    }
  }

  const updatedRow = await withTransaction(async (tx) => {
    await tx.insert(careRecords).values({
      id: crypto.randomUUID(),
      needId: needRow.id,
      petId: pet.id,
      careTakerId: user.id,
      date: recordDate, // UTC timestamp of the act
      note: input.note,
      ...toMeasurementColumns(input),
      timezone: input.timezone, // acting user's IANA timezone (audit)
      createdAt: now,
    });

    return recomputeNeedCompletion(tx, needRow, now);
  });

  setResponseStatus(event, 201);
  return toDomainNeed(updatedRow);
});
