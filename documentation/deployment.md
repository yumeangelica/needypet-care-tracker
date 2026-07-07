# Deployment

Production checklist for hosting NeedyPet. The database path (SQLite → Postgres/
Supabase) has its own doc: [`postgres.md`](./postgres.md). This file covers the
full runtime environment, pet-photo storage, and the daily-digest cron.

## Build and run

```bash
bun install
bun run build          # produces .output/
node .output/server/index.mjs   # or: bun .output/server/index.mjs
```

Run migrations at deploy time, never at runtime (the dev-only migrate plugin is
skipped in production):

```bash
# SQLite host: apply the sqlite migrations to the live DB file before starting.
# Postgres/Supabase: see postgres.md (db:migrate:pg against the direct 5432 URL).
```

## Environment variables

| Variable | Purpose |
| --- | --- |
| `NUXT_SESSION_PASSWORD` | 32+ char secret sealing the session cookie (**required**) |
| `NUXT_DB_FILE` | local SQLite path (default `.data/needypet.sqlite`) |
| `NUXT_DB_URL` | set → switches the server to Postgres ([`postgres.md`](./postgres.md)) |
| `NUXT_MAILER_PROVIDER` | `resend` enables the HTTP mailer; unset = console mailer (dev) |
| `NUXT_MAILER_API_KEY` | Resend API key (required when provider is `resend`) |
| `NUXT_MAILER_FROM` | sender address, e.g. `NeedyPet <no-reply@yourdomain>` |
| `NUXT_UPLOADS_PROVIDER` | `local` (default) or `supabase` for pet photos |
| `NUXT_UPLOADS_DIR` | local photo directory (default `.data/uploads`; local provider only) |
| `NUXT_UPLOADS_SUPABASE_URL` | Supabase project URL, e.g. `https://<ref>.supabase.co` |
| `NUXT_UPLOADS_SUPABASE_SERVICE_KEY` | Supabase **service role** key (server-side only) |
| `NUXT_UPLOADS_SUPABASE_BUCKET` | Storage bucket name for pet photos |
| `NUXT_DIGEST_SECRET` | shared secret guarding the digest cron endpoint; **empty = endpoint disabled (always 401)** |
| `NUXT_DIGEST_HOUR` | local hour (0–23) each user must reach before that day's digest sends (default `18`) |

## Pet-photo storage

Local disk (`NUXT_UPLOADS_PROVIDER=local`) is the dev default and writes under
`NUXT_UPLOADS_DIR`. **On most hosts the container disk is ephemeral**, so uploaded
photos vanish on redeploy — only use the local provider in production if you have
mounted a persistent volume at that path.

For a durable setup use Supabase Storage:

1. In the Supabase dashboard, create a Storage bucket (e.g. `pet-photos`) and mark
   it **Public**.
2. Set `NUXT_UPLOADS_PROVIDER=supabase` plus the three `NUXT_UPLOADS_SUPABASE_*`
   variables. If the provider is `supabase` and any of the three is missing, the
   first upload throws — the app never silently falls back to ephemeral local
   disk.
3. The service role key is used server-side only (uploads/deletes go through the
   Nitro API, never the browser).

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
