# Architecture

System-level map of NeedyPet: modules, boundaries, data flows and the
invariants that keep the design coherent. The rationale behind each major
choice lives in [`decisions/`](decisions/README.md) (ADRs); the domain rules
live in [`domain-model.md`](domain-model.md).

## Shape

One Nuxt 4 application is the whole system. Nuxt server routes (Nitro) are the
only API — there is no separate backend server ([ADR-0001](decisions/0001-nuxt-monolith-rebuild.md)).
The runtime is Bun end to end and Web-standard by design: `bun:sqlite` drives
the local database, `Bun.password` (argon2id) hashes passwords,
`Bun.write`/`Bun.file` handle uploads, and Web Crypto powers tokens and R2
request signing — no `node:crypto`, no Node runtime required
([ADR-0003](decisions/0003-bun-native-web-standard.md)).

```
Browser (Vue 3 SSR + PWA)
   │  cookie session, JSON DTOs (strings only — no Date objects on the wire)
   ▼
Nitro server routes (server/api/**)          ← the only API surface
   │  Drizzle ORM
   ▼
SQLite: bun:sqlite (dev) / libSQL/Turso (prod, same dialect)
   plus: Cloudflare R2 or local disk (pet photos), Resend prod / console dev (mail)
```

## Module map

| Path | Responsibility |
| --- | --- |
| `nuxt.config.ts` | Modules (nuxt-auth-utils, @vite-pwa/nuxt), PWA manifest + Workbox, runtimeConfig (db/mailer/uploads/digest/session), `useI18n` auto-import preset, Nitro `bun` preset, `/offline` prerender |
| `app/pages/` | File-based routes: landing, auth flows, `home`, `profile`, `pets/new`, `pets/[petId]/{index,edit,history,stats}`, `offline` |
| `app/components/` | 16 flat components (`AppButton`, `AppModal`, `NeedCard`, `NeedForm`, `CareRecordForm`, `CareRecordList`, `CaretakerManager`, `PetForm`, `PetImagePicker`, `DayNavigator`, `TaskProgressBadge`, …) |
| `app/middleware/auth.ts` | Route guard for signed-in pages |
| `app/plugins/i18n.ts` + `app/i18n/{index,en,fi}.ts` | vue-i18n as a plain plugin; locale read from the session for flicker-free SSR |
| `app/utils/fetchErrors.ts` | Resolves API `messageKey` errors to localized copy |
| `app/assets/css/main.css` | Design tokens (colors, radii, 44px tap targets, focus-visible) — components use `var(--…)`, not literals |
| `server/api/` | Session-authenticated route handlers (full surface below) |
| `server/routes/uploads/[...path].get.ts` | Serves local-disk pet photos (dev provider) |
| `server/db/` | `schema.sqlite.ts` (the single schema), `index.ts` (`useDb`, `withTransaction`), `migrate.ts`, `migrations/sqlite/`, `seed.ts`, `import-legacy.ts` + `import/` |
| `server/plugins/01.migrate.ts` | Dev-only auto-migrate on boot (production migrates at deploy time) |
| `server/utils/` | `session`, `petAccess`, `validate`, `errors`, `rateLimit`, `tokens`, `password`, `mailer`, `rollover`, `needSchedules`, `careRecords`, `mappers`, `imageStorage` |
| `shared/` (`#shared` alias) | Isomorphic code: `schemas/` (zod, client + server), `types/domain.ts` (DTOs), `utils/` (`temporal`, `date`, `datetime`, `measurement`, `careRules`, `rollover`, `recurrence`, `records`, `stats`, `digest`, `petImages`, `imageValidation`) |
| `tests/` | `unit/` (shared logic, schemas, i18n parity, guardrails) and `integration/` (HTTP against a built server) — see [`testing-strategy.md`](testing-strategy.md) |

## Request flow

Every authenticated API handler follows the same pipeline:

1. **Session** — `requireAppUser(event)` (`server/utils/session.ts`) requires a
   valid sealed cookie *and* re-reads the full user row per request. The
   session payload stores only `{ id, userName, sessionVersion, locale }`.
   Deleted accounts and cookies invalidated by a password reset/change fail
   immediately ([ADR-0013](decisions/0013-revocable-sealed-cookie-sessions.md)).
