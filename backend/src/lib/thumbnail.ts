/**
 * Thumbnails for the gallery, the file list and the hover backdrop.
 *
 * Without them every tile pulls its full file: a 20 MB photo for a 40 px list
 * icon, a video element per gallery cell. Instead each picture, video frame or
 * cover art is shrunk once by libvips (sharp) into a small WebP and kept on
 * disk, one folder per transfer:
 *
 *   <THUMB_CACHE_DIR>/<transferId>/<fileId>-<size>.v1.webp
 *
 * The cache is disposable and held on a short leash so it never competes with
 * uploads for disk:
 *   - an entry's mtime is its last use, and one idle past THUMB_CACHE_TTL_MS
 *     is deleted;
 *   - the whole cache stays under THUMB_CACHE_MAX_BYTES, least recently used
 *     out first, checked on every sweep and as soon as a write overshoots;
 *   - below THUMB_CACHE_MIN_FREE_BYTES of free disk nothing new is stored and
 *     the sweep empties the cache;
 *   - a transfer's folder goes with the transfer (purge, delete, expiry), so a
 *     thumbnail never outlives the file it shows.
 */

import sharp, { type Sharp, type SharpOptions } from 'sharp';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  rmSync,
  statfsSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'fs';
import { dirname, isAbsolute, join, relative, sep } from 'path';
import { gunzipSync } from 'zlib';
import {
  DATA_DIR,
  RENDER_MAX_INPUT_BYTES,
  THUMB_CACHE_DIR,
  THUMB_CACHE_MAX_BYTES,
  THUMB_CACHE_MIN_FREE_BYTES,
  THUMB_CACHE_TTL_MS,
  THUMB_CONCURRENCY,
  THUMB_MAX_INPUT_PIXELS,
  THUMB_QUEUE_MAX,
  THUMB_TIMEOUT_MS,
  THUMB_VIPS_THREADS,
  UPLOADS_DIR,
} from '../config';
import type { TransferFile } from '../db';
import { extensionOf, type PreviewKind } from './fileSafety';
import { findLargestJpeg, tiffOrientation } from './rawPreview';
import { existingRender } from './render';
import { isValidTransferId } from './safePath';
import { fileSizeOrNull, storagePath, transferDir } from './storage';
import { run, runBuffer, Semaphore, SingleFlight } from './subprocess';

// libvips keeps an operation cache and open file handles by default. Every
// thumbnail is unique, so that cache only costs memory - and a cached handle
// would keep a deleted upload's blocks allocated on disk.
sharp.cache(false);
sharp.concurrency(Math.max(1, THUMB_VIPS_THREADS));

// SVG is only ever rendered from memory (see svgSource). libvips picks its
// loader by content, and a file or stream load hands librsvg a base directory
// to resolve <image href> against - so a "photo.png" that is really SVG could
// pull other files of its transfer into the thumbnail.
sharp.block({ operation: ['VipsForeignLoadSvgFile', 'VipsForeignLoadSvgSource'] });

export type ThumbSize = 'sm' | 'lg';

interface Preset {
  width: number;
  height: number;
  fit: 'cover' | 'inside';
  quality: number;
}

const PRESETS: Record<ThumbSize, Preset> = {
  // Tiles, grid cells and list icons are all squares. 384 px fills a ~190 px
  // tile on a 2x screen, and the crop follows the most salient region instead
  // of the plain centre.
  sm: { width: 384, height: 384, fit: 'cover', quality: 70 },
  // The hover backdrop and the poster shown while a preview loads.
  lg: { width: 1280, height: 1280, fit: 'inside', quality: 74 },
};

const SIZES = Object.keys(PRESETS) as ThumbSize[];

/** Longest edge a converter hands back; every size is cut from that frame. */
const FRAME_BOX = 1280;

/** Bump when the encoding changes; files of older versions are swept at once. */
const VERSION = 'v1';

/** A failure is remembered briefly, so a broken file does not rerun ffmpeg per request. */
const NEGATIVE_TTL_MS = 60 * 60 * 1000;

/** mtime doubles as last-use time; refreshing it at most this often keeps a hit to one stat. */
const TOUCH_EVERY_MS = 10 * 60 * 1000;

