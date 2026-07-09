/**
 * Date-only + timezone helpers.
 *
 * Domain rules these enforce:
 * - Date-only values are `YYYY-MM-DD` strings and are compared as strings.
 *   Never round-trip them through a local timezone.
 * - "Today" is always computed for an explicit IANA timezone (the pet
 *   owner's for needs/rollover, the acting user's for audit stamps).
 *
 * Computation runs on Temporal (via #shared/utils/temporal); the values these
 * accept and return stay strings so the DB, JSON and zod boundaries are untouched.
 */

import { Temporal } from './temporal';

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True when `value` is a real calendar date in YYYY-MM-DD form (rejects 2026-02-30). */
export function isValidDateOnly(value: string): boolean {
  // The regex rejects looser forms Temporal would accept (e.g. 2026-1-1);
  // `overflow: 'reject'` then rejects impossible dates like 2026-02-30.
  if (!DATE_ONLY_RE.test(value)) {
    return false;
  }
  try {
    Temporal.PlainDate.from(value, { overflow: 'reject' });
    return true;
  } catch {
    return false;
  }
}

let supportedTimeZones: Set<string> | null = null;

/** Membership check against the runtime's IANA timezone list (cached). */
export function isSupportedTimeZone(timezone: string): boolean {
  if (!supportedTimeZones) {
    supportedTimeZones = new Set(Intl.supportedValuesOf('timeZone'));
  }
  return supportedTimeZones.has(timezone);
}

/** The current calendar day in the given IANA timezone as YYYY-MM-DD. */
export function todayInTimeZone(timezone: string, now: Temporal.Instant = Temporal.Now.instant()): string {
  if (!isSupportedTimeZone(timezone)) {
    throw new Error(`Invalid timezone: ${timezone}`);
  }
  return now.toZonedDateTimeISO(timezone).toPlainDate().toString();
}

/**
 * The current hour (0–23) in the given IANA timezone. Used by the daily digest
 * to gate sending on each user's own local clock (DST-correct via Temporal).
 */
export function hourInTimeZone(timezone: string, now: Temporal.Instant = Temporal.Now.instant()): number {
  if (!isSupportedTimeZone(timezone)) {
    throw new Error(`Invalid timezone: ${timezone}`);
  }
  return now.toZonedDateTimeISO(timezone).hour;
}

/** Lexicographic compare is chronological compare for YYYY-MM-DD strings. */
export function compareDateOnly(a: string, b: string): -1 | 0 | 1 {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

/** Add (or subtract) whole days to a date-only string. */
export function addDaysDateOnly(value: string, days: number): string {
  return Temporal.PlainDate.from(value).add({ days }).toString();
}

/** True when `value` is after today in the given timezone (birthday rule). */
export function isFutureDateOnly(value: string, timezone: string): boolean {
  return compareDateOnly(value, todayInTimeZone(timezone)) > 0;
}

/** The Monday of the week the given date-only value falls in. */
export function weekStartOf(value: string): string {
  const date = Temporal.PlainDate.from(value);
  // Temporal dayOfWeek is 1 = Monday ... 7 = Sunday.
  return date.subtract({ days: date.dayOfWeek - 1 }).toString();
}

/** True when `value` is a full UTC ISO-8601 timestamp (the storage format
 * for care record dates and created/updated stamps). */
export function isValidIsoTimestamp(value: string): boolean {
  // The regex pins the exact stored shape (Temporal would also accept offsets
  // like +02:00, which are not valid here); Temporal then rejects bad instants.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(value)) {
    return false;
  }
  try {
    Temporal.Instant.from(value);
    return true;
  } catch {
    return false;
  }
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function diffDaysDateOnly(from: string, to: string): number {
  return Temporal.PlainDate.from(from)
    .until(Temporal.PlainDate.from(to), { largestUnit: 'day' })
    .days;
}
