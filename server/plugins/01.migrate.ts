import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { useDb } from '../db';

/**
 * Applies pending SQLite migrations on server start. Idempotent and instant
 * for local development. Against a remote DB (Turso/libSQL) migrations run at
 * deploy time instead, never at runtime.
 */
export default defineNitroPlugin(() => {
  // Local dev only — never auto-migrate a remote DB (NUXT_DB_URL) at runtime.
  if (import.meta.dev && !process.env.NUXT_DB_URL) {
    migrate(useDb(), { migrationsFolder: 'server/db/migrations/sqlite' });
  }
});
