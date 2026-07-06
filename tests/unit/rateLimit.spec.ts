import { describe, expect, it } from 'vitest';
import { createRateLimiter } from '../../server/utils/rateLimit';

const WINDOW = 60_000;
const T0 = 1_000_000;

describe('createRateLimiter', () => {
  it('allows exactly max hits within one window', () => {
    const limiter = createRateLimiter();
    for (let i = 0; i < 5; i++) {
      expect(limiter.hit('k', 5, WINDOW, T0 + i).allowed).toBe(true);
    }
  });

  it('blocks the hit after max and reports time until the window resets', () => {
    const limiter = createRateLimiter();
    for (let i = 0; i < 5; i++) {
      limiter.hit('k', 5, WINDOW, T0);
    }
    const verdict = limiter.hit('k', 5, WINDOW, T0 + 10_000);
    expect(verdict.allowed).toBe(false);
    expect(verdict.retryAfterMs).toBe(WINDOW - 10_000);
  });

  it('starts a fresh window once the previous one has expired', () => {
    const limiter = createRateLimiter();
    for (let i = 0; i < 6; i++) {
      limiter.hit('k', 5, WINDOW, T0);
    }
    expect(limiter.hit('k', 5, WINDOW, T0).allowed).toBe(false);
    expect(limiter.hit('k', 5, WINDOW, T0 + WINDOW).allowed).toBe(true);
  });

  it('keeps counters isolated per key', () => {
    const limiter = createRateLimiter();
    for (let i = 0; i < 6; i++) {
      limiter.hit('a', 5, WINDOW, T0);
    }
    expect(limiter.hit('a', 5, WINDOW, T0).allowed).toBe(false);
    expect(limiter.hit('b', 5, WINDOW, T0).allowed).toBe(true);
  });

  it('reset clears a key so hits are allowed again', () => {
    const limiter = createRateLimiter();
    for (let i = 0; i < 6; i++) {
      limiter.hit('k', 5, WINDOW, T0);
    }
    expect(limiter.hit('k', 5, WINDOW, T0).allowed).toBe(false);
    limiter.reset('k');
    expect(limiter.hit('k', 5, WINDOW, T0).allowed).toBe(true);
  });

  it('sweeps expired keys when the map hits the cap, keeping live ones', () => {
    const limiter = createRateLimiter(3);
    limiter.hit('old-1', 5, WINDOW, T0);
    limiter.hit('old-2', 5, WINDOW, T0);
    limiter.hit('live', 5, WINDOW, T0 + WINDOW - 1);
    // Map is at cap; old-1/old-2 windows have expired by now, live has not.
    limiter.hit('new', 5, WINDOW, T0 + WINDOW + 1);
    // live's count survives the sweep: its second hit lands in the same window.
    for (let i = 0; i < 4; i++) {
      limiter.hit('live', 5, WINDOW, T0 + WINDOW + 2);
    }
    expect(limiter.hit('live', 5, WINDOW, T0 + WINDOW + 3).allowed).toBe(false);
    // Swept keys start fresh windows.
    expect(limiter.hit('old-1', 5, WINDOW, T0 + WINDOW + 3).allowed).toBe(true);
  });

  it('does not extend the window on repeated blocked hits', () => {
    const limiter = createRateLimiter();
    for (let i = 0; i < 6; i++) {
      limiter.hit('k', 5, WINDOW, T0);
    }
    limiter.hit('k', 5, WINDOW, T0 + 30_000);
    // The reset moment stays anchored to the first hit of the window.
    const verdict = limiter.hit('k', 5, WINDOW, T0 + 40_000);
    expect(verdict.allowed).toBe(false);
    expect(verdict.retryAfterMs).toBe(WINDOW - 40_000);
  });
});
