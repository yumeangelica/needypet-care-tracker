/**
 * Instant (UTC timestamp) <-> timezone helpers for care records. Date-only
 * helpers live in date.ts; these deal with time-of-day, always through Intl
 * so the browser's local timezone never leaks in.
 */

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getPartsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = partsFormatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    partsFormatterCache.set(timeZone, formatter);
  }
  return formatter;
}

/** Offset of `timeZone` from UTC at the given instant, in milliseconds. */
function tzOffsetMs(timeZone: string, utc: Date): number {
  const parts = getPartsFormatter(timeZone).formatToParts(utc);
  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return asUtc - utc.getTime();
}

/**
 * Converts a wall-clock moment ('YYYY-MM-DD' + 'HH:mm' in an IANA timezone)
 * to a UTC ISO timestamp without a date library.
 *
 * DST edges resolve deterministically: an ambiguous fall-back time maps to
 * one of its two instants, and a nonexistent spring-forward time shifts by
 * the gap. Callers that must stay inside a calendar day should round-trip
 * the result through todayInTimeZone and compare.
 */
export function zonedDateTimeToUtcIso(dateOnly: string, timeOfDay: string, timeZone: string): string {
  const [year, month, day] = dateOnly.split('-').map(Number);
  const [hour, minute] = timeOfDay.split(':').map(Number);
  const guess = Date.UTC(year!, month! - 1, day!, hour!, minute!, 0);
  const firstOffset = tzOffsetMs(timeZone, new Date(guess));
  let utcMs = guess - firstOffset;
  const secondOffset = tzOffsetMs(timeZone, new Date(utcMs));
  if (secondOffset !== firstOffset) {
    utcMs = guess - secondOffset;
  }
  return new Date(utcMs).toISOString();
}

/** 'HH:mm' wall-clock time of a UTC instant in the given timezone. */
export function formatTimeInTimeZone(isoUtc: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(isoUtc));
}

/** The calendar day ('YYYY-MM-DD') a UTC instant falls on in the given timezone. */
export function dateOnlyInTimeZone(isoUtc: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(isoUtc));
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
