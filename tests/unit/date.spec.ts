import { describe, expect, it } from 'vitest';
import {
  addDaysDateOnly,
  compareDateOnly,
  diffDaysDateOnly,
  hourInTimeZone,
  isFutureDateOnly,
  isSupportedTimeZone,
  isValidDateOnly,
  todayInTimeZone,
} from '../../shared/utils/date';

describe('isValidDateOnly', () => {
  it('accepts real calendar dates', () => {
    expect(isValidDateOnly('2026-07-05')).toBe(true);
    expect(isValidDateOnly('2024-02-29')).toBe(true); // leap day
    expect(isValidDateOnly('2026-01-01')).toBe(true);
    expect(isValidDateOnly('2026-12-31')).toBe(true);
  });

  it('rejects impossible calendar dates', () => {
    expect(isValidDateOnly('2026-02-30')).toBe(false);
    expect(isValidDateOnly('2023-02-29')).toBe(false); // not a leap year
    expect(isValidDateOnly('2026-13-01')).toBe(false);
    expect(isValidDateOnly('2026-00-10')).toBe(false);
    expect(isValidDateOnly('2026-04-31')).toBe(false);
  });

  it('rejects wrong formats', () => {
    expect(isValidDateOnly('2026-1-1')).toBe(false);
    expect(isValidDateOnly('26-01-01')).toBe(false);
    expect(isValidDateOnly('2026/01/01')).toBe(false);
    expect(isValidDateOnly('2026-07-05T00:00:00Z')).toBe(false);
    expect(isValidDateOnly('')).toBe(false);
  });
});

describe('todayInTimeZone', () => {
  // 11:00 UTC straddles the date line: UTC+14 is already tomorrow.
  const instant = new Date('2026-01-01T11:00:00Z');

  it('computes the local calendar day for extreme timezones', () => {
    expect(todayInTimeZone('Pacific/Kiritimati', instant)).toBe('2026-01-02'); // UTC+14
    expect(todayInTimeZone('Pacific/Midway', instant)).toBe('2026-01-01'); // UTC-11
    expect(todayInTimeZone('Europe/London', instant)).toBe('2026-01-01'); // UTC+0 in winter
  });

  it('handles days near UTC midnight', () => {
    const nearMidnight = new Date('2026-06-30T22:30:00Z');
    expect(todayInTimeZone('Europe/Helsinki', nearMidnight)).toBe('2026-07-01'); // UTC+3 in summer
    expect(todayInTimeZone('America/New_York', nearMidnight)).toBe('2026-06-30'); // UTC-4 in summer
  });

  it('throws on unsupported timezones', () => {
    expect(() => todayInTimeZone('Not/AZone')).toThrow('Invalid timezone');
  });
});

describe('hourInTimeZone', () => {
  // 11:00 UTC: local hour shifts by each zone's offset.
  const instant = new Date('2026-01-01T11:00:00Z');

  it('computes the local hour for offset timezones', () => {
    expect(hourInTimeZone('Europe/London', instant)).toBe(11); // UTC+0 in winter
    expect(hourInTimeZone('Europe/Helsinki', instant)).toBe(13); // UTC+2 in winter
    expect(hourInTimeZone('America/New_York', instant)).toBe(6); // UTC-5 in winter
    expect(hourInTimeZone('Pacific/Kiritimati', instant)).toBe(1); // UTC+14 -> next day 01:00
  });

  it('normalizes midnight to 0', () => {
    const midnightUtc = new Date('2026-01-01T00:00:00Z');
    expect(hourInTimeZone('Europe/London', midnightUtc)).toBe(0);
  });

  it('throws on unsupported timezones', () => {
    expect(() => hourInTimeZone('Not/AZone')).toThrow('Invalid timezone');
  });
});

describe('isSupportedTimeZone', () => {
  it('accepts IANA zones and rejects junk', () => {
    expect(isSupportedTimeZone('Europe/Helsinki')).toBe(true);
    expect(isSupportedTimeZone('Pacific/Kiritimati')).toBe(true);
    expect(isSupportedTimeZone('Mars/Olympus')).toBe(false);
    expect(isSupportedTimeZone('')).toBe(false);
  });
});

describe('compareDateOnly', () => {
  it('compares as strings, chronologically', () => {
    expect(compareDateOnly('2026-07-05', '2026-07-05')).toBe(0);
    expect(compareDateOnly('2026-07-04', '2026-07-05')).toBe(-1);
    expect(compareDateOnly('2026-07-06', '2026-07-05')).toBe(1);
    expect(compareDateOnly('2025-12-31', '2026-01-01')).toBe(-1);
  });
});

describe('addDaysDateOnly', () => {
  it('crosses month, year and leap boundaries', () => {
    expect(addDaysDateOnly('2026-02-28', 1)).toBe('2026-03-01'); // non-leap
    expect(addDaysDateOnly('2024-02-28', 1)).toBe('2024-02-29'); // leap
    expect(addDaysDateOnly('2025-12-31', 1)).toBe('2026-01-01');
    expect(addDaysDateOnly('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDaysDateOnly('2026-07-05', 0)).toBe('2026-07-05');
    expect(addDaysDateOnly('2026-07-05', 30)).toBe('2026-08-04');
  });
});

describe('diffDaysDateOnly', () => {
  it('counts whole days in either direction', () => {
    expect(diffDaysDateOnly('2026-07-01', '2026-07-05')).toBe(4);
    expect(diffDaysDateOnly('2026-07-05', '2026-07-01')).toBe(-4);
    expect(diffDaysDateOnly('2026-07-05', '2026-07-05')).toBe(0);
    expect(diffDaysDateOnly('2025-12-30', '2026-01-02')).toBe(3);
  });
});

describe('isFutureDateOnly', () => {
  it('flags dates after today in the given timezone', () => {
    const today = todayInTimeZone('Europe/Helsinki');
    expect(isFutureDateOnly(addDaysDateOnly(today, 1), 'Europe/Helsinki')).toBe(true);
    expect(isFutureDateOnly(today, 'Europe/Helsinki')).toBe(false);
    expect(isFutureDateOnly(addDaysDateOnly(today, -1), 'Europe/Helsinki')).toBe(false);
  });
});
