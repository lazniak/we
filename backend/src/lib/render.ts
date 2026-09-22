import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
} from 'fs';
import { join } from 'path';
import {
  RENDER_CACHE_TTL_MS,
  RENDER_CONCURRENCY,
  RENDER_DOC_TIMEOUT_MS,
  RENDER_IMAGE_TIMEOUT_MS,
  RENDER_MAX_INPUT_BYTES,
  RENDER_VIDEO_TIMEOUT_MS,
  RENDER_VIDEO_TRANSCODE_MAX_BYTES,
} from '../config';
import type { TransferFile } from '../db';
import { extensionOf, type PreviewKind } from './fileSafety';
import { fileSizeOrNull, storagePath, transferDir } from './storage';
import { run, Semaphore, SingleFlight, type RunResult } from './subprocess';

export interface RenderResult {
  path: string;
  mime: string;
}

const limiter = new Semaphore(RENDER_CONCURRENCY);
const inflight = new SingleFlight<RenderResult | null>();

function renderDir(transferId: string): string {
  const dir = join(transferDir(transferId), '.render');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Converters key off the file extension, but payloads are stored under opaque
 * names (f00001.bin). This drops a symlink with the real extension next to the
 * source so the tools recognise the format.
 */
export function stagedInput(transferId: string, file: TransferFile): string {
  const ext = extensionOf(file.rel_path) || 'bin';
  const staged = join(renderDir(transferId), `src-${file.file_index}.${ext}`);
  if (existsSync(staged)) return staged;

  const source = storagePath(transferId, file.storage_name);
  try {
    symlinkSync(source, staged);
  } catch {
    copyFileSync(source, staged);
  }
  return staged;
}

function cachePath(transferId: string, file: TransferFile, suffix: string): string {
  return join(renderDir(transferId), `out-${file.file_index}.${suffix}`);
}

/** Last-use stamps are refreshed at most this often, so a hit costs one stat. */
const TOUCH_EVERY_MS = 60 * 60 * 1000;

/**
 * True when a finished rendition is on disk. Its mtime is refreshed on use:
 * that is the clock pruneRenderCache reads, so renditions people still open
 * stay while forgotten ones go.
 */
function cachedRendition(path: string): boolean {
  let stats;
  try {
    stats = statSync(path);
  } catch {
    return false;
  }
  if (!stats.isFile() || stats.size === 0) return false;
  if (Date.now() - stats.mtimeMs > TOUCH_EVERY_MS) {
    try {
      const now = new Date();
      utimesSync(path, now, now);
    } catch {
      /* a failed touch does not make the rendition any less usable */
    }
  }
  return true;
}

/**
 * Converters write to a ".part" name and only a clean exit renames it into
 * place, so nobody - a second viewer, the thumbnailer - ever reads half a
 * file, and a run killed at its timeout leaves nothing behind to be served.
 */
function publish(part: string, out: string, ok: boolean): boolean {
  try {
    if (ok && statSync(part).size > 0) {
      renameSync(part, out);
      return true;
    }
  } catch {
    /* nothing was produced */
  }
  try {
    rmSync(part, { force: true });
  } catch {
    /* pruned with the rest of .render */
  }
  return false;
}

/** A rendition the preview window already produced, without creating anything. */
export function existingRender(transferId: string, file: TransferFile, suffix: string): string | null {
  const path = join(transferDir(transferId), '.render', `out-${file.file_index}.${suffix}`);
  return cachedRendition(path) ? path : null;
}

/**
 * Deletes renditions nobody has opened for ttlMs, returning the bytes freed.
 * They are rebuilt on the next request, so this only trades a little CPU for
 * disk. The staged links (src-*) stay: they are empty and a conversion may be
 * reading through one right now.
 */
export function pruneRenderCache(
  transferId: string,
  now = Date.now(),
  ttlMs = RENDER_CACHE_TTL_MS,
): number {
  const dir = join(transferDir(transferId), '.render');
  if (!existsSync(dir)) return 0;

  let freed = 0;
  for (const name of readdirSync(dir)) {
    if (!name.startsWith('out-')) continue;
    const path = join(dir, name);
    try {
      const stats = statSync(path);
      if (!stats.isFile() || now - stats.mtimeMs <= ttlMs) continue;
      rmSync(path, { force: true });
      freed += stats.size;
    } catch {
      /* already gone */
    }
  }
  return freed;
}

/* ------------------------------------------------------------- documents */

async function renderDocument(transferId: string, file: TransferFile): Promise<RenderResult | null> {
  const out = cachePath(transferId, file, 'pdf');
  if (cachedRendition(out)) return { path: out, mime: 'application/pdf' };

  const input = stagedInput(transferId, file);
  const dir = renderDir(transferId);
  // A dedicated profile per run avoids LibreOffice's single-instance lock.
  const profile = join(dir, `lo-${file.file_index}`);

  const result = await run(
    [
      'soffice',
      '--headless',
      '--nologo',
      '--nolockcheck',
      '--nodefault',
      '--norestore',
      `-env:UserInstallation=file://${profile}`,
      '--convert-to',
      'pdf',
      '--outdir',
      dir,
      input,
    ],
    RENDER_DOC_TIMEOUT_MS,
  );

  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    /* best effort */
  }

  // LibreOffice names the output after the input basename, next to the
  // input - a name nothing else reads, so it doubles as the ".part" file.
  const produced = join(dir, `src-${file.file_index}.pdf`);
  if (publish(produced, out, !result.timedOut && result.code === 0)) {
    return { path: out, mime: 'application/pdf' };
  }

  console.error(`📄 doc render failed for ${file.rel_path}: code ${result.code} ${result.stderr.slice(0, 200)}`);
  return null;
}

