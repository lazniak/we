import { describe, expect, test, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import { consumeKey, rateLimit, resetRateLimits } from './rateLimit';
import { RATE_LIMITS } from '../config';

describe('rate limit counter', () => {
  beforeEach(() => resetRateLimits());

  const rule = { max: 3, windowMs: 1000 };

  test('allows up to the limit, then blocks within the same window', () => {
    const now = 10_000;
    expect(consumeKey('k|ip', rule, now).ok).toBe(true); // 1
    expect(consumeKey('k|ip', rule, now).ok).toBe(true); // 2

    const third = consumeKey('k|ip', rule, now); // 3 - last allowed
    expect(third.ok).toBe(true);
    expect(third.remaining).toBe(0);

    const fourth = consumeKey('k|ip', rule, now); // 4 - over
    expect(fourth.ok).toBe(false);
    expect(fourth.retryAfterSec).toBeGreaterThan(0);
  });

  test('opens a fresh window once the old one elapses', () => {
    const now = 10_000;
    for (let i = 0; i < 5; i++) consumeKey('k|ip', rule, now); // exhaust
    expect(consumeKey('k|ip', rule, now).ok).toBe(false);

    const later = now + rule.windowMs + 1;
    const after = consumeKey('k|ip', rule, later);
    expect(after.ok).toBe(true);
    expect(after.remaining).toBe(rule.max - 1);
  });

  test('counts each key independently', () => {
    const now = 10_000;
    for (let i = 0; i < 3; i++) consumeKey('a|ip', rule, now);
    expect(consumeKey('a|ip', rule, now).ok).toBe(false);

    // A different IP/category shares nothing with the exhausted bucket.
    expect(consumeKey('b|ip', rule, now).ok).toBe(true);
  });

  test('never reports a retry longer than the window', () => {
    const now = 10_000;
    const result = consumeKey('k|ip', rule, now);
    expect(result.retryAfterSec).toBeLessThanOrEqual(Math.ceil(rule.windowMs / 1000));
  });
});

describe('rate limit middleware (Hono)', () => {
  beforeEach(() => resetRateLimits());

  test('serves under the limit, then answers 429 with the standard headers', async () => {
    const app = new Hono();
    app.get('/x', rateLimit('read'), (c) => c.text('ok'));

    const max = RATE_LIMITS.read.max;
    const headers = { 'x-forwarded-for': '203.0.113.7' };

    let last: Response | undefined;
    for (let i = 0; i < max; i++) last = await app.request('/x', { headers });
    expect(last!.status).toBe(200);
    expect(last!.headers.get('X-RateLimit-Remaining')).toBe('0');

    const blocked = await app.request('/x', { headers });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('X-RateLimit-Limit')).toBe(String(max));
    expect(Number(blocked.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect((await blocked.json()).error).toContain('Too many requests');
  });

  test('keeps a separate budget per client IP', async () => {
    const app = new Hono();
    app.get('/x', rateLimit('read'), (c) => c.text('ok'));

    const max = RATE_LIMITS.read.max;
    for (let i = 0; i < max + 1; i++) {
      await app.request('/x', { headers: { 'x-forwarded-for': '198.51.100.1' } });
    }
    // The first IP is now spent; a different one is untouched.
    const other = await app.request('/x', { headers: { 'x-forwarded-for': '198.51.100.2' } });
    expect(other.status).toBe(200);
  });
});
