import { and, eq } from 'drizzle-orm';
import { MAX_NEEDS_PER_DAY } from '#shared/schemas/need';
import type { NeedInput, NeedUpdateInput, ScheduleUpdateInput } from '#shared/schemas/need';
import type { RecurrenceRule } from '#shared/types/domain';
import { instantToIso } from '#shared/utils/datetime';
import { hasExactlyOneMeasurement } from '#shared/utils/measurement';
import { formatWeekdaysCsv, isScheduleDueOn } from '#shared/utils/recurrence';
import { Temporal } from '#shared/utils/temporal';
import { type Db, firstRow, withTransaction } from '../db';
import { needSchedules, needs } from '../db/schema';
import type { NeedRow, ScheduleRow } from './mappers';
import { toMeasurementColumns, toRecurrenceColumns, toRecurrenceRule } from './mappers';

/**
 * Shared need/schedule lifecycle operations (ADR-0015). Both route surfaces —
 * the per-instance `needs/:needId` routes the day cards use and the
 * `schedules/:scheduleId` routes the rules list uses — funnel through here so
 * the reconciliation rules cannot drift apart:
 *
 * - a scheduled instance's edit/pause/delete acts on its RULE (edit
 *   propagates to today's live instance, delete removes rule + live
 *   instances, frozen history keeps its rows via ON DELETE SET NULL);
 * - a schedule-less (one-off) instance keeps the pre-0015 instance-only
 *   behavior;
 * - changing a rule re-anchors it to the owner-local today and materializes
 *   today's instance when the rule just became due (cap-enforced with the
 *   same 400 as POST — explicit user actions never overfill a day).
 */

interface MeasurementColumns {
  durationValue: number | null;
  durationUnit: string | null;
  quantityValue: number | null;
  quantityUnit: string | null;
}

function nowIso(): string {
  return instantToIso(Temporal.Now.instant());
}

/** Non-archived instances on one owner-local day (the MAX_NEEDS_PER_DAY base). */
export async function countLiveNeedsOnDay(db: Db, petId: string, day: string): Promise<number> {
  const rows = await db
    .select({ id: needs.id })
    .from(needs)
    .where(and(eq(needs.petId, petId), eq(needs.dateFor, day), eq(needs.archived, false)));
  return rows.length;
}

function rejectDayFull(): never {
  badRequest('Maximum number of needs for the day reached', 'needs.dayFull');
}

/** Rule equality: same type and parameters (weekday order-insensitive). */
export function rulesEqual(a: RecurrenceRule, b: RecurrenceRule): boolean {
  if (a.type !== b.type) {
    return false;
  }
  if (a.type === 'interval' && b.type === 'interval') {
    return a.intervalDays === b.intervalDays;
  }
  if (a.type === 'weekly' && b.type === 'weekly') {
    return formatWeekdaysCsv(a.weekdays) === formatWeekdaysCsv(b.weekdays);
  }
  return true; // both daily
}

/** Payload measurement, or the given carry-over columns when omitted. */
function resolveMeasurement(
  input: { duration?: { value: number; unit: 'minutes' } | null; quantity?: { value: number; unit: 'ml' | 'g' } | null },
  carryOver: MeasurementColumns,
): MeasurementColumns {
  return hasExactlyOneMeasurement(input) ? toMeasurementColumns(input) : carryOver;
}