/* ---------------------------------------------------------------- images */

async function renderImage(transferId: string, file: TransferFile): Promise<RenderResult | null> {
  const out = cachePath(transferId, file, 'png');
  if (cachedRendition(out)) return { path: out, mime: 'image/png' };

  const input = stagedInput(transferId, file);
  const ext = extensionOf(file.rel_path);
  // "[0]" takes the first layer/page and composites PSD; harmless for others.
  const spec = ext === 'psd' || ext === 'psb' ? `${input}[0]` : `${input}[0]`;

  const part = cachePath(transferId, file, 'part.png');
  const result = await run(
    ['convert', '-limit', 'thread', '2', spec, '-auto-orient', '-flatten', `png:${part}`],
    RENDER_IMAGE_TIMEOUT_MS,
  );

  if (publish(part, out, !result.timedOut && result.code === 0)) return { path: out, mime: 'image/png' };

  console.error(`🖼️  image render failed for ${file.rel_path}: code ${result.code} ${result.stderr.slice(0, 200)}`);
  return null;
}

/* ----------------------------------------------------------------- video */

interface Probe {
  vcodec: string | null;
  acodec: string | null;
}

async function probeVideo(input: string): Promise<Probe | null> {
  const result = await run(
    ['ffprobe', '-v', 'quiet', '-print_format', 'json', '-show_streams', input],
    20_000,
  );
  if (result.code !== 0) return null;
  try {
    const data = JSON.parse(result.stdout) as { streams?: { codec_type?: string; codec_name?: string }[] };
    const streams = data.streams ?? [];
    return {
      vcodec: streams.find((s) => s.codec_type === 'video')?.codec_name ?? null,
      acodec: streams.find((s) => s.codec_type === 'audio')?.codec_name ?? null,
    };
  } catch {
    return null;
  }
}

const WEB_VIDEO_CODECS = new Set(['h264', 'avc1']);

async function renderVideo(transferId: string, file: TransferFile): Promise<RenderResult | null> {
  const mp4 = cachePath(transferId, file, 'mp4');
  if (cachedRendition(mp4)) return { path: mp4, mime: 'video/mp4' };
  const poster = cachePath(transferId, file, 'jpg');
  if (cachedRendition(poster)) return { path: poster, mime: 'image/jpeg' };

  const input = stagedInput(transferId, file);
  const size = fileSizeOrNull(input) ?? Infinity;
  const probe = await probeVideo(input);

  const clean = (result: RunResult) => !result.timedOut && result.code === 0;
  const part = cachePath(transferId, file, 'part.mp4');

  // H.264 video: keep the stream, only normalise the container and audio.
  if (probe && probe.vcodec && WEB_VIDEO_CODECS.has(probe.vcodec)) {
    const remux = await run(
      ['ffmpeg', '-nostdin', '-y', '-i', input, '-c:v', 'copy', '-c:a', 'aac',
        '-movflags', '+faststart', '-map', '0:v:0', '-map', '0:a:0?', part],
      RENDER_VIDEO_TIMEOUT_MS,
    );
    if (publish(part, mp4, clean(remux))) return { path: mp4, mime: 'video/mp4' };
    console.warn(`🎞️  remux failed for ${file.rel_path}: ${remux.stderr.slice(0, 160)}`);
  }

  // Otherwise transcode, but only for inputs small enough to bound the cost.
  if (size <= RENDER_VIDEO_TRANSCODE_MAX_BYTES) {
    const transcode = await run(
      ['ffmpeg', '-nostdin', '-y', '-i', input, '-vf', "scale='min(1280,iw)':-2",
        '-c:v', 'libx264', '-crf', '28', '-preset', 'veryfast', '-c:a', 'aac',
        '-movflags', '+faststart', part],
      RENDER_VIDEO_TIMEOUT_MS,
    );
    if (publish(part, mp4, clean(transcode))) return { path: mp4, mime: 'video/mp4' };
  }

  // Last resort: a single poster frame so there is at least something to show.
  const posterPart = cachePath(transferId, file, 'part.jpg');
  const still = await run(
    ['ffmpeg', '-nostdin', '-y', '-i', input, '-frames:v', '1',
      '-vf', "scale='min(1280,iw)':-2", posterPart],
    60_000,
  );
  if (publish(posterPart, poster, clean(still))) return { path: poster, mime: 'image/jpeg' };

  return null;
}

/* --------------------------------------------------------------- dispatch */

/**
 * Produces (and caches) a browser-friendly rendition of a file. Returns null
 * when the type is not renderable or the conversion failed. Concurrency is
 * bounded and identical requests are coalesced.
 */
export async function renderPreview(
  transferId: string,
  file: TransferFile,
  kind: PreviewKind,
): Promise<RenderResult | null> {
  const source = storagePath(transferId, file.storage_name);
  const size = fileSizeOrNull(source);
  if (size === null) return null;
  if (kind !== 'video-render' && size > RENDER_MAX_INPUT_BYTES) return null;

  const key = `${transferId}:${file.file_index}:${kind}`;
  return inflight.run(key, () =>
    limiter.run(async () => {
      switch (kind) {
        case 'document':
          return renderDocument(transferId, file);
        case 'image-render':
          return renderImage(transferId, file);
        case 'video-render':
          return renderVideo(transferId, file);
        default:
          return null;
      }
    }),
  );
}
