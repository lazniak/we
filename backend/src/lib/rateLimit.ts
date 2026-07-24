/**
 * Per-IP rate limiting shared by both request paths.
 *
 * The service runs two dispatchers: most endpoints go through Hono, but
 * downloads and the WebSocket upgrade are served straight from Bun.serve (see
 * index.ts / routes/download.ts). Both need the same throttle, so the counting
 * lives here and is exposed three ways: a Hono middleware, a raw helper that
 * returns a ready 429 Response, and the low-level counter for tests.
 *
 * Counting is a fixed window per (category, ip): the first request in a window
 * opens a bucket that expires after windowMs, and everything keyed to that
 * bucket shares one allowance. In-memory on purpose - a single Bun process
 * behind nginx, so there is nothing to coordinate and no dependency to add.
 */

import type { Context } from 'hono';
import { RATE_LIMITS, type RateCategory } from '../config';

export interface RateResult {
  /** False once the window's allowance is spent. */
  ok: boolean;
  limit: number;
  remaining: number;
  /** Epoch ms when the current window resets. */
  resetAt: number;
  retryAfterSec: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
let lastSweep = 0;

/** Drops expired buckets so a churn of unique IPs cannot grow the map forever. */
function sweep(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  lastSweep = now;
}

/**
 * Core counter, kept pure over its inputs (explicit key, rule and clock) so it
 * can be exercised deterministically in tests. Callers in production go through
 * {@link consume}.
 */
export function consumeKey(
  key: string,
  rule: { max: number; windowMs: number },
  now: number,
): RateResult {
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + rule.windowMs };
    buckets.set(key, bucket);
  }

  bucket.count += 1;

  // Opportunistic cleanup - only when the map is large and not swept recently,
  // so the hot path stays a single map lookup.
  if (buckets.size > 20_000 && now - lastSweep > 30_000) sweep(now);

  return {
    ok: bucket.count <= rule.max,
    limit: rule.max,
    remaining: Math.max(0, rule.max - bucket.count),
    resetAt: bucket.resetAt,
    retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

/** Counts one request against a category for an IP. */
export function consume(category: RateCategory, ip: string): RateResult {
  return consumeKey(`${category}|${ip}`, RATE_LIMITS[category], Date.now());
}

/** Test-only: forget every bucket. */
export function resetRateLimits(): void {
  buckets.clear();
  lastSweep = 0;
}

/**
 * The real client address. nginx sits in front and sets these, so the first
 * hop in X-Forwarded-For (falling back to X-Real-IP) is the caller. Everything
 * without a proxy header shares the "unknown" bucket, which only happens off
 * the reverse proxy (local dev, health checks).
 */
export function clientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim() || 'unknown';
  return headers.get('x-real-ip')?.trim() || 'unknown';
}

function rateHeaders(result: RateResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
  };
}

/**
 * Hono middleware that throttles a route by category, keyed on client IP.
 * Adds the standard X-RateLimit-* headers on the way out and answers 429 with
 * Retry-After when the window is spent.
 */
export function rateLimit(category: RateCategory) {
  return async (c: Context, next: () => Promise<void>) => {
    const result = consume(category, clientIpFromHeaders(c.req.raw.headers));
    const headers = rateHeaders(result);

    if (!result.ok) {
      for (const [key, value] of Object.entries(headers)) c.header(key, value);
      c.header('Retry-After', String(result.retryAfterSec));
      return c.json({ error: 'Too many requests, slow down' }, 429);
    }

    await next();
    for (const [key, value] of Object.entries(headers)) c.header(key, value);
  };
}

/**
 * Throttle for the raw Bun.serve paths (downloads, WS upgrade) that never touch
 * Hono. Returns a finished 429 Response to send back, or null to proceed. The
 * caller supplies its own header builder so the 429 carries the same CORS and
 * security headers as its normal responses.
 */
export function enforceRawRateLimit(
  category: RateCategory,
  headers: Headers,
  buildHeaders: (extra: Record<string, string>) => HeadersInit,
): Response | null {
  const result = consume(category, clientIpFromHeaders(headers));
  if (result.ok) return null;

  return new Response(JSON.stringify({ error: 'Too many requests, slow down' }), {
    status: 429,
    headers: buildHeaders({
      'Content-Type': 'application/json',
      'Retry-After': String(result.retryAfterSec),
      ...rateHeaders(result),
    }),
  });
}