/** Inserts the per-day instance row for a schedule. */
async function insertInstance(
  tx: Db,
  schedule: Pick<ScheduleRow, 'id' | 'petId' | 'category' | 'description'> & MeasurementColumns,
  dateFor: string,
  now: string,
): Promise<NeedRow> {
  const rows = await tx
    .insert(needs)
    .values({
      id: crypto.randomUUID(),
      petId: schedule.petId,
      scheduleId: schedule.id,
      dateFor,
      category: schedule.category,
      description: schedule.description,
      durationValue: schedule.durationValue,
      durationUnit: schedule.durationUnit,
      quantityValue: schedule.quantityValue,
      quantityUnit: schedule.quantityUnit,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return rows[0]!;
}

/**
 * POST /pets/:petId/needs — creates the instance the owner asked for on
 * `input.dateFor` and, unless the choice was `once`, the rule behind it
 * (anchored on that same day). The instance is always materialized on
 * dateFor even when the rule is not due there (e.g. a weekly Mon rule
 * created on a Wednesday): the explicit create wins today, the rule governs
 * the future. Caller has already enforced the past-day and cap checks.
 */
export async function createNeedWithSchedule(
  db: Db,
  petId: string,
  input: NeedInput,
): Promise<{ need: NeedRow; recurrence: RecurrenceRule | null }> {
  const now = nowIso();
  const measurement = toMeasurementColumns(input);

  if (input.recurrence.type === 'once') {
    const rows = await db
      .insert(needs)
      .values({
        id: crypto.randomUUID(),
        petId,
        dateFor: input.dateFor,
        category: input.category,
        description: input.description,
        ...measurement,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return { need: rows[0]!, recurrence: null };
  }

  const rule = input.recurrence;
  return withTransaction(async (tx) => {
    const scheduleRows = await tx
      .insert(needSchedules)
      .values({
        id: crypto.randomUUID(),
        petId,
        category: input.category,
        description: input.description,
        ...measurement,
        ...toRecurrenceColumns(rule),
        anchorDate: input.dateFor,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    const need = await insertInstance(tx, scheduleRows[0]!, input.dateFor, now);
    return { need, recurrence: rule };
  });
}

/**
 * PUT /pets/:petId/needs/:needId — updates a live instance and reconciles
 * its rule: no `recurrence` keeps the current rule; `once` detaches (and
 * deletes) the rule; a rule payload updates or creates one, re-anchoring to
 * the instance's day when the rule actually changed.
 */
export async function updateNeedWithSchedule(
  db: Db,
  need: NeedRow,
  input: NeedUpdateInput,
): Promise<{ need: NeedRow; recurrence: RecurrenceRule | null }> {
  const now = nowIso();
  const schedule = need.scheduleId
    ? firstRow(await db.select().from(needSchedules).where(eq(needSchedules.id, need.scheduleId)))
    : undefined;
  const measurement = resolveMeasurement(input, {
    durationValue: need.durationValue,
    durationUnit: need.durationUnit,
    quantityValue: need.quantityValue,
    quantityUnit: need.quantityUnit,
  });
  const fields = { category: input.category, description: input.description, ...measurement };

  return withTransaction(async (tx) => {
    let recurrence: RecurrenceRule | null = schedule ? toRecurrenceRule(schedule) : null;

    // `once` never reaches the rule paths below; narrow it away up front.
    const requestedRule =
      input.recurrence && input.recurrence.type !== 'once' ? input.recurrence : undefined;

    if (schedule && input.recurrence?.type === 'once') {
      // Detach: the rule disappears, frozen history keeps rows via SET NULL.
      await tx.delete(needSchedules).where(eq(needSchedules.id, schedule.id));
      recurrence = null;
    } else if (schedule) {
      const newRule = requestedRule ?? toRecurrenceRule(schedule);
      const changed = !rulesEqual(toRecurrenceRule(schedule), newRule);
      await tx
        .update(needSchedules)
        .set({
          ...fields,
          ...toRecurrenceColumns(newRule),
          // Re-anchor on a real rule change so "every N days" restarts from
          // the day the owner changed their mind, not the original anchor.
          ...(changed ? { anchorDate: need.dateFor } : {}),
          updatedAt: now,
        })
        .where(eq(needSchedules.id, schedule.id));
      recurrence = newRule;
    } else if (requestedRule) {
      // One-off promoted to a recurring rule, anchored on its own day.
      const rule = requestedRule;
      const scheduleRows = await tx
        .insert(needSchedules)
        .values({
          id: crypto.randomUUID(),
          petId: need.petId,
          ...fields,
          ...toRecurrenceColumns(rule),
          anchorDate: need.dateFor,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      recurrence = rule;
      await tx
        .update(needs)
        .set({ scheduleId: scheduleRows[0]!.id })
        .where(eq(needs.id, need.id));
    }

    const updatedRows = await tx
      .update(needs)
      .set({ ...fields, updatedAt: now })
      .where(eq(needs.id, need.id))
      .returning();
    return { need: updatedRows[0]!, recurrence };
  });
}

/**
 * Toggle on the instance surface: a scheduled instance pauses/resumes its
 * RULE (and mirrors the state onto the instance so the card reflects it); a
 * one-off keeps the legacy instance-only flip.
 */
export async function toggleNeedWithSchedule(
  db: Db,
  need: NeedRow,
): Promise<{ need: NeedRow; recurrence: RecurrenceRule | null }> {
  const now = nowIso();
  const schedule = need.scheduleId
    ? firstRow(await db.select().from(needSchedules).where(eq(needSchedules.id, need.scheduleId)))
    : undefined;

  if (!schedule) {
    const rows = await db
      .update(needs)
      .set({ isActive: !need.isActive, updatedAt: now })
      .where(eq(needs.id, need.id))
      .returning();
    return { need: rows[0]!, recurrence: null };
  }

  const nextActive = !schedule.isActive;
  return withTransaction(async (tx) => {
    await tx
      .update(needSchedules)
      .set({ isActive: nextActive, updatedAt: now })
      .where(eq(needSchedules.id, schedule.id));
    const rows = await tx
      .update(needs)
      .set({ isActive: nextActive, updatedAt: now })
      .where(eq(needs.id, need.id))
      .returning();
    return { need: rows[0]!, recurrence: toRecurrenceRule(schedule) };
  });
}

/**
 * Deletes a need. A scheduled instance takes its rule and every live
 * (non-archived) sibling instance with it — "remove this task from now on".
 * Archived history rows survive with schedule_id set NULL by the FK.
 */
export async function deleteNeedWithSchedule(db: Db, need: Pick<NeedRow, 'id' | 'scheduleId'>): Promise<void> {
  if (!need.scheduleId) {
    await db.delete(needs).where(eq(needs.id, need.id));
    return;
  }
  const scheduleId = need.scheduleId;
  await withTransaction(async (tx) => {
    await tx
      .delete(needs)
      .where(and(eq(needs.scheduleId, scheduleId), eq(needs.archived, false)));
    await tx.delete(needSchedules).where(eq(needSchedules.id, scheduleId));
  });
}

/**
 * PUT /pets/:petId/schedules/:scheduleId — rules-list edit. Propagates the
 * fields to today's live instance, re-anchors on rule change and, when the
 * rule just became due today with no live instance, materializes one
 * (cap-enforced: explicit edits never overfill a day).
 */
export async function updateSchedule(
  db: Db,
  schedule: ScheduleRow,
  input: ScheduleUpdateInput,
  ownerToday: string,
): Promise<ScheduleRow> {
  const now = nowIso();
  const measurement = resolveMeasurement(input, {
    durationValue: schedule.durationValue,
    durationUnit: schedule.durationUnit,
    quantityValue: schedule.quantityValue,
    quantityUnit: schedule.quantityUnit,
  });
  const fields = { category: input.category, description: input.description, ...measurement };
  const newRule = input.recurrence ?? toRecurrenceRule(schedule);
  const changed = !rulesEqual(toRecurrenceRule(schedule), newRule);
  const anchorDate = changed ? ownerToday : schedule.anchorDate;

  return withTransaction(async (tx) => {
    const updatedRows = await tx
      .update(needSchedules)
      .set({
        ...fields,
        ...toRecurrenceColumns(newRule),
        anchorDate,
        updatedAt: now,
      })
      .where(eq(needSchedules.id, schedule.id))
      .returning();
    const updated = updatedRows[0]!;

    const todayLive = await tx
      .select({ id: needs.id })
      .from(needs)
      .where(
        and(
          eq(needs.scheduleId, schedule.id),
          eq(needs.dateFor, ownerToday),
          eq(needs.archived, false),
        ),
      );
    if (todayLive.length > 0) {
      await tx
        .update(needs)
        .set({ ...fields, updatedAt: now })
        .where(
          and(
            eq(needs.scheduleId, schedule.id),
            eq(needs.dateFor, ownerToday),
            eq(needs.archived, false),
          ),
        );
    } else if (
      updated.isActive &&
      isScheduleDueOn({ recurrence: newRule, anchorDate }, ownerToday)
    ) {
      if ((await countLiveNeedsOnDay(tx, schedule.petId, ownerToday)) >= MAX_NEEDS_PER_DAY) {
        rejectDayFull();
      }
      await insertInstance(tx, updated, ownerToday, now);
    }
    return updated;
  });
}

/**
 * Toggle on the rules list. Pausing mirrors onto today's live instance;
 * resuming re-activates it — or materializes it when the rule is due today
 * and the instance is missing (the reason a paused weekly rule stays
 * reachable at all).
 */
export async function toggleSchedule(
  db: Db,
  schedule: ScheduleRow,
  ownerToday: string,
): Promise<ScheduleRow> {
  const now = nowIso();
  const nextActive = !schedule.isActive;

  return withTransaction(async (tx) => {
    const updatedRows = await tx
      .update(needSchedules)
      .set({ isActive: nextActive, updatedAt: now })
      .where(eq(needSchedules.id, schedule.id))
      .returning();
    const updated = updatedRows[0]!;

    const todayLive = await tx
      .select({ id: needs.id })
      .from(needs)
      .where(
        and(
          eq(needs.scheduleId, schedule.id),
          eq(needs.dateFor, ownerToday),
          eq(needs.archived, false),
        ),
      );
    if (todayLive.length > 0) {
      await tx
        .update(needs)
        .set({ isActive: nextActive, updatedAt: now })
        .where(
          and(
            eq(needs.scheduleId, schedule.id),
            eq(needs.dateFor, ownerToday),
            eq(needs.archived, false),
          ),
        );
    } else if (
      nextActive &&
      isScheduleDueOn({ recurrence: toRecurrenceRule(updated), anchorDate: updated.anchorDate }, ownerToday)
    ) {
      if ((await countLiveNeedsOnDay(tx, schedule.petId, ownerToday)) >= MAX_NEEDS_PER_DAY) {
        rejectDayFull();
      }
      await insertInstance(tx, updated, ownerToday, now);
    }
    return updated;
  });
}

/** DELETE on the rules list: rule + live instances; frozen history stays. */
export async function deleteSchedule(db: Db, scheduleId: string): Promise<void> {
  await withTransaction(async (tx) => {
    await tx
      .delete(needs)
      .where(and(eq(needs.scheduleId, scheduleId), eq(needs.archived, false)));
    await tx.delete(needSchedules).where(eq(needSchedules.id, scheduleId));
  });
}
