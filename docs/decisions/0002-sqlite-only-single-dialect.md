# 0002 — SQLite only: bun:sqlite dev, libSQL/Turso prod, one schema

**Status**: Accepted

## Context

An earlier iteration kept a dual setup: SQLite for development and Postgres
for production (separate `schema.pg.ts`, pg migrations, `db:*:pg` scripts).
A dev/prod dialect split invites drift — `ILIKE`, `jsonb`, date handling —
and means testing a different engine than the one deployed.

## Decision

SQLite everywhere. `useDb()` (`server/db/index.ts`) switches on
`NUXT_DB_URL`: unset → local `bun:sqlite` file; a `libsql://` Turso URL →
`drizzle-orm/libsql`. Same dialect, same single schema
(`server/db/schema.sqlite.ts`), same migration set
(`server/db/migrations/sqlite/`). All Postgres surfaces were deleted.
`withTransaction` is provider-aware (interactive transaction on libSQL,
manual `begin immediate` on bun:sqlite).

## Consequences

- Zero dialect drift; the integration suite tests the deployed engine.
- Turso free tier hosts production for free; `PRAGMA foreign_keys` must be on
  (Turso default — verified per `../deployment.md`) because cascade/SET NULL
  deletes depend on it.
- Any schema change requires `bun run db:generate`; the integration suite
  migrates its temp DB from the committed migration files.
- Portable-SQLite conventions in the schema (TEXT UUIDs, TEXT dates, boolean
  integers) are load-bearing — keep them.