2. **Access guard** — `requirePetOwner(petId, userId)` or
   `requirePetAccess(petId, userId)` (`server/utils/petAccess.ts`). Missing
   pet → 404; existing pet without permission → 403.
3. **Input validation** — `readValidatedBodyOr422(event, schema)`
   (`server/utils/validate.ts`) with a zod schema from `shared/schemas/` —
   the same schema the client form already ran.
4. **Business rules** — pure functions from `shared/utils/` (e.g.
   `careRules.ts`) decide, handlers orchestrate; violations throw 400 via
   `server/utils/errors.ts`.
5. **Persistence** — Drizzle through `useDb()`; multi-statement writes go
   through `withTransaction()`. Rows are mapped to domain DTOs by
   `server/utils/mappers.ts` before leaving the API.

Reading a pet additionally triggers the **lazy day rollover**
(`server/utils/rollover.ts` → pure plan in `shared/utils/rollover.ts`): open
instances from past days are archived and each due active recurrence rule
(`need_schedules`, [ADR-0015](decisions/0015-recurring-need-schedules.md))
materializes today's instance, guarded by `pets.lastRolledNeedDate`
([ADR-0009](decisions/0009-lazy-rollover.md)).

## API surface

```
POST /api/auth/{register,login,logout,confirm-email,resend-confirmation,forgot-password,reset-password}
GET|PUT|DELETE /api/me            PUT /api/me/password
GET|POST /api/pets                GET|PUT|DELETE /api/pets/[petId]
GET  /api/pets/[petId]/{records,stats}
POST|DELETE /api/pets/[petId]/image
POST /api/pets/[petId]/caretakers DELETE /api/pets/[petId]/caretakers/[userId]
POST /api/pets/[petId]/needs      PUT|DELETE /api/pets/[petId]/needs/[needId]
POST /api/pets/[petId]/needs/[needId]/toggle
PUT|DELETE /api/pets/[petId]/schedules/[scheduleId]
POST /api/pets/[petId]/schedules/[scheduleId]/toggle
POST /api/pets/[petId]/needs/[needId]/records
PATCH|DELETE /api/pets/[petId]/needs/[needId]/records/[recordId]
POST /api/internal/daily-digest   (cron only, guarded by NUXT_DIGEST_SECRET)
GET  /uploads/[...path]           (non-API: local-disk photo serving)
```

## Client state: deliberately store-free

There is **no Pinia, no `defineStore`, no global `useState`** — and none
should be added ([ADR-0006](decisions/0006-store-free-client-state.md)). The
server is the single source of truth:

- `useUserSession()` (nuxt-auth-utils) is the auth/session state.
- Pages fetch DTOs with `useFetch`/`$fetch` and refresh after mutations.
- Forms hold component-local `ref`/`reactive` state only.

## Error taxonomy

| Status | Meaning | Thrown by |
| --- | --- | --- |
| 400 | Business-rule violation | `badRequest()` in `server/utils/errors.ts` |
| 401 | Not authenticated / session invalid | `unauthorized()` |
| 403 | Authenticated but not permitted | `forbidden()` |
| 404 | Resource does not exist | `notFound()` |
| 422 | Schema validation failure — `{ message: 'Validation error', errorDetails: fieldErrors }` | `readValidatedBodyOr422()` |
| 429 | Rate limited (`Retry-After` header set) | `tooManyRequests()` |

The API `message` stays English (stable for clients and tests); user-facing
errors additionally carry an i18n `messageKey` in `error.data`, which the
client resolves to the active locale via `app/utils/fetchErrors.ts`
([ADR-0012](decisions/0012-error-message-key-localization.md)). zod validation
messages are themselves i18n keys (e.g. `'validation.quantityMin'`), resolved
by the forms.

## Database provider seam

`useDb()` (`server/db/index.ts`) switches on `NUXT_DB_URL`:

- unset → local `bun:sqlite` file (`NUXT_DB_FILE`, default
  `.data/needypet.sqlite`) with `PRAGMA journal_mode = WAL` and
  `PRAGMA foreign_keys = ON` (the cascade/SET NULL deletes depend on it);
- a `libsql://` Turso URL (+ `NUXT_DB_AUTH_TOKEN`) → `drizzle-orm/libsql` —
  same dialect, same schema, same migration set
  ([ADR-0002](decisions/0002-sqlite-only-single-dialect.md)).

