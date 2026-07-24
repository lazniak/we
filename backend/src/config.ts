import { join, resolve } from 'path';

const ROOT = resolve(import.meta.dir, '../..');

/** Where uploaded payloads live. Override with UPLOADS_DIR in production. */
export const UPLOADS_DIR = resolve(process.env.UPLOADS_DIR || join(ROOT, 'uploads'));

/** Where the SQLite database lives. Override with DATA_DIR in production. */
export const DATA_DIR = resolve(process.env.DATA_DIR || join(ROOT, 'data'));

/** Upload chunk size. Sent to the client by /init, so it stays in sync. */
export const CHUNK_SIZE = 5 * 1024 * 1024;

/** Hard ceiling on a single chunk body, guards against memory exhaustion. */
export const MAX_CHUNK_BYTES = CHUNK_SIZE + 64 * 1024;

/** Hard ceiling on one transfer. */
export const MAX_TRANSFER_BYTES = 5 * 1024 * 1024 * 1024;

/** Hard ceiling on a single file inside a transfer. */
export const MAX_FILE_BYTES = MAX_TRANSFER_BYTES;

/** Hard ceiling on how many entries a single transfer may contain. */
export const MAX_FILES_PER_TRANSFER = 5000;

/** Longest accepted relative path (after sanitisation) and its segments. */
export const MAX_PATH_LENGTH = 900;
export const MAX_PATH_SEGMENT_LENGTH = 180;
export const MAX_PATH_DEPTH = 32;

export const MIN_EXPIRATION_DAYS = 1;
export const MAX_EXPIRATION_DAYS = 7;
export const DEFAULT_EXPIRATION_DAYS = 3;

/**
 * Backstop retention: nothing survives past this, even if expires_at was
 * somehow written wrong or the row vanished. Keeps "self destruct" honest.
 */
export const HARD_MAX_AGE_MS = (MAX_EXPIRATION_DAYS + 1) * 24 * 60 * 60 * 1000;

/**
 * How long an unfinished upload may sit on disk before it is swept.
 * Must be comfortably longer than the slowest realistic 5GB upload.
 */
export const INCOMPLETE_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;

/** Grace period before an on-disk directory with no DB row is treated as an orphan. */
export const ORPHAN_GRACE_MS = 60 * 60 * 1000;

export const CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

/** Rate limiting for transfer creation, per client IP. */
export const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
export const RATE_LIMIT_MAX_TRANSFERS = 60;

/**
 * Interface the backend listens on. It stays behind nginx, so the default
 * keeps port 3001 off the public interface entirely. Set BIND_HOST=0.0.0.0
 * only when something other than a local reverse proxy has to reach it.
 */
export const BIND_HOST = process.env.BIND_HOST || '127.0.0.1';

export const ALLOWED_ORIGINS = (
  process.env.ALLOWED_ORIGINS ||
  'https://we.pablogfx.com,http://localhost:3002,http://localhost:3000'
)
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
