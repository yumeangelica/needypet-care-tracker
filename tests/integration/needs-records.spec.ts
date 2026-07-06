import { beforeAll, describe, expect, it } from 'vitest';
import { addDaysDateOnly, todayInTimeZone } from '../../shared/utils/date';
import { zonedDateTimeToUtcIso } from '../../shared/utils/datetime';
import {
  api,
  createNeed,
  createPet,
  createRecord,
  createUserWithSession,
  errorDetails,
  errorMessage,
  getNeedRow,
  getRecordRows,
  uniqueName,
} from './helpers';

function hourIn(tz: string): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hour12: false }).format(new Date()),
  );
}

/**
 * A timezone whose local clock is currently comfortably inside the day, so
 * "one hour ago" and "one hour ahead" stay within the same care day and the
 * manual-time tests can't flake around midnight. The hour is re-read inside
 * each test (it may drift by a step during the run; it stays in 1..22).
 */
function pickDaytimeTimezone(): string {
  // No 'UTC' here: Intl.supportedValuesOf('timeZone') (the app's allowlist)
  // only carries region-based zones. Helsinki and Tokyo alone already cover
  // every UTC hour; the rest add slack.
  const candidates = ['Europe/Helsinki', 'Asia/Tokyo', 'America/New_York', 'Australia/Sydney'];
  for (const tz of candidates) {
    const hour = hourIn(tz);
    if (hour >= 1 && hour <= 21) {
      return tz;
    }
  }
  throw new Error('no daytime timezone available');
}

const pad = (n: number) => String(n).padStart(2, '0');

