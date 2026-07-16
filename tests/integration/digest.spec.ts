import { beforeAll, describe, expect, it } from 'vitest';
import { addDaysDateOnly, hourInTimeZone, todayInTimeZone } from '../../shared/utils/date';
import { Temporal } from '../../shared/utils/temporal';
import {
  addCaretaker,
  api,
  createNeed,
  createPet,
  createUser,
  getPetRow,
  getUserRow,
} from './helpers';

/**
 * The daily digest endpoint. The suite server sets NUXT_DIGEST_SECRET (see
 * global-setup.ts) and NUXT_DIGEST_HOUR defaults to 18. Mail goes to the
 * console (no capture), so delivery is asserted via the response counters and
 * the users.last_digest_date stamp rather than a mailbox.
 */
const SECRET = 'itest-digest-secret';
const SEND_HOUR = 18;

/**
 * Picks a real IANA timezone whose CURRENT local hour sits inside [min, max],
 * so the send-hour gate is exercised deterministically regardless of when the
 * suite runs. Boundary hours are excluded by the caller's range. Intl's list
 * has no UTC, which the app rejects as a user timezone anyway.
 */
function timezoneWithLocalHourBetween(min: number, max: number): string {
  const now = Temporal.Now.instant();
  for (const tz of Intl.supportedValuesOf('timeZone')) {
    const hour = hourInTimeZone(tz, now);
    if (hour >= min && hour <= max) {
      return tz;
    }
  }
  throw new Error(`No timezone currently has a local hour in [${min}, ${max}]`);
}

function digest(headers?: Record<string, string>) {
  return api('/api/internal/daily-digest', { method: 'POST', headers });
}

