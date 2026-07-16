import { eq, lte, sql } from 'drizzle-orm';
import type { H3Event } from 'h3';
import { getRequestHeader, getRequestIP, setResponseHeader } from 'h3';
import type { Db } from '../db';
import { firstRow, useDb } from '../db';
import { rateLimits } from '../db/schema';
// Relative (not #shared): this module is imported directly from vitest specs,
// where the Nuxt '#shared' alias is not registered.
import { instantToIso } from '../../shared/utils/datetime';
import { Temporal } from '../../shared/utils/temporal';
import { tooManyRequests } from './errors';

export interface RateLimitVerdict {
  allowed: boolean;
  retryAfterMs: number;
}

const SWEEP_INTERVAL_MS = 5 * 60_000;
const nextSweepAtByDb = new WeakMap<object, number>();

/**
 * Atomically advances one fixed-window counter. The upsert is one statement so
 * concurrent app instances sharing libSQL cannot lose increments.
 */
export async function hitRateLimit(
  db: Db,
  key: string,
  max: number,
  windowMs: number,
  nowMs = Temporal.Now.instant().epochMilliseconds,
): Promise<RateLimitVerdict> {
  const now = instantToIso(Temporal.Instant.fromEpochMilliseconds(nowMs));
  const nextResetAt = instantToIso(
    Temporal.Instant.fromEpochMilliseconds(nowMs + windowMs),
  );
  const row = firstRow(
    await db
      .insert(rateLimits)
      .values({ key, count: 1, resetAt: nextResetAt })
      .onConflictDoUpdate({
        target: rateLimits.key,
        set: {
          count: sql<number>`case when ${rateLimits.resetAt} <= ${now} then 1 else ${rateLimits.count} + 1 end`,
          resetAt: sql<string>`case when ${rateLimits.resetAt} <= ${now} then ${nextResetAt} else ${rateLimits.resetAt} end`,
        },
      })
      .returning(),
  );
  if (!row) {
    throw new Error('Rate-limit counter update returned no row');
  }

  await sweepExpiredCountersIfDue(db, now, nowMs);

  const allowed = row.count <= max;
  return {
    allowed,
    retryAfterMs: allowed
      ? 0
      : Math.max(0, Temporal.Instant.from(row.resetAt).epochMilliseconds - nowMs),
  };
}

async function sweepExpiredCountersIfDue(db: Db, now: string, nowMs: number): Promise<void> {
  const nextSweepAt = nextSweepAtByDb.get(db) ?? Number.NEGATIVE_INFINITY;
  if (nowMs < nextSweepAt) {
    return;
  }

  // Set the deadline before awaiting so concurrent hits on this process do
  // not all issue the same maintenance write. Each app instance has one
  // cached DB client; the reset_at index keeps the periodic delete bounded.
  nextSweepAtByDb.set(db, nowMs + SWEEP_INTERVAL_MS);
  try {
    await db.delete(rateLimits).where(lte(rateLimits.resetAt, now));
  } catch {
    nextSweepAtByDb.delete(db);
    console.error('[rate-limit] Expired-counter cleanup failed');
  }
}

export async function clearRateLimit(db: Db, key: string): Promise<void> {
  await db.delete(rateLimits).where(eq(rateLimits.key, key));
}

/** Resolves a key address without trusting caller-controlled headers by default. */
export function rateLimitIp(event: H3Event): string {
  const socketIp = getRequestIP(event);
  const forwardedFor = getRequestHeader(event, 'x-forwarded-for');
  return selectRateLimitIp(
    socketIp,
    forwardedFor,
    process.env.NUXT_RATE_LIMIT_TRUST_PROXY === 'true',
  );
}

/** Takes the rightmost value added or overwritten by the trusted edge proxy. */
export function selectRateLimitIp(
  socketIp: string | undefined,
  forwardedFor: string | undefined,
  trustProxy: boolean,
): string {
  if (!trustProxy) {
    return socketIp ?? 'unknown';
  }
  const forwardedIp = forwardedFor
    ?.split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .at(-1);
  return forwardedIp ?? socketIp ?? 'unknown';
}

/** Counts a hit for the key and throws 429 (with Retry-After) once over the limit. */
export async function checkRateLimit(
  event: H3Event,
  key: string,
  options: { max: number; windowMs: number },
): Promise<void> {
  const verdict = await hitRateLimit(useDb(), key, options.max, options.windowMs);
  if (!verdict.allowed) {
    setResponseHeader(event, 'Retry-After', Math.ceil(verdict.retryAfterMs / 1000));
    tooManyRequests();
  }
}

/** Clears a key, e.g. the per-user login counter after a successful login. */
export async function resetRateLimit(key: string): Promise<void> {
  await clearRateLimit(useDb(), key);
}