/** A half-written file left by a crash. */
const STALE_TMP_MS = 60 * 60 * 1000;

/** Ceiling on one frame piped back from ffmpeg or ImageMagick. */
const MAX_PIPE_BYTES = 64 * 1024 * 1024;

/** SVG is parsed in memory, so it gets its own, much lower ceiling. */
const SVG_MAX_BYTES = 16 * 1024 * 1024;

/** How much of a RAW file is searched for the camera's embedded JPEG. */
const RAW_SCAN_BYTES = 48 * 1024 * 1024;

/** Formats libvips reads itself; if it cannot, ImageMagick will not do better. */
const VIPS_ONLY = new Set([
  'jpg', 'jpeg', 'jfif', 'pjpeg', 'png', 'apng', 'gif', 'webp', 'avif',
]);

const RAW_EXTENSIONS = new Set([
  'cr2', 'cr3', 'nef', 'nrw', 'arw', 'srf', 'sr2', 'dng', 'orf', 'rw2', 'raf',
  'srw', 'pef', 'x3f', 'raw', 'rwl', 'iiq', '3fr', 'mef', 'mos', 'kdc', 'dcr',
]);

const SHARP_INPUT: SharpOptions = {
  // A truncated or slightly broken upload should still get a picture.
  failOn: 'none',
  limitInputPixels: THUMB_MAX_INPUT_PIXELS,
  autoOrient: true,
};

/** Kinds that get a thumbnail: pictures, video frames and audio cover art. */
export function canThumbnail(kind: PreviewKind | null): kind is PreviewKind {
  return (
    kind === 'image' ||
    kind === 'svg' ||
    kind === 'image-render' ||
    kind === 'video' ||
    kind === 'video-render' ||
    kind === 'audio'
  );
}

/** "sm" (default) or "lg"; null for anything else. */
export function parseThumbSize(value: string | null): ThumbSize | null {
  if (value === null || value === '' || value === 'sm') return 'sm';
  if (value === 'lg') return 'lg';
  return null;
}

export function thumbnailDir(transferId: string): string {
  return join(THUMB_CACHE_DIR, transferId);
}

function thumbPath(transferId: string, fileId: number, size: ThumbSize): string {
  return join(thumbnailDir(transferId), `${fileId}-${size}.${VERSION}.webp`);
}

function markerPath(transferId: string, fileId: number, size: ThumbSize): string {
  return join(thumbnailDir(transferId), `${fileId}-${size}.${VERSION}.none`);
}

/** Every name this module writes: thumbnails, failure markers and their temp files. */
const OWN_FILE = /^\d+-[a-z]+\.v\d+\.(?:webp|none)(?:\.tmp-[\w-]+)?$/;

/**
 * The sweeper deletes files under THUMB_CACHE_DIR, so a directory that
 * overlaps the uploads or the database - or is a filesystem root - turns the
 * cache off rather than let it near them. Thumbnails are then made per request.
 */
export function cacheDirIsSafe(dir: string, guarded = [UPLOADS_DIR, DATA_DIR]): boolean {
  const within = (child: string, parent: string) => {
    const rel = relative(parent, child);
    return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
  };
  if (dirname(dir) === dir) return false;
  return guarded.every((other) => !within(dir, other) && !within(other, dir));
}

const CACHE_ENABLED = cacheDirIsSafe(THUMB_CACHE_DIR);
if (!CACHE_ENABLED) {
  console.error(
    `🖼️  THUMB_CACHE_DIR ${THUMB_CACHE_DIR} overlaps the uploads or data directory - thumbnail cache disabled`,
  );
}

/** Thrown when so many thumbnails are queued that a new one would only wait. */
export class ThumbnailBusy extends Error {
  constructor() {
    super('Thumbnail queue is full');
    this.name = 'ThumbnailBusy';
  }
}

/* -------------------------------------------------------------- sources */

/**
 * Something sharp can cut thumbnails from. `costly` marks sources that took a
 * converter run or a long scan to obtain: every size is encoded from them in
 * the same go, so the backdrop or poster asked for next is already on disk.
 */
interface Source {
  open: (preset: Preset) => Sharp;
  costly: boolean;
}

