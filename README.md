# NeedyPet (Nuxt rebuild)

Mobile-first rebuild of NeedyPet — a warm, pastel pet-care app where owners
and caretakers share a pet's daily care tasks. This is the Nuxt 4 successor to
the legacy Vue/Vite + Express + MongoDB app (kept read-only next door as
reference).

Stack: Nuxt 4 · Vue 3 · TypeScript · Tailwind CSS v4 · Nuxt server routes ·
Drizzle ORM · SQLite locally / Postgres (Supabase) in production · Bun. Bun-native
throughout: `bun:sqlite` and `Bun.sql` drive the database, `Bun.password`
(argon2id) hashes passwords, and the test suite runs under `bun --bun vitest` — no
Node runtime required.

## Features

- Cookie-session auth (nuxt-auth-utils) with email confirmation, password
  reset, account deletion with cascades, and rate limiting on the auth
  endpoints (`documentation/auth-audit.md`)
- Pets with preset portraits **or an uploaded photo** (magic-byte validated,
  local disk in dev or Supabase Storage in production, behind one storage
  abstraction — see `documentation/deployment.md`)
- Daily care tasks (needs): max 10/day, pause/resume, lazy day rollover in the
  owner's timezone
- Care records: full and partial logs with auto-completion, manual
  time-of-day, edit/delete with an owner/caretaker permission matrix
- Caretaker management and caretaker self-removal
- Care diary (paginated history) and a weekly stats page (streak, per-day
  counts, per-category totals)
- Opt-in daily email digest of unfinished care tasks, sent per user on their
  own local evening via a secret-guarded cron endpoint
  (`documentation/deployment.md`)
- Legacy JSON bundle importer (`documentation/migration.md`)
- Installable PWA: web manifest + Workbox service worker (auto-updating), maskable
  icons, and an offline fallback page — API responses are never cached
  (`documentation/deployment.md`)
- English + Finnish UI (vue-i18n), language stored on the user profile and
  switchable from Profile — see *Internationalization* below

## Environment variables

| Variable | Purpose |
| --- | --- |
| `NUXT_SESSION_PASSWORD` | 32+ char secret sealing the session cookie (required) |
| `NUXT_DB_FILE` | local SQLite path (default `.data/needypet.sqlite`) |
| `NUXT_DB_URL` | set in production → switches the server to Postgres (`documentation/postgres.md`) |
| `NUXT_MAILER_PROVIDER` / `NUXT_MAILER_API_KEY` / `NUXT_MAILER_FROM` | `resend` + key + sender enables the HTTP mailer; unset = console mailer (dev) |
| `NUXT_UPLOADS_PROVIDER` | `local` (default) or `supabase` for pet photos (`documentation/deployment.md`) |
| `NUXT_UPLOADS_DIR` | pet photo directory for the local storage provider (default `.data/uploads`) |
| `NUXT_UPLOADS_SUPABASE_URL` / `NUXT_UPLOADS_SUPABASE_SERVICE_KEY` / `NUXT_UPLOADS_SUPABASE_BUCKET` | Supabase Storage config (required when the provider is `supabase`) |
| `NUXT_DIGEST_SECRET` | secret guarding the daily-digest cron endpoint; empty = disabled |
| `NUXT_DIGEST_HOUR` | local hour (0–23) each user must reach before their digest sends (default `18`) |

Full production setup (build, migrations, storage, digest cron) lives in
`documentation/deployment.md`.

## Layout

- `app/` — pages, layouts, components (mobile-first, bottom navigation)
- `server/api/` — session-cookie-authenticated API routes
- `server/db/` — Drizzle schemas (`schema.sqlite.ts` + `schema.pg.ts` in
  lockstep), migrations for both dialects, seed, legacy importer
- `shared/` — domain types, date/measurement/stats/pet-image utilities, zod
  schemas used by both client and server
- `tests/unit/` — pure-function vitest tests for the shared utilities;
  `tests/integration/` — endpoint tests that drive the built server over HTTP
  (permission matrix, rollover, record recompute, auth and profile flows)
- `public/` — static assets and PWA icons (`favicon.ico`, `pwa-192x192.png`,
  `pwa-512x512.png`, `maskable-512x512.png`, `apple-touch-icon.png`); the manifest
  and service worker are generated at build time by `@vite-pwa/nuxt`
- `documentation/` — `deployment.md` (production environment, storage, digest
  cron, PWA), `postgres.md` (production database path), `migration.md` (legacy
  import contract), `auth-audit.md` (auth hardening notes)

## Internationalization

The UI ships in **English (default) and Finnish**, using `vue-i18n` directly as a
Nuxt plugin (`app/plugins/i18n.ts`) rather than `@nuxtjs/i18n` — this is an auth
app with no need for per-locale routing or SEO, and no language ever appears in
the URL. Messages live in `app/i18n/en.ts` and `app/i18n/fi.ts` (namespaced:
`common`, `nav`, `auth`, `pets`, `needs`, `records`, `caretakers`, `profile`,
`stats`, `offline`, `errors`); the Finnish copy is a **transcreation**, keeping
the warm 🐾 tone rather than a literal translation. Finnish plural rules and named
interpolation are handled by vue-i18n (e.g. task counts, care-team announcements).

- The active language is stored on the user's profile (`users.locale`, default
  `'en'`) and changed from the **Profile** page. There is no browser-language
  autodetect.
- The SSR i18n plugin reads the locale from the session (cached on the session
  payload), so the server and client render the same language with no
  hydration-time flicker. Signed-out pages (landing / login / register) are
  always English.
- `<html lang>` and the in-app `Intl.DateTimeFormat` date/weekday labels follow
  the active locale; the PWA manifest `lang` stays `en` (it is generated once at
  build time). The daily digest email is localized to the recipient's locale;
  confirmation/reset emails stay English.
- A unit test (`tests/unit/i18n.spec.ts`) enforces en/fi key parity, so a new key
  added to one locale but not the other fails the suite.

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
