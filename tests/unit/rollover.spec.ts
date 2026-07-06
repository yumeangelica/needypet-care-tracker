import { describe, expect, it } from 'vitest';
import type { RolloverNeed } from '../../shared/utils/rollover';
import { computeRollover } from '../../shared/utils/rollover';

const TODAY = '2026-07-05';
const YESTERDAY = '2026-07-04';
const LAST_WEEK = '2026-06-28';

let counter = 0;
function need(overrides: Partial<RolloverNeed>): RolloverNeed {
  counter += 1;
  return {
    id: `need-${counter}`,
    dateFor: YESTERDAY,
    category: 'Evening walk',
    description: 'Around the park.',
    archived: false,
    isActive: true,
    duration: { value: 30, unit: 'minutes' },
    ...overrides,
  };
}

describe('computeRollover', () => {
  it('archives every open past-day need, paused ones included', () => {
    const active = need({});
    const paused = need({ category: 'Playtime', isActive: false });
    const plan = computeRollover([active, paused], TODAY);
    expect(plan.archiveIds).toEqual([active.id, paused.id]);
  });

  it('creates today-copies only for active templates', () => {
    const active = need({});
    const paused = need({ category: 'Playtime', isActive: false });
    const plan = computeRollover([active, paused], TODAY);
    expect(plan.createForToday).toEqual([
      {
        category: 'Evening walk',
        description: 'Around the park.',
        duration: { value: 30, unit: 'minutes' },
        quantity: undefined,
      },
    ]);
  });

  it('rolls a completed past need into a fresh open copy', () => {
    const completedYesterday = { ...need({}), completed: true } as RolloverNeed;
    const plan = computeRollover([completedYesterday], TODAY);
    expect(plan.archiveIds).toHaveLength(1);
    expect(plan.createForToday).toHaveLength(1);
  });

  it('de-duplicates identical templates across several missed days', () => {
    const older = need({ dateFor: LAST_WEEK });
    const newer = need({ dateFor: YESTERDAY });
    const plan = computeRollover([older, newer], TODAY);
    expect(plan.archiveIds).toEqual([older.id, newer.id]);
    expect(plan.createForToday).toHaveLength(1);
  });

  it('skips a template that already has a live copy today', () => {
    const yesterdays = need({});
    const todays = need({ dateFor: TODAY });
    const plan = computeRollover([yesterdays, todays], TODAY);
    expect(plan.archiveIds).toEqual([yesterdays.id]);
    expect(plan.createForToday).toHaveLength(0);
  });

  it('still copies when today only has a PAUSED need with the same template', () => {
    const yesterdays = need({});
    const todaysPaused = need({ dateFor: TODAY, isActive: false });
    const plan = computeRollover([yesterdays, todaysPaused], TODAY);
    expect(plan.createForToday).toHaveLength(1);
  });

  it('treats different measurements as different templates', () => {
    const shortWalk = need({});
    const longWalk = need({ duration: { value: 60, unit: 'minutes' } });
    const plan = computeRollover([shortWalk, longWalk], TODAY);
    expect(plan.createForToday).toHaveLength(2);
  });

  it('returns an empty plan when nothing is in the past', () => {
    const todays = need({ dateFor: TODAY });
    const future = need({ dateFor: '2026-07-06' });
    const plan = computeRollover([todays, future], TODAY);
    expect(plan.archiveIds).toHaveLength(0);
    expect(plan.createForToday).toHaveLength(0);
  });

  it('is idempotent: applying the plan yields an empty follow-up plan', () => {
    const yesterdays = need({});
    const first = computeRollover([yesterdays], TODAY);
    const afterApply: RolloverNeed[] = [
      { ...yesterdays, archived: true, isActive: false },
      ...first.createForToday.map((template, index) => ({
        ...template,
        id: `rolled-${index}`,
        dateFor: TODAY,
        archived: false,
        isActive: true,
      })),
    ];
    const second = computeRollover(afterApply, TODAY);
    expect(second.archiveIds).toHaveLength(0);
    expect(second.createForToday).toHaveLength(0);
  });
});
