import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type BunSQLiteDatabase, drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import * as schema from '../../server/db/schema.sqlite';
import {
  clearRateLimit,
  hitRateLimit,
  selectRateLimitIp,
} from '../../server/utils/rateLimit';

const WINDOW = 60_000;
const T0 = 1_000_000;

describe('DB-backed fixed-window rate limiter', () => {
  let sqlite: Database;
  let db: BunSQLiteDatabase<typeof schema>;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    const migrationDb = drizzle(sqlite);
    migrate(migrationDb, { migrationsFolder: 'server/db/migrations/sqlite' });
    db = drizzle(sqlite, { schema });
  });

  afterEach(() => {
    sqlite.close();
  });

  it('allows exactly max hits within one window', async () => {
    for (let index = 0; index < 5; index += 1) {
      expect((await hitRateLimit(db, 'k', 5, WINDOW, T0 + index)).allowed).toBe(true);
    }
  });

  it('blocks the hit after max and reports time until the window resets', async () => {
    for (let index = 0; index < 5; index += 1) {
      await hitRateLimit(db, 'k', 5, WINDOW, T0);
    }
    const verdict = await hitRateLimit(db, 'k', 5, WINDOW, T0 + 10_000);
    expect(verdict).toEqual({ allowed: false, retryAfterMs: WINDOW - 10_000 });
  });

  it('starts a fresh window once the previous one has expired', async () => {
    for (let index = 0; index < 6; index += 1) {
      await hitRateLimit(db, 'k', 5, WINDOW, T0);
    }
    expect((await hitRateLimit(db, 'k', 5, WINDOW, T0)).allowed).toBe(false);
    expect((await hitRateLimit(db, 'k', 5, WINDOW, T0 + WINDOW)).allowed).toBe(true);
  });

  it('keeps counters isolated per key', async () => {
    for (let index = 0; index < 6; index += 1) {
      await hitRateLimit(db, 'a', 5, WINDOW, T0);
    }
    expect((await hitRateLimit(db, 'a', 5, WINDOW, T0)).allowed).toBe(false);
    expect((await hitRateLimit(db, 'b', 5, WINDOW, T0)).allowed).toBe(true);
  });

  it('clears a key so hits are allowed again', async () => {
    for (let index = 0; index < 6; index += 1) {
      await hitRateLimit(db, 'k', 5, WINDOW, T0);
    }
    await clearRateLimit(db, 'k');
    expect((await hitRateLimit(db, 'k', 5, WINDOW, T0)).allowed).toBe(true);
  });

  it('sweeps expired rows at most once per five minutes while preserving live counters', async () => {
    await hitRateLimit(db, 'old', 5, WINDOW, T0);
    await hitRateLimit(db, 'live', 5, WINDOW, T0 + 5 * WINDOW - 1);

    const beforeSweep = await db.select({ key: schema.rateLimits.key }).from(schema.rateLimits);
    expect(beforeSweep.map((row) => row.key)).toContain('old');

    await hitRateLimit(db, 'new', 5, WINDOW, T0 + 5 * WINDOW);

    const keys = (await db.select({ key: schema.rateLimits.key }).from(schema.rateLimits)).map(
      (row) => row.key,
    );
    expect(keys).not.toContain('old');
    expect(keys).toEqual(expect.arrayContaining(['live', 'new']));
  });

  it('does not extend the window on repeated blocked hits', async () => {
    for (let index = 0; index < 6; index += 1) {
      await hitRateLimit(db, 'k', 5, WINDOW, T0);
    }
    await hitRateLimit(db, 'k', 5, WINDOW, T0 + 30_000);
    const verdict = await hitRateLimit(db, 'k', 5, WINDOW, T0 + 40_000);
    expect(verdict).toEqual({ allowed: false, retryAfterMs: WINDOW - 40_000 });
  });

  it('counts concurrent hits atomically', async () => {
    const verdicts = await Promise.all(
      Array.from({ length: 20 }, () => hitRateLimit(db, 'k', 5, WINDOW, T0)),
    );
    expect(verdicts.filter((verdict) => verdict.allowed)).toHaveLength(5);
    const [row] = await db.select().from(schema.rateLimits);
    expect(row?.count).toBe(20);
  });
});

describe('selectRateLimitIp', () => {
  it('ignores forwarded values when proxy trust is disabled', () => {
    expect(selectRateLimitIp('127.0.0.1', '203.0.113.7', false)).toBe('127.0.0.1');
  });

  it('uses the rightmost forwarded value from a trusted proxy', () => {
    expect(selectRateLimitIp('127.0.0.1', 'spoofed, 203.0.113.7 ', true)).toBe('203.0.113.7');
  });

  it('falls back to the socket address or unknown', () => {
    expect(selectRateLimitIp('127.0.0.1', undefined, true)).toBe('127.0.0.1');
    expect(selectRateLimitIp(undefined, ' , ', true)).toBe('unknown');
  });
});
