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
  `{ id, userName, sessionVersion, locale }`; `requireAppUser`
  (`server/utils/session.ts`) re-reads the user row on every request and
  rejects a stale version. Password reset revokes every existing cookie;
  password change revokes other devices and issues the caller a replacement
  ([ADR-0013](decisions/0013-revocable-sealed-cookie-sessions.md)).
- **Passwords**: `Bun.password` argon2id (OWASP first choice) via
  `server/utils/password.ts`; strength enforced by the shared zod schema on
  both client and server. Imported legacy bcrypt hashes still verify and are
  upgraded to argon2id on the next successful login (rehash-on-login in
  `server/api/auth/login.post.ts`) — no forced reset needed.
- **Email tokens** (`server/utils/tokens.ts`, Web Crypto only): confirmation
  and reset tokens are random, stored only as SHA-256 hashes, expire (24 h
  confirm / 1 h reset) and are atomically single-use (the conditional update
  clears the token). A repeated forgot-password request rotates the token —
  the latest link wins.
- **No account oracle**: login answers a generic `Invalid credentials` for
  both unknown user and wrong password; `forgot-password` always answers 200
  with the same message; `confirm-email`/`reset-password` use one generic
  failure for bad-vs-expired tokens.
- **Reset confirms the mailbox**: completing a password reset also sets
  `emailConfirmed` — the link proves ownership.
- **Usernames**: Unicode letters/marks/numbers plus a small identifier-safe
  punctuation set. Display spelling is preserved; an internal NFKC + lowercase
  key is uniquely indexed so lookup, limiter keys, imports and persistence use
  exactly the same canonical form.
- **Emailed links**: `NUXT_SITE_URL` supplies the canonical origin. It is
  validated, HTTPS-only and required in production, so a caller-controlled
  `Host` header cannot redirect confirmation/reset tokens. Production also
  requires complete Resend configuration; console mail exists only in dev.
  Configuration is resolved before account-specific mutation. Optional
  confirmation delivery failures do not undo registration/profile changes;
  explicit resend reports 503 and forgot-password preserves its always-200
  response. Provider calls abort after 10 seconds. Forgot-password schedules
  token persistence and delivery with Nitro `waitUntil`, so provider latency is
  not observable in the response time for a known address.
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

Fixed-window counters live in the shared SQLite/libSQL `rate_limits` table
(`server/utils/rateLimit.ts`). Each hit is one atomic upsert, so counters survive
redeploys and remain consistent across app instances. Expired rows are swept
through the `reset_at` index at most once per five minutes per process/DB
client, avoiding an extra remote write for every fresh key. `tooManyRequests()` sets a
`Retry-After` header on every 429.

IP checks run before body validation so malformed requests count too; identity
keys (username/email/user id) necessarily run after parsing or authentication.
`x-forwarded-for` is ignored by default. Setting
`NUXT_RATE_LIMIT_TRUST_PROXY=true` trusts the rightmost value supplied by one
configured edge proxy; direct deployments must leave it false. Successful
login/current-password verification clears its account counter.

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
| `PUT /api/me` | `password:user:<userId>` | 5 / 15 min, shared and cleared on successful verification |
| `PUT /api/me/password` | `password:user:<userId>` | 5 / 15 min, shared and cleared on successful verification |
| `DELETE /api/me` | `password:user:<userId>` | 5 / 15 min, shared and cleared on successful verification |
| `POST /api/pets/:petId/caretakers` | `caretaker-add:user:<userId>` | 20 / h |
| `POST /api/internal/daily-digest` | `digest:ip:<ip>` | 60 / min (after secret verification) |

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
| Anonymous internet → auth endpoints | credential stuffing, enumeration, mailbox flooding, Host-header poisoning | durable rate limits, no-oracle responses, atomic hashed tokens, argon2id, canonical public origin |
| Authenticated user → API | horizontal privilege escalation (another user's pets/records), caretaker overreach | per-request guards, owner/caretaker matrix, server-side re-validation |
| Browser → session | cookie theft, CSRF | httpOnly + secure + sameSite=lax sealed cookie, 10 h expiry |
| Cron caller → digest endpoint | unauthorized trigger, timing attacks on the secret | shared secret, constant-time compare, empty-secret = disabled |
| App → Turso / R2 / Resend | leaked provider credentials | secrets only in env vars (never committed; `.env*` gitignored), server-side use only |
| Public → photo bucket / `/uploads` | scraping, enumeration | unguessable UUID keys (see assessment below) |

**Assessments and accepted residual risks**:

- **Proxy trust is deployment-sensitive**: when
  `NUXT_RATE_LIMIT_TRUST_PROXY=true`, exactly one trusted edge must overwrite
  `X-Forwarded-For` or append the address it observed as the rightmost value.
  Enabling the flag on a directly exposed server makes IP keys spoofable.
- **Caretaker discovery is reduced, not eliminated**: not-found, owner and
  already-assigned targets return the same generic 400 response. A valid new
  target still returns 201 because adding that account is the requested side
  effect. Attempts are capped at 20 per owner per hour. Invitation/acceptance
  semantics would be required to hide that state completely.
- **CSRF**: no anti-CSRF token; the protection is `sameSite=lax` plus the
  JSON-body API shape. Acceptable for current browsers; revisit if any
  endpoint ever accepts form-encoded bodies or `GET` side effects.
- **Public photo bucket**: photos are world-readable at unguessable UUID URLs
  (`pets/<petId>/<uuid>.<ext>`); the local `/uploads` route is likewise
  unauthenticated. Deliberate — `publicUrl()` is synchronous by design, and
  signed/expiring URLs are out of scope. Pet photos only; nothing else may go
  in that bucket. A leaked URL stays accessible until the photo is replaced
  or deleted.
- **No lockout notifications / audit log**: counter state persists, but blocked
  request details are not an audit trail. If audit trails become a requirement,
  log (userName, ip, endpoint, timestamp) on blocked hits — never the password.

## Rules for changes touching this file's territory

- Never hardcode or log secrets, credentials, password material, mail tokens or
  provider response bodies; mail addresses appear only in the deliberate dev
  console mailer output.
- New endpoints: start from `requireAppUser` + the narrowest access guard,
  validate with a shared zod schema, and add integration tests for the 401 /
  403 / 404 paths (see [`testing-strategy.md`](testing-strategy.md)).
- Auth-flow changes should preserve the no-oracle property and the rate-limit
  table above — update both together, and update this document in the same
  change.
- Production mail links require a validated `NUXT_SITE_URL`; proxy trust must
  stay off unless the deployment topology matches the contract above.
