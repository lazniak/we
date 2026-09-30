/**
 * Who may see a transfer, beyond "knows the id".
 *
 * Two gates sit on top of the unguessable link:
 *
 * - A password. The recipient types it once; the server answers with an
 *   HttpOnly cookie scoped to that transfer's API path, so every later request
 *   (downloads, previews, thumbnails - plain <a> and <img> included) carries
 *   the proof without the page having to add headers.
 * - The owner token the uploader got from /init. It opens everything for the
 *   sender's own browser (history thumbnails, the "open" tab during upload)
 *   and never consumes a one-time transfer on its own.
 */

import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  UNLOCK_FAILURE_WINDOW_MS,
  UNLOCK_MAX_FAILURES,
} from '../config';
import type { Transfer } from '../db';

/** Constant time string comparison, so a check does not leak through timing. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function isOwner(transfer: Transfer, headers: Headers): boolean {
  const provided = headers.get('x-owner-token') || '';
  return Boolean(transfer.owner_token) && safeEqual(provided, transfer.owner_token!);
}

export function unlockCookieName(transferId: string): string {
  return `we_unlock_${transferId}`;
}

function readCookie(headers: Headers, name: string): string | null {
  const raw = headers.get('cookie');
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

/** True when nothing stands between this request and the content. */
export function isUnlocked(transfer: Transfer, headers: Headers): boolean {
  if (!transfer.password_hash) return true;
  if (isOwner(transfer, headers)) return true;
  const cookie = readCookie(headers, unlockCookieName(transfer.id));
  return Boolean(cookie && transfer.unlock_key && safeEqual(cookie, transfer.unlock_key));
}

/**
 * Cookie that proves the password was given. Scoped to the transfer's own API
 * path and dying with the link.
 */
export function unlockCookie(transfer: Transfer, secure: boolean): string {
  const seconds = Math.max(
    60,
    Math.floor((new Date(transfer.expires_at).getTime() - Date.now()) / 1000),
  );
  return [
    `${unlockCookieName(transfer.id)}=${transfer.unlock_key}`,
    `Path=/api/transfer/${transfer.id}`,
    `Max-Age=${seconds}`,
    'HttpOnly',
    'SameSite=Lax',
    secure ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ');
}

/** Rejects passwords that are not a string of sane length. */
export function validPassword(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= MIN_PASSWORD_LENGTH &&
    value.length <= MAX_PASSWORD_LENGTH
  );
}

/**
 * argon2id sized for a small VPS: OWASP's 19 MiB / 2 passes. Every unlock pays
 * this once, which is also what makes guessing expensive.
 */
export function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, { algorithm: 'argon2id', memoryCost: 19456, timeCost: 2 });
}

export async function checkPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await Bun.password.verify(password, hash);
  } catch {
    return false;
  }
}

/* ---------------------------------------------------- failure throttle */

/**
 * Wrong guesses per transfer, independent of the caller's IP. The IP limit
 * alone would not stop a guesser spreading attempts over many addresses.
 */
const failures = new Map<string, { count: number; since: number }>();

export function unlockBlockedFor(transferId: string): number {
  const entry = failures.get(transferId);
  if (!entry) return 0;
  const age = Date.now() - entry.since;
  if (age >= UNLOCK_FAILURE_WINDOW_MS) {
    failures.delete(transferId);
    return 0;
  }
  return entry.count >= UNLOCK_MAX_FAILURES ? Math.ceil((UNLOCK_FAILURE_WINDOW_MS - age) / 1000) : 0;
}

export function recordUnlockFailure(transferId: string): void {
  const now = Date.now();
  const entry = failures.get(transferId);
  if (!entry || now - entry.since >= UNLOCK_FAILURE_WINDOW_MS) {
    failures.set(transferId, { count: 1, since: now });
  } else {
    entry.count++;
  }

  // Keep the map from growing without bound under a spray of bogus ids.
  if (failures.size > 10_000) {
    for (const [key, value] of failures) {
      if (now - value.since >= UNLOCK_FAILURE_WINDOW_MS) failures.delete(key);
    }
  }
}

export function clearUnlockFailures(transferId: string): void {
  failures.delete(transferId);
}

/** Is the original request https, directly or behind the reverse proxy? */
export function isSecureRequest(url: string, headers: Headers): boolean {
  const forwarded = headers.get('x-forwarded-proto');
  if (forwarded) return forwarded.split(',')[0].trim() === 'https';
  return url.startsWith('https:');
}
