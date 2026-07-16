# 0005 — Sealed cookie sessions (nuxt-auth-utils), no JWTs

**Status**: Superseded by [0013](0013-revocable-sealed-cookie-sessions.md)

## Context

The legacy Express API used JWTs with a 10 h lifetime. In a same-origin Nuxt
monolith ([ADR-0001](0001-nuxt-monolith-rebuild.md)) there is no cross-origin
API to justify bearer tokens, and hand-rolled JWT handling is an easy place
to get auth wrong.

## Decision

Cookie sessions via nuxt-auth-utils: a sealed (encrypted) cookie —
`httpOnly`, `secure`, `sameSite=lax`, 10 h max age (matching the old JWT
lifetime). The payload stores only `{ id, userName, locale }`;
`requireAppUser` (`server/utils/session.ts`) re-reads the full user row on
every request, so handlers always see fresh data and deleted accounts are
locked out immediately. `locale` rides in the payload so SSR i18n needs no DB
read.

## Consequences

- No token storage, refresh or revocation machinery to maintain; the session
  secret is `NUXT_SESSION_PASSWORD` (32+ chars, required).
- Stateless sessions cannot be invalidated server-side: a password reset does
  not log out other devices until the 10 h expiry (accepted — see
  [`../security-model.md`](../security-model.md)).
- Never hand-roll JWTs or parallel auth paths; new auth surface goes through
  nuxt-auth-utils and `requireAppUser`.
