import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Database } from 'bun:sqlite';
import { sql } from 'drizzle-orm';
import { type BunSQLDatabase, drizzle as drizzlePg } from 'drizzle-orm/bun-sql';
import { type BunSQLiteDatabase, drizzle } from 'drizzle-orm/bun-sqlite';
import * as schema from './schema';
import * as pgSchema from './schema.pg';

/**
 * Canonical Db typing stays the bun:sqlite flavour; the pg branch is cast
 * into it (see the note in ./schema.ts). All call sites use the awaited query
 * style, which behaves identically on both drivers.
 */
export type Db = BunSQLiteDatabase<typeof schema>;
type PgDb = BunSQLDatabase<typeof pgSchema>;

let db: Db | null = null;

/** Postgres in production when NUXT_DB_URL is set; local SQLite otherwise. */
export const isPg = (): boolean => Boolean(process.env.NUXT_DB_URL);

// process.env (not runtimeConfig) so the seed/import scripts work outside nitro.
export function useDb(): Db {
  if (!db) {
    const dbUrl = process.env.NUXT_DB_URL;
    if (dbUrl) {
      // Native Bun.sql client. prepare: false is required by Supabase's
      // transaction pooler (port 6543).
      db = drizzlePg({
        connection: { url: dbUrl, prepare: false },
        schema: pgSchema,
      }) as unknown as Db;
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
 * Dialect-agnostic transaction wrapper: pg uses a real driver transaction;
 * sqlite is driven manually because bun:sqlite's own `transaction()` only
 * accepts synchronous callbacks. On the sqlite branch an awaited drizzle
 * statement yields a microtask, so in theory another request could interleave
 * into the open transaction — accepted because sqlite is the local single-user
 * dev path and the transaction bodies contain no real async I/O.
 */
export async function withTransaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
  const database = useDb();
  if (isPg()) {
    return (database as unknown as PgDb).transaction((tx) => fn(tx as unknown as Db));
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