function bufferSource(data: Uint8Array): Source {
  return { open: () => sharp(data, SHARP_INPUT), costly: true };
}

/**
 * SVG is rendered from memory: without a file path librsvg has no base
 * directory, so an <image href> inside it cannot pull other files off disk.
 * Each size is rendered at the density that lands on it, so a 24 px icon
 * comes out sharp instead of upscaled.
 */
async function svgSource(path: string): Promise<Source | null> {
  const size = fileSizeOrNull(path);
  if (size === null || size > SVG_MAX_BYTES) return null;

  let data: Buffer = readFileSync(path);
  if (data[0] === 0x1f && data[1] === 0x8b) {
    data = gunzipSync(data, { maxOutputLength: SVG_MAX_BYTES }); // .svgz
  }

  const { width, height } = await sharp(data, SHARP_INPUT).metadata();
  if (!width || !height) return null;

  return {
    open: (preset) => {
      const edge = preset.fit === 'cover' ? Math.min(width, height) : Math.max(width, height);
      const density = Math.min(2400, Math.max(1, (72 * preset.width) / edge));
      return sharp(data, { ...SHARP_INPUT, density });
    },
    costly: false,
  };
}

/**
 * Camera RAW: the JPEG the camera embedded. Its own EXIF orientation wins;
 * most cameras store the preview unrotated and record the orientation only in
 * the RAW's TIFF header, which is applied instead.
 */
async function rawSource(path: string): Promise<Source | null> {
  const head = Buffer.from(await Bun.file(path).slice(0, RAW_SCAN_BYTES).arrayBuffer());
  const preview = findLargestJpeg(head);
  if (!preview || Math.min(preview.width, preview.height) < 160) return null;

  // Copied out, so the 48 MB scan window can be collected.
  const jpeg = Buffer.from(head.subarray(preview.offset, preview.offset + preview.length));
  const own = (await sharp(jpeg, { failOn: 'none' }).metadata()).orientation ?? 1;
  const orientation = own > 1 ? 1 : tiffOrientation(head);

  return {
    open: () => {
      const image = sharp(jpeg, { ...SHARP_INPUT, autoOrient: own > 1 });
      // Cameras only record plain rotations; mirrored orientations stay as they are.
      if (orientation === 3) image.rotate(180);
      else if (orientation === 6) image.rotate(90);
      else if (orientation === 8) image.rotate(270);
      return image;
    },
    costly: true,
  };
}

/**
 * ImageMagick decoder per extension. The "coder:" prefix pins it: without one
 * ImageMagick trusts a file's first bytes over its name, so an upload could
 * choose MVG, MSL or SVG - formats that read other files - by how it starts.
 * Extensions missing here never reach ImageMagick.
 */
const MAGICK_CODERS: Record<string, string> = {
  bmp: 'bmp', dib: 'dib', ico: 'ico', cur: 'cur', tif: 'tiff', tiff: 'tiff',
  psd: 'psd', psb: 'psb', heic: 'heic', heif: 'heic', jp2: 'jp2', j2k: 'j2k',
  jpf: 'jp2', jpx: 'jp2', jxl: 'jxl', exr: 'exr', hdr: 'hdr', tga: 'tga',
  pcx: 'pcx', xcf: 'xcf', ppm: 'ppm', pgm: 'pgm', pbm: 'pbm', pnm: 'pnm',
  dds: 'dds', sgi: 'sgi', pict: 'pict', pct: 'pict', xpm: 'xpm', wbmp: 'wbmp',
  fits: 'fits', fit: 'fits',
  // Camera RAW without a usable embedded preview: dcraw/libraw via the DNG coder.
  ...Object.fromEntries([...RAW_EXTENSIONS].map((ext) => [ext, 'dng'])),
};

/** Tighter than the usual policy.xml, and in effect even where there is none. */
const MAGICK_LIMITS = [
  '-limit', 'memory', '256MiB', '-limit', 'map', '512MiB', '-limit', 'disk', '1GiB',
  '-limit', 'area', '128MP', '-limit', 'thread', '2',
  '-limit', 'time', String(Math.ceil(THUMB_TIMEOUT_MS / 1000)),
];

