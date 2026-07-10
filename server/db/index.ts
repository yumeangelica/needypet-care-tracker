import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Database } from 'bun:sqlite';
import { createClient } from '@libsql/client';
import { sql } from 'drizzle-orm';
import { type BunSQLiteDatabase, drizzle } from 'drizzle-orm/bun-sqlite';
import { type LibSQLDatabase, drizzle as drizzleLibsql } from 'drizzle-orm/libsql';
import * as schema from './schema';

/**
 * SQLite everywhere: bun:sqlite locally, libSQL/Turso in production (same
 * dialect, schema and migrations). All call sites use the awaited query style,
 * which works against both drivers; `Db` stays the bun:sqlite type and the
 * libSQL instance is cast to it (structurally compatible for that style).
 */
export type Db = BunSQLiteDatabase<typeof schema>;

let db: Db | null = null;
// Kept in its own, correctly-typed slot: transactions need the real libSQL
// API (interactive transaction), not the cast-to-Db view.
let remoteDb: LibSQLDatabase<typeof schema> | null = null;

// process.env (not runtimeConfig) so the seed/import/migrate scripts work
// outside nitro.
export function useDb(): Db {
  if (!db) {
    const url = process.env.NUXT_DB_URL;
    if (url) {
      // Remote libSQL (Turso: libsql://... + auth token). Migrations run at
      // deploy time via `bun run db:migrate`, never at runtime. Note Turso
      // enforces foreign keys by default — verify per deployment.md, the
      // cascade deletes depend on it.
      remoteDb = drizzleLibsql(
        createClient({ url, authToken: process.env.NUXT_DB_AUTH_TOKEN }),
        { schema },
      );
      db = remoteDb as unknown as Db;
    } else {
      const file = process.env.NUXT_DB_FILE ?? '.data/needypet.sqlite';
      mkdirSync(dirname(file), { recursive: true });
      const sqlite = new Database(file);
      sqlite.exec('PRAGMA journal_mode = WAL');
      sqlite.exec('PRAGMA foreign_keys = ON');
      db = drizzle(sqlite, { schema });
    }
  }
  return db;
}

export { schema };

/** First row of an awaited result set — the awaited-style stand-in for `.get()`. */
export function firstRow<T>(rows: T[]): T | undefined {
  return rows[0];
}

/**
 * Transaction wrapper, provider-aware:
 * - libSQL/Turso: drizzle's own `transaction()` (an interactive libSQL
 *   transaction — raw BEGIN/COMMIT statements would not share a session over
 *   the network protocol).
 * - bun:sqlite: driven manually, because the driver's own `transaction()`
 *   only accepts synchronous callbacks. An awaited drizzle statement yields a
 *   microtask, so in theory another request could interleave into the open
 *   transaction — accepted because bun:sqlite is the local single-user dev
 *   path and the transaction bodies contain no real async I/O.
 */
export async function withTransaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
  const database = useDb();
  if (remoteDb) {
    return remoteDb.transaction(async (tx) => fn(tx as unknown as Db));
  }
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
