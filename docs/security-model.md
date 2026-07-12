# Security model

How NeedyPet authenticates, authorizes and protects data, plus a practical
threat model. Sections marked **fact** describe verified code behaviour;
sections marked **assessment** are judgment calls that should be revisited if
the deployment shape changes. The auth-hardening review notes from 2026-07-06
are folded in below.

## Authentication (fact)

- **Sessions**: sealed cookie via nuxt-auth-utils — `httpOnly`, `secure`,
  `sameSite=lax`, 10 h max age (matches the old JWT lifetime;
  `nuxt.config.ts` `runtimeConfig.session`). The payload stores only
  `{ id, userName, locale }`; `requireAppUser` (`server/utils/session.ts`)
  re-reads the user row on every request, so a deleted account is locked out
  immediately even with a live cookie ([ADR-0005](decisions/0005-cookie-sessions-no-jwt.md)).
- **Passwords**: `Bun.password` argon2id (OWASP first choice) via
  `server/utils/password.ts`; strength enforced by the shared zod schema on
  both client and server. Imported legacy bcrypt hashes still verify and are
  upgraded to argon2id on the next successful login (rehash-on-login in
  `server/api/auth/login.post.ts`) — no forced reset needed.
- **Email tokens** (`server/utils/tokens.ts`, Web Crypto only): confirmation
  and reset tokens are random, stored only as SHA-256 hashes, expire (24 h
  confirm / 1 h reset) and are single-use (cleared on redemption). A repeated
  forgot-password request rotates the token — the latest link wins.
- **No account oracle**: login answers a generic `Invalid credentials` for
  both unknown user and wrong password; `forgot-password` always answers 200
  with the same message; `confirm-email`/`reset-password` use one generic
  failure for bad-vs-expired tokens.
- **Reset confirms the mailbox**: completing a password reset also sets
  `emailConfirmed` — the link proves ownership.
- `toPublicUser` strips password hash and token fields from every user
  payload the API returns.

## Authorization (fact)

