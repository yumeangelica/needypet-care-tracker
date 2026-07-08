# Auth hardening notes

Reviewed 2026-07-06 while adding rate limiting. Covers the endpoints under
`server/api/auth/` plus the account routes in `server/api/me*`.

## Already sound before this pass

- **No account oracle**: login answers a generic `Invalid credentials` for both
  unknown user and wrong password; `forgot-password` always answers 200 with the
  same message; `confirm-email` / `reset-password` use one generic failure for
  bad-vs-expired tokens.
- **Tokens**: confirmation and reset tokens are random, stored only as SHA-256
  hashes (`server/utils/tokens.ts`), expire (24 h confirm / 1 h reset), and are
  single-use (cleared on redemption). A repeated forgot request rotates the
  token — the latest link wins.
- **Passwords**: hashed with `Bun.password` argon2id (OWASP first choice) via
  `server/utils/password.ts`; password strength enforced by the shared zod schema
  on both client and server. Legacy accounts keep their imported bcrypt hashes —
  `Bun.password.verify` accepts both, and a successful login upgrades a bcrypt hash
  to argon2id in place (rehash-on-login).
- **Sessions**: sealed cookie via nuxt-auth-utils, `httpOnly`, `secure`,
  `sameSite=lax`, 10 h max age. `requireAppUser` re-reads the user row on every
  request, so deleted accounts are locked out immediately even with a live
  cookie.
- **Reset flow confirms the mailbox**: completing a password reset also sets
  `emailConfirmed` — the link proves ownership.

## Added in this pass

Fixed-window in-memory rate limiting (`server/utils/rateLimit.ts`,
`tooManyRequests` 429 helper in `server/utils/errors.ts`, `Retry-After` header
set on every 429):

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

IP checks run before body validation so malformed requests count too; identity
keys (username/email) necessarily run after parsing. The per-account login
counter resets on success so a legitimate owner logging in often is never
locked out, while failures against one account stay capped even from many IPs.

## Caveats and follow-ups

- **Per-instance state**: counters live in process memory — they reset on
  restart/redeploy and are not shared between instances. Fine for a
  single-instance deployment; a shared store (Redis or a DB table) slots in
  behind `createRateLimiter()` if the app scales out.
- **`x-forwarded-for` trust**: `rateLimitIp` trusts the forwarded header. In
  production the app must sit behind a proxy that overwrites (not appends to)
  client-supplied `X-Forwarded-For`; exposed directly to the internet, the
  header is spoofable and the IP keys can be rotated by the attacker. The
  per-identity keys are the defence that survives IP spoofing.
- **No lockout notifications / audit log**: 429s are not persisted anywhere.
  If audit trails become a requirement, log (userName, ip, endpoint,
  timestamp) on blocked hits — never the password.
- **Session invalidation on reset**: sessions are stateless sealed cookies, so
  a password reset does not log out other devices; they stay valid until the
  10 h expiry. Acceptable for now; documented in `reset-password.post.ts`.
- **Hashing**: new hashes use `Bun.password` argon2id; imported legacy bcrypt
  hashes still verify and are upgraded to argon2id on the next successful login
  (rehash-on-login in `login.post.ts`). No forced reset needed.
