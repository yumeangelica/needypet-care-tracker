/**
 * Date-only + timezone helpers.
 *
 * Domain rules these enforce:
 * - Date-only values are `YYYY-MM-DD` strings and are compared as strings.
 *   Never round-trip them through `new Date(...)` in a local timezone.
 * - "Today" is always computed for an explicit IANA timezone (the pet
 *   owner's for needs/rollover, the acting user's for audit stamps).
 */

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True when `value` is a real calendar date in YYYY-MM-DD form (rejects 2026-02-30). */
export function isValidDateOnly(value: string): boolean {
  if (!DATE_ONLY_RE.test(value)) {
    return false;
  }
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  // Date.UTC normalizes overflow (Feb 30 -> Mar 2); a round-trip mismatch means invalid.
  const utc = new Date(Date.UTC(year, month - 1, day));
  return (
    utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day
  );
}

let supportedTimeZones: Set<string> | null = null;

/** Membership check against the runtime's IANA timezone list (cached). */
export function isSupportedTimeZone(timezone: string): boolean {
  if (!supportedTimeZones) {
    supportedTimeZones = new Set(Intl.supportedValuesOf('timeZone'));
  }
  return supportedTimeZones.has(timezone);
}

/**
 * The current calendar day in the given IANA timezone as YYYY-MM-DD.
 * `en-CA` formats dates as YYYY-MM-DD natively.
 */
export function todayInTimeZone(timezone: string, now: Date = new Date()): string {
  if (!isSupportedTimeZone(timezone)) {
    throw new Error(`Invalid timezone: ${timezone}`);
  }
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * The current hour (0–23) in the given IANA timezone. Used by the daily digest
 * to gate sending on each user's own local clock (DST-correct via Intl).
 */
export function hourInTimeZone(timezone: string, now: Date = new Date()): number {
  if (!isSupportedTimeZone(timezone)) {
    throw new Error(`Invalid timezone: ${timezone}`);
  }
  const hour = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    hour12: false,
  }).format(now);
  // Some runtimes format midnight as '24'; normalize it to 0.
  return Number(hour === '24' ? '00' : hour);
}

/** Lexicographic compare is chronological compare for YYYY-MM-DD strings. */
export function compareDateOnly(a: string, b: string): -1 | 0 | 1 {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

/** Add (or subtract) whole days to a date-only string via UTC math. */
export function addDaysDateOnly(value: string, days: number): string {
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return utc.toISOString().slice(0, 10);
}

/** True when `value` is after today in the given timezone (birthday rule). */
export function isFutureDateOnly(value: string, timezone: string): boolean {
  return compareDateOnly(value, todayInTimeZone(timezone)) > 0;
}

/** The Monday of the week the given date-only value falls in. */
export function weekStartOf(value: string): string {
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0 = Sunday
  return addDaysDateOnly(value, -((dayOfWeek + 6) % 7));
}

/** True when `value` is a full UTC ISO-8601 timestamp (the storage format
 * for care record dates and created/updated stamps). */
export function isValidIsoTimestamp(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(value)) {
    return false;
  }
  return !Number.isNaN(Date.parse(value));
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function diffDaysDateOnly(from: string, to: string): number {
  const toUtc = (v: string) => {
    const [year, month, day] = v.split('-').map(Number) as [number, number, number];
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((toUtc(to) - toUtc(from)) / 86_400_000);
}
