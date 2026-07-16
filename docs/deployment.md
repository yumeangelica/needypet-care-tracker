# Deployment

Production checklist for hosting NeedyPet. The app is SQLite-only: `bun:sqlite`
locally, and libSQL/Turso in production (same dialect, schema and migrations — no
dialect drift). This file covers the full runtime environment, pet-photo storage,
and the daily-digest cron.

## Build and run

```bash
bun install
bun run build          # produces .output/
bun run preview        # serves .output/server/index.mjs with Bun
```

Run migrations at deploy time, never at runtime (the dev-only migrate plugin is
skipped in production). `db:migrate` targets whichever database the environment
points at and is idempotent:

```bash
# Local SQLite host: migrates the file at NUXT_DB_FILE.
bun run db:migrate

# Turso/libSQL: same migration set, applied to the remote DB.
NUXT_DB_URL=libsql://<db>-<org>.turso.io NUXT_DB_AUTH_TOKEN=<token> bun run db:migrate
```

## Environment variables

| Variable | Purpose |
| --- | --- |
| `NUXT_SESSION_PASSWORD` | 32+ char secret sealing the session cookie (**required**) |
| `NUXT_SITE_URL` | canonical public app URL used in emailed links, e.g. `https://needypet.example` (**required in production**) |
| `NUXT_RATE_LIMIT_TRUST_PROXY` | set to `true` only behind the single trusted edge described below (default false) |
| `NUXT_DB_FILE` | local SQLite path (default `.data/needypet.sqlite`) |
| `NUXT_DB_URL` | set (a `libsql://` Turso URL) → uses the remote libSQL DB instead of the local file |
| `NUXT_DB_AUTH_TOKEN` | Turso database auth token (required with a `libsql://` URL) |
| `NUXT_MAILER_PROVIDER` | production requires `resend`; unset is console mailer in dev only |
| `NUXT_MAILER_API_KEY` | Resend API key (**required in production**) |
| `NUXT_MAILER_FROM` | sender address, e.g. `NeedyPet <no-reply@yourdomain>` (**required in production**) |
| `NUXT_MAILER_API_URL` | Resend-compatible HTTPS endpoint (defaults to Resend's API) |
| `NUXT_UPLOADS_PROVIDER` | `local` (default) or `r2` (Cloudflare R2) for pet photos |
| `NUXT_UPLOADS_DIR` | local photo directory (default `.data/uploads`; local provider only) |
| `NUXT_UPLOADS_R2_ENDPOINT` | R2 S3 API endpoint, e.g. `https://<accountId>.r2.cloudflarestorage.com` |
| `NUXT_UPLOADS_R2_ACCESS_KEY_ID` | R2 access key id (server-side only) |
| `NUXT_UPLOADS_R2_SECRET_ACCESS_KEY` | R2 secret access key (server-side only) |
| `NUXT_UPLOADS_R2_BUCKET` | R2 bucket name for pet photos |
| `NUXT_UPLOADS_R2_PUBLIC_BASE_URL` | public read base, e.g. `https://pub-<hash>.r2.dev` or a custom domain |
| `NUXT_DIGEST_SECRET` | shared secret guarding the digest cron endpoint; **empty = endpoint disabled (always 401)** |
| `NUXT_DIGEST_HOUR` | local hour (0–23) each user must reach before that day's digest sends (default `18`) |

## Public origin and proxy trust

`NUXT_SITE_URL` must be the externally reachable HTTPS origin. Production
mail links fail closed when it is missing, non-HTTPS or invalid; request `Host` headers are
never used for confirmation, reset or digest links. Paths in the configured URL
are discarded, so configure an origin such as `https://needypet.example`.

Production email routes also fail closed before account mutation unless the
mailer provider is `resend` with a non-empty API key and sender. Console mail is
development-only because it intentionally prints copyable links and recipients.
Resend requests abort after 10 seconds. Forgot-password hands token persistence
and delivery to Nitro `waitUntil`; long-lived Bun hosts finish that promise in
process, while serverless adapters must support Nitro's background-work hook.

Rate-limit IP keys use the direct socket address by default. Set
`NUXT_RATE_LIMIT_TRUST_PROXY=true` only when one trusted edge proxy either
overwrites `X-Forwarded-For` or appends the client address it observed as the
rightmost value. Leave the flag false for a directly exposed server or an
unverified multi-proxy chain.

## Database (Turso)

The recommended production database is [Turso](https://turso.tech) — hosted
libSQL, i.e. the same SQLite dialect, schema and migration set the app already
uses locally, so there is zero dialect drift. The free tier is comfortably
enough for this app.

1. Install the Turso CLI and sign up, then create the database:
   `turso db create needypet`.
2. Get the connection URL and an auth token:
   `turso db show needypet --url` → `NUXT_DB_URL` (a `libsql://...` URL), and
   `turso db tokens create needypet` → `NUXT_DB_AUTH_TOKEN`.
3. Apply the migrations before the first start (and on every deploy that adds
   a migration): `NUXT_DB_URL=... NUXT_DB_AUTH_TOKEN=... bun run db:migrate`.
4. Verify foreign-key enforcement once per database — account/pet deletion
   relies on `ON DELETE CASCADE`: in `turso db shell needypet` run
   `PRAGMA foreign_keys;` and expect `1`. Turso enforces foreign keys by
   default; this check just pins the assumption.

With `NUXT_DB_URL` unset the app falls back to the local `bun:sqlite` file
(`NUXT_DB_FILE`) — only use that in production with a persistent volume, for
the same ephemeral-disk reason as photo storage below. `db:seed` and
`db:import` are local-only tools and refuse to run when `NUXT_DB_URL` is set.
The same database also stores atomic fixed-window rate-limit counters, so a
persistent/shared database preserves abuse controls across deploys and app
instances.

## Pet-photo storage

Local disk (`NUXT_UPLOADS_PROVIDER=local`) is the dev default and writes under
`NUXT_UPLOADS_DIR`. **On most hosts the container disk is ephemeral**, so uploaded
photos vanish on redeploy — only use the local provider in production if you have
mounted a persistent volume at that path.

For a durable setup use Cloudflare R2 (10 GB free, zero egress, no inactivity
pause):

1. In the R2 dashboard, create a bucket (e.g. `pet-photos`) and enable **public
   access** (an `r2.dev` subdomain or a custom domain) — that URL is
   `NUXT_UPLOADS_R2_PUBLIC_BASE_URL`.
2. Create an R2 API token (Object Read & Write) to get the access key id / secret
   and the account's S3 endpoint.
3. Set `NUXT_UPLOADS_PROVIDER=r2` plus the five `NUXT_UPLOADS_R2_*` variables. If
   the provider is `r2` and any is missing, the first upload throws — the app never
   silently falls back to ephemeral local disk.
4. Writes/deletes are signed with AWS SigV4 (via Web Crypto, no SDK) and go through
   the Nitro API server-side only, never the browser.

**Why a public bucket:** the app stores each photo's public URL and serves it
directly. Storage keys embed an unguessable UUID (`pets/<petId>/<uuid>.<ext>`),
and the local provider's `/uploads` route is likewise unauthenticated — so a
public bucket matches the existing trust model. `publicUrl()` is synchronous by
design, so signed (expiring) URLs are intentionally out of scope. Do not put
anything but pet photos in this bucket.

## Daily-digest cron

The digest emails each opted-in, email-confirmed user a summary of their pets'
unfinished care tasks for the day. It is **opt-in** (off by default; users turn it
on from their profile) and timezone-correct: a user is mailed only once their own
local clock passes `NUXT_DIGEST_HOUR`, at most once per local day.

Trigger it from an external scheduler **hourly** (the hourly cadence lets each
timezone cross the send hour at the right moment; the endpoint is idempotent per
user per day):

```bash
# crontab: every hour, on the hour
0 * * * * curl -fsS -X POST https://yourdomain/api/internal/daily-digest \
  -H "x-digest-secret: $NUXT_DIGEST_SECRET"
```

The endpoint returns `{ "sent": n, "skipped": n, "failed": n }` for observability.
A missing or wrong `x-digest-secret` returns 401; an empty `NUXT_DIGEST_SECRET`
disables the endpoint entirely (always 401). A per-recipient send failure is
counted in `failed` and retried on the next run (the user's `last_digest_date` is
only stamped after a successful send).

## Progressive Web App

NeedyPet is installable. `@vite-pwa/nuxt` generates the web manifest and a
Workbox service worker at build time (`registerType: 'autoUpdate'`, so clients
pick up new deploys on their next navigation). Nothing extra is needed at deploy
time beyond a normal `bun run build` — the manifest link and service worker are
emitted into `.output/public/`. There are no PWA-specific environment variables.

- **Icons** live in `public/`: `pwa-192x192.png`, `pwa-512x512.png` (both
  `any` purpose), `maskable-512x512.png` (`maskable` purpose), `apple-touch-icon.png`
  (180×180 for iOS) and `favicon.ico`. They are generated from
  `public/needypet-paw-favicon.png` (512×512) and committed — there is no build
  step or image dependency.
- **Offline fallback:** navigations that miss the cache with no network fall back
  to `/offline` (a static page — no API or session use).
- **Caching:** the service worker precaches the app shell and built assets only.
  API responses (`/api/**`) and uploaded pet photos (`/uploads/**`) are **never**
  cached or served from the fallback, so care data, sessions and permissions are
  always fetched fresh.
- The service worker is disabled in dev (`pwa.devOptions.enabled: false`); test
  installability and offline behaviour against a production build
  (`bun run build` → `bun run preview`).
