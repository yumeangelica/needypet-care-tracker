import type { H3Event } from 'h3';
import { getRequestIP, setResponseHeader } from 'h3';
// Relative (not #shared): this module is imported directly from vitest specs,
// where the Nuxt '#shared' alias is not registered.
import { Temporal } from '../../shared/utils/temporal';
import { tooManyRequests } from './errors';

export interface RateLimitVerdict {
  allowed: boolean;
  retryAfterMs: number;
}

interface WindowEntry {
  count: number;
  resetAt: number;
}

/**
 * Fixed-window in-memory rate limiter. Counters live per process and vanish
 * on restart — enough for a single-instance deployment. A shared store
 * (e.g. Redis) would replace the Map here if the app ever scales out.
 */
export function createRateLimiter(maxKeys = 10_000) {
  const windows = new Map<string, WindowEntry>();

  function sweep(now: number): void {
    for (const [key, entry] of windows) {
      if (now >= entry.resetAt) {
        windows.delete(key);
      }
    }
  }

  function hit(
    key: string,
    max: number,
    windowMs: number,
    now = Temporal.Now.instant().epochMilliseconds,
  ): RateLimitVerdict {
    const entry = windows.get(key);
    if (!entry || now >= entry.resetAt) {
      // Sweep lazily so the map can't grow unbounded from one-off keys.
      if (windows.size >= maxKeys) {
        sweep(now);
      }
      windows.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, retryAfterMs: 0 };
    }
    entry.count += 1;
    if (entry.count > max) {
      return { allowed: false, retryAfterMs: entry.resetAt - now };
    }
    return { allowed: true, retryAfterMs: 0 };
  }

  function reset(key: string): void {
    windows.delete(key);
  }

  return { hit, reset };
}

const limiter = createRateLimiter();

/** Client address for rate-limit keys; trusts x-forwarded-for from the proxy. */
export function rateLimitIp(event: H3Event): string {
  return getRequestIP(event, { xForwardedFor: true }) ?? 'unknown';
}

/** Counts a hit for the key and throws 429 (with Retry-After) once over the limit. */
export function checkRateLimit(
  event: H3Event,
  key: string,
  options: { max: number; windowMs: number },
): void {
  const verdict = limiter.hit(key, options.max, options.windowMs);
  if (!verdict.allowed) {
    setResponseHeader(event, 'Retry-After', Math.ceil(verdict.retryAfterMs / 1000));
    tooManyRequests();
  }
}

/** Clears a key, e.g. the per-user login counter after a successful login. */
export function resetRateLimit(key: string): void {
  limiter.reset(key);
}
