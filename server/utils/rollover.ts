import { and, eq, inArray } from 'drizzle-orm';
import { todayInTimeZone } from '#shared/utils/date';
import { computeRollover } from '#shared/utils/rollover';
import { firstRow, withTransaction } from '../db';
import { needs, pets } from '../db/schema';
import { toDomainNeed, toMeasurementColumns } from './mappers';
import type { PetRow } from './petAccess';

/**
 * Lazy on-read daily rollover, called from the pet GET endpoints. Rolls the
 * pet's needs forward to the owner's current day and stamps
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
      .select()
      .from(needs)
      .where(and(eq(needs.petId, pet.id), eq(needs.archived, false)));
    const plan = computeRollover(openRows.map(toDomainNeed), today);

    const now = new Date().toISOString();
    if (plan.archiveIds.length > 0) {
      await tx
        .update(needs)
        .set({ archived: true, isActive: false, updatedAt: now })
        .where(inArray(needs.id, plan.archiveIds));
    }
    for (const template of plan.createForToday) {
      await tx.insert(needs).values({
        id: crypto.randomUUID(),
        petId: pet.id,
        dateFor: today,
        category: template.category,
        description: template.description,
        ...toMeasurementColumns(template),
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