/** ImageMagick, for what libvips cannot open: PSD, HEIC, JPEG 2000, BMP, RAW without a preview… */
async function magickFrame(transferId: string, file: TransferFile): Promise<Uint8Array | null> {
  const coder = MAGICK_CODERS[extensionOf(file.rel_path)];
  if (!coder) return null;

  // With the coder pinned the stored name needs no extension, so nothing is
  // staged - that would touch the transfer folder's mtime (see videoFrame).
  const input = storagePath(transferId, file.storage_name);
  const size = fileSizeOrNull(input);
  if (size === null || size > RENDER_MAX_INPUT_BYTES) return null;

  // "[0]" is the first page, i.e. the flattened composite of a PSD.
  // -thumbnail is ImageMagick's fast resize, and it drops the profiles too.
  return runBuffer(
    ['convert', ...MAGICK_LIMITS, `${coder}:${input}[0]`, '-auto-orient',
      '-thumbnail', `${FRAME_BOX}x${FRAME_BOX}>`, '-define', 'png:compression-level=1', 'png:-'],
    THUMB_TIMEOUT_MS,
    MAX_PIPE_BYTES,
  );
}

/** Scale filter that keeps a frame inside FRAME_BOX, never enlarging it. */
const FRAME_SCALE =
  `scale=w='min(iw,${FRAME_BOX})':h='min(ih,${FRAME_BOX})':force_original_aspect_ratio=decrease`;

async function durationOf(input: string): Promise<number> {
  const result = await run(
    ['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', input],
    15_000,
  );
  const seconds = Number(result.stdout.trim());
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
}

function grabFrame(input: string, at: number): Promise<Uint8Array | null> {
  // Seeking before -i jumps by keyframe index instead of decoding up to the
  // point. The thumbnail filter then keeps the most typical of a few frames,
  // which steers clear of black frames and cuts.
  return runBuffer(
    ['ffmpeg', '-nostdin', '-v', 'error', '-ss', at.toFixed(2), '-i', input,
      '-map', '0:v:0', '-frames:v', '1', '-vf', `${FRAME_SCALE},thumbnail=8`,
      '-c:v', 'png', '-compression_level', '1', '-f', 'image2pipe', 'pipe:1'],
    THUMB_TIMEOUT_MS,
    MAX_PIPE_BYTES,
  );
}

/**
 * ffmpeg reads the stored payload directly - it recognises containers by
 * their content. Staging a link would create <transfer>/.render and so bump
 * the transfer folder's mtime, the clock of the hard retention backstop.
 */
async function videoFrame(transferId: string, file: TransferFile): Promise<Uint8Array | null> {
  const input = storagePath(transferId, file.storage_name);
  const duration = await durationOf(input);
  // A tenth of the way in skips fade-ins and slates; capped so a long film
  // does not have to seek far.
  const at = duration > 0 ? Math.min(duration * 0.1, 30) : 0;

  const frame = await grabFrame(input, at);
  if (frame || at === 0) return frame;
  return grabFrame(input, 0);
}

/** Embedded cover art (ID3 APIC, FLAC picture, MP4 covr). Most files have none. */
function coverArt(transferId: string, file: TransferFile): Promise<Uint8Array | null> {
  return runBuffer(
    ['ffmpeg', '-nostdin', '-v', 'error', '-i', storagePath(transferId, file.storage_name),
      '-map', '0:v:0', '-frames:v', '1', '-vf', FRAME_SCALE,
      '-c:v', 'png', '-f', 'image2pipe', 'pipe:1'],
    THUMB_TIMEOUT_MS,
    MAX_PIPE_BYTES,
  );
}

/**
 * Candidate sources for one file, best first. Lazy: a converter only runs
 * when everything before it came up empty or could not be decoded.
 */
