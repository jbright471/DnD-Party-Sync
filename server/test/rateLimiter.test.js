'use strict';

import { describe, expect, it } from 'vitest';
import { createFixedWindowRateLimiter } from '../lib/rateLimiter.js';

describe('bounded fixed-window rate limiter', () => {
  it('denies attempts beyond the configured limit and resets after the window', () => {
    let now = 1_000;
    const limiter = createFixedWindowRateLimiter({ limit: 2, windowMs: 100, now: () => now });

    expect(limiter.consume('client-a').allowed).toBe(true);
    expect(limiter.consume('client-a').allowed).toBe(true);
    expect(limiter.consume('client-a')).toMatchObject({ allowed: false, retryAfterMs: 100 });
    now += 101;
    expect(limiter.consume('client-a').allowed).toBe(true);
  });

  it('resets a key after successful authentication', () => {
    const limiter = createFixedWindowRateLimiter({ limit: 1, windowMs: 100 });
    limiter.consume('client-a');
    expect(limiter.consume('client-a').allowed).toBe(false);
    limiter.reset('client-a');
    expect(limiter.consume('client-a').allowed).toBe(true);
  });

  it('keeps tracked source state within the configured bound', () => {
    const limiter = createFixedWindowRateLimiter({ limit: 1, windowMs: 10_000, maxEntries: 2 });
    limiter.consume('client-a');
    limiter.consume('client-b');
    limiter.consume('client-c');
    expect(limiter.size()).toBeLessThanOrEqual(2);
  });
});
