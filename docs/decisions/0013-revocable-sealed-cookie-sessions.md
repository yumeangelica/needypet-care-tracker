# 0013 — Revocable sealed-cookie sessions via a per-user version

**Status**: Accepted

Supersedes [ADR-0005](0005-cookie-sessions-no-jwt.md).

## Context

Sealed cookies remain the right fit for the same-origin Nuxt application, but
fully stateless cookies could not be revoked after a password reset. A stolen
cookie therefore stayed valid for up to the 10-hour expiry even after the
account owner recovered access.

## Decision

Keep `nuxt-auth-utils` sealed cookies and add `users.session_version`, starting
at zero. The cookie payload is `{ id, userName, sessionVersion, locale }`.
`requireAppUser` still reloads the user row on every authenticated request and
now rejects and clears a cookie whose version differs from the row.

Password reset increments the version and revokes every existing cookie.
Password change also increments it, then issues the calling browser a new
cookie with the returned version; other devices become stale. Logout continues
to clear only the calling browser's cookie.

## Consequences

- Sensitive credential changes gain immediate session revocation without a
  session table or a parallel authentication mechanism.
- Cookies issued before this migration lack a version and require one re-login.
- Every session-writing route must include the current version.
- The session remains sealed, `httpOnly`, `secure`, `sameSite=lax`, and limited
  to 10 hours. JWTs and browser storage remain out of scope.
