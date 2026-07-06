import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { sql } from 'drizzle-orm';
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';
import { drizzle as drizzlePg, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import * as pgSchema from './schema.pg';

/**
 * Canonical Db typing stays the better-sqlite3 flavour; the pg branch is cast
 * into it (see the note in ./schema.ts). All call sites use the awaited query
 * style, which behaves identically on both drivers.
 */
export type Db = BetterSQLite3Database<typeof schema>;
type PgDb = PostgresJsDatabase<typeof pgSchema>;

let db: Db | null = null;

/** Postgres in production when NUXT_DB_URL is set; local SQLite otherwise. */
export const isPg = (): boolean => Boolean(process.env.NUXT_DB_URL);

// process.env (not runtimeConfig) so tsx scripts (seed, import) work outside nitro.
export function useDb(): Db {
  if (!db) {
    const dbUrl = process.env.NUXT_DB_URL;
    if (dbUrl) {
      // prepare: false is required by Supabase's transaction pooler (port 6543).
      const client = postgres(dbUrl, { prepare: false });
      db = drizzlePg(client, { schema: pgSchema }) as unknown as Db;
    } else {
      const file = process.env.NUXT_DB_FILE ?? '.data/needypet.sqlite';
      mkdirSync(dirname(file), { recursive: true });
      const sqlite = new Database(file);
      sqlite.pragma('journal_mode = WAL');
      sqlite.pragma('foreign_keys = ON');
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
 * sqlite is driven manually because better-sqlite3's own `transaction()` only
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
