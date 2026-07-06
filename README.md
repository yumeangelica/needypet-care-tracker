# NeedyPet (Nuxt rebuild)

Mobile-first rebuild of NeedyPet — a warm, pastel pet-care app where owners
and caretakers share a pet's daily care tasks. This is the Nuxt 4 successor to
the legacy Vue/Vite + Express + MongoDB app (kept read-only next door as
reference).

Stack: Nuxt 4 · Vue 3 · TypeScript · Tailwind CSS v4 · Nuxt server routes ·
Drizzle ORM · SQLite locally / Postgres (Supabase) in production · Bun.

## Features

- Cookie-session auth (nuxt-auth-utils) with email confirmation, password
  reset, account deletion with cascades, and rate limiting on the auth
  endpoints (`documentation/auth-audit.md`)
- Pets with preset portraits **or an uploaded photo** (magic-byte validated,
  local disk in dev behind a storage abstraction)
- Daily care tasks (needs): max 10/day, pause/resume, lazy day rollover in the
  owner's timezone
- Care records: full and partial logs with auto-completion, manual
  time-of-day, edit/delete with an owner/caretaker permission matrix
- Caretaker management and caretaker self-removal
- Care diary (paginated history) and a weekly stats page (streak, per-day
  counts, per-category totals)
- Legacy JSON bundle importer (`documentation/migration.md`)

## Setup

```bash
bun install
# Create a .env with at least NUXT_SESSION_PASSWORD (32+ chars).
# See the environment variables table below for the full list.
bun run db:seed        # creates + seeds .data/needypet.sqlite
```

The seed prints demo credentials:

```
owner:     demo   / DemoPaws123!
caretaker: helper / HelperPaws123!
```

## Development

```bash
bun run dev            # http://localhost:3000
bun run test           # vitest unit tests (shared domain utilities)
bun run typecheck      # vue-tsc via nuxt typecheck
bun run db:generate    # regenerate sqlite migrations after schema changes
bun run db:generate:pg # regenerate the paired Postgres migrations
bun run db:seed        # reset + reseed the local database
bun run db:import      # import a legacy JSON bundle (see migration.md)
```

## Environment variables

| Variable | Purpose |
| --- | --- |
| `NUXT_SESSION_PASSWORD` | 32+ char secret sealing the session cookie (required) |
| `NUXT_DB_FILE` | local SQLite path (default `.data/needypet.sqlite`) |
| `NUXT_DB_URL` | set in production → switches the server to Postgres (`documentation/postgres.md`) |
| `NUXT_MAILER_PROVIDER` / `NUXT_MAILER_API_KEY` / `NUXT_MAILER_FROM` | `resend` + key + sender enables the HTTP mailer; unset = console mailer (dev) |
| `NUXT_UPLOADS_DIR` | pet photo directory for the local storage provider (default `.data/uploads`) |

## Layout

- `app/` — pages, layouts, components (mobile-first, bottom navigation)
- `server/api/` — session-cookie-authenticated API routes
- `server/db/` — Drizzle schemas (`schema.sqlite.ts` + `schema.pg.ts` in
  lockstep), migrations for both dialects, seed, legacy importer
- `shared/` — domain types, date/measurement/stats/pet-image utilities, zod
  schemas used by both client and server
- `documentation/` — `migration.md` (legacy import contract),
  `postgres.md` (production database path), `auth-audit.md` (auth hardening
  notes)

## Domain rules worth knowing

- Date-only values (`birthday`, need `dateFor`) are `YYYY-MM-DD` strings on
  the **pet owner's** local day and are compared as strings — never shifted
  through a browser timezone. Care record dates are full UTC timestamps with
  the acting user's IANA timezone stored for audit.
- Every need and care record has exactly one measurement: duration
  (1–1440 minutes) or quantity (ml/g). A record must match its parent
  need's measurement type.
- Owners control everything; caretakers see only their assigned pets and can
  view, log, and edit/delete only their own records. Rolled-over (archived)
  days are frozen.
- Pet images are the presets `dog`, `cat` or `bunny` (anything unknown
  coerces to cat) or an uploaded JPEG/PNG/WebP photo.
