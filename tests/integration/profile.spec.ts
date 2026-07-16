import { describe, expect, it } from 'vitest';
import { todayInTimeZone } from '../../shared/utils/date';
import {
  addCaretaker,
  api,
  createNeed,
  createPet,
  createRecord,
  createUser,
  createUserWithSession,
  errorMessage,
  getPetRow,
  getRecordRows,
  getUserRow,
  loginAs,
  plantEmailConfirmToken,
  sessionCookieFrom,
  uniqueName,
} from './helpers';

const TZ = 'Europe/Helsinki';

describe('profile', () => {
  describe('PUT /api/me', () => {
    it('401s a wrong current password', async () => {
      const user = await createUserWithSession({ timezone: TZ });
      const res = await api('/api/me', {
        method: 'PUT',
        body: { userName: user.userName, email: user.email, timezone: TZ, locale: 'en', digestOptIn: false, currentPassword: 'WrongPaws123!' },
        cookie: user.cookie,
      });
      expect(res.status).toBe(401);
      expect(errorMessage(res.body)).toBe('Invalid current password');
    });

    it('updates username and timezone, keeps confirmation, refreshes the session', async () => {
      const user = await createUserWithSession({ timezone: TZ });
      const newName = uniqueName('renamed');
      const res = await api('/api/me', {
        method: 'PUT',
        body: { userName: newName, email: user.email, timezone: 'Europe/Stockholm', locale: 'en', digestOptIn: false, currentPassword: user.password },
        cookie: user.cookie,
      });
      expect(res.status).toBe(200);
      expect(res.body.user.userName).toBe(newName);
      // The session is re-issued so its cached userName stays fresh.
      expect(res.headers.getSetCookie().length).toBeGreaterThan(0);

      // Sessions are stateless, so the pre-change cookie still authenticates
      // and sees the updated row.
      const me = await api('/api/me', { cookie: user.cookie });
      expect(me.status).toBe(200);
      expect(me.body.userName).toBe(newName);
      expect(me.body.timezone).toBe('Europe/Stockholm');
      // Email did not change - confirmation is untouched.
      expect(me.body.emailConfirmed).toBe(true);
    });

    it('rejects a taken username and a taken email', async () => {
      const user = await createUserWithSession({ timezone: TZ });
      const other = await createUser({ timezone: TZ });

      const dupName = await api('/api/me', {
        method: 'PUT',
        body: { userName: other.userName.toUpperCase(), email: user.email, timezone: TZ, locale: 'en', digestOptIn: false, currentPassword: user.password },
        cookie: user.cookie,
      });
      expect(dupName.status).toBe(400);
      expect(errorMessage(dupName.body)).toBe('Username already exists');

      const dupEmail = await api('/api/me', {
        method: 'PUT',
        body: { userName: user.userName, email: other.email, timezone: TZ, locale: 'en', digestOptIn: false, currentPassword: user.password },
        cookie: user.cookie,
      });
      expect(dupEmail.status).toBe(400);
      expect(errorMessage(dupEmail.body)).toBe('Email already exists');
    });

    it('changing the email un-confirms it and the new address re-verifies', async () => {
      const user = await createUserWithSession({ timezone: TZ });
      const newEmail = `${uniqueName('changed')}@example.com`;

      const res = await api('/api/me', {
        method: 'PUT',
        body: { userName: user.userName, email: newEmail, timezone: TZ, locale: 'en', digestOptIn: false, currentPassword: user.password },
        cookie: user.cookie,
      });
      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe(newEmail);
      expect(res.body.user.emailConfirmed).toBe(false);

      const row = await getUserRow(user.id);
      expect(row?.emailConfirmToken).toBeTruthy();
      expect(row?.emailConfirmExpiresAt).toBeTruthy();

      // Complete the reverification loop against the public confirm endpoint.
      const rawToken = `rev-${crypto.randomUUID()}`;
      await plantEmailConfirmToken(user.id, rawToken);
      const confirmed = await api('/api/auth/confirm-email', { method: 'POST', body: { token: rawToken } });
      expect(confirmed.status).toBe(200);
      expect((await getUserRow(user.id))?.emailConfirmed).toBe(true);
    });

    it('keeps an email change successful when optional confirmation delivery fails', async () => {
      const user = await createUserWithSession({ timezone: TZ });
      const newEmail = `fail-${uniqueName('profile-mail')}@example.com`;
      const res = await api('/api/me', {
        method: 'PUT',
        body: {
          userName: user.userName,
          email: newEmail,
          timezone: TZ,
          locale: 'en',
          digestOptIn: false,
          currentPassword: user.password,
        },
        cookie: user.cookie,
      });
      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe(newEmail);
      expect(res.body.user.emailConfirmed).toBe(false);
    });

    it('toggles the daily-reminder opt-in and reflects it on GET /api/me', async () => {
      const user = await createUserWithSession({ timezone: TZ });
      // Defaults off.
      expect((await api('/api/me', { cookie: user.cookie })).body.digestOptIn).toBe(false);

      const res = await api('/api/me', {
        method: 'PUT',
        body: { userName: user.userName, email: user.email, timezone: TZ, locale: 'en', digestOptIn: true, currentPassword: user.password },
        cookie: user.cookie,
      });
      expect(res.status).toBe(200);
      expect(res.body.user.digestOptIn).toBe(true);
      expect((await api('/api/me', { cookie: user.cookie })).body.digestOptIn).toBe(true);
      expect((await getUserRow(user.id))?.digestOptIn).toBe(true);
    });

    it('persists a locale change and reflects it on GET /api/me', async () => {
      const user = await createUserWithSession({ timezone: TZ });
      // New accounts default to English.
      expect((await api('/api/me', { cookie: user.cookie })).body.locale).toBe('en');

      const res = await api('/api/me', {
        method: 'PUT',
        body: { userName: user.userName, email: user.email, timezone: TZ, locale: 'fi', digestOptIn: false, currentPassword: user.password },
        cookie: user.cookie,
      });
      expect(res.status).toBe(200);
      expect(res.body.user.locale).toBe('fi');
      expect((await api('/api/me', { cookie: user.cookie })).body.locale).toBe('fi');
      expect((await getUserRow(user.id))?.locale).toBe('fi');
    });

    it('422s an unsupported locale value', async () => {
      const user = await createUserWithSession({ timezone: TZ });
      const res = await api('/api/me', {
        method: 'PUT',
        body: { userName: user.userName, email: user.email, timezone: TZ, locale: 'de', digestOptIn: false, currentPassword: user.password },
        cookie: user.cookie,
      });
      expect(res.status).toBe(422);
    });
  });

  describe('PUT /api/me/password', () => {
    it('401s a wrong current password and 422s a weak new one', async () => {
      const user = await createUserWithSession({ timezone: TZ });
      const wrong = await api('/api/me/password', {
        method: 'PUT',
        body: { currentPassword: 'WrongPaws123!', newPassword: 'BrandNewPaws77!' },
        cookie: user.cookie,
      });
      expect(wrong.status).toBe(401);

      const weak = await api('/api/me/password', {
        method: 'PUT',
        body: { currentPassword: user.password, newPassword: 'kitten' },
        cookie: user.cookie,
      });
      expect(weak.status).toBe(422);
    });

    it('keeps the caller signed in, revokes another device and resets successful verification', async () => {
      const user = await createUserWithSession({ timezone: TZ });
      const otherDeviceCookie = await loginAs(user.userName, user.password);
      const newPassword = 'BrandNewPaws77!';

      const wrongBeforeSuccess = await api('/api/me/password', {
        method: 'PUT',
        body: { currentPassword: 'WrongPaws123!', newPassword },
        cookie: user.cookie,
      });
      expect(wrongBeforeSuccess.status).toBe(401);

      const res = await api('/api/me/password', {
        method: 'PUT',
        body: { currentPassword: user.password, newPassword },
        cookie: user.cookie,
      });
      expect(res.status).toBe(200);
      const currentCookie = sessionCookieFrom(res);
      expect((await api('/api/me', { cookie: currentCookie })).status).toBe(200);
      expect((await api('/api/me', { cookie: user.cookie })).status).toBe(401);
      expect((await api('/api/me', { cookie: otherDeviceCookie })).status).toBe(401);

      const oldLogin = await api('/api/auth/login', {
        method: 'POST',
        body: { userName: user.userName, password: user.password },
      });
      expect(oldLogin.status).toBe(401);

      const newLogin = await api('/api/auth/login', {
        method: 'POST',
        body: { userName: user.userName, password: newPassword },
      });
      expect(newLogin.status).toBe(200);

      // The successful verification cleared the earlier failure. Five new
      // failures are counted normally; the sixth is blocked.
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const wrong = await api('/api/me/password', {
          method: 'PUT',
          body: { currentPassword: 'WrongPaws123!', newPassword: 'AnotherPaws88!' },
          cookie: currentCookie,
        });
        expect(wrong.status).toBe(401);
      }
      const blocked = await api('/api/me/password', {
        method: 'PUT',
        body: { currentPassword: 'WrongPaws123!', newPassword: 'AnotherPaws88!' },
        cookie: currentCookie,
      });
      expect(blocked.status).toBe(429);
      expect(blocked.headers.get('retry-after')).toBeTruthy();
    });

    it('allows only one concurrent password change from the same session', async () => {
      const user = await createUserWithSession({ timezone: TZ });
      const passwords = ['FirstPaws123!', 'SecondPaws456!'] as const;
      const results = await Promise.all(
        passwords.map((newPassword) =>
          api('/api/me/password', {
            method: 'PUT',
            body: { currentPassword: user.password, newPassword },
            cookie: user.cookie,
          }),
        ),
      );
      expect(results.map((result) => result.status).sort()).toEqual([200, 401]);

      const winnerIndex = results.findIndex((result) => result.status === 200);
      const loserIndex = winnerIndex === 0 ? 1 : 0;
      expect(
        (
          await api('/api/auth/login', {
            method: 'POST',
            body: { userName: user.userName, password: passwords[winnerIndex]! },
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await api('/api/auth/login', {
            method: 'POST',
            body: { userName: user.userName, password: passwords[loserIndex]! },
          })
        ).status,
      ).toBe(401);
    });

    const passwordProtectedRoutes: Array<{
      label: string;
      path: string;
      method: 'PUT' | 'DELETE';
      body: (user: Awaited<ReturnType<typeof createUserWithSession>>) => Record<string, unknown>;
    }> = [
      {
        label: 'profile update',
        path: '/api/me',
        method: 'PUT',
        body: (user) => ({
          userName: user.userName,
          email: user.email,
          timezone: TZ,
          locale: 'en',
          digestOptIn: false,
          currentPassword: 'WrongPaws123!',
        }),
      },
      {
        label: 'password change',
        path: '/api/me/password',
        method: 'PUT',
        body: () => ({
          currentPassword: 'WrongPaws123!',
          newPassword: 'AnotherPaws88!',
        }),
      },
      {
        label: 'account deletion',
        path: '/api/me',
        method: 'DELETE',
        body: () => ({ currentPassword: 'WrongPaws123!' }),
      },
    ];

    it.each(passwordProtectedRoutes)('rate limits $label password attempts', async (route) => {
      const user = await createUserWithSession({ timezone: TZ });
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const wrong = await api(route.path, {
          method: route.method,
          body: route.body(user),
          cookie: user.cookie,
        });
        expect(wrong.status).toBe(401);
      }
      const blocked = await api(route.path, {
        method: route.method,
        body: route.body(user),
        cookie: user.cookie,
      });
      expect(blocked.status).toBe(429);
      expect(blocked.headers.get('retry-after')).toBeTruthy();
    });
  });

  describe('DELETE /api/me', () => {
    it('401s a wrong current password', async () => {
      const user = await createUserWithSession({ timezone: TZ });
      const res = await api('/api/me', {
        method: 'DELETE',
        body: { currentPassword: 'WrongPaws123!' },
        cookie: user.cookie,
      });
      expect(res.status).toBe(401);
    });

    it('cascades own pets and keeps audit rows on other pets with a nulled actor', async () => {
      const today = todayInTimeZone(TZ);
      const victim = await createUserWithSession({ timezone: TZ });
      const otherOwner = await createUserWithSession({ timezone: TZ });

      const ownPet = await createPet(victim.id, { lastRolledNeedDate: today });
      const otherPet = await createPet(otherOwner.id, { lastRolledNeedDate: today });
      await addCaretaker(otherPet.id, victim.id);
      const otherNeed = await createNeed(otherPet.id, { dateFor: today, quantity: { value: 500, unit: 'ml' } });
      await createRecord({
        needId: otherNeed.id,
        petId: otherPet.id,
        careTakerId: victim.id,
        quantity: { value: 50, unit: 'ml' },
      });

      const res = await api('/api/me', {
        method: 'DELETE',
        body: { currentPassword: victim.password },
        cookie: victim.cookie,
      });
      expect(res.status).toBe(204);

      // The account is gone: the old cookie no longer resolves to a user.
      expect((await api('/api/me', { cookie: victim.cookie })).status).toBe(401);
      // Own pet cascaded away.
      expect(await getPetRow(ownPet.id)).toBeUndefined();
      // The record on the other owner's pet survives as an anonymous audit row.
      const records = await getRecordRows(otherNeed.id);
      expect(records).toHaveLength(1);
      expect(records[0]?.careTakerId).toBeNull();
      // The caretaker link itself is gone.
      const detail = await api(`/api/pets/${otherPet.id}`, { cookie: otherOwner.cookie });
      expect(detail.body.caretakers).toEqual([]);
    });
  });
});
