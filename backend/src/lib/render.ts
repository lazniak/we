import { existsSync, mkdirSync, rmSync, statSync, symlinkSync, copyFileSync } from 'fs';
import { join } from 'path';
import {
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
import { run, Semaphore, SingleFlight } from './subprocess';

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
function stagedInput(transferId: string, file: TransferFile): string {
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

/* ------------------------------------------------------------- documents */

async function renderDocument(transferId: string, file: TransferFile): Promise<RenderResult | null> {
  const out = cachePath(transferId, file, 'pdf');
  if (existsSync(out) && statSync(out).size > 0) return { path: out, mime: 'application/pdf' };

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

  // LibreOffice names the output after the input basename.
  const produced = join(dir, `src-${file.file_index}.pdf`);
  if (existsSync(produced)) {
    if (produced !== out) {
      try {
        copyFileSync(produced, out);
        rmSync(produced, { force: true });
      } catch {
        return { path: produced, mime: 'application/pdf' };
      }
    }
    return { path: out, mime: 'application/pdf' };
  }

  console.error(`📄 doc render failed for ${file.rel_path}: code ${result.code} ${result.stderr.slice(0, 200)}`);
  return null;
}

/* ---------------------------------------------------------------- images */

async function renderImage(transferId: string, file: TransferFile): Promise<RenderResult | null> {
  const out = cachePath(transferId, file, 'png');
  if (existsSync(out) && statSync(out).size > 0) return { path: out, mime: 'image/png' };

  const input = stagedInput(transferId, file);
  const ext = extensionOf(file.rel_path);
  // "[0]" takes the first layer/page and composites PSD; harmless for others.
  const spec = ext === 'psd' || ext === 'psb' ? `${input}[0]` : `${input}[0]`;

  const result = await run(
    ['convert', '-limit', 'thread', '2', spec, '-auto-orient', '-flatten', `png:${out}`],
    RENDER_IMAGE_TIMEOUT_MS,
  );

  if (existsSync(out) && statSync(out).size > 0) return { path: out, mime: 'image/png' };

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
  if (existsSync(mp4) && statSync(mp4).size > 0) return { path: mp4, mime: 'video/mp4' };
  const poster = cachePath(transferId, file, 'jpg');
  if (existsSync(poster) && statSync(poster).size > 0) return { path: poster, mime: 'image/jpeg' };

  const input = stagedInput(transferId, file);
  const size = fileSizeOrNull(input) ?? Infinity;
  const probe = await probeVideo(input);

  // H.264 video: keep the stream, only normalise the container and audio.
  if (probe && probe.vcodec && WEB_VIDEO_CODECS.has(probe.vcodec)) {
    const remux = await run(
      ['ffmpeg', '-nostdin', '-y', '-i', input, '-c:v', 'copy', '-c:a', 'aac',
        '-movflags', '+faststart', '-map', '0:v:0', '-map', '0:a:0?', mp4],
      RENDER_VIDEO_TIMEOUT_MS,
    );
    if (existsSync(mp4) && statSync(mp4).size > 0) return { path: mp4, mime: 'video/mp4' };
    console.warn(`🎞️  remux failed for ${file.rel_path}: ${remux.stderr.slice(0, 160)}`);
  }

  // Otherwise transcode, but only for inputs small enough to bound the cost.
  if (size <= RENDER_VIDEO_TRANSCODE_MAX_BYTES) {
    await run(
      ['ffmpeg', '-nostdin', '-y', '-i', input, '-vf', "scale='min(1280,iw)':-2",
        '-c:v', 'libx264', '-crf', '28', '-preset', 'veryfast', '-c:a', 'aac',
        '-movflags', '+faststart', mp4],
      RENDER_VIDEO_TIMEOUT_MS,
    );
    if (existsSync(mp4) && statSync(mp4).size > 0) return { path: mp4, mime: 'video/mp4' };
  }

  // Last resort: a single poster frame so there is at least something to show.
  await run(
    ['ffmpeg', '-nostdin', '-y', '-i', input, '-frames:v', '1',
      '-vf', "scale='min(1280,iw)':-2", poster],
    60_000,
  );
  if (existsSync(poster) && statSync(poster).size > 0) return { path: poster, mime: 'image/jpeg' };

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