async function* sourcesFor(
  transferId: string,
  file: TransferFile,
  kind: PreviewKind,
): AsyncGenerator<Source> {
  const path = storagePath(transferId, file.storage_name);
  const ext = extensionOf(file.rel_path);

  if (kind === 'video' || kind === 'video-render') {
    const frame = await videoFrame(transferId, file);
    if (frame) yield bufferSource(frame);
    return;
  }
  if (kind === 'audio') {
    const cover = await coverArt(transferId, file);
    if (cover) yield bufferSource(cover);
    return;
  }
  if (kind === 'svg') {
    const svg = await svgSource(path);
    if (svg) yield svg;
    return;
  }

  if (RAW_EXTENSIONS.has(ext)) {
    // Not handed to libvips first: most RAWs are TIFF containers, and it
    // would happily return their 160 px first-IFD thumbnail.
    const raw = await rawSource(path).catch(() => null);
    if (raw) yield raw;
  } else {
    // libvips sniffs the format itself and shrinks JPEG and WebP while decoding.
    yield { open: () => sharp(path, SHARP_INPUT), costly: false };
    if (VIPS_ONLY.has(ext)) return;
  }

  // A full rendition from the preview window, when someone already opened it.
  const rendered = existingRender(transferId, file, 'png');
  if (rendered) yield { open: () => sharp(rendered, SHARP_INPUT), costly: true };

  const frame = await magickFrame(transferId, file);
  if (frame) yield bufferSource(frame);
}

function encode(image: Sharp, preset: Preset): Promise<Buffer> {
  return image
    .resize({
      width: preset.width,
      height: preset.height,
      fit: preset.fit,
      ...(preset.fit === 'cover' ? { position: sharp.strategy.attention } : {}),
      withoutEnlargement: true,
    })
    .webp({ quality: preset.quality, effort: 4 })
    .timeout({ seconds: Math.ceil(THUMB_TIMEOUT_MS / 1000) })
    .toBuffer();
}

/* ---------------------------------------------------------------- cache */

const limiter = new Semaphore(Math.max(1, THUMB_CONCURRENCY));
const inflight = new SingleFlight<Uint8Array | null>();

/** Running estimate of the cache size; every sweep resets it to the truth. */
let cacheBytes = 0;
let sweepQueued = false;

/** Free bytes on the cache's filesystem, or null when the OS will not say. */
function freeBytes(): number | null {
  if (!CACHE_ENABLED) return null;
  try {
    if (!existsSync(THUMB_CACHE_DIR)) mkdirSync(THUMB_CACHE_DIR, { recursive: true });
    const stats = statfsSync(THUMB_CACHE_DIR);
    const free = Number(stats.bavail) * Number(stats.bsize);
    return Number.isFinite(free) && free >= 0 ? free : null;
  } catch {
    return null;
  }
}

function diskIsLow(): boolean {
  const free = freeBytes();
  return free !== null && free < THUMB_CACHE_MIN_FREE_BYTES;
}

/** Reads a cached thumbnail and marks it used, or null on a miss. */
function readCached(path: string): Uint8Array | null {
  let stats;
  let data: Buffer;
  try {
    stats = statSync(path);
    if (!stats.isFile() || stats.size === 0) return null;
    data = readFileSync(path);
  } catch {
    return null;
  }
  if (Date.now() - stats.mtimeMs > TOUCH_EVERY_MS) {
    try {
      const now = new Date();
      utimesSync(path, now, now);
    } catch {
      /* swept meanwhile or a read-only disk: the bytes are still good */
    }
  }
  return data;
}

function isCached(path: string): boolean {
  try {
    return statSync(path).size > 0;
  } catch {
    return false;
  }
}

function recentFailure(path: string): boolean {
  try {
    return Date.now() - statSync(path).mtimeMs < NEGATIVE_TTL_MS;
  } catch {
    return false;
  }
}

/**
 * Whether results for this transfer may be stored. A transfer deleted while
 * its thumbnail was being made must not get a cache folder back.
 */
function mayStore(transferId: string): boolean {
  return CACHE_ENABLED && existsSync(transferDir(transferId)) && !diskIsLow();
}

function write(transferId: string, path: string, data: Uint8Array): void {
  if (!mayStore(transferId)) return;
  try {
    mkdirSync(thumbnailDir(transferId), { recursive: true });
    // Written aside and renamed, so a reader never sees half a file.
    const tmp = `${path}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 10)}`;
    writeFileSync(tmp, data);
    renameSync(tmp, path);
    cacheBytes += data.byteLength;
    if (cacheBytes > THUMB_CACHE_MAX_BYTES) queueSweep();
  } catch (error) {
    console.warn(`🖼️  could not cache thumbnail ${path}:`, (error as Error).message);
  }
}

