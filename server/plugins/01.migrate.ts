import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { useDb } from '../db';

/**
 * Applies pending SQLite migrations on server start. Idempotent and instant
 * for local development. Production Postgres migrations will instead run at
 * deploy time, never at runtime.
 */
export default defineNitroPlugin(() => {
  // Never at runtime against Postgres — pg migrations run via db:migrate:pg.
  if (import.meta.dev && !process.env.NUXT_DB_URL) {
    migrate(useDb(), { migrationsFolder: 'server/db/migrations/sqlite' });
  }
});
