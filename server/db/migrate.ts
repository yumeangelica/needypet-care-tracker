import { Database } from 'bun:sqlite';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { drizzle as drizzleLibsql } from 'drizzle-orm/libsql';
import { migrate as migrateLibsql } from 'drizzle-orm/libsql/migrator';

/**
 * Applies the SQLite migration set to whichever database the environment
 * points at — the deploy-time counterpart of the dev-only migrate plugin:
 *
 *   NUXT_DB_URL set   -> remote libSQL/Turso (NUXT_DB_AUTH_TOKEN required
 *                        for libsql:// URLs)
 *   otherwise         -> local file at NUXT_DB_FILE (default .data/needypet.sqlite)
 *
 * Idempotent: already-applied migrations are skipped. Run with: bun run db:migrate
 */

const MIGRATIONS_FOLDER = 'server/db/migrations/sqlite';

const url = process.env.NUXT_DB_URL;
if (url) {
  const client = createClient({ url, authToken: process.env.NUXT_DB_AUTH_TOKEN });
  await migrateLibsql(drizzleLibsql(client), { migrationsFolder: MIGRATIONS_FOLDER });
  client.close();
  console.log(`[db:migrate] Remote libSQL database is up to date (${url.split('@').pop()})`);
} else {
  const file = process.env.NUXT_DB_FILE ?? '.data/needypet.sqlite';
  const sqlite = new Database(file);
  migrate(drizzle(sqlite), { migrationsFolder: MIGRATIONS_FOLDER });
  sqlite.close();
  console.log(`[db:migrate] Local SQLite database is up to date (${file})`);
}
