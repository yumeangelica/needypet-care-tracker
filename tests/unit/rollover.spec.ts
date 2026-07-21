import { describe, expect, it } from 'vitest';
import { MAX_NEEDS_PER_DAY } from '../../shared/schemas/need';
import type { RolloverNeed, RolloverSchedule } from '../../shared/utils/rollover';
import { computeRollover } from '../../shared/utils/rollover';

const TODAY = '2026-07-05'; // a Sunday (ISO weekday 7)
const YESTERDAY = '2026-07-04';
const LAST_WEEK = '2026-06-28';

let counter = 0;

function need(overrides: Partial<RolloverNeed> = {}): RolloverNeed {
  counter += 1;
  return {
    id: `need-${counter}`,
    dateFor: YESTERDAY,
    scheduleId: null,
    archived: false,
    ...overrides,
  };
}

function schedule(overrides: Partial<RolloverSchedule> = {}): RolloverSchedule {
  counter += 1;
  return {
    id: `schedule-${counter}`,
    isActive: true,
    recurrence: { type: 'daily' },
    anchorDate: LAST_WEEK,
    createdAt: `2026-06-28T00:00:00.000Z`,
    ...overrides,
  };
}

describe('computeRollover', () => {
  it('archives every open past-day instance, one-offs included', () => {
    const scheduled = need({ scheduleId: 'schedule-x' });
    const oneOff = need();
    const plan = computeRollover([scheduled, oneOff], [], TODAY);
    expect(plan.archiveIds).toEqual([scheduled.id, oneOff.id]);
  });

  it('materializes one instance per due active schedule', () => {
    const daily = schedule();
    const plan = computeRollover([], [daily], TODAY);
    expect(plan.createForToday).toEqual([daily.id]);
  });

  it('never revives a one-off: archived without a copy', () => {
    const oneOff = need();
    const plan = computeRollover([oneOff], [], TODAY);
    expect(plan.archiveIds).toEqual([oneOff.id]);
    expect(plan.createForToday).toHaveLength(0);
  });

  it('skips a paused schedule but still archives its past instance', () => {
    const paused = schedule({ isActive: false });
    const pastInstance = need({ scheduleId: paused.id });
    const plan = computeRollover([pastInstance], [paused], TODAY);
    expect(plan.archiveIds).toEqual([pastInstance.id]);
    expect(plan.createForToday).toHaveLength(0);
  });

  it('skips a schedule that already has a live instance today (any state)', () => {
    const daily = schedule();
    const todays = need({ dateFor: TODAY, scheduleId: daily.id });
    const plan = computeRollover([todays], [daily], TODAY);
    expect(plan.createForToday).toHaveLength(0);
  });

  it('materializes an interval schedule only on its due days (fixed anchor)', () => {
    // Anchor 2026-06-28 + every 3 days -> due 06-28, 07-01, 07-04, 07-07…
    const every3 = schedule({ recurrence: { type: 'interval', intervalDays: 3 }, anchorDate: LAST_WEEK });
    const notDue = computeRollover([], [every3], TODAY); // 07-05: 7 days from anchor
    expect(notDue.createForToday).toHaveLength(0);
    const due = computeRollover([], [every3], '2026-07-07'); // 9 days from anchor
    expect(due.createForToday).toEqual([every3.id]);
  });

  it('does not backfill a missed interval day and keeps the rhythm', () => {
    // Due 07-04 was missed (nobody opened the app); rolling on 07-05 creates
    // nothing for the interval rule, and the next due day stays 07-07.
    const every3 = schedule({ recurrence: { type: 'interval', intervalDays: 3 }, anchorDate: LAST_WEEK });
    const missed = need({ scheduleId: every3.id, dateFor: '2026-07-01' });
    const plan = computeRollover([missed], [every3], TODAY);
    expect(plan.archiveIds).toEqual([missed.id]);
    expect(plan.createForToday).toHaveLength(0);
  });

  it('materializes a weekly schedule only on its weekdays', () => {
    const monThu = schedule({ recurrence: { type: 'weekly', weekdays: [1, 4] }, anchorDate: LAST_WEEK });
    expect(computeRollover([], [monThu], TODAY).createForToday).toHaveLength(0); // Sunday
    expect(computeRollover([], [monThu], '2026-07-06').createForToday).toEqual([monThu.id]); // Monday
    expect(computeRollover([], [monThu], '2026-07-09').createForToday).toEqual([monThu.id]); // Thursday
  });

  it('never schedules before the anchor date', () => {
    const future = schedule({ anchorDate: '2026-07-06' });
    expect(computeRollover([], [future], TODAY).createForToday).toHaveLength(0);
    expect(computeRollover([], [future], '2026-07-06').createForToday).toEqual([future.id]);
  });

  it('caps today at MAX_NEEDS_PER_DAY, oldest schedules first', () => {
    const schedules = Array.from({ length: MAX_NEEDS_PER_DAY + 3 }, (_, index) =>
      schedule({ createdAt: `2026-06-28T00:00:${String(index).padStart(2, '0')}.000Z` }),
    );
    const plan = computeRollover([], schedules, TODAY);
    expect(plan.createForToday).toHaveLength(MAX_NEEDS_PER_DAY);
    expect(plan.createForToday).toEqual(schedules.slice(0, MAX_NEEDS_PER_DAY).map((rule) => rule.id));
  });

  it('counts existing live instances today against the cap', () => {
    const existing = Array.from({ length: MAX_NEEDS_PER_DAY - 1 }, () => need({ dateFor: TODAY }));
    const first = schedule({ createdAt: '2026-06-28T00:00:00.000Z' });
    const second = schedule({ createdAt: '2026-06-28T00:00:01.000Z' });
    const plan = computeRollover(existing, [first, second], TODAY);
    expect(plan.createForToday).toEqual([first.id]);
  });

  it('returns an empty plan when nothing is past and nothing is due', () => {
    const todays = need({ dateFor: TODAY });
    const future = need({ dateFor: '2026-07-06' });
    const monThu = schedule({ recurrence: { type: 'weekly', weekdays: [1, 4] } });
    const plan = computeRollover([todays, future], [monThu], TODAY); // Sunday
    expect(plan.archiveIds).toHaveLength(0);
    expect(plan.createForToday).toHaveLength(0);
  });

  it('is idempotent: applying the plan yields an empty follow-up plan', () => {
    const daily = schedule();
    const pastInstance = need({ scheduleId: daily.id });
    const first = computeRollover([pastInstance], [daily], TODAY);
    const afterApply: RolloverNeed[] = [
      { ...pastInstance, archived: true },
      ...first.createForToday.map((scheduleId, index) => ({
        id: `rolled-${index}`,
        dateFor: TODAY,
        scheduleId,
        archived: false,
      })),
    ];
    const second = computeRollover(afterApply, [daily], TODAY);
    expect(second.archiveIds).toHaveLength(0);
    expect(second.createForToday).toHaveLength(0);
  });
});
