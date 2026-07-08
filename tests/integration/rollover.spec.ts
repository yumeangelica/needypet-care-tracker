import { beforeAll, describe, expect, it } from 'vitest';
import { addDaysDateOnly, todayInTimeZone } from '../../shared/utils/date';
import {
  addCaretaker,
  api,
  createNeed,
  createPet,
  createUser,
  createUserWithSession,
  getNeedRows,
  getPetRow,
} from './helpers';

/**
 * Lazy rollover through the real endpoints. Owners live in extreme-offset
 * Pacific timezones so "today" is stable relative to the run and the
 * backward/forward timezone moves are unambiguous:
 * Kiritimati (UTC+14) is always at least a day ahead of Pago Pago (UTC-11).
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
      await createNeed(pet.id, { dateFor: yesterday, category: 'Fresh water', quantity: { value: 200, unit: 'ml' } });
      await createNeed(pet.id, {
        dateFor: yesterday,
        category: 'Evening walk',
        duration: { value: 30, unit: 'minutes' },
        completed: true,
      });
      await createNeed(pet.id, {
        dateFor: yesterday,
        category: 'Playtime',
        quantity: { value: 100, unit: 'ml' },
        isActive: false,
      });
    });

    it('archives past needs, copies active templates and stamps the guard', async () => {
      const res = await api('/api/pets', { cookie: owner.cookie });
      expect(res.status).toBe(200);
      const listed = res.body.find((item: any) => item.id === pet.id);
      expect(listed.lastRolledNeedDate).toBe(today);
      // Both fresh copies are open; the paused template did not roll.
      expect(listed.todayTaskCount).toBe(2);

      const rows = await getNeedRows(pet.id);
      const pastRows = rows.filter((row) => row.dateFor === yesterday);
      expect(pastRows).toHaveLength(3);
      for (const row of pastRows) {
        expect(row.archived).toBe(true);
      }

      const todayRows = rows.filter((row) => row.dateFor === today);
      expect(todayRows.map((row) => row.category).sort()).toEqual(['Evening walk', 'Fresh water']);
      for (const row of todayRows) {
        // The completed template rolls too - the copy starts fresh.
        expect(row.completed).toBe(false);
        expect(row.archived).toBe(false);
        expect(row.isActive).toBe(true);
      }

      expect((await getPetRow(pet.id))?.lastRolledNeedDate).toBe(today);
    });

    it('is idempotent on the next read', async () => {
      const before = (await getNeedRows(pet.id)).length;
      const res = await api(`/api/pets/${pet.id}`, { cookie: owner.cookie });
      expect(res.status).toBe(200);
      expect((await getNeedRows(pet.id)).length).toBe(before);
    });

    it('skips a template that already has a live need today', async () => {
      const dedupPet = await createPet(owner.id, { lastRolledNeedDate: yesterday });
      await createNeed(dedupPet.id, { dateFor: yesterday, category: 'Fresh water', quantity: { value: 200, unit: 'ml' } });
      // Identical template already lives on today (category, description and
      // measurement all match), so the rollover must not duplicate it.
      await createNeed(dedupPet.id, { dateFor: today, category: 'Fresh water', quantity: { value: 200, unit: 'ml' } });

      const res = await api(`/api/pets/${dedupPet.id}`, { cookie: owner.cookie });
      expect(res.status).toBe(200);

      const rows = await getNeedRows(dedupPet.id);
      expect(rows.filter((row) => row.dateFor === today)).toHaveLength(1);
      expect(rows.filter((row) => row.dateFor === yesterday && row.archived)).toHaveLength(1);
    });
  });

  it('does not re-roll when the owner moves to an earlier timezone', async () => {
    const owner = await createUserWithSession({ timezone: AHEAD_TZ });
    const aheadToday = todayInTimeZone(AHEAD_TZ);
    const pet = await createPet(owner.id, { lastRolledNeedDate: addDaysDateOnly(aheadToday, -1) });
    await createNeed(pet.id, {
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
    await createNeed(pet.id, { dateFor: behindToday, category: 'Fresh water', quantity: { value: 200, unit: 'ml' } });

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
    await createNeed(pet.id, {
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
