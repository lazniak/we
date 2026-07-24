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
 * Per-IP rate limits, one bucket per category, sized to the shape of each
 * endpoint rather than one blanket number. Every limit is a fixed window
 * (max requests per windowMs) and can be tuned from the environment with
 * RL_<CATEGORY>_MAX / RL_<CATEGORY>_WINDOW_MS.
 *
 * The defaults are deliberately generous - they exist to stop a flood from
 * exhausting the box, not to get in the way of a real upload or a folder full
 * of previews. The busy paths (uploading chunks, streaming ranges) sit far
 * above anything a legitimate client produces; the expensive paths (creating a
 * transfer, server-side rendering) are held much tighter.
 */
export type RateCategory = 'init' | 'upload' | 'mutate' | 'read' | 'download' | 'render';

function rateRule(key: string, defMax: number, defWindowMs: number): { max: number; windowMs: number } {
  const max = Number(process.env[`RL_${key}_MAX`]);
  const windowMs = Number(process.env[`RL_${key}_WINDOW_MS`]);
  return {
    max: Number.isFinite(max) && max > 0 ? Math.floor(max) : defMax,
    windowMs: Number.isFinite(windowMs) && windowMs > 0 ? Math.floor(windowMs) : defWindowMs,
  };
}

export const RATE_LIMITS: Record<RateCategory, { max: number; windowMs: number }> = {
  // Creating a transfer allocates a directory and a DB row - kept to the
  // existing hourly cap so nobody can spin up thousands of empty transfers.
  init: { max: RATE_LIMIT_MAX_TRANSFERS, windowMs: RATE_LIMIT_WINDOW_MS },
  // Chunk PUTs are the busy path by design: 4 parallel streams of 5MB chunks,
  // up to ~1000 chunks for a 5GB upload. The cap trips only on a flood well
  // past any real link speed, and the client backs off politely on a 429.
  upload: rateRule('UPLOAD', 1200, 60_000),
  // complete / delete: a handful per transfer, retried a few times.
  mutate: rateRule('MUTATE', 120, 60_000),
  // Status polls and the stats widget - cheap reads, but a page may ask about
  // several transfers, so the window stays roomy.
  read: rateRule('READ', 240, 60_000),
  // Streaming files, previews and zips. Range requests fan a single video into
  // many GETs and a folder download touches every file, so this is high.
  download: rateRule('DOWNLOAD', 600, 60_000),
  // Server-side rendering (LibreOffice / ffmpeg / ImageMagick) and cracking an
  // archive open to list it are CPU and memory heavy - capped the hardest.
  render: rateRule('RENDER', 60, 60_000),
};

/**
 * Interface the backend listens on. It stays behind nginx, so the default
 * keeps port 3001 off the public interface entirely. Set BIND_HOST=0.0.0.0
 * only when something other than a local reverse proxy has to reach it.
 */
export const BIND_HOST = process.env.BIND_HOST || '127.0.0.1';

/**
 * Antivirus. The scan runs once the upload has landed and before the transfer
 * becomes downloadable. Set AV_ENABLED=0 where no clamd exists, otherwise
 * every transfer would be reported as unscanned.
 */
export const AV_ENABLED = process.env.AV_ENABLED !== '0';

/**
 * Files above this size are passed through unscanned. clamd refuses very
 * large inputs anyway, and the formats that carry executable payloads are
 * essentially never this big.
 */
export const AV_MAX_FILE_BYTES = Number(process.env.AV_MAX_FILE_BYTES || 512 * 1024 * 1024);

/** Ceiling on one scan, so a pathological archive cannot stall a transfer. */
export const AV_TIMEOUT_MS = Number(process.env.AV_TIMEOUT_MS || 5 * 60 * 1000);

/* ----------------------------------------------------- preview rendering */

/** At most this many document/image/video conversions run at once. */
export const RENDER_CONCURRENCY = Number(process.env.RENDER_CONCURRENCY || 2);

/** Per-conversion timeouts. */
export const RENDER_DOC_TIMEOUT_MS = Number(process.env.RENDER_DOC_TIMEOUT_MS || 90_000);
export const RENDER_IMAGE_TIMEOUT_MS = Number(process.env.RENDER_IMAGE_TIMEOUT_MS || 60_000);
export const RENDER_VIDEO_TIMEOUT_MS = Number(process.env.RENDER_VIDEO_TIMEOUT_MS || 180_000);

/** A document/image bigger than this is not converted (returns 413 to preview). */
export const RENDER_MAX_INPUT_BYTES = Number(
  process.env.RENDER_MAX_INPUT_BYTES || 300 * 1024 * 1024,
);

/** Video above this is never fully transcoded - only remuxed or postered. */
export const RENDER_VIDEO_TRANSCODE_MAX_BYTES = Number(
  process.env.RENDER_VIDEO_TRANSCODE_MAX_BYTES || 200 * 1024 * 1024,
);

/** Largest archive we will crack open to list its structure. */
export const ARCHIVE_MAX_INPUT_BYTES = Number(
  process.env.ARCHIVE_MAX_INPUT_BYTES || 2 * 1024 * 1024 * 1024,
);

/** Cap on how many entries an archive listing returns. */
export const ARCHIVE_MAX_ENTRIES = Number(process.env.ARCHIVE_MAX_ENTRIES || 20_000);

export const ALLOWED_ORIGINS = (
  process.env.ALLOWED_ORIGINS ||
  'https://we.pablogfx.com,http://localhost:3002,http://localhost:3000'
)
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
