import { describe, expect, it } from 'vitest';
import {
  TEST_PASSWORD,
  api,
  createUser,
  createUserWithSession,
  errorDetails,
  errorMessage,
  getUserRow,
  plantEmailConfirmToken,
  plantPasswordResetToken,
  sessionCookieFrom,
  uniqueIp,
  uniqueName,
} from './helpers';

const TZ = 'Europe/Helsinki';

function registerBody(userName: string) {
  return { userName, email: `${userName}@example.com`, newPassword: TEST_PASSWORD, timezone: TZ };
}

describe('register', () => {
  it('creates an unconfirmed account, starts a session and stores a confirm token', async () => {
    const userName = uniqueName('reg');
    const res = await api('/api/auth/register', { method: 'POST', body: registerBody(userName) });
    expect(res.status).toBe(201);
    expect(res.body.user.emailConfirmed).toBe(false);

    const cookie = sessionCookieFrom(res);
    const me = await api('/api/me', { cookie });
    expect(me.status).toBe(200);
    expect(me.body.userName).toBe(userName);

    const row = await getUserRow(res.body.user.id);
    expect(row?.emailConfirmToken).toBeTruthy();
    expect(row?.emailConfirmExpiresAt).toBeTruthy();
  });

  it('rejects a taken username and a taken email', async () => {
    const existing = await createUser();

    const dupName = await api('/api/auth/register', {
      method: 'POST',
      body: { ...registerBody(uniqueName('dup')), userName: existing.userName },
    });
    expect(dupName.status).toBe(400);
    expect(errorMessage(dupName.body)).toBe('Username already exists');

    const dupEmail = await api('/api/auth/register', {
      method: 'POST',
      body: { ...registerBody(uniqueName('dup')), email: existing.email },
    });
    expect(dupEmail.status).toBe(400);
    expect(errorMessage(dupEmail.body)).toBe('Email already exists');
  });

  it('422s a weak password and an invalid timezone with field details', async () => {
    const weak = await api('/api/auth/register', {
      method: 'POST',
      body: { ...registerBody(uniqueName('weak')), newPassword: 'kitten' },
    });
    expect(weak.status).toBe(422);
    expect(errorDetails(weak.body)?.newPassword).toBeTruthy();

    const badTz = await api('/api/auth/register', {
      method: 'POST',
      body: { ...registerBody(uniqueName('tz')), timezone: 'Mars/Olympus_Mons' },
    });
    expect(badTz.status).toBe(422);
    expect(errorDetails(badTz.body)?.timezone).toBeTruthy();
  });

  it('rate limits registration per ip (429 before validation)', async () => {
    const ip = uniqueIp();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const res = await api('/api/auth/register', { method: 'POST', body: {}, ip });
      expect(res.status).toBe(422);
    }
    const blocked = await api('/api/auth/register', { method: 'POST', body: {}, ip });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toBeTruthy();
  });
});

describe('login and logout', () => {
  it('logs in with valid credentials and the session works', async () => {
    const user = await createUser();
    const res = await api('/api/auth/login', {
      method: 'POST',
      body: { userName: user.userName, password: user.password },
    });
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(user.id);

    const me = await api('/api/me', { cookie: sessionCookieFrom(res) });
    expect(me.status).toBe(200);
  });

  it('answers 401 with one generic message for wrong password and unknown user', async () => {
    const user = await createUser();
    const wrongPassword = await api('/api/auth/login', {
      method: 'POST',
      body: { userName: user.userName, password: 'WrongPaws123!' },
    });
    expect(wrongPassword.status).toBe(401);
    expect(errorMessage(wrongPassword.body)).toBe('Invalid credentials');

    const unknownUser = await api('/api/auth/login', {
      method: 'POST',
      body: { userName: uniqueName('ghost'), password: 'WrongPaws123!' },
    });
    expect(unknownUser.status).toBe(401);
    expect(errorMessage(unknownUser.body)).toBe('Invalid credentials');
  });

  it('logout clears the session cookie', async () => {
    const user = await createUserWithSession();
    const out = await api('/api/auth/logout', { method: 'POST', cookie: user.cookie });
    expect(out.status).toBe(200);

    // Sessions are stateless sealed cookies; logout works by overwriting the
    // cookie with an empty one. The cleared cookie must not authenticate.
    const clearedCookie = sessionCookieFrom(out);
    const me = await api('/api/me', { cookie: clearedCookie });
    expect(me.status).toBe(401);
  });

  it('rate limits login per account after 5 attempts in the window', async () => {
    const user = await createUser();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const res = await api('/api/auth/login', {
        method: 'POST',
        body: { userName: user.userName, password: 'WrongPaws123!' },
      });
      expect(res.status).toBe(401);
    }
    // 6th hit on the per-account counter - even the correct password is
    // refused until the window resets.
    const blocked = await api('/api/auth/login', {
      method: 'POST',
      body: { userName: user.userName, password: user.password },
    });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toBeTruthy();
  });
});