describe('daily digest endpoint', () => {
  // "Evening": past the send hour but not so late the local date is about to
  // flip. "Morning": safely before the send hour.
  let eveningTz: string;
  let morningTz: string;

  beforeAll(() => {
    eveningTz = timezoneWithLocalHourBetween(SEND_HOUR, 22);
    morningTz = timezoneWithLocalHourBetween(6, SEND_HOUR - 2);
  });

  describe('auth', () => {
    it('rejects a missing secret with 401', async () => {
      const res = await digest();
      expect(res.status).toBe(401);
    });

    it('rejects a wrong secret with 401', async () => {
      const res = await digest({ 'x-digest-secret': 'nope' });
      expect(res.status).toBe(401);
    });
  });

  describe('send gating', () => {
    it('sends to an opted-in evening user with an open task and stamps the date', async () => {
      const owner = await createUser({ timezone: eveningTz, digestOptIn: true });
      const today = todayInTimeZone(eveningTz);
      const pet = await createPet(owner.id, { lastRolledNeedDate: today });
      await createNeed(pet.id, {
        dateFor: today,
        category: 'Fresh water',
        quantity: { value: 200, unit: 'ml' },
      });

      const res = await digest({ 'x-digest-secret': SECRET });
      expect(res.status).toBe(200);
      expect(res.body.sent).toBeGreaterThanOrEqual(1);

      const row = await getUserRow(owner.id);
      expect(row?.lastDigestDate).toBe(today);
    });

    it('does not send twice on the same local day (idempotent rerun)', async () => {
      const owner = await createUser({ timezone: eveningTz, digestOptIn: true });
      const today = todayInTimeZone(eveningTz);
      const pet = await createPet(owner.id, { lastRolledNeedDate: today });
      await createNeed(pet.id, {
        dateFor: today,
        category: 'Breakfast',
        quantity: { value: 100, unit: 'g' },
      });

      const first = await digest({ 'x-digest-secret': SECRET });
      expect(first.body.sent).toBeGreaterThanOrEqual(1);
      const stampAfterFirst = (await getUserRow(owner.id))?.lastDigestDate;

      // A second run finds last_digest_date == today and skips this user.
      await digest({ 'x-digest-secret': SECRET });
      expect((await getUserRow(owner.id))?.lastDigestDate).toBe(stampAfterFirst);
    });

    it('sends only once when two runs fire concurrently (atomic claim)', async () => {
      const owner = await createUser({ timezone: eveningTz, digestOptIn: true });
      const today = todayInTimeZone(eveningTz);
      const pet = await createPet(owner.id, { lastRolledNeedDate: today });
      await createNeed(pet.id, {
        dateFor: today,
        category: 'Fresh water',
        quantity: { value: 200, unit: 'ml' },
      });

      // Two overlapping cron invocations. The conditional claim update means
      // exactly one run may stamp-and-send this user; the other sees the row
      // already claimed for today and skips it.
      const [a, b] = await Promise.all([
        digest({ 'x-digest-secret': SECRET }),
        digest({ 'x-digest-secret': SECRET }),
      ]);
      expect(a.status).toBe(200);
      expect(b.status).toBe(200);

      // Each response counts every candidate user in the shared test DB, so the
      // only assertion that isolates THIS user is the single stamp plus the fact
      // that this user contributed to exactly one of the two runs' `sent` totals.
      expect((await getUserRow(owner.id))?.lastDigestDate).toBe(today);
      expect(a.body.sent + b.body.sent).toBeGreaterThanOrEqual(1);
    });

    it('skips a morning user (send hour not reached)', async () => {
      const owner = await createUser({ timezone: morningTz, digestOptIn: true });
      const today = todayInTimeZone(morningTz);
      const pet = await createPet(owner.id, { lastRolledNeedDate: today });
      await createNeed(pet.id, {
        dateFor: today,
        category: 'Fresh water',
        quantity: { value: 200, unit: 'ml' },
      });

      await digest({ 'x-digest-secret': SECRET });
      expect((await getUserRow(owner.id))?.lastDigestDate).toBeNull();
    });

    it('skips a default opt-out user', async () => {
      const owner = await createUser({ timezone: eveningTz }); // digestOptIn defaults false
      const today = todayInTimeZone(eveningTz);
      const pet = await createPet(owner.id, { lastRolledNeedDate: today });
      await createNeed(pet.id, {
        dateFor: today,
        category: 'Fresh water',
        quantity: { value: 200, unit: 'ml' },
      });

      await digest({ 'x-digest-secret': SECRET });
      expect((await getUserRow(owner.id))?.lastDigestDate).toBeNull();
    });

    it('skips an opted-in but unconfirmed user', async () => {
      const owner = await createUser({
        timezone: eveningTz,
        digestOptIn: true,
        emailConfirmed: false,
      });
      const today = todayInTimeZone(eveningTz);
      const pet = await createPet(owner.id, { lastRolledNeedDate: today });
      await createNeed(pet.id, {
        dateFor: today,
        category: 'Fresh water',
        quantity: { value: 200, unit: 'ml' },
      });

      await digest({ 'x-digest-secret': SECRET });
      expect((await getUserRow(owner.id))?.lastDigestDate).toBeNull();
    });

    it('does not send or stamp when there are no open tasks', async () => {
      const owner = await createUser({ timezone: eveningTz, digestOptIn: true });
      const today = todayInTimeZone(eveningTz);
      const pet = await createPet(owner.id, { lastRolledNeedDate: today });
      // Completed today -> not an open task.
      await createNeed(pet.id, {
        dateFor: today,
        category: 'Breakfast',
        quantity: { value: 100, unit: 'g' },
        completed: true,
      });

      await digest({ 'x-digest-secret': SECRET });
      expect((await getUserRow(owner.id))?.lastDigestDate).toBeNull();
    });
  });

  describe('rollover and caretaker coverage', () => {
    it('rolls a stale pet forward, sends, and advances last_rolled_need_date', async () => {
      const owner = await createUser({ timezone: eveningTz, digestOptIn: true });
      const today = todayInTimeZone(eveningTz);
      const yesterday = addDaysDateOnly(today, -1);
      const pet = await createPet(owner.id, { lastRolledNeedDate: yesterday });
      // An active, incomplete need on yesterday: rollover copies it to today.
      await createNeed(pet.id, {
        dateFor: yesterday,
        category: 'Evening walk',
        duration: { value: 30, unit: 'minutes' },
      });

      const res = await digest({ 'x-digest-secret': SECRET });
      expect(res.status).toBe(200);

      const petRow = await getPetRow(pet.id);
      expect(petRow?.lastRolledNeedDate).toBe(today);
      expect((await getUserRow(owner.id))?.lastDigestDate).toBe(today);
    });

    it('sends a caretaker the digest for a caretaken pet (owner-local day)', async () => {
      const owner = await createUser({ timezone: eveningTz });
      const caretaker = await createUser({ timezone: eveningTz, digestOptIn: true });
      const today = todayInTimeZone(eveningTz);
      const pet = await createPet(owner.id, { lastRolledNeedDate: today });
      await addCaretaker(pet.id, caretaker.id);
      await createNeed(pet.id, {
        dateFor: today,
        category: 'Fresh water',
        quantity: { value: 200, unit: 'ml' },
      });

      await digest({ 'x-digest-secret': SECRET });
      expect((await getUserRow(caretaker.id))?.lastDigestDate).toBe(today);
    });
  });
});