/** Tries each source in turn; the first that decodes wins. */
async function generate(
  transferId: string,
  file: TransferFile,
  kind: PreviewKind,
  size: ThumbSize,
): Promise<Buffer | null> {
  let failure: unknown = null;

  for await (const source of sourcesFor(transferId, file, kind)) {
    let data: Buffer;
    try {
      data = await encode(source.open(PRESETS[size]), PRESETS[size]);
    } catch (error) {
      failure = error;
      continue;
    }

    if (source.costly) {
      for (const other of SIZES) {
        const path = thumbPath(transferId, file.id, other);
        if (other === size || isCached(path)) continue;
        try {
          write(transferId, path, await encode(source.open(PRESETS[other]), PRESETS[other]));
        } catch {
          /* only a bonus - that size is made on its own request */
        }
      }
    }
    return data;
  }

  if (failure) console.warn(`🖼️  no thumbnail for ${file.rel_path}: ${(failure as Error).message}`);
  return null;
}

/**
 * The thumbnail of one file as WebP bytes, from the cache or freshly made.
 * Null when the file has nothing to show (no cover art, unreadable format).
 *
 * Generation is bounded by THUMB_CONCURRENCY and identical requests share one
 * run, so a gallery opening two hundred tiles at once queues instead of
 * spawning two hundred decoders. Tiles ("sm") go ahead of backdrops and
 * posters ("lg"): what is on screen matters more than what is hovered. Past
 * THUMB_QUEUE_MAX waiting runs a new one throws ThumbnailBusy instead of
 * queueing, so the caller can answer 503 and the browser ask again later.
 */
export async function getThumbnail(
  transferId: string,
  file: TransferFile,
  kind: PreviewKind,
  size: ThumbSize,
): Promise<Uint8Array | null> {
  const path = thumbPath(transferId, file.id, size);
  const hit = readCached(path);
  if (hit) return hit;

  const marker = markerPath(transferId, file.id, size);
  if (recentFailure(marker)) return null;

  const key = `${transferId}:${file.id}:${size}`;
  // Joining a run that is already queued costs nothing, so only new work is refused.
  if (!inflight.has(key) && limiter.waiting >= THUMB_QUEUE_MAX) throw new ThumbnailBusy();

  return inflight.run(key, () =>
    limiter.run(async () => {
      // Another request may have produced it while this one queued.
      const ready = readCached(path);
      if (ready) return ready;

      let data: Buffer | null = null;
      try {
        data = await generate(transferId, file, kind, size);
      } catch (error) {
        console.warn(`🖼️  thumbnail failed for ${file.rel_path}: ${(error as Error).message}`);
      }

      if (!data || data.byteLength === 0) {
        if (mayStore(transferId)) {
          try {
            mkdirSync(thumbnailDir(transferId), { recursive: true });
            writeFileSync(marker, '');
          } catch {
            /* best effort */
          }
        }
        return null;
      }

      write(transferId, path, data);
      return data;
    }, size === 'sm' ? 'high' : 'low'),
  );
}

/* ---------------------------------------------------------------- sweep */

export interface SweepOptions {
  dir: string;
  now: number;
  /** Idle time after which an entry is deleted. */
  ttlMs: number;
  /** Ceiling on the kept thumbnails; above it the least recently used go. */
  maxBytes: number;
  /** Transfers that still exist; the thumbnails of any other id are removed. */
  knownIds?: Set<string>;
  /** Trim to this many bytes instead of 90 % of maxBytes (0 empties the cache). */
  targetBytes?: number;
}

export interface SweepResult {
  removed: number;
  freedBytes: number;
  keptFiles: number;
  keptBytes: number;
}

/**
 * One pass over a cache directory. Kept pure over its inputs (explicit dir,
 * limits and clock) so it can be tested without touching the real cache.
 *
 * Only files this module names itself, inside <transferId>/ folders, are ever
 * deleted; anything else found there is left where it is. A misconfigured
 * THUMB_CACHE_DIR therefore costs nothing but a useless sweep.
 */
