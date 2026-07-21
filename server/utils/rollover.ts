import { and, eq, inArray } from 'drizzle-orm';
import { todayInTimeZone } from '#shared/utils/date';
import { instantToIso } from '#shared/utils/datetime';
import { computeRollover } from '#shared/utils/rollover';
import { Temporal } from '#shared/utils/temporal';
import { firstRow, withTransaction } from '../db';
import { needSchedules, needs, pets } from '../db/schema';
import { toRecurrenceRule } from './mappers';
import type { PetRow } from './petAccess';

/**
 * Lazy on-read rollover (ADR-0009, schedules per ADR-0015), called from the
 * pet GET endpoints. Archives open past-day instances, materializes today's
 * instances from the pet's due active schedules, and stamps
 * `pets.last_rolled_need_date` as the idempotency guard.
 *
 * Concurrency/idempotency:
 * - the `>=` string compare (not `===`) also stays quiet when an owner moves
 *   to an earlier timezone and "today" temporarily steps backwards;
 * - the in-transaction re-read of the guard is the primary defence: a second
 *   near-simultaneous request re-reads the stamped date and no-ops;
 * - the guard is stamped even when there was nothing to roll, so later reads
 *   on the same day take the cheap fast path.
 *
 * Returns the rolled-to date, or null when the pet was already up to date.
 */
export async function rollPetNeedsIfDue(pet: PetRow, ownerTimezone: string): Promise<string | null> {
  const today = todayInTimeZone(ownerTimezone);
  if (pet.lastRolledNeedDate && pet.lastRolledNeedDate >= today) {
    return null;
  }

  await withTransaction(async (tx) => {
    const fresh = firstRow(
      await tx
        .select({ lastRolledNeedDate: pets.lastRolledNeedDate })
        .from(pets)
        .where(eq(pets.id, pet.id)),
    );
    if (fresh?.lastRolledNeedDate && fresh.lastRolledNeedDate >= today) {
      return;
    }

    const openRows = await tx
      .select({
        id: needs.id,
        dateFor: needs.dateFor,
        scheduleId: needs.scheduleId,
        archived: needs.archived,
      })
      .from(needs)
      .where(and(eq(needs.petId, pet.id), eq(needs.archived, false)));
    const scheduleRows = await tx
      .select()
      .from(needSchedules)
      .where(eq(needSchedules.petId, pet.id));

    const plan = computeRollover(
      openRows,
      scheduleRows.map((row) => ({
        id: row.id,
        isActive: row.isActive,
        recurrence: toRecurrenceRule(row),
        anchorDate: row.anchorDate,
        createdAt: row.createdAt,
      })),
      today,
    );

    const now = instantToIso(Temporal.Now.instant());
    if (plan.archiveIds.length > 0) {
      await tx
        .update(needs)
        .set({ archived: true, isActive: false, updatedAt: now })
        .where(inArray(needs.id, plan.archiveIds));
    }
    const byId = new Map(scheduleRows.map((row) => [row.id, row]));
    for (const scheduleId of plan.createForToday) {
      const schedule = byId.get(scheduleId);
      if (!schedule) {
        continue; // planner only emits ids it was given
      }
      await tx.insert(needs).values({
        id: crypto.randomUUID(),
        petId: pet.id,
        scheduleId: schedule.id,
        dateFor: today,
        category: schedule.category,
        description: schedule.description,
        durationValue: schedule.durationValue,
        durationUnit: schedule.durationUnit,
        quantityValue: schedule.quantityValue,
        quantityUnit: schedule.quantityUnit,
        createdAt: now,
        updatedAt: now,
      });
    }
    await tx
      .update(pets)
      .set({ lastRolledNeedDate: today, updatedAt: now })
      .where(eq(pets.id, pet.id));
  });

  return today;
}
