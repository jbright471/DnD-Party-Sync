'use strict';

function createFixedWindowRateLimiter({
  limit,
  windowMs,
  maxEntries = 10_000,
  now = Date.now,
}) {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('limit must be a positive integer');
  if (!Number.isSafeInteger(windowMs) || windowMs < 1) throw new Error('windowMs must be a positive integer');
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) throw new Error('maxEntries must be a positive integer');

  const windows = new Map();

  function prune(timestamp) {
    for (const [key, entry] of windows) {
      if (entry.resetAt <= timestamp) windows.delete(key);
    }
    while (windows.size >= maxEntries) {
      windows.delete(windows.keys().next().value);
    }
  }

  function consume(key) {
    const timestamp = now();
    let entry = windows.get(key);
    if (!entry || entry.resetAt <= timestamp) {
      prune(timestamp);
      entry = { count: 0, resetAt: timestamp + windowMs };
      windows.set(key, entry);
    }
    entry.count += 1;
    const allowed = entry.count <= limit;
    return Object.freeze({
      allowed,
      remaining: Math.max(0, limit - entry.count),
      retryAfterMs: allowed ? 0 : Math.max(1, entry.resetAt - timestamp),
    });
  }

  return Object.freeze({
    consume,
    reset(key) {
      windows.delete(key);
    },
    size() {
      return windows.size;
    },
  });
}

module.exports = { createFixedWindowRateLimiter };
