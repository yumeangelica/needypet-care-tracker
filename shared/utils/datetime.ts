/**
 * Instant (UTC timestamp) <-> timezone helpers for care records. Date-only
 * helpers live in date.ts; these deal with time-of-day through Temporal so the
 * browser's local timezone never leaks in. Values cross the wire and hit the DB
 * as strings; Temporal is used only for the computation in between.
 */

import { Temporal } from './temporal';

/**
 * A UTC instant as a millisecond-precision ISO string (`...:00.000Z`), matching
 * the stored timestamp format. `Instant.toString()` omits the `.000` when the
 * sub-second part is zero, so the precision is pinned explicitly.
 */
export function instantToIso(instant: Temporal.Instant): string {
  return instant.toString({ smallestUnit: 'millisecond' });
}

/**
 * Converts a wall-clock moment ('YYYY-MM-DD' + 'HH:mm' in an IANA timezone)
 * to a UTC ISO timestamp.
 *
 * DST edges resolve deterministically via Temporal's default 'compatible'
 * disambiguation: a nonexistent spring-forward time shifts forward by the gap,
 * and an ambiguous fall-back time maps to the earlier of its two instants.
 * Callers that must stay inside a calendar day should round-trip the result
 * through todayInTimeZone and compare.
 */
export function zonedDateTimeToUtcIso(dateOnly: string, timeOfDay: string, timeZone: string): string {
  const instant = Temporal.PlainDateTime.from(`${dateOnly}T${timeOfDay}`)
    .toZonedDateTime(timeZone)
    .toInstant();
  return instantToIso(instant);
}

/** 'HH:mm' wall-clock time of a UTC instant in the given timezone. */
export function formatTimeInTimeZone(isoUtc: string, timeZone: string): string {
  const time = Temporal.Instant.from(isoUtc).toZonedDateTimeISO(timeZone).toPlainTime();
  return `${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`;
}

/** The calendar day ('YYYY-MM-DD') a UTC instant falls on in the given timezone. */
export function dateOnlyInTimeZone(isoUtc: string, timeZone: string): string {
  return Temporal.Instant.from(isoUtc).toZonedDateTimeISO(timeZone).toPlainDate().toString();
}

/**
 * Groups records (already sorted date DESC) into calendar days of the given
 * timezone, preserving order. Used by the care diary.
 */
export function groupRecordsByDay<T extends { date: string }>(
  records: T[],
  timeZone: string,
): { day: string; records: T[] }[] {
  const groups: { day: string; records: T[] }[] = [];
  for (const record of records) {
    const day = dateOnlyInTimeZone(record.date, timeZone);
    const last = groups[groups.length - 1];
    if (last && last.day === day) {
      last.records.push(record);
    } else {
      groups.push({ day, records: [record] });
    }
  }
  return groups;
}
