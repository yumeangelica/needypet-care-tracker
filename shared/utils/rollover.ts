import { MAX_NEEDS_PER_DAY } from '../schemas/need';
import type { Need, RecurrenceRule } from '../types/domain';
import { compareDateOnly } from './date';
import { isScheduleDueOn } from './recurrence';

/**
 * Pure rollover computation (ADR-0009, template model amended by ADR-0015).
 * Given a pet's non-archived need instances, its recurrence rules and the
 * owner-local today:
 * - every open instance left on a past day gets archived (paused ones
 *   included) — past days stay frozen, one-off needs simply never return;
 * - each ACTIVE schedule that is due today materializes one fresh instance,
 *   de-duplicated by schedule id: skipped when today already has a live
 *   instance of the same rule;
 * - missed in-between days are NOT backfilled: archived copies could never
 *   receive care records, so an empty past day is the honest history;
 * - today never exceeds MAX_NEEDS_PER_DAY live instances: schedules are
 *   considered oldest-first and excess due rules skip this day (they get
 *   their next chance on their next due day).
 */

export type RolloverNeed = Pick<Need, 'id' | 'dateFor' | 'scheduleId' | 'archived'>;

/** The slice of a schedule the planner needs (rule resolved from columns). */
export interface RolloverSchedule {
  id: string;
  isActive: boolean;
  recurrence: RecurrenceRule;
  anchorDate: string; // YYYY-MM-DD, owner-local
  createdAt: string; // deterministic oldest-first cap ordering
}

export interface RolloverPlan {
  archiveIds: string[];
  /** Schedule ids to materialize an instance for on `today`. */
  createForToday: string[];
}

export function computeRollover(
  needs: RolloverNeed[],
  schedules: RolloverSchedule[],
  today: string,
): RolloverPlan {
  const past = needs.filter(
    (need) => !need.archived && compareDateOnly(need.dateFor, today) < 0,
  );

  const todayLive = needs.filter((need) => need.dateFor === today && !need.archived);
  const todayScheduleIds = new Set(
    todayLive.map((need) => need.scheduleId).filter((id): id is string => id !== null),
  );

  const createForToday: string[] = [];
  let todayCount = todayLive.length;
  const ordered = [...schedules].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const schedule of ordered) {
    if (!schedule.isActive) {
      continue; // paused: no new instances until resumed
    }
    if (!isScheduleDueOn(schedule, today)) {
      continue;
    }
    if (todayScheduleIds.has(schedule.id)) {
      continue; // today already has a live instance of this rule
    }
    if (todayCount >= MAX_NEEDS_PER_DAY) {
      continue; // day is full — deterministic skip, oldest rules won
    }
    createForToday.push(schedule.id);
    todayCount += 1;
  }

  return { archiveIds: past.map((need) => need.id), createForToday };
}
