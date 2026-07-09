import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Database } from 'bun:sqlite';
import { sql } from 'drizzle-orm';
import { type BunSQLiteDatabase, drizzle } from 'drizzle-orm/bun-sqlite';
import * as schema from './schema';

/**
 * SQLite everywhere: bun:sqlite locally, libSQL/Turso in production (same
 * dialect, schema and migrations). All call sites use the awaited query style.
 */
export type Db = BunSQLiteDatabase<typeof schema>;

let db: Db | null = null;

// process.env (not runtimeConfig) so the seed/import scripts work outside nitro.
export function useDb(): Db {
  if (!db) {
    // Turso seam: when NUXT_DB_URL is a libsql://... (or https://) Turso URL,
    // swap in a `drizzle-orm/libsql` client here — it uses this SAME `schema`
    // and the same SQLite migrations, so nothing else changes. Left unwired on
    // purpose (no @libsql/client dependency until a host is chosen); local
    // bun:sqlite is the only active path today. See documentation/backlog.md.
    const file = process.env.NUXT_DB_FILE ?? '.data/needypet.sqlite';
    mkdirSync(dirname(file), { recursive: true });
    const sqlite = new Database(file);
    sqlite.exec('PRAGMA journal_mode = WAL');
    sqlite.exec('PRAGMA foreign_keys = ON');
    db = drizzle(sqlite, { schema });
  }
  return db;
}

export { schema };

/** First row of an awaited result set — the awaited-style stand-in for `.get()`. */
export function firstRow<T>(rows: T[]): T | undefined {
  return rows[0];
}

/**
 * Transaction wrapper. bun:sqlite's own `transaction()` only accepts synchronous
 * callbacks, so the transaction is driven manually. On the sqlite branch an
 * awaited drizzle statement yields a microtask, so in theory another request
 * could interleave into the open transaction — accepted because sqlite is the
 * local single-user dev path and the transaction bodies contain no real async I/O.
 */
export async function withTransaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
  const database = useDb();
  database.run(sql`begin immediate`);
  try {
    const result = await fn(database);
    database.run(sql`commit`);
    return result;
  } catch (error) {
    database.run(sql`rollback`);
    throw error;
  }
}
