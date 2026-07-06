# Postgres / Supabase production path

Local development stays on SQLite. Setting `NUXT_DB_URL` switches the whole
server to Postgres — no code changes.

## How the switch works

- `server/db/schema.sqlite.ts` and `server/db/schema.pg.ts` are the two
  dialect schemas — **keep them in lockstep**. Mapping notes live at the top
  of `schema.pg.ts` (booleans, `double precision`, `num_nonnulls` checks;
  date-only and timestamp columns stay TEXT on purpose).
- `server/db/schema.ts` re-exports one of them at runtime based on
  `NUXT_DB_URL`. The sqlite table types stay the canonical TypeScript typing;
  the pg branch is cast (documented unsoundness confined to `schema.ts` +
  `db/index.ts`).
- `server/db/index.ts` — `useDb()` builds a postgres-js client
  (`prepare: false` for Supabase's transaction pooler on port 6543) or the
  better-sqlite3 client. All queries use the awaited drizzle style and
  `withTransaction()`, which behave identically on both dialects.

## Deploying against Supabase

1. Create the project; take the **transaction pooler** connection string
   (port 6543) for the app, and the **direct** connection string (port 5432)
   for migrations.
2. Apply migrations at deploy time (never at runtime):
   `NUXT_DB_URL=<direct-url> bun run db:migrate:pg`
3. Run the app with `NUXT_DB_URL=<pooler-url>` (plus `NUXT_SESSION_PASSWORD`
   and the `NUXT_MAILER_*` variables).

New schema changes: edit both schema files, then `bun run db:generate` (sqlite)
and `bun run db:generate:pg` (pg) to produce paired migrations.

## Notes

- `db:seed` and `db:import` are local SQLite tools and refuse to run when
  `NUXT_DB_URL` is set.
- The dev-server migrate plugin (`server/plugins/01.migrate.ts`) is skipped
  when `NUXT_DB_URL` is set.
- Verified end-to-end against a real Postgres wire protocol (PGlite over TCP):
  migrations, auth, pet/need CRUD, record transactions with completion
  recompute in both directions, history queries and cascading deletes.