describe('needs and care records', () => {
  const TZ = pickDaytimeTimezone();
  let owner: Awaited<ReturnType<typeof createUserWithSession>>;
  let today: string;
  let pet: { id: string };

  const recordBody = (value: number) => ({ timezone: TZ, quantity: { value, unit: 'ml' } });

  beforeAll(async () => {
    owner = await createUserWithSession({ timezone: TZ });
    today = todayInTimeZone(TZ);
    pet = await createPet(owner.id, { lastRolledNeedDate: today });
  });

  describe('completion recompute', () => {
    let needId: string;
    const base = () => `/api/pets/${pet.id}/needs/${needId}/records`;

    it('auto-completes when summed records reach the target', async () => {
      const created = await api(`/api/pets/${pet.id}/needs`, {
        method: 'POST',
        body: { dateFor: today, category: 'Water bowl', quantity: { value: 200, unit: 'ml' } },
        cookie: owner.cookie,
      });
      expect(created.status).toBe(201);
      expect(created.body.completed).toBe(false);
      needId = created.body.id;

      const half = await api(base(), { method: 'POST', body: recordBody(100), cookie: owner.cookie });
      expect(half.status).toBe(201);
      expect(half.body.completed).toBe(false);

      const full = await api(base(), { method: 'POST', body: recordBody(100), cookie: owner.cookie });
      expect(full.status).toBe(201);
      expect(full.body.completed).toBe(true);
    });

    it('rejects further records on a completed need', async () => {
      const res = await api(base(), { method: 'POST', body: recordBody(10), cookie: owner.cookie });
      expect(res.status).toBe(400);
      expect(errorMessage(res.body)).toBe('Need is already completed');
    });

    it('un-completes and re-completes through record edits', async () => {
      const records = await getRecordRows(needId);
      const target = records[0]!;

      const down = await api(`${base()}/${target.id}`, {
        method: 'PATCH',
        body: { quantity: { value: 50, unit: 'ml' } },
        cookie: owner.cookie,
      });
      expect(down.status).toBe(200);
      expect(down.body.completed).toBe(false);

      const up = await api(`${base()}/${target.id}`, {
        method: 'PATCH',
        body: { quantity: { value: 100, unit: 'ml' } },
        cookie: owner.cookie,
      });
      expect(up.status).toBe(200);
      expect(up.body.completed).toBe(true);
    });

    it('un-completes when a record is deleted', async () => {
      const records = await getRecordRows(needId);
      const res = await api(`${base()}/${records[0]!.id}`, { method: 'DELETE', cookie: owner.cookie });
      expect(res.status).toBe(204);
      expect((await getNeedRow(needId))?.completed).toBe(false);
    });

    it('works for duration needs too', async () => {
      const created = await api(`/api/pets/${pet.id}/needs`, {
        method: 'POST',
        body: { dateFor: today, category: 'Evening walk', duration: { value: 30, unit: 'minutes' } },
        cookie: owner.cookie,
      });
      const walk = await api(`/api/pets/${pet.id}/needs/${created.body.id}/records`, {
        method: 'POST',
        body: { timezone: TZ, duration: { value: 30, unit: 'minutes' } },
        cookie: owner.cookie,
      });
      expect(walk.status).toBe(201);
      expect(walk.body.completed).toBe(true);
    });
  });

  describe('measurement rules', () => {
    let quantityNeed: { id: string };
    let recordId: string;

    beforeAll(async () => {
      quantityNeed = await createNeed(pet.id, { dateFor: today, quantity: { value: 5000, unit: 'ml' } });
      recordId = (
        await createRecord({ needId: quantityNeed.id, petId: pet.id, careTakerId: owner.id, quantity: { value: 10, unit: 'ml' } })
      ).id;
    });

    it('rejects a record whose type differs from the need (create and edit)', async () => {
      const base = `/api/pets/${pet.id}/needs/${quantityNeed.id}/records`;
      const created = await api(base, {
        method: 'POST',
        body: { timezone: TZ, duration: { value: 10, unit: 'minutes' } },
        cookie: owner.cookie,
      });
      expect(created.status).toBe(400);
      expect(errorMessage(created.body)).toBe('Care record measurement must match need measurement');

      const patched = await api(`${base}/${recordId}`, {
        method: 'PATCH',
        body: { duration: { value: 10, unit: 'minutes' } },
        cookie: owner.cookie,
      });
      expect(patched.status).toBe(400);
      expect(errorMessage(patched.body)).toBe('Care record measurement must match need measurement');
    });

    it('422s a record with both or neither measurement', async () => {
      const base = `/api/pets/${pet.id}/needs/${quantityNeed.id}/records`;
      const both = await api(base, {
        method: 'POST',
        body: { timezone: TZ, quantity: { value: 10, unit: 'ml' }, duration: { value: 10, unit: 'minutes' } },
        cookie: owner.cookie,
      });
      expect(both.status).toBe(422);
      expect(errorDetails(both.body)?.quantity).toBeTruthy();

      const neither = await api(base, { method: 'POST', body: { timezone: TZ }, cookie: owner.cookie });
      expect(neither.status).toBe(422);
    });

    it('422s a need with both measurements', async () => {
      const res = await api(`/api/pets/${pet.id}/needs`, {
        method: 'POST',
        body: {
          dateFor: today,
          category: 'Confused need',
          quantity: { value: 10, unit: 'ml' },
          duration: { value: 10, unit: 'minutes' },
        },
        cookie: owner.cookie,
      });
      expect(res.status).toBe(422);
      expect(errorDetails(res.body)?.quantity).toBeTruthy();
    });
  });

  describe('day rules', () => {
    it('caps a day at 10 needs', async () => {
      const cappedPet = await createPet(owner.id, { lastRolledNeedDate: today });
      for (let i = 0; i < 9; i += 1) {
        await createNeed(cappedPet.id, { dateFor: today, category: `Care task ${i}`, duration: { value: 5, unit: 'minutes' } });
      }
      const tenth = await api(`/api/pets/${cappedPet.id}/needs`, {
        method: 'POST',
        body: { dateFor: today, category: 'The tenth task', duration: { value: 5, unit: 'minutes' } },
        cookie: owner.cookie,
      });
      expect(tenth.status).toBe(201);

      const eleventh = await api(`/api/pets/${cappedPet.id}/needs`, {
        method: 'POST',
        body: { dateFor: today, category: 'One too many', duration: { value: 5, unit: 'minutes' } },
        cookie: owner.cookie,
      });
      expect(eleventh.status).toBe(400);
      expect(errorMessage(eleventh.body)).toBe('Maximum number of needs for the day reached');
    });

    it('rejects creating a need for a past day', async () => {
      const res = await api(`/api/pets/${pet.id}/needs`, {
        method: 'POST',
        body: { dateFor: addDaysDateOnly(today, -1), category: 'Time travel', duration: { value: 5, unit: 'minutes' } },
        cookie: owner.cookie,
      });
      expect(res.status).toBe(400);
      expect(errorMessage(res.body)).toBe('Cannot add a need for a past day');
    });

    it('rejects logging care on a need outside the current care day', async () => {
      const tomorrowNeed = await createNeed(pet.id, { dateFor: addDaysDateOnly(today, 1), quantity: { value: 100, unit: 'ml' } });
      const res = await api(`/api/pets/${pet.id}/needs/${tomorrowNeed.id}/records`, {
        method: 'POST',
        body: recordBody(50),
        cookie: owner.cookie,
      });
      expect(res.status).toBe(400);
      expect(errorMessage(res.body)).toBe('Need date is not the same as the current date');
    });
  });

  describe('archived (rolled-over) days are frozen', () => {
    let archivedNeed: { id: string };
    let archivedRecordId: string;

    beforeAll(async () => {
      const yesterday = addDaysDateOnly(today, -1);
      archivedNeed = await createNeed(pet.id, {
        dateFor: yesterday,
        category: 'Old task',
        quantity: { value: 100, unit: 'ml' },
        archived: true,
        isActive: false,
      });
      archivedRecordId = (
        await createRecord({ needId: archivedNeed.id, petId: pet.id, careTakerId: owner.id, quantity: { value: 40, unit: 'ml' } })
      ).id;
    });

    it('blocks new records, record edits and record deletes', async () => {
      const base = `/api/pets/${pet.id}/needs/${archivedNeed.id}/records`;
      const created = await api(base, { method: 'POST', body: recordBody(10), cookie: owner.cookie });
      expect(created.status).toBe(400);
      expect(errorMessage(created.body)).toBe('Need is archived');

      const patched = await api(`${base}/${archivedRecordId}`, {
        method: 'PATCH',
        body: { quantity: { value: 50, unit: 'ml' } },
        cookie: owner.cookie,
      });
      expect(patched.status).toBe(400);
      expect(errorMessage(patched.body)).toBe('Care history for rolled-over days is frozen');

      const deleted = await api(`${base}/${archivedRecordId}`, { method: 'DELETE', cookie: owner.cookie });
      expect(deleted.status).toBe(400);
      expect(errorMessage(deleted.body)).toBe('Care history for rolled-over days is frozen');
    });

    it('blocks need edits and pause/resume, but still allows deletion', async () => {
      const putRes = await api(`/api/pets/${pet.id}/needs/${archivedNeed.id}`, {
        method: 'PUT',
        body: { category: 'Renamed task' },
        cookie: owner.cookie,
      });
      expect(putRes.status).toBe(400);
      expect(errorMessage(putRes.body)).toBe('Need is archived');

      const toggled = await api(`/api/pets/${pet.id}/needs/${archivedNeed.id}/toggle`, {
        method: 'POST',
        cookie: owner.cookie,
      });
      expect(toggled.status).toBe(400);

      const deleted = await api(`/api/pets/${pet.id}/needs/${archivedNeed.id}`, {
        method: 'DELETE',
        cookie: owner.cookie,
      });
      expect(deleted.status).toBe(204);
    });
  });

  describe('manual time of day', () => {
    let timedNeed: { id: string };

    beforeAll(async () => {
      timedNeed = await createNeed(pet.id, { dateFor: today, category: 'Timed care', quantity: { value: 5000, unit: 'ml' } });
    });

    it('accepts an earlier wall-clock time and stores the matching instant', async () => {
      const timeOfDay = `${pad(hourIn(TZ) - 1)}:00`;
      const res = await api(`/api/pets/${pet.id}/needs/${timedNeed.id}/records`, {
        method: 'POST',
        body: { ...recordBody(10), timeOfDay },
        cookie: owner.cookie,
      });
      expect(res.status).toBe(201);

      const records = await getRecordRows(timedNeed.id);
      const expectedInstant = zonedDateTimeToUtcIso(today, timeOfDay, TZ);
      expect(records.some((row) => row.date === expectedInstant)).toBe(true);
    });

    it('rejects a future wall-clock time', async () => {
      const res = await api(`/api/pets/${pet.id}/needs/${timedNeed.id}/records`, {
        method: 'POST',
        body: { ...recordBody(10), timeOfDay: `${pad(hourIn(TZ) + 1)}:00` },
        cookie: owner.cookie,
      });
      expect(res.status).toBe(400);
      expect(errorMessage(res.body)).toBe('Cannot log care in the future');
    });

    it('422s a malformed time', async () => {
      const res = await api(`/api/pets/${pet.id}/needs/${timedNeed.id}/records`, {
        method: 'POST',
        body: { ...recordBody(10), timeOfDay: '25:00' },
        cookie: owner.cookie,
      });
      expect(res.status).toBe(422);
      expect(errorDetails(res.body)?.timeOfDay).toBeTruthy();
    });
  });

  describe('input validation', () => {
    it('422s a too-short category, a bad date and an over-long note', async () => {
      const shortCategory = await api(`/api/pets/${pet.id}/needs`, {
        method: 'POST',
        body: { dateFor: today, category: 'ab', duration: { value: 5, unit: 'minutes' } },
        cookie: owner.cookie,
      });
      expect(shortCategory.status).toBe(422);
      expect(errorDetails(shortCategory.body)?.category).toBeTruthy();

      const badDate = await api(`/api/pets/${pet.id}/needs`, {
        method: 'POST',
        body: { dateFor: '2026-02-30', category: 'Ghost day', duration: { value: 5, unit: 'minutes' } },
        cookie: owner.cookie,
      });
      expect(badDate.status).toBe(422);
      expect(errorDetails(badDate.body)?.dateFor).toBeTruthy();

      const longNoteNeed = await createNeed(pet.id, { dateFor: today, category: uniqueName('Note'), quantity: { value: 100, unit: 'ml' } });
      const longNote = await api(`/api/pets/${pet.id}/needs/${longNoteNeed.id}/records`, {
        method: 'POST',
        body: { ...recordBody(10), note: 'x'.repeat(301) },
        cookie: owner.cookie,
      });
      expect(longNote.status).toBe(422);
      expect(errorDetails(longNote.body)?.note).toBeTruthy();
    });

    it('404s records against a missing need', async () => {
      const res = await api(`/api/pets/${pet.id}/needs/${crypto.randomUUID()}/records`, {
        method: 'POST',
        body: recordBody(10),
        cookie: owner.cookie,
      });
      expect(res.status).toBe(404);
    });
  });
});
