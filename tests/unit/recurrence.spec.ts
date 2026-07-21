import { describe, expect, it } from 'vitest';
import { formatWeekdaysCsv, isScheduleDueOn, parseWeekdaysCsv } from '../../shared/utils/recurrence';

describe('isScheduleDueOn', () => {
  it('daily is due every day from the anchor on', () => {
    const rule = { recurrence: { type: 'daily' as const }, anchorDate: '2026-07-01' };
    expect(isScheduleDueOn(rule, '2026-07-01')).toBe(true);
    expect(isScheduleDueOn(rule, '2026-07-02')).toBe(true);
    expect(isScheduleDueOn(rule, '2026-06-30')).toBe(false); // before anchor
  });

  it('interval is due on anchor + N + 2N…, fixed anchor', () => {
    const rule = {
      recurrence: { type: 'interval' as const, intervalDays: 2 },
      anchorDate: '2026-07-01',
    };
    expect(isScheduleDueOn(rule, '2026-07-01')).toBe(true);
    expect(isScheduleDueOn(rule, '2026-07-02')).toBe(false);
    expect(isScheduleDueOn(rule, '2026-07-03')).toBe(true);
    expect(isScheduleDueOn(rule, '2026-07-05')).toBe(true);
    // A missed due day (07-03 never materialized) does not shift the rhythm.
    expect(isScheduleDueOn(rule, '2026-07-04')).toBe(false);
  });

  it('interval spans month boundaries through real calendar math', () => {
    const rule = {
      recurrence: { type: 'interval' as const, intervalDays: 7 },
      anchorDate: '2026-06-28',
    };
    expect(isScheduleDueOn(rule, '2026-07-05')).toBe(true);
    expect(isScheduleDueOn(rule, '2026-07-12')).toBe(true);
    expect(isScheduleDueOn(rule, '2026-07-11')).toBe(false);
  });

  it('weekly is due on the chosen ISO weekdays only', () => {
    const rule = {
      recurrence: { type: 'weekly' as const, weekdays: [1, 4] }, // Mon, Thu
      anchorDate: '2026-07-01',
    };
    expect(isScheduleDueOn(rule, '2026-07-06')).toBe(true); // Monday
    expect(isScheduleDueOn(rule, '2026-07-09')).toBe(true); // Thursday
    expect(isScheduleDueOn(rule, '2026-07-05')).toBe(false); // Sunday
    expect(isScheduleDueOn(rule, '2026-07-07')).toBe(false); // Tuesday
  });

  it('weekly never fires before the anchor', () => {
    const rule = {
      recurrence: { type: 'weekly' as const, weekdays: [1] },
      anchorDate: '2026-07-08',
    };
    expect(isScheduleDueOn(rule, '2026-07-06')).toBe(false); // Monday, but pre-anchor
    expect(isScheduleDueOn(rule, '2026-07-13')).toBe(true); // next Monday
  });
});

describe('weekdays CSV', () => {
  it('round-trips sorted unique weekday numbers', () => {
    expect(formatWeekdaysCsv([4, 1, 4])).toBe('1,4');
    expect(parseWeekdaysCsv('1,4')).toEqual([1, 4]);
  });

  it('parses unsorted and padded input', () => {
    expect(parseWeekdaysCsv(' 7 , 1 ,3')).toEqual([1, 3, 7]);
  });

  it('rejects values that hold no valid weekday', () => {
    expect(parseWeekdaysCsv('')).toBeNull();
    expect(parseWeekdaysCsv('0,8')).toBeNull();
    expect(parseWeekdaysCsv('nope')).toBeNull();
  });

  it('drops invalid entries but keeps valid ones', () => {
    expect(parseWeekdaysCsv('1,9,4')).toEqual([1, 4]);
  });
});
