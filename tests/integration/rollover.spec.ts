import { beforeAll, describe, expect, it } from 'vitest';
import { addDaysDateOnly, isoWeekdayOf, todayInTimeZone } from '../../shared/utils/date';
import {
  addCaretaker,
  api,
  createDailyNeed,
  createNeed,
  createPet,
  createSchedule,
  createUser,
  createUserWithSession,
  getNeedRows,
  getPetRow,
  getScheduleRows,
} from './helpers';

/**
 * Lazy rollover through the real endpoints. Owners live in extreme-offset
 * Pacific timezones so "today" is stable relative to the run and the
 * backward/forward timezone moves are unambiguous:
 * Kiritimati (UTC+14) is always at least a day ahead of Pago Pago (UTC-11).
 *
 * Daily fixtures use createDailyNeed (rule + instance) — the shape the 0005
 * migration leaves every legacy live need in (ADR-0015).
 */
const AHEAD_TZ = 'Pacific/Kiritimati';
const BEHIND_TZ = 'Pacific/Pago_Pago';

describe('lazy rollover', () => {
  describe('rolling a stale pet on read', () => {
    let owner: Awaited<ReturnType<typeof createUserWithSession>>;
    let today: string;
    let yesterday: string;
    let pet: { id: string };

    beforeAll(async () => {
      owner = await createUserWithSession({ timezone: AHEAD_TZ });
      today = todayInTimeZone(AHEAD_TZ);
      yesterday = addDaysDateOnly(today, -1);
      pet = await createPet(owner.id, { lastRolledNeedDate: yesterday });
      await createDailyNeed(pet.id, { dateFor: yesterday, category: 'Fresh water', quantity: { value: 200, unit: 'ml' } });
      await createDailyNeed(pet.id, {
        dateFor: yesterday,
        category: 'Evening walk',
        duration: { value: 30, unit: 'minutes' },
        completed: true,
      });
      // Paused rule + its paused instance: stays put, does not materialize.
      await createDailyNeed(pet.id, {
        dateFor: yesterday,
        category: 'Playtime',
        quantity: { value: 100, unit: 'ml' },
        isActive: false,
      });
      // One-off (no rule): archives and never returns.
      await createNeed(pet.id, {
        dateFor: yesterday,
        category: 'Vet visit',
        duration: { value: 45, unit: 'minutes' },
      });
    });

    it('archives past needs, materializes due rules and stamps the guard', async () => {
      const res = await api('/api/pets', { cookie: owner.cookie });
      expect(res.status).toBe(200);
      const listed = res.body.find((item: any) => item.id === pet.id);
      expect(listed.lastRolledNeedDate).toBe(today);
      // Both active rules materialized; the paused rule and one-off did not.
      expect(listed.todayTaskCount).toBe(2);

      const rows = await getNeedRows(pet.id);
      const pastRows = rows.filter((row) => row.dateFor === yesterday);
      expect(pastRows).toHaveLength(4);
      for (const row of pastRows) {
        expect(row.archived).toBe(true);
      }

      const todayRows = rows.filter((row) => row.dateFor === today);
      expect(todayRows.map((row) => row.category).sort()).toEqual(['Evening walk', 'Fresh water']);
      for (const row of todayRows) {
        // The completed rule materializes too - the copy starts fresh.
        expect(row.completed).toBe(false);
        expect(row.archived).toBe(false);
        expect(row.isActive).toBe(true);
        expect(row.scheduleId).not.toBeNull();
      }

      expect((await getPetRow(pet.id))?.lastRolledNeedDate).toBe(today);
    });

    it('is idempotent on the next read', async () => {
      const before = (await getNeedRows(pet.id)).length;
      const res = await api(`/api/pets/${pet.id}`, { cookie: owner.cookie });
      expect(res.status).toBe(200);
      expect((await getNeedRows(pet.id)).length).toBe(before);
    });

    it('skips a rule that already has a live instance today', async () => {
      const dedupPet = await createPet(owner.id, { lastRolledNeedDate: yesterday });
      const planted = await createDailyNeed(dedupPet.id, { dateFor: yesterday, category: 'Fresh water', quantity: { value: 200, unit: 'ml' } });
      // The same rule already has a live instance on today, so the rollover
      // must not duplicate it.
      await createNeed(dedupPet.id, {
        dateFor: today,
        category: 'Fresh water',
        quantity: { value: 200, unit: 'ml' },
        scheduleId: planted.scheduleId,
      });

      const res = await api(`/api/pets/${dedupPet.id}`, { cookie: owner.cookie });
      expect(res.status).toBe(200);

      const rows = await getNeedRows(dedupPet.id);
      expect(rows.filter((row) => row.dateFor === today)).toHaveLength(1);
      expect(rows.filter((row) => row.dateFor === yesterday && row.archived)).toHaveLength(1);
    });
  });

  describe('recurrence rules (ADR-0015)', () => {
    let owner: Awaited<ReturnType<typeof createUserWithSession>>;
    let today: string;

    beforeAll(async () => {
      owner = await createUserWithSession({ timezone: AHEAD_TZ });
      today = todayInTimeZone(AHEAD_TZ);
    });

    it('materializes an every-2-days rule only on its due day (fixed anchor)', async () => {
      const duePet = await createPet(owner.id, { lastRolledNeedDate: addDaysDateOnly(today, -2) });
      // Anchor today-4, every 2 days -> due today; last instance was today-2.
      const dueRule = await createSchedule(duePet.id, {
        anchorDate: addDaysDateOnly(today, -4),
        category: 'Second-day feed',
        recurrenceType: 'interval',
        intervalDays: 2,
      });
      await createNeed(duePet.id, { dateFor: addDaysDateOnly(today, -2), category: 'Second-day feed', scheduleId: dueRule.id });

      const notDuePet = await createPet(owner.id, { lastRolledNeedDate: addDaysDateOnly(today, -1) });
      // Anchor today-3, every 2 days -> due yesterday (missed), NOT today.
      const notDueRule = await createSchedule(notDuePet.id, {
        anchorDate: addDaysDateOnly(today, -3),
        category: 'Second-day feed',
        recurrenceType: 'interval',
        intervalDays: 2,
      });
      await createNeed(notDuePet.id, { dateFor: addDaysDateOnly(today, -3), category: 'Second-day feed', scheduleId: notDueRule.id });

      expect((await api(`/api/pets/${duePet.id}`, { cookie: owner.cookie })).status).toBe(200);
      expect((await api(`/api/pets/${notDuePet.id}`, { cookie: owner.cookie })).status).toBe(200);

      const dueRows = await getNeedRows(duePet.id);
      expect(dueRows.filter((row) => row.dateFor === today && !row.archived)).toHaveLength(1);

      // The missed day is not backfilled and today gets nothing: the rhythm
      // waits for tomorrow (anchor+4).
      const notDueRows = await getNeedRows(notDuePet.id);
      expect(notDueRows.filter((row) => row.dateFor === today)).toHaveLength(0);
      expect(notDueRows.every((row) => row.archived)).toBe(true);
    });

    it('materializes a weekly rule only when today is a chosen weekday', async () => {
      const pet = await createPet(owner.id, { lastRolledNeedDate: addDaysDateOnly(today, -7) });
      const todayWd = isoWeekdayOf(today);
      const otherWd = (todayWd % 7) + 1; // any weekday that is not today
      await createSchedule(pet.id, {
        anchorDate: addDaysDateOnly(today, -7),
        category: 'Weekly medicine',
        recurrenceType: 'weekly',
        weekdays: String(todayWd),
      });
      await createSchedule(pet.id, {
        anchorDate: addDaysDateOnly(today, -7),
        category: 'Weekly brushing',
        recurrenceType: 'weekly',
        weekdays: String(otherWd),
      });

      expect((await api(`/api/pets/${pet.id}`, { cookie: owner.cookie })).status).toBe(200);

      const rows = await getNeedRows(pet.id);
      const todayRows = rows.filter((row) => row.dateFor === today && !row.archived);
      expect(todayRows.map((row) => row.category)).toEqual(['Weekly medicine']);
    });

    it('POST /needs with a weekly rule creates the rule and today instance; a once need stays rule-less', async () => {
      const pet = await createPet(owner.id, { lastRolledNeedDate: today });
      const todayWd = isoWeekdayOf(today);

      const recurring = await api(`/api/pets/${pet.id}/needs`, {
        method: 'POST',
        cookie: owner.cookie,
        body: {
          dateFor: today,
          category: 'Weekly medicine',
          quantity: { value: 5, unit: 'ml' },
          recurrence: { type: 'weekly', weekdays: [todayWd] },
        },
      });
      expect(recurring.status).toBe(201);
      expect(recurring.body.scheduleId).not.toBeNull();
      expect(recurring.body.recurrence).toEqual({ type: 'weekly', weekdays: [todayWd] });

      const oneOff = await api(`/api/pets/${pet.id}/needs`, {
        method: 'POST',
        cookie: owner.cookie,
        body: {
          dateFor: today,
          category: 'Vet visit today',
          duration: { value: 45, unit: 'minutes' },
          recurrence: { type: 'once' },
        },
      });
      expect(oneOff.status).toBe(201);
      expect(oneOff.body.scheduleId).toBeNull();
      expect(oneOff.body.recurrence).toBeNull();

      const schedules = await getScheduleRows(pet.id);
      expect(schedules).toHaveLength(1);
      expect(schedules[0]!.weekdays).toBe(String(todayWd));
    });

    it('toggle on a scheduled instance pauses the rule; schedule toggle materializes on resume', async () => {
      const pet = await createPet(owner.id, { lastRolledNeedDate: today });
      const created = await api(`/api/pets/${pet.id}/needs`, {
        method: 'POST',
        cookie: owner.cookie,
        body: {
          dateFor: today,
          category: 'Daily brushing',
          duration: { value: 10, unit: 'minutes' },
          recurrence: { type: 'daily' },
        },
      });
      expect(created.status).toBe(201);

      // Pause through the day card (instance route): rule + instance pause.
      const paused = await api(`/api/pets/${pet.id}/needs/${created.body.id}/toggle`, {
        method: 'POST',
        cookie: owner.cookie,
      });
      expect(paused.status).toBe(200);
      expect(paused.body.isActive).toBe(false);
      const pausedSchedules = await getScheduleRows(pet.id);
      expect(pausedSchedules[0]!.isActive).toBe(false);

      // Simulate the paused rule surviving into a later day with no instance:
      // remove today's instance, then resume from the rules list — the due
      // day materializes immediately.
      await api(`/api/pets/${pet.id}/needs/${created.body.id}`, { method: 'DELETE', cookie: owner.cookie });

      // Instance delete on a scheduled need removes the rule too, so plant a
      // fresh paused rule with no instance for the resume-materialize case.
      const rule = await createSchedule(pet.id, {
        anchorDate: addDaysDateOnly(today, -7),
        category: 'Paused daily water',
        isActive: false,
      });
      const resumed = await api(`/api/pets/${pet.id}/schedules/${rule.id}/toggle`, {
        method: 'POST',
        cookie: owner.cookie,
      });
      expect(resumed.status).toBe(200);
      expect(resumed.body.isActive).toBe(true);
      const rows = await getNeedRows(pet.id);
      expect(
        rows.filter((row) => row.dateFor === today && !row.archived && row.scheduleId === rule.id),
      ).toHaveLength(1);
    });

    it('editing a scheduled instance updates the rule and re-anchors on change', async () => {
      const pet = await createPet(owner.id, { lastRolledNeedDate: today });
      const created = await api(`/api/pets/${pet.id}/needs`, {
        method: 'POST',
        cookie: owner.cookie,
        body: {
          dateFor: today,
          category: 'Daily kibble',
          quantity: { value: 100, unit: 'g' },
          recurrence: { type: 'daily' },
        },
      });
      expect(created.status).toBe(201);

      const updated = await api(`/api/pets/${pet.id}/needs/${created.body.id}`, {
        method: 'PUT',
        cookie: owner.cookie,
        body: {
          category: 'Second-day kibble',
          quantity: { value: 150, unit: 'g' },
          recurrence: { type: 'interval', intervalDays: 2 },
        },
      });
      expect(updated.status).toBe(200);
      expect(updated.body.recurrence).toEqual({ type: 'interval', intervalDays: 2 });
      expect(updated.body.quantity).toEqual({ value: 150, unit: 'g' });

      const schedules = await getScheduleRows(pet.id);
      expect(schedules).toHaveLength(1);
      expect(schedules[0]!.recurrenceType).toBe('interval');
      expect(schedules[0]!.intervalDays).toBe(2);
      expect(schedules[0]!.category).toBe('Second-day kibble');
      // Rule change re-anchors to the instance's day (owner-local today).
      expect(schedules[0]!.anchorDate).toBe(today);
    });

    it('deleting a scheduled instance removes the rule but keeps frozen history', async () => {
      const pet = await createPet(owner.id, { lastRolledNeedDate: today });
      const planted = await createDailyNeed(pet.id, { dateFor: today, category: 'Daily play' });
      // A frozen (archived) instance of the same rule from an earlier day.
      await createNeed(pet.id, {
        dateFor: addDaysDateOnly(today, -1),
        category: 'Daily play',
        archived: true,
        isActive: false,
        scheduleId: planted.scheduleId,
      });

      const res = await api(`/api/pets/${pet.id}/needs/${planted.id}`, {
        method: 'DELETE',
        cookie: owner.cookie,
      });
      expect(res.status).toBe(204);

      expect(await getScheduleRows(pet.id)).toHaveLength(0);
      const rows = await getNeedRows(pet.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.archived).toBe(true);
      expect(rows[0]!.scheduleId).toBeNull(); // FK SET NULL kept the history row
    });
  });

  it('does not re-roll when the owner moves to an earlier timezone', async () => {
    const owner = await createUserWithSession({ timezone: AHEAD_TZ });
    const aheadToday = todayInTimeZone(AHEAD_TZ);
    const pet = await createPet(owner.id, { lastRolledNeedDate: addDaysDateOnly(aheadToday, -1) });
    await createDailyNeed(pet.id, {
      dateFor: addDaysDateOnly(aheadToday, -1),
      category: 'Fresh water',
      quantity: { value: 200, unit: 'ml' },
    });

    const first = await api('/api/pets', { cookie: owner.cookie });
    expect(first.status).toBe(200);
    expect((await getPetRow(pet.id))?.lastRolledNeedDate).toBe(aheadToday);
    const rowsAfterRoll = (await getNeedRows(pet.id)).length;

    // Move the owner far west: their "today" steps backwards.
    const moved = await api('/api/me', {
      method: 'PUT',
      body: { userName: owner.userName, email: owner.email, timezone: BEHIND_TZ, locale: 'en', digestOptIn: false, currentPassword: owner.password },
      cookie: owner.cookie,
    });
    expect(moved.status).toBe(200);
    expect(todayInTimeZone(BEHIND_TZ) < aheadToday).toBe(true);

    const second = await api('/api/pets', { cookie: owner.cookie });
    expect(second.status).toBe(200);
    // The >= guard keeps the future-dated stamp: nothing re-rolls, nothing
    // gets double-archived.
    expect((await getPetRow(pet.id))?.lastRolledNeedDate).toBe(aheadToday);
    expect((await getNeedRows(pet.id)).length).toBe(rowsAfterRoll);
  });

  it('rolls again when the owner moves to a later timezone', async () => {
    const owner = await createUserWithSession({ timezone: BEHIND_TZ });
    const behindToday = todayInTimeZone(BEHIND_TZ);
    const pet = await createPet(owner.id, { lastRolledNeedDate: behindToday });
    await createDailyNeed(pet.id, { dateFor: behindToday, category: 'Fresh water', quantity: { value: 200, unit: 'ml' } });

    const moved = await api('/api/me', {
      method: 'PUT',
      body: { userName: owner.userName, email: owner.email, timezone: AHEAD_TZ, locale: 'en', digestOptIn: false, currentPassword: owner.password },
      cookie: owner.cookie,
    });
    expect(moved.status).toBe(200);

    const aheadToday = todayInTimeZone(AHEAD_TZ);
    expect(aheadToday > behindToday).toBe(true);

    const res = await api('/api/pets', { cookie: owner.cookie });
    expect(res.status).toBe(200);
    expect((await getPetRow(pet.id))?.lastRolledNeedDate).toBe(aheadToday);

    const rows = await getNeedRows(pet.id);
    expect(rows.filter((row) => row.dateFor === behindToday && row.archived)).toHaveLength(1);
    expect(rows.filter((row) => row.dateFor === aheadToday && !row.archived)).toHaveLength(1);
  });

  it("a caretaker's read rolls the pet by the owner's timezone", async () => {
    const owner = await createUser({ timezone: AHEAD_TZ });
    const caretaker = await createUserWithSession({ timezone: 'Europe/Helsinki' });
    const ownerToday = todayInTimeZone(AHEAD_TZ);
    const pet = await createPet(owner.id, { lastRolledNeedDate: addDaysDateOnly(ownerToday, -1) });
    await createDailyNeed(pet.id, {
      dateFor: addDaysDateOnly(ownerToday, -1),
      category: 'Fresh water',
      quantity: { value: 200, unit: 'ml' },
    });
    await addCaretaker(pet.id, caretaker.id);

    const res = await api('/api/pets', { cookie: caretaker.cookie });
    expect(res.status).toBe(200);
    // Rolled to the OWNER's today (UTC+14), not the caretaker's (Helsinki).
    expect((await getPetRow(pet.id))?.lastRolledNeedDate).toBe(ownerToday);
    const rows = await getNeedRows(pet.id);
    expect(rows.filter((row) => row.dateFor === ownerToday && !row.archived)).toHaveLength(1);
  });
});

describe('dashboard task progress counts', () => {
  it('splits today needs into open (todayTaskCount) and completed (todayCompletedCount)', async () => {
    const owner = await createUserWithSession({ timezone: AHEAD_TZ });
    const today = todayInTimeZone(AHEAD_TZ);
    // Pre-stamp the guard so rollover doesn't archive/replace these today needs.
    const pet = await createPet(owner.id, { lastRolledNeedDate: today });
    await createNeed(pet.id, { dateFor: today, category: 'Fresh water' });
    await createNeed(pet.id, { dateFor: today, category: 'Evening walk', completed: true });
    // Completed but archived — must not count toward the badge total.
    await createNeed(pet.id, { dateFor: today, category: 'Old task', completed: true, archived: true });

    const res = await api('/api/pets', { cookie: owner.cookie });
    expect(res.status).toBe(200);
    const listed = res.body.find((item: { id: string }) => item.id === pet.id);
    expect(listed.todayTaskCount).toBe(1);
    expect(listed.todayCompletedCount).toBe(1);
  });
});