Two roles per pet — owner and caretaker — enforced server-side on every
request by `requirePetOwner`/`requirePetAccess` (`server/utils/petAccess.ts`)
plus the record rules in `shared/utils/careRules.ts`. The full permission
matrix is in [`domain-model.md`](domain-model.md#permissions). Existence is
not leaked to the unauthorized: a pet that does not exist is 404, one the
user may not touch is 403.

The digest cron endpoint (`POST /api/internal/daily-digest`) is guarded by
`NUXT_DIGEST_SECRET` compared in constant time via Web Crypto digests; an
empty secret disables the endpoint entirely (always 401).

## Rate limiting (fact)

Fixed-window in-memory limiter (`server/utils/rateLimit.ts`);
`tooManyRequests()` sets a `Retry-After` header on every 429. IP checks run
before body validation so malformed requests count too; identity keys
(username/email) necessarily run after parsing. The per-account login counter
resets on success, so a legitimate owner logging in often is never locked
out, while failures against one account stay capped even from many IPs.

| Endpoint | Key(s) | Limit |
| --- | --- | --- |
| `POST /api/auth/login` | `login:ip:<ip>` | 20 / 15 min |
| | `login:user:<userName>` | 5 / 15 min, cleared on successful login |
| `POST /api/auth/register` | `register:ip:<ip>` | 5 / h |
| `POST /api/auth/forgot-password` | `forgot:ip:<ip>` | 5 / h |
| | `forgot:email:<email>` | 3 / h (mailbox flooding) |
| `POST /api/auth/reset-password` | `reset:ip:<ip>` | 10 / h |
| `POST /api/auth/confirm-email` | `confirm:ip:<ip>` | 10 / h |
| `POST /api/auth/resend-confirmation` | `resend:user:<userId>` | 3 / h |

## Input validation and uploads (fact)

- Every mutating endpoint validates its body against a shared zod schema via
  `readValidatedBodyOr422` before touching the database; business rules are
  re-checked server-side regardless of what the client validated.
- Pet photo uploads are magic-byte validated (JPEG/PNG/WebP,
  `shared/utils/imageValidation.ts`), size-capped (5 MB,
  `runtimeConfig.uploads.maxBytes`), stored under generated
  UUID keys, and written server-side only (R2 SigV4 signing never reaches the
  browser). The local `/uploads` route resolves paths against the uploads dir
  (`resolve` + separator check in `server/routes/uploads/[...path].get.ts`)
  to prevent traversal.

## Threat model

**Assets**: account credentials and email addresses; pet care data (pets,
needs, records — low sensitivity but private); uploaded pet photos; the
session-sealing secret and provider tokens (Turso, R2, Resend, digest).

**Actors and trust boundaries**:

| Boundary | Threats considered | Mitigations |
| --- | --- | --- |
| Anonymous internet → auth endpoints | credential stuffing, enumeration, mailbox flooding | rate limits, no-oracle responses, hashed single-use tokens, argon2id |
| Authenticated user → API | horizontal privilege escalation (another user's pets/records), caretaker overreach | per-request guards, owner/caretaker matrix, server-side re-validation |
| Browser → session | cookie theft, CSRF | httpOnly + secure + sameSite=lax sealed cookie, 10 h expiry |
| Cron caller → digest endpoint | unauthorized trigger, timing attacks on the secret | shared secret, constant-time compare, empty-secret = disabled |
| App → Turso / R2 / Resend | leaked provider credentials | secrets only in env vars (never committed; `.env*` gitignored), server-side use only |
| Public → photo bucket / `/uploads` | scraping, enumeration | unguessable UUID keys (see assessment below) |

**Assessments and accepted residual risks**:

- **Per-instance rate-limit state**: counters live in process memory — they
  reset on restart/redeploy and are not shared between instances. Fine for a
  single-instance deployment; a shared store (Redis or a DB table) slots in
  behind `createRateLimiter()` before scaling out (tracked in
  [`../tasks/backlog.md`](../tasks/backlog.md)).
- **`x-forwarded-for` trust**: `rateLimitIp` trusts the forwarded header. In
  production the app must sit behind a proxy that overwrites (not appends
  to) client-supplied `X-Forwarded-For`; exposed directly to the internet the
  header is spoofable and IP keys can be rotated by the attacker. The
  per-identity keys are the defence that survives IP spoofing.
- **CSRF**: no anti-CSRF token; the protection is `sameSite=lax` plus the
  JSON-body API shape. Acceptable for current browsers; revisit if any
  endpoint ever accepts form-encoded bodies or `GET` side effects.
- **Session invalidation on reset**: sessions are stateless sealed cookies,
  so a password reset does not log out other devices; they stay valid until
  the 10 h expiry. Accepted; documented in `reset-password.post.ts`.
- **Public photo bucket**: photos are world-readable at unguessable UUID URLs
  (`pets/<petId>/<uuid>.<ext>`); the local `/uploads` route is likewise
  unauthenticated. Deliberate — `publicUrl()` is synchronous by design, and
  signed/expiring URLs are out of scope. Pet photos only; nothing else may go
  in that bucket. A leaked URL stays accessible until the photo is replaced
  or deleted.
- **No lockout notifications / audit log**: 429s are not persisted. If audit
  trails become a requirement, log (userName, ip, endpoint, timestamp) on
  blocked hits — never the password.

## Rules for changes touching this file's territory

- Never hardcode or log secrets, credentials or password material; mail
  addresses appear in logs only via the dev console mailer.
- New endpoints: start from `requireAppUser` + the narrowest access guard,
  validate with a shared zod schema, and add integration tests for the 401 /
  403 / 404 paths (see [`testing-strategy.md`](testing-strategy.md)).
- Auth-flow changes should preserve the no-oracle property and the rate-limit
  table above — update both together, and update this document in the same
  change.