describe('confirm email', () => {
  it('confirms with a valid token exactly once', async () => {
    const user = await createUser({ emailConfirmed: false });
    const rawToken = `confirm-${crypto.randomUUID()}`;
    await plantEmailConfirmToken(user.id, rawToken);

    const ok = await api('/api/auth/confirm-email', { method: 'POST', body: { token: rawToken } });
    expect(ok.status).toBe(200);

    const row = await getUserRow(user.id);
    expect(row?.emailConfirmed).toBe(true);
    expect(row?.emailConfirmToken).toBeNull();
    expect(row?.emailConfirmExpiresAt).toBeNull();

    const reused = await api('/api/auth/confirm-email', { method: 'POST', body: { token: rawToken } });
    expect(reused.status).toBe(400);
  });

  it('rejects an expired token', async () => {
    const user = await createUser({ emailConfirmed: false });
    const rawToken = `expired-${crypto.randomUUID()}`;
    await plantEmailConfirmToken(user.id, rawToken, new Date(Date.now() - 60_000).toISOString());

    const res = await api('/api/auth/confirm-email', { method: 'POST', body: { token: rawToken } });
    expect(res.status).toBe(400);
    const row = await getUserRow(user.id);
    expect(row?.emailConfirmed).toBe(false);
  });
});

describe('password reset', () => {
  it('always answers 200 to forgot-password, storing a token only for known emails', async () => {
    const unknown = await api('/api/auth/forgot-password', {
      method: 'POST',
      body: { email: `${uniqueName('nobody')}@example.com` },
    });
    expect(unknown.status).toBe(200);

    const user = await createUser();
    const known = await api('/api/auth/forgot-password', { method: 'POST', body: { email: user.email } });
    expect(known.status).toBe(200);
    expect(known.body.message).toBe(unknown.body.message);

    const row = await getUserRow(user.id);
    expect(row?.passwordResetToken).toBeTruthy();
    expect(row?.passwordResetExpiresAt).toBeTruthy();
  });

  it('resets the password with a valid token exactly once and confirms the email', async () => {
    const user = await createUser({ emailConfirmed: false });
    const rawToken = `reset-${crypto.randomUUID()}`;
    await plantPasswordResetToken(user.id, rawToken);

    const newPassword = 'FreshPaws456!';
    const ok = await api('/api/auth/reset-password', {
      method: 'POST',
      body: { token: rawToken, newPassword },
    });
    expect(ok.status).toBe(200);

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

    // The reset link proves mailbox ownership, so the email is confirmed too.
    const row = await getUserRow(user.id);
    expect(row?.emailConfirmed).toBe(true);
    expect(row?.passwordResetToken).toBeNull();

    const reused = await api('/api/auth/reset-password', {
      method: 'POST',
      body: { token: rawToken, newPassword: 'OtherPaws789!' },
    });
    expect(reused.status).toBe(400);
  });

  it('422s a weak new password', async () => {
    const user = await createUser();
    const rawToken = `weakreset-${crypto.randomUUID()}`;
    await plantPasswordResetToken(user.id, rawToken);

    const res = await api('/api/auth/reset-password', {
      method: 'POST',
      body: { token: rawToken, newPassword: 'kitten' },
    });
    expect(res.status).toBe(422);
    expect(errorDetails(res.body)?.newPassword).toBeTruthy();
  });
});
