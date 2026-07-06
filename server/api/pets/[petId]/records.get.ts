import { and, count, desc, eq } from 'drizzle-orm';
import type { PetHistory } from '#shared/types/domain';
import { isValidDateOnly } from '#shared/utils/date';
import { firstRow, useDb } from '../../../db';
import { careRecords, needs, users } from '../../../db/schema';
import { toDomainCareRecord } from '../../../utils/mappers';
import { requirePetAccess } from '../../../utils/petAccess';
import { requireAppUser } from '../../../utils/session';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/** Parses a non-negative integer query param; garbage is a 400. */
function parseQueryInt(value: unknown, name: string, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    badRequest(`Invalid ${name}`);
  }
  return parsed;
}

/** The care diary: every record of the pet, newest first, actor resolved.
 * Visible to the owner and caretakers alike. */
export default defineEventHandler(async (event): Promise<PetHistory> => {
  const user = await requireAppUser(event);
  const petId = getRouterParam(event, 'petId');
  if (!petId) {
    notFound('Pet not found');
  }
  const pet = await requirePetAccess(petId, user.id);

  const query = getQuery(event);
  const limit = Math.min(parseQueryInt(query.limit, 'limit', DEFAULT_LIMIT), MAX_LIMIT);
  const offset = parseQueryInt(query.offset, 'offset', 0);

  // Optional filter: only records whose parent need belongs to this owner-local
  // care day. A day holds at most 10 needs, so one MAX_LIMIT page covers it.
  const needDateFor = query.needDateFor === undefined ? undefined : String(query.needDateFor);
  if (needDateFor !== undefined && !isValidDateOnly(needDateFor)) {
    badRequest('Invalid needDateFor');
  }
  const recordsFilter = needDateFor
    ? and(eq(careRecords.petId, pet.id), eq(needs.dateFor, needDateFor))
    : eq(careRecords.petId, pet.id);

  const db = useDb();
  const owner = firstRow(
    await db
      .select({ id: users.id, userName: users.userName, timezone: users.timezone })
      .from(users)
      .where(eq(users.id, pet.ownerId)),
  );

  // needId is a non-null FK, so the join never drops rows when unfiltered.
  const total = firstRow(
    await db
      .select({ value: count() })
      .from(careRecords)
      .innerJoin(needs, eq(careRecords.needId, needs.id))
      .where(recordsFilter),
  );

  const rows = await db
    .select({ record: careRecords, actorUserName: users.userName, needCategory: needs.category })
    .from(careRecords)
    .innerJoin(needs, eq(careRecords.needId, needs.id))
    .leftJoin(users, eq(careRecords.careTakerId, users.id))
    .where(recordsFilter)
    .orderBy(desc(careRecords.date))
    .limit(limit)
    .offset(offset);

  return {
    pet: { id: pet.id, name: pet.name },
    owner: owner ?? { id: pet.ownerId, userName: 'Unknown', timezone: 'UTC' },
    isOwner: pet.ownerId === user.id,
    total: total?.value ?? 0,
    records: rows.map((row) => ({
      ...toDomainCareRecord(row.record, row.actorUserName),
      needCategory: row.needCategory,
    })),
  };
});
