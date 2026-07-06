import { describe, expect, it } from 'vitest';
import { weekStartOf } from '../../shared/utils/date';
import { zonedDateTimeToUtcIso } from '../../shared/utils/datetime';
import { computeStreak, computeWeekStats } from '../../shared/utils/stats';
import type { WeekStatsRecord } from '../../shared/utils/stats';

const TZ = 'Europe/Helsinki';
const WEEK_START = '2026-06-29'; // Monday

function minutes(date: string, category = 'Walk', value = 30): WeekStatsRecord {
  return { date, category, duration: { value, unit: 'minutes' } };
}

function ml(date: string, category = 'Water', value = 100): WeekStatsRecord {
  return { date, category, quantity: { value, unit: 'ml' } };
}

describe('weekStartOf', () => {
  it('returns the Monday for every weekday', () => {
    // 2026-06-29 is a Monday.
    for (let offset = 0; offset < 7; offset++) {
      const day = `2026-07-0${offset + 1}`; // Jul 1 (Wed) .. Jul 7 (Tue)
      const expected = offset <= 4 ? '2026-06-29' : '2026-07-06';
      expect(weekStartOf(day)).toBe(expected);
    }
  });

  it('crosses month and year boundaries', () => {
    expect(weekStartOf('2026-03-01')).toBe('2026-02-23'); // Sunday -> previous Monday in Feb
    expect(weekStartOf('2026-01-01')).toBe('2025-12-29'); // Thursday -> Monday in previous year
    expect(weekStartOf('2026-06-29')).toBe('2026-06-29'); // Monday maps to itself
  });
});

describe('computeWeekStats', () => {
  it('buckets late-evening and early-morning records on the owner-local day', () => {
    // 23:30 Helsinki on Tuesday = 20:30 UTC Tuesday; 00:30 Wednesday = 21:30 UTC Tuesday.
    const lateTuesday = zonedDateTimeToUtcIso('2026-06-30', '23:30', TZ);
    const earlyWednesday = zonedDateTimeToUtcIso('2026-07-01', '00:30', TZ);
    const stats = computeWeekStats([minutes(lateTuesday), minutes(earlyWednesday)], WEEK_START, TZ);
    expect(stats.days[1]).toEqual({ day: '2026-06-30', recordCount: 1 });
    expect(stats.days[2]).toEqual({ day: '2026-07-01', recordCount: 1 });
    expect(stats.totalRecords).toBe(2);
  });

  it('always yields 7 days, DST transition week included', () => {
    // Helsinki DST starts 2026-03-29.
    const dstWeek = weekStartOf('2026-03-29');
    const stats = computeWeekStats([], dstWeek, TZ);
    expect(stats.days).toHaveLength(7);
    expect(stats.days[0]!.day).toBe(dstWeek);
    expect(stats.days[6]!.day).toBe('2026-03-29');
  });

  it('never mixes units: same category with min and ml stays two rows', () => {
    const monday = zonedDateTimeToUtcIso('2026-06-29', '10:00', TZ);
    const stats = computeWeekStats(
      [minutes(monday, 'Care', 30), ml(monday, 'Care', 200)],
      WEEK_START,
      TZ,
    );
    expect(stats.categories).toHaveLength(2);
    const units = stats.categories.map((c) => c.unit).sort();
    expect(units).toEqual(['min', 'ml']);
  });

  it('sums totals and perDay per category, sorted by total desc', () => {
    const mon = zonedDateTimeToUtcIso('2026-06-29', '08:00', TZ);
    const tue = zonedDateTimeToUtcIso('2026-06-30', '08:00', TZ);
    const stats = computeWeekStats(
      [ml(mon, 'Water', 100), ml(tue, 'Water', 200), minutes(mon, 'Walk', 15)],
      WEEK_START,
      TZ,
    );
    expect(stats.categories[0]).toMatchObject({ category: 'Water', unit: 'ml', total: 300 });
    expect(stats.categories[0]!.perDay[0]).toBe(100);
    expect(stats.categories[0]!.perDay[1]).toBe(200);
    expect(stats.categories[1]).toMatchObject({ category: 'Walk', unit: 'min', total: 15 });
  });

  it('ignores records outside the week window', () => {
    const before = zonedDateTimeToUtcIso('2026-06-28', '12:00', TZ);
    const after = zonedDateTimeToUtcIso('2026-07-06', '12:00', TZ);
    const stats = computeWeekStats([minutes(before), minutes(after)], WEEK_START, TZ);
    expect(stats.totalRecords).toBe(0);
  });
});

describe('computeStreak', () => {
  const TODAY = '2026-07-06';
  const at = (day: string) => zonedDateTimeToUtcIso(day, '12:00', TZ);

  it('counts consecutive days back from today', () => {
    const dates = [at('2026-07-06'), at('2026-07-05'), at('2026-07-04')];
    expect(computeStreak(dates, TZ, TODAY)).toBe(3);
  });

  it('an empty today does not break the streak', () => {
    const dates = [at('2026-07-05'), at('2026-07-04')];
    expect(computeStreak(dates, TZ, TODAY)).toBe(2);
  });

  it('a gap resets the streak', () => {
    const dates = [at('2026-07-06'), at('2026-07-04'), at('2026-07-03')];
    expect(computeStreak(dates, TZ, TODAY)).toBe(1);
  });

  it('no records means zero', () => {
    expect(computeStreak([], TZ, TODAY)).toBe(0);
  });

  it('multiple records on one day count once', () => {
    const dates = [at('2026-07-06'), zonedDateTimeToUtcIso('2026-07-06', '18:00', TZ)];
    expect(computeStreak(dates, TZ, TODAY)).toBe(1);
  });
});