export function sweepCacheDir(options: SweepOptions): SweepResult {
  const { dir, now, ttlMs, maxBytes, knownIds } = options;
  const result: SweepResult = { removed: 0, freedBytes: 0, keptFiles: 0, keptBytes: 0 };
  if (!existsSync(dir)) return result;

  const drop = (path: string, bytes: number) => {
    try {
      rmSync(path, { force: true });
      result.removed++;
      result.freedBytes += bytes;
    } catch {
      /* still in use - next sweep */
    }
  };

  const kept: { path: string; size: number; used: number }[] = [];

  for (const name of readdirSync(dir)) {
    if (!isValidTransferId(name)) continue;
    const folder = join(dir, name);
    let entries: string[];
    try {
      if (!lstatSync(folder).isDirectory()) continue;
      entries = readdirSync(folder);
    } catch {
      continue;
    }
    // The transfer is gone: its thumbnails go with it.
    const orphaned = knownIds !== undefined && !knownIds.has(name);

    let left = 0;
    for (const entry of entries) {
      const path = join(folder, entry);
      let file;
      try {
        file = lstatSync(path);
      } catch {
        continue;
      }
      if (!file.isFile() || !OWN_FILE.test(entry)) {
        left++;
        continue;
      }

      const idle = now - file.mtimeMs;
      const isThumb = entry.endsWith(`.${VERSION}.webp`);
      const expired =
        orphaned ||
        (entry.includes('.tmp-')
          ? idle > STALE_TMP_MS
          : entry.endsWith('.none')
            ? idle > NEGATIVE_TTL_MS
            : !isThumb || idle > ttlMs);

      if (expired) {
        drop(path, file.size);
        continue;
      }
      left++;
      if (isThumb) kept.push({ path, size: file.size, used: file.mtimeMs });
    }

    if (left === 0) {
      try {
        rmdirSync(folder);
      } catch {
        /* a write landed in the meantime */
      }
    }
  }

  let total = kept.reduce((sum, entry) => sum + entry.size, 0);
  const target = options.targetBytes ?? (total > maxBytes ? Math.floor(maxBytes * 0.9) : total);

  if (total > target) {
    kept.sort((a, b) => a.used - b.used);
    for (const entry of kept) {
      if (total <= target) break;
      drop(entry.path, entry.size);
      total -= entry.size;
      entry.size = -1;
    }
  }

  const survivors = kept.filter((entry) => entry.size >= 0);
  result.keptFiles = survivors.length;
  result.keptBytes = survivors.reduce((sum, entry) => sum + entry.size, 0);
  return result;
}

/**
 * Applies retention to the thumbnail cache. Called by the periodic cleanup
 * with the ids of every live transfer, and on its own when a write pushes the
 * cache over its ceiling.
 */
export function sweepThumbnailCache(knownIds?: Set<string>): SweepResult {
  if (!CACHE_ENABLED) return { removed: 0, freedBytes: 0, keptFiles: 0, keptBytes: 0 };
  const low = diskIsLow();
  const result = sweepCacheDir({
    dir: THUMB_CACHE_DIR,
    now: Date.now(),
    ttlMs: THUMB_CACHE_TTL_MS,
    maxBytes: THUMB_CACHE_MAX_BYTES,
    knownIds,
    targetBytes: low ? 0 : undefined,
  });
  cacheBytes = result.keptBytes;

  if (result.removed > 0) {
    console.log(
      `🧹 Thumbnails: removed ${result.removed} (${(result.freedBytes / 1024 / 1024).toFixed(1)} MB)` +
        `${low ? ' - disk low' : ''}, kept ${result.keptFiles} (${(result.keptBytes / 1024 / 1024).toFixed(1)} MB)`,
    );
  }
  return result;
}

function queueSweep(): void {
  if (sweepQueued) return;
  sweepQueued = true;
  const timer = setTimeout(() => {
    sweepQueued = false;
    try {
      sweepThumbnailCache();
    } catch (error) {
      console.error('Thumbnail sweep failed:', error);
    }
  }, 1_000);
  if (typeof timer === 'object' && 'unref' in timer) timer.unref();
}
