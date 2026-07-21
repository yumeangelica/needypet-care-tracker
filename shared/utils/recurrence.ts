import type { RecurrenceRule } from '../types/domain';
import { compareDateOnly, diffDaysDateOnly, isoWeekdayOf } from './date';

/**
 * Pure recurrence math for need schedules (ADR-0015). All date parameters are
 * owner-local YYYY-MM-DD strings; weekday and day-difference computation runs
 * on the Temporal seam via shared/utils/date.ts.
 *
 * Interval rhythm uses a FIXED anchor: a schedule created (or re-anchored) on
 * `anchorDate` with `intervalDays = N` is due on anchor, anchor+N, anchor+2N…
 * regardless of which days were actually materialized — missed days never
 * shift the rhythm, and neither does an owner timezone change.
 */

export const MIN_INTERVAL_DAYS = 2;
export const MAX_INTERVAL_DAYS = 365;

/** The shape of a schedule the due-check needs (a subset of NeedSchedule). */
export interface ScheduleDueInput {
  recurrence: RecurrenceRule;
  anchorDate: string; // YYYY-MM-DD, owner-local
}

/** Whether an ACTIVE schedule should produce an instance on `day`. */
export function isScheduleDueOn(schedule: ScheduleDueInput, day: string): boolean {
  // Nothing is due before the rule existed (also guards negative modulo).
  if (compareDateOnly(day, schedule.anchorDate) < 0) {
    return false;
  }
  const rule = schedule.recurrence;
  switch (rule.type) {
    case 'daily':
      return true;
    case 'interval':
      return diffDaysDateOnly(schedule.anchorDate, day) % rule.intervalDays === 0;
    case 'weekly':
      return rule.weekdays.includes(isoWeekdayOf(day));
  }
}

/**
 * Parses the stored weekdays CSV ("1,4") into sorted unique ISO weekday
 * numbers. Returns null when the value does not hold at least one valid day —
 * a stored weekly rule must never be silently treated as "no days".
 */
export function parseWeekdaysCsv(csv: string): number[] | null {
  const days = [...new Set(csv.split(',').map((part) => Number(part.trim())))]
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7)
    .sort((a, b) => a - b);
  return days.length > 0 ? days : null;
}

/** Formats ISO weekday numbers for storage, sorted and de-duplicated. */
export function formatWeekdaysCsv(weekdays: number[]): string {
  return [...new Set(weekdays)].sort((a, b) => a - b).join(',');
}