`withTransaction()` is provider-aware: drizzle's interactive `transaction()`
on libSQL, a manual `begin immediate`/`commit`/`rollback` on bun:sqlite (whose
driver only accepts synchronous transaction callbacks — accepted for the
single-user dev path). All call sites use the awaited query style, which works
against both drivers; `firstRow()` is the awaited-style stand-in for `.get()`.

Migrations: one Drizzle schema (`server/db/schema.sqlite.ts`), regenerated with
`bun run db:generate` into `server/db/migrations/sqlite/`, applied with
`bun run db:migrate` (deploy-time, idempotent, provider-aware). Dev boots
auto-migrate via `server/plugins/01.migrate.ts`.

## i18n

Plain `vue-i18n` as a Nuxt plugin — **not** `@nuxtjs/i18n`
([ADR-0007](decisions/0007-plain-vue-i18n.md)). `app/i18n/en.ts` is the
source-of-truth message shape; `fi.ts` must mirror every key
(`tests/unit/i18n.spec.ts` enforces parity and compiles every message). The
locale lives on the user profile and is cached in the session payload, so SSR
and client render the same language with no hydration flicker; signed-out
pages are English. Finnish is a transcreation, not a literal translation.

## Dates and time

All date/time computation goes through the TC39 Temporal API, imported only
via `shared/utils/temporal.ts` ([ADR-0004](decisions/0004-temporal-behind-seam.md)).
Temporal is internal to computation: storage, JSON DTOs and zod schemas stay
`YYYY-MM-DD` / ISO-UTC **strings**. `new Date` does not exist in app/server/
shared code. The full date contract (owner-local care day, UTC record
timestamps) is in [`domain-model.md`](domain-model.md#dates-and-timezones)
and [ADR-0008](decisions/0008-owner-timezone-care-day.md).

## PWA

`@vite-pwa/nuxt` generates the manifest and a Workbox service worker at build
time (`registerType: 'autoUpdate'`; disabled in dev). The SW precaches the app
shell and falls back to the prerendered `/offline` page for cache-missing
navigations. **API responses (`/api/**`) and uploads (`/uploads/**`) are never
cached** (Workbox `navigateFallbackDenylist`) — care data, sessions and
permissions are always fetched fresh.

## Invariants

Things that must stay true. Each links to its rationale; the statically
checkable ones are enforced by `tests/unit/guardrails.spec.ts`.

| Invariant | Rationale | Enforced by |
| --- | --- | --- |
| No separate API server; backend logic lives in Nuxt server routes | [ADR-0001](decisions/0001-nuxt-monolith-rebuild.md) | review |
| One SQLite dialect, one schema, one migration set (bun:sqlite ↔ libSQL) | [ADR-0002](decisions/0002-sqlite-only-single-dialect.md) | review |
| No `node:crypto` — Web Crypto / Bun natives only | [ADR-0003](decisions/0003-bun-native-web-standard.md) | guardrails |
| `temporal-polyfill` imported only via `shared/utils/temporal.ts`; no `new Date` in app/server/shared | [ADR-0004](decisions/0004-temporal-behind-seam.md) | guardrails |
| Versioned cookie sessions via nuxt-auth-utils; no hand-rolled JWTs | [ADR-0013](decisions/0013-revocable-sealed-cookie-sessions.md) | review |
| No Pinia / global stores; server is the source of truth | [ADR-0006](decisions/0006-store-free-client-state.md) | guardrails |
| vue-i18n as a plain plugin; en/fi key parity | [ADR-0007](decisions/0007-plain-vue-i18n.md) | `i18n.spec.ts` |
| Date-only values are owner-local `YYYY-MM-DD` strings; record `date` is UTC ISO | [ADR-0008](decisions/0008-owner-timezone-care-day.md) | unit + integration tests |
| Rollover is lazy, idempotent, never backfills | [ADR-0009](decisions/0009-lazy-rollover.md) | `rollover.spec.ts` (unit + integration) |
| Need instances materialize from `need_schedules` rules; frozen history survives rule deletion (`SET NULL`) | [ADR-0015](decisions/0015-recurring-need-schedules.md) | `recurrence.spec.ts` + `rollover.spec.ts` |
| Exactly one bounded measurement per need/record, matching types | [ADR-0014](decisions/0014-bounded-single-measurements.md) | zod + DB CHECK + tests |
| API responses never cached by the service worker | Workbox denylist in `nuxt.config.ts` | config |
