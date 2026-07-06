import { desc, eq, gte, lt, and } from 'drizzle-orm';
import type { PetWeekStats } from '#shared/types/domain';
import { addDaysDateOnly, isValidDateOnly, todayInTimeZone, weekStartOf } from '#shared/utils/date';
import { zonedDateTimeToUtcIso } from '#shared/utils/datetime';
import { computeStreak, computeWeekStats } from '#shared/utils/stats';
import type { StatsUnit } from '#shared/utils/stats';
import { firstRow, useDb } from '../../../db';
import { careRecords, needs, users } from '../../../db/schema';
import { requirePetAccess } from '../../../utils/petAccess';
import { requireAppUser } from '../../../utils/session';

/** How far back the streak can look; enough for a 5+ year daily streak. */
const STREAK_SCAN_LIMIT = 2000;

/**
 * Weekly care summary. `weekStart` (optional, any YYYY-MM-DD) is normalized
 * to its Monday in the OWNER's calendar; default is the owner's current week.
 * Visible to owner and caretakers alike, same as the diary.
 */
export default defineEventHandler(async (event): Promise<PetWeekStats> => {
  const user = await requireAppUser(event);
  const petId = getRouterParam(event, 'petId');
  if (!petId) {
    notFound('Pet not found');
  }
  const pet = await requirePetAccess(petId, user.id);

  const db = useDb();
  const owner = firstRow(
    await db
      .select({ id: users.id, userName: users.userName, timezone: users.timezone })
      .from(users)
      .where(eq(users.id, pet.ownerId)),
  );
  const ownerTimezone = owner?.timezone ?? 'UTC';
  const ownerToday = todayInTimeZone(ownerTimezone);

  const query = getQuery(event);
  let weekStart = weekStartOf(ownerToday);
  if (query.weekStart !== undefined) {
    const requested = String(query.weekStart);
    if (!isValidDateOnly(requested)) {
      badRequest('Invalid weekStart');
    }
    weekStart = weekStartOf(requested);
  }

  // The week's bounds as UTC instants: owner-local midnight to midnight.
  const startUtc = zonedDateTimeToUtcIso(weekStart, '00:00', ownerTimezone);
  const endUtc = zonedDateTimeToUtcIso(addDaysDateOnly(weekStart, 7), '00:00', ownerTimezone);

  const rows = await db
    .select({
      date: careRecords.date,
      category: needs.category,
      durationValue: careRecords.durationValue,
      quantityValue: careRecords.quantityValue,
      quantityUnit: careRecords.quantityUnit,
    })
    .from(careRecords)
    .innerJoin(needs, eq(careRecords.needId, needs.id))
    .where(and(eq(careRecords.petId, pet.id), gte(careRecords.date, startUtc), lt(careRecords.date, endUtc)));

  const weekRecords = rows.map((row) => ({
    date: row.date,
    category: row.category,
    duration: row.durationValue !== null ? { value: row.durationValue, unit: 'minutes' as const } : undefined,
    quantity:
      row.quantityValue !== null
        ? { value: row.quantityValue, unit: (row.quantityUnit ?? 'ml') as Exclude<StatsUnit, 'min'> }
        : undefined,
  }));
  const week = computeWeekStats(weekRecords, weekStart, ownerTimezone);

  // Streak scans record dates only — cheap even with a long history.
  const streakRows = await db
    .select({ date: careRecords.date })
    .from(careRecords)
    .where(eq(careRecords.petId, pet.id))
    .orderBy(desc(careRecords.date))
    .limit(STREAK_SCAN_LIMIT);
  const streak = computeStreak(streakRows.map((row) => row.date), ownerTimezone, ownerToday);

  return {
    pet: { id: pet.id, name: pet.name },
    owner: owner ?? { id: pet.ownerId, userName: 'Unknown', timezone: 'UTC' },
    weekStart,
    weekEnd: addDaysDateOnly(weekStart, 6),
    ownerToday,
    days: week.days,
    categories: week.categories,
    totalRecords: week.totalRecords,
    streak,
  };
});
