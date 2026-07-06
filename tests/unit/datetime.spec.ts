import { describe, expect, it } from 'vitest';
import { todayInTimeZone } from '../../shared/utils/date';
import {
  dateOnlyInTimeZone,
  formatTimeInTimeZone,
  groupRecordsByDay,
  zonedDateTimeToUtcIso,
} from '../../shared/utils/datetime';

describe('zonedDateTimeToUtcIso', () => {
  it('passes UTC through unchanged', () => {
    expect(zonedDateTimeToUtcIso('2026-07-06', '14:30', 'UTC')).toBe('2026-07-06T14:30:00.000Z');
  });

  it('converts Helsinki summer time (UTC+3)', () => {
    expect(zonedDateTimeToUtcIso('2026-07-06', '14:30', 'Europe/Helsinki')).toBe(
      '2026-07-06T11:30:00.000Z',
    );
  });

  it('converts Helsinki winter time (UTC+2)', () => {
    expect(zonedDateTimeToUtcIso('2026-01-15', '14:30', 'Europe/Helsinki')).toBe(
      '2026-01-15T12:30:00.000Z',
    );
  });

  it('handles a half-hour offset (Asia/Kolkata, UTC+5:30)', () => {
    expect(zonedDateTimeToUtcIso('2026-07-06', '09:15', 'Asia/Kolkata')).toBe(
      '2026-07-06T03:45:00.000Z',
    );
  });

  it('converts New York daylight time (UTC-4)', () => {
    expect(zonedDateTimeToUtcIso('2026-07-06', '08:00', 'America/New_York')).toBe(
      '2026-07-06T12:00:00.000Z',
    );
  });

  it('converts midnight at the start of the day', () => {
    expect(zonedDateTimeToUtcIso('2026-07-06', '00:00', 'Europe/Helsinki')).toBe(
      '2026-07-05T21:00:00.000Z',
    );
  });

  it('resolves a nonexistent spring-forward time to a real instant on the same day', () => {
    // Helsinki 2026-03-29: clocks jump from 03:00 to 04:00 (03:30 never happens).
    const iso = zonedDateTimeToUtcIso('2026-03-29', '03:30', 'Europe/Helsinki');
    expect(Number.isNaN(Date.parse(iso))).toBe(false);
    expect(todayInTimeZone('Europe/Helsinki', new Date(iso))).toBe('2026-03-29');
  });

  it('resolves an ambiguous fall-back time to one of its two instants', () => {
    // Helsinki 2026-10-25: 03:30 happens twice (UTC+3 then UTC+2).
    const iso = zonedDateTimeToUtcIso('2026-10-25', '03:30', 'Europe/Helsinki');
    expect(['2026-10-25T00:30:00.000Z', '2026-10-25T01:30:00.000Z']).toContain(iso);
  });

  it('round-trips through todayInTimeZone for an ordinary time', () => {
    const iso = zonedDateTimeToUtcIso('2026-07-06', '23:45', 'Europe/Helsinki');
    expect(todayInTimeZone('Europe/Helsinki', new Date(iso))).toBe('2026-07-06');
  });
});

describe('formatTimeInTimeZone', () => {
  it('formats a UTC instant as the owner wall clock', () => {
    expect(formatTimeInTimeZone('2026-07-06T11:30:00.000Z', 'Europe/Helsinki')).toBe('14:30');
  });

  it('formats midnight as 00:00, not 24:00', () => {
    expect(formatTimeInTimeZone('2026-07-05T21:00:00.000Z', 'Europe/Helsinki')).toBe('00:00');
  });

  it('round-trips with zonedDateTimeToUtcIso', () => {
    const iso = zonedDateTimeToUtcIso('2026-02-01', '07:05', 'America/New_York');
    expect(formatTimeInTimeZone(iso, 'America/New_York')).toBe('07:05');
  });
});

describe('dateOnlyInTimeZone', () => {
  it('returns the UTC day for UTC', () => {
    expect(dateOnlyInTimeZone('2026-07-06T23:30:00.000Z', 'UTC')).toBe('2026-07-06');
  });

  it('crosses into the next day in an eastern timezone', () => {
    // 23:30Z is already 02:30 on the 7th in Helsinki (UTC+3).
    expect(dateOnlyInTimeZone('2026-07-06T23:30:00.000Z', 'Europe/Helsinki')).toBe('2026-07-07');
  });

  it('stays on the previous day in a western timezone', () => {
    expect(dateOnlyInTimeZone('2026-07-06T02:30:00.000Z', 'America/New_York')).toBe('2026-07-05');
  });
});

describe('groupRecordsByDay', () => {
  const record = (date: string) => ({ date });

  it('groups consecutive records on the same owner-timezone day', () => {
    const groups = groupRecordsByDay(
      [
        record('2026-07-06T18:00:00.000Z'),
        record('2026-07-06T05:00:00.000Z'),
        record('2026-07-05T12:00:00.000Z'),
      ],
      'Europe/Helsinki',
    );
    expect(groups.map((group) => group.day)).toEqual(['2026-07-06', '2026-07-05']);
    expect(groups[0]!.records).toHaveLength(2);
    expect(groups[1]!.records).toHaveLength(1);
  });

  it('splits on the timezone day boundary, not the UTC one', () => {
    // 23:30Z on the 6th is the 7th in Helsinki; 19:00Z stays on the 6th.
    const groups = groupRecordsByDay(
      [record('2026-07-06T23:30:00.000Z'), record('2026-07-06T19:00:00.000Z')],
      'Europe/Helsinki',
    );
    expect(groups.map((group) => group.day)).toEqual(['2026-07-07', '2026-07-06']);
  });

  it('returns an empty list for no records', () => {
    expect(groupRecordsByDay([], 'UTC')).toEqual([]);
  });
});
