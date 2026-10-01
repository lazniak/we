#!/usr/bin/env node
/**
 * Encodes the studio promo films for the web.
 *
 * Drop an original (any size, 16:9 preferred) as public/promo/<art>.mp4, where
 * <art> is a PromoArtKey, then run `npm run promo:video`. The script:
 *   1. moves new originals to assets/promo-sources/video (kept out of git),
 *   2. bakes a ping-pong loop into each film: forward, then backward without
 *      repeating either end frame, so a plain `loop` plays it seamlessly,
 *   3. writes silent renditions to public/promo/video: 1920x1080 for the
 *      desktop stage and 1280x720 for the phone banner, each as AV1 WebM (what
 *      most browsers play, about a third smaller) and H.264 MP4 (the fallback
 *      for Safari without AV1 hardware), plus <art>.webp, the first frame, as
 *      the poster,
 *   4. regenerates components/promoVideos.ts, which switches those arts from
 *      still images to films and versions their URLs.
 *
 * Up-to-date renditions are skipped; pass --force to re-encode everything.
 * FFMPEG and FFPROBE may point at the binaries when they are not on PATH.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DROP = join(root, 'public', 'promo');
const SOURCES = join(root, 'assets', 'promo-sources', 'video');
const OUT = join(root, 'public', 'promo', 'video');
const MANIFEST = join(root, 'components', 'promoVideos.ts');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const FFPROBE = process.env.FFPROBE || 'ffprobe';
const force = process.argv.includes('--force');

/** Files still being written (an export in progress) are left for the next run. */
const SETTLE_MS = 30_000;
/** Encoders already spread over several cores; a few at once fill the rest. */
const JOBS = Math.max(1, Math.min(4, Math.floor(cpus().length / 6)));

/** CRF per codec: AV1 needs a higher value at 720p to come out lighter than H.264. */
const SIZES = [
  { suffix: '1080', width: 1920, height: 1080, h264: 31, av1: 42 },
  { suffix: '720', width: 1280, height: 720, h264: 32, av1: 46 },
];

function run(bin, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => reject(new Error(`${bin}: ${error.message}`)));
    child.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${bin} exited with ${code}\n${stderr.trim().split('\n').slice(-5).join('\n')}`));
    });
  });
}

async function frameCount(file) {
  const out = await run(FFPROBE, [
    '-v', 'error', '-select_streams', 'v:0', '-count_packets',
    '-show_entries', 'stream=nb_read_packets', '-of', 'csv=p=0', file,
  ]);
  const frames = Number.parseInt(out.trim(), 10);
  if (!Number.isFinite(frames) || frames < 1) throw new Error(`no video frames in ${file}`);
  return frames;
}

function isFresh(target, source) {
  return !force && existsSync(target) && statSync(target).mtimeMs >= statSync(source).mtimeMs;
}

function fit(width, height) {
  return `scale=${width}:${height}:force_original_aspect_ratio=increase:flags=lanczos,crop=${width}:${height},format=yuv420p`;
}

function encoderArgs(codec, size) {
  if (codec === 'webm') {
    return ['-c:v', 'libsvtav1', '-preset', '4', '-crf', String(size.av1), '-g', '240', '-svtav1-params', 'tune=0', '-f', 'webm'];
  }
  return ['-c:v', 'libx264', '-preset', 'slower', '-crf', String(size.h264), '-profile:v', 'high', '-movflags', '+faststart'];
}

function encode(source, target, size, codec, frames) {
  // Frames 0..n-1 forward, then n-2..1 backward; the loop returns to frame 0.
  const graph = frames > 2
    ? `[0:v]${fit(size.width, size.height)},split[f][b];[b]reverse,trim=start_frame=1:end_frame=${frames - 1},setpts=PTS-STARTPTS[r];[f][r]concat=n=2:v=1:a=0[v]`
    : `[0:v]${fit(size.width, size.height)}[v]`;
  return run(FFMPEG, [
    '-v', 'error', '-y', '-i', source, '-an', '-filter_complex', graph, '-map', '[v]',
    ...encoderArgs(codec, size), '-pix_fmt', 'yuv420p', target,
  ]);
}

function poster(source, target) {
  return run(FFMPEG, [
    '-v', 'error', '-y', '-i', source, '-frames:v', '1', '-vf', fit(1920, 1080),
    '-c:v', 'libwebp', '-quality', '90', target,
  ]);
}

async function pool(tasks, limit) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (next < tasks.length) await tasks[next++]();
  });
  await Promise.all(workers);
}

mkdirSync(SOURCES, { recursive: true });
mkdirSync(OUT, { recursive: true });

for (const name of readdirSync(DROP)) {
  if (!name.toLowerCase().endsWith('.mp4')) continue;
  const from = join(DROP, name);
  if (Date.now() - statSync(from).mtimeMs < SETTLE_MS) {
    console.log(`skip ${name}: modified moments ago, still being written?`);
    continue;
  }
  renameSync(from, join(SOURCES, name.toLowerCase()));
  console.log(`moved ${name} -> assets/promo-sources/video`);
}

const arts = readdirSync(SOURCES).filter((name) => name.endsWith('.mp4')).sort().map((name) => {
  const art = name.slice(0, -4);
  const outputs = SIZES.flatMap((size) => ['webm', 'mp4'].map((codec) => ({
    size, codec, file: join(OUT, `${art}-${size.suffix}.${codec}`),
  })));
  return { art, source: join(SOURCES, name), outputs, poster: join(OUT, `${art}.webp`) };
});

const tasks = [];
for (const { art, source, outputs, poster: posterFile } of arts) {
  const frames = outputs.some((o) => !isFresh(o.file, source)) ? frameCount(source) : null;
  for (const o of outputs) {
    if (isFresh(o.file, source)) continue;
    tasks.push(async () => {
      const started = Date.now();
      await encode(source, o.file, o.size, o.codec, await frames);
      const mb = (statSync(o.file).size / 1e6).toFixed(2);
      console.log(`${art}-${o.size.suffix}.${o.codec}  ${mb} MB  ${((Date.now() - started) / 1000).toFixed(0)} s`);
    });
  }
  if (!isFresh(posterFile, source)) tasks.push(() => poster(source, posterFile));
}
await pool(tasks, JOBS);

const versions = {};
for (const { art, outputs, poster: posterFile } of arts) {
  const hash = createHash('sha1');
  for (const file of [...outputs.map((o) => o.file), posterFile]) hash.update(readFileSync(file));
  versions[art] = hash.digest('hex').slice(0, 10);
}

const body = Object.entries(versions).map(([art, v]) => `  ${art}: '${v}',`).join('\n');
writeFileSync(
  MANIFEST,
  `// Generated by scripts/encode-promo-videos.mjs. Do not edit by hand.
// Arts listed here play a silent ping-pong film from public/promo/video; the
// value versions its URLs.
import type { PromoArtKey } from './PromoArt';

export const PROMO_VIDEOS: Partial<Record<PromoArtKey, string>> = {
${body}
};
`,
);
console.log(`${Object.keys(versions).length} films -> components/promoVideos.ts`);
