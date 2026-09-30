import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import JSZip from 'jszip';
import sharp from 'sharp';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const PORT = 3199;
const BASE = `http://127.0.0.1:${PORT}`;
const CHUNK_SIZE = 5 * 1024 * 1024;

const root = mkdtempSync(join(tmpdir(), 'we-e2e-'));
const uploadsDir = join(root, 'uploads');
const dataDir = join(root, 'data');
const thumbsDir = join(root, 'thumbs');

let server: ReturnType<typeof Bun.spawn> | null = null;

async function startServer() {
  server = Bun.spawn(['bun', 'src/index.ts'], {
    cwd: import.meta.dir.replace(/[\\/]src$/, ''),
    env: {
      ...process.env,
      PORT: String(PORT),
      UPLOADS_DIR: uploadsDir,
      DATA_DIR: dataDir,
      THUMB_CACHE_DIR: thumbsDir,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await Bun.sleep(120);
  }
  throw new Error('backend did not start');
}

async function stopServer() {
  if (!server) return;
  server.kill();
  await server.exited;
  server = null;
  await Bun.sleep(150);
}

/** Uploads a payload for one planned file, chunk by chunk. */
async function uploadFile(transferId: string, index: number, data: Uint8Array) {
  const chunks = Math.max(1, Math.ceil(data.length / CHUNK_SIZE));
  for (let i = 0; i < chunks; i++) {
    const slice = data.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    const res = await fetch(`${BASE}/api/transfer/${transferId}/file/${index}/chunk/${i}`, {
      method: 'PUT',
      body: slice,
      headers: { 'Content-Type': 'application/octet-stream' },
    });
    expect(res.status).toBe(200);
  }
}

interface Payload {
  path: string;
  data: Uint8Array;
}

function text(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

async function createTransfer(
  payloads: Payload[],
  dirs: string[] = [],
  expirationDays = 3,
  extra: Record<string, unknown> = {},
) {
  const res = await fetch(`${BASE}/api/transfer/init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...extra,
      expirationDays,
      dirs,
      files: payloads.map((p) => ({ path: p.path, size: p.data.length, type: '' })),
    }),
  });
  expect(res.status).toBe(200);
  const init = (await res.json()) as {
    transferId: string;
    ownerToken: string;
    files: { index: number; path: string }[];
  };

  for (const file of init.files) {
    await uploadFile(init.transferId, file.index, payloads[file.index].data);
  }

  const complete = await fetch(`${BASE}/api/transfer/${init.transferId}/complete`, {
    method: 'POST',
  });
  expect(complete.status).toBe(200);

  // On a host with clamd the transfer passes through a brief "scanning" state
  // before it is downloadable. Wait it out so the assertions see the final
  // verdict rather than racing the scanner.
  await waitUntilReady(init.transferId, init.ownerToken);

  return init;
}

/** Polls until the transfer leaves the scanning state. */
async function waitUntilReady(transferId: string, ownerToken?: string): Promise<string> {
  for (let i = 0; i < 100; i++) {
    const info = await (
      await fetch(`${BASE}/api/transfer/${transferId}`, {
        headers: ownerToken ? { 'X-Owner-Token': ownerToken } : undefined,
      })
    ).json();
    if (info.status !== 'scanning') return info.status;
    await Bun.sleep(100);
  }
  throw new Error(`transfer ${transferId} stuck scanning`);
}

beforeAll(startServer);

afterAll(async () => {
  await stopServer();
  rmSync(root, { recursive: true, force: true });
});

describe('upload → download round trip', () => {
  const payloads: Payload[] = [
    { path: 'projekt/readme.md', data: text('# projekt\nząb, żółw, ćma') },
    { path: 'projekt/src/index.ts', data: text('export const x = 1;\n') },
    { path: 'projekt/assets/big.bin', data: new Uint8Array(12 * 1024 * 1024).fill(7) },
    { path: 'projekt/setup.exe', data: text('MZ fake executable') },
  ];

  let transferId = '';
  let ownerToken = '';

  it('accepts a folder upload and reports the full tree', async () => {
    const init = await createTransfer(payloads, ['projekt/empty-folder']);
    transferId = init.transferId;
    ownerToken = init.ownerToken;

    const info = await (await fetch(`${BASE}/api/transfer/${transferId}`)).json();
    expect(info.status).toBe('ready');
    expect(info.fileCount).toBe(4);
    expect(info.isSingleFile).toBe(false);

    const paths = info.entries.map((e: { path: string }) => e.path).sort();
    expect(paths).toContain('projekt/src/index.ts');
    expect(paths).toContain('projekt/empty-folder');
    expect(paths).toContain('projekt/assets');

    const exe = info.entries.find((e: { path: string }) => e.path.endsWith('setup.exe'));
    expect(exe.isDangerous).toBe(true);
  });

  it('serves the whole transfer as a valid zip of the announced size', async () => {
    const res = await fetch(`${BASE}/api/transfer/${transferId}/download`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/zip');

    // Bun answers streamed bodies with chunked encoding, so the exact size is
    // published separately - and it has to match to the byte.
    const declared = Number(res.headers.get('x-archive-size'));
    const buffer = new Uint8Array(await res.arrayBuffer());
    expect(declared).toBeGreaterThan(0);
    expect(buffer.length).toBe(declared);

    const zip = await JSZip.loadAsync(buffer, { checkCRC32: true });
    for (const payload of payloads) {
      const entry = zip.file(payload.path);
      expect(entry, `missing ${payload.path}`).not.toBeNull();
      const content = await entry!.async('uint8array');
      expect(content.length).toBe(payload.data.length);
    }

    // Directory structure, including the folder that contains no files.
    expect(zip.files['projekt/']).toBeDefined();
    expect(zip.files['projekt/src/']).toBeDefined();
    expect(zip.files['projekt/empty-folder/']).toBeDefined();
  });

  it('downloads a single file from inside the package', async () => {
    const info = await (await fetch(`${BASE}/api/transfer/${transferId}`)).json();
    const entry = info.entries.find((e: { path: string }) => e.path === 'projekt/readme.md');

    const res = await fetch(`${BASE}/api/transfer/${transferId}/file/${entry.id}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toContain('attachment');
    expect(await res.text()).toBe('# projekt\nząb, żółw, ćma');
  });

  it('downloads one folder as its own zip', async () => {
    const res = await fetch(
      `${BASE}/api/transfer/${transferId}/download?path=${encodeURIComponent('projekt/src')}`,
    );
    expect(res.status).toBe(200);

    const zip = await JSZip.loadAsync(new Uint8Array(await res.arrayBuffer()), {
      checkCRC32: true,
    });
    expect(zip.file('index.ts')).not.toBeNull();
    expect(zip.file('readme.md')).toBeNull();
  });

  it('wraps executables in a zip instead of serving them raw', async () => {
    const info = await (await fetch(`${BASE}/api/transfer/${transferId}`)).json();
    const exe = info.entries.find((e: { path: string }) => e.path.endsWith('setup.exe'));

    const res = await fetch(`${BASE}/api/transfer/${transferId}/file/${exe.id}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/zip');
    expect(res.headers.get('content-disposition')).toContain('setup.exe.zip');

    const zip = await JSZip.loadAsync(new Uint8Array(await res.arrayBuffer()));
    expect(zip.file('setup.exe')).not.toBeNull();

    // A binary executable has no inert representation, so preview is refused.
    const preview = await fetch(`${BASE}/api/transfer/${transferId}/preview/${exe.id}`);
    expect(preview.status).toBe(415);
  });

  it('previews an executable script as harmless text while zipping its download', async () => {
    // A .py is dangerous to download (handed over zipped) but safe to preview,
    // because the preview is served as text/plain and cannot run.
    const init = await createTransfer([
      { path: 'deploy.py', data: text('import os\nprint("to jest tylko tekst")') },
    ]);

    const info = await (await fetch(`${BASE}/api/transfer/${init.transferId}`)).json();
    const script = info.entries[0];
    expect(script.isDangerous).toBe(true);
    expect(script.previewable).toBe(true);

    const preview = await fetch(`${BASE}/api/transfer/${init.transferId}/preview/${script.id}`);
    expect(preview.status).toBe(200);
    expect(preview.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(await preview.text()).toContain('tylko tekst');

    // Downloading it is still an opaque, zipped attachment.
    const download = await fetch(`${BASE}/api/transfer/${init.transferId}/file/${script.id}`);
    expect(download.headers.get('content-type')).toBe('application/zip');
    expect(download.headers.get('content-disposition')).toContain('deploy.py.zip');
  });

  it('never lets uploaded markup render in the site origin', async () => {
    const init = await createTransfer([
      { path: 'page.html', data: text('<script>alert(document.domain)</script>') },
      { path: 'logo.svg', data: text('<svg xmlns="http://www.w3.org/2000/svg"></svg>') },
      { path: 'notes.docx', data: text('binary-ish') },
    ]);

    const info = await (await fetch(`${BASE}/api/transfer/${init.transferId}`)).json();
    const byName = (suffix: string) =>
      info.entries.find((e: { path: string }) => e.path.endsWith(suffix));

    // Markup is readable, but only ever as source: text/plain cannot execute.
    const html = await fetch(`${BASE}/api/transfer/${init.transferId}/preview/${byName('.html').id}`);
    expect(html.status).toBe(200);
    expect(html.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(html.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(html.headers.get('content-security-policy')).toContain('sandbox');

    // SVG keeps its own type so it can be shown as a picture, and carries a
    // policy that forbids scripts even if opened as a top level document.
    const svg = await fetch(`${BASE}/api/transfer/${init.transferId}/preview/${byName('.svg').id}`);
    expect(svg.status).toBe(200);
    expect(svg.headers.get('content-type')).toBe('image/svg+xml');
    expect(svg.headers.get('content-security-policy')).toContain('sandbox');

    // A binary type with no inert representation is still refused outright.
    expect(
      (await fetch(`${BASE}/api/transfer/${init.transferId}/preview/${byName('.docx').id}`)).status,
    ).toBe(415);

    // Downloading any of them stays an opaque attachment.
    for (const entry of info.entries.filter((e: { isDir: boolean }) => !e.isDir)) {
      const res = await fetch(`${BASE}/api/transfer/${init.transferId}/file/${entry.id}`);
      expect(res.headers.get('content-type')).toBe('application/octet-stream');
      expect(res.headers.get('content-disposition')).toContain('attachment');
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('content-security-policy')).toContain('sandbox');
    }
  });

  it('reports a real Content-Length and honours ranges for single files', async () => {
    const info = await (await fetch(`${BASE}/api/transfer/${transferId}`)).json();
    const entry = info.entries.find((e: { path: string }) => e.path === 'projekt/assets/big.bin');

    const whole = await fetch(`${BASE}/api/transfer/${transferId}/file/${entry.id}`);
    expect(Number(whole.headers.get('content-length'))).toBe(12 * 1024 * 1024);
    expect((await whole.arrayBuffer()).byteLength).toBe(12 * 1024 * 1024);

    const ranged = await fetch(`${BASE}/api/transfer/${transferId}/file/${entry.id}`, {
      headers: { Range: 'bytes=100-1099' },
    });
    expect(ranged.status).toBe(206);
    expect(ranged.headers.get('content-range')).toBe(`bytes 100-1099/${12 * 1024 * 1024}`);
    expect((await ranged.arrayBuffer()).byteLength).toBe(1000);

    const suffix = await fetch(`${BASE}/api/transfer/${transferId}/file/${entry.id}`, {
      headers: { Range: 'bytes=-500' },
    });
    expect(suffix.status).toBe(206);
    expect((await suffix.arrayBuffer()).byteLength).toBe(500);
  });

  it('refuses deletion without the owner token, accepts it with', async () => {
    const denied = await fetch(`${BASE}/api/transfer/${transferId}`, { method: 'DELETE' });
    expect(denied.status).toBe(403);
    expect(existsSync(join(uploadsDir, transferId))).toBe(true);

    const allowed = await fetch(`${BASE}/api/transfer/${transferId}`, {
      method: 'DELETE',
      headers: { 'X-Owner-Token': ownerToken },
    });
    expect(allowed.status).toBe(200);
    expect(existsSync(join(uploadsDir, transferId))).toBe(false);
    expect((await fetch(`${BASE}/api/transfer/${transferId}`)).status).toBe(404);
  });
});

describe('one-time transfers', () => {
  it('hands the package over once, then destroys it', async () => {
    const init = await createTransfer(
      [
        { path: 'raz/a.txt', data: text('pierwszy') },
        { path: 'raz/b.txt', data: text('drugi') },
      ],
      [],
      3,
      { oneTime: true },
    );
    const id = init.transferId;

    const info = await (await fetch(`${BASE}/api/transfer/${id}`)).json();
    expect(info.oneTime).toBe(true);
    expect(info.claimed).toBe(false);
    // The recipient sees names, never previews.
    expect(info.entries.every((e: { previewable: boolean }) => !e.previewable)).toBe(true);

    const fileEntry = info.entries.find((e: { isDir: boolean }) => !e.isDir);
    for (const path of [
      `/api/transfer/${id}/file/${fileEntry.id}`,
      `/api/transfer/${id}/preview/${fileEntry.id}`,
      `/api/transfer/${id}/thumb/${fileEntry.id}`,
      `/api/transfer/${id}/download?path=raz`,
    ]) {
      expect((await fetch(`${BASE}${path}`)).status).toBe(403);
    }

    // HEAD looks without using the link up.
    expect((await fetch(`${BASE}/api/transfer/${id}/download`, { method: 'HEAD' })).status).toBe(200);

    const first = await fetch(`${BASE}/api/transfer/${id}/download`);
    expect(first.status).toBe(200);
    const zip = await JSZip.loadAsync(await first.arrayBuffer());
    expect(await zip.file('raz/a.txt')!.async('string')).toBe('pierwszy');

    // Destruction happens as the stream ends; give it a beat.
    let status = 0;
    for (let i = 0; i < 40 && status !== 410; i++) {
      status = (await fetch(`${BASE}/api/transfer/${id}`)).status;
      if (status !== 410) await Bun.sleep(50);
    }
    const gone = await fetch(`${BASE}/api/transfer/${id}`);
    expect(gone.status).toBe(410);
    expect((await gone.json()).status).toBe('consumed');
    expect(existsSync(join(uploadsDir, id))).toBe(false);
    expect((await fetch(`${BASE}/api/transfer/${id}/download`)).status).toBe(410);
  });

  it('gives a single file back raw and still burns it', async () => {
    const init = await createTransfer([{ path: 'solo.txt', data: text('solo') }], [], 3, {
      oneTime: true,
    });
    const res = await fetch(`${BASE}/api/transfer/${init.transferId}/download`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('solo');
    expect(res.headers.get('x-archive-size')).toBe('4');

    let status = 0;
    for (let i = 0; i < 40 && status !== 410; i++) {
      status = (await fetch(`${BASE}/api/transfer/${init.transferId}`)).status;
      if (status !== 410) await Bun.sleep(50);
    }
    expect(status).toBe(410);
  });

  it('releases the transfer when the download breaks off, and turns away a second one meanwhile', async () => {
    const big = new Uint8Array(24 * 1024 * 1024).fill(3);
    const init = await createTransfer([{ path: 'duzy.bin', data: big }], [], 3, { oneTime: true });
    const id = init.transferId;

    const controller = new AbortController();
    const res = await fetch(`${BASE}/api/transfer/${id}/download`, { signal: controller.signal });
    expect(res.status).toBe(200);
    const reader = res.body!.getReader();
    await reader.read();

    // While the first download runs, nobody else gets in.
    const second = await fetch(`${BASE}/api/transfer/${id}/download`);
    expect(second.status).toBe(409);
    await second.arrayBuffer();
    const during = await (await fetch(`${BASE}/api/transfer/${id}`)).json();
    expect(during.claimed).toBe(true);

    controller.abort();
    await reader.cancel().catch(() => undefined);

    let info = { status: '', claimed: true };
    for (let i = 0; i < 60 && info.claimed; i++) {
      await Bun.sleep(50);
      info = await (await fetch(`${BASE}/api/transfer/${id}`)).json();
    }
    expect(info.status).toBe('ready');
    expect(info.claimed).toBe(false);
    expect(existsSync(join(uploadsDir, id))).toBe(true);

    const retry = await fetch(`${BASE}/api/transfer/${id}/download`);
    expect((await retry.arrayBuffer()).byteLength).toBe(big.length);
  });

  it('lets the sender look without using the link up', async () => {
    const init = await createTransfer([{ path: 'moje.txt', data: text('moje') }], [], 3, {
      oneTime: true,
    });
    const owner = { 'X-Owner-Token': init.ownerToken };

    const info = await (await fetch(`${BASE}/api/transfer/${init.transferId}`, { headers: owner })).json();
    expect(info.isOwner).toBe(true);
    const own = await fetch(`${BASE}/api/transfer/${init.transferId}/download`, { headers: owner });
    expect(await own.text()).toBe('moje');
    await Bun.sleep(100);

    const still = await (await fetch(`${BASE}/api/transfer/${init.transferId}`)).json();
    expect(still.status).toBe('ready');
  });
});

describe('password protected transfers', () => {
  it('rejects passwords that are too short', async () => {
    const res = await fetch(`${BASE}/api/transfer/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'abc', files: [{ path: 'a.txt', size: 1 }] }),
    });
    expect(res.status).toBe(400);
  });

  it('opens only with the right password, through a scoped cookie', async () => {
    const init = await createTransfer([{ path: 'tajne.txt', data: text('tajne dane') }], [], 3, {
      password: 'kotlet schabowy',
    });
    const id = init.transferId;

    const locked = await fetch(`${BASE}/api/transfer/${id}`);
    expect(locked.status).toBe(401);
    const lockedBody = await locked.json();
    expect(lockedBody.passwordRequired).toBe(true);
    expect(lockedBody.filename).toBeUndefined();
    expect(lockedBody.entries).toBeUndefined();

    expect((await fetch(`${BASE}/api/transfer/${id}/download`)).status).toBe(401);

    const wrong = await fetch(`${BASE}/api/transfer/${id}/unlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'mielony' }),
    });
    expect(wrong.status).toBe(403);
    expect(wrong.headers.get('set-cookie')).toBeNull();

    const right = await fetch(`${BASE}/api/transfer/${id}/unlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'kotlet schabowy' }),
    });
    expect(right.status).toBe(200);
    const setCookie = right.headers.get('set-cookie') || '';
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain(`Path=/api/transfer/${id}`);
    const cookie = setCookie.split(';')[0];

    const info = await fetch(`${BASE}/api/transfer/${id}`, { headers: { Cookie: cookie } });
    expect(info.status).toBe(200);
    expect((await info.json()).passwordProtected).toBe(true);

    const file = await fetch(`${BASE}/api/transfer/${id}/download`, { headers: { Cookie: cookie } });
    expect(await file.text()).toBe('tajne dane');

    // A cookie for another transfer, or a forged one, opens nothing.
    const forged = await fetch(`${BASE}/api/transfer/${id}/download`, {
      headers: { Cookie: `we_unlock_${id}=${'x'.repeat(32)}` },
    });
    expect(forged.status).toBe(401);
  });

  it('lets the owner token unlock without the password', async () => {
    const init = await createTransfer([{ path: 'x.txt', data: text('x') }], [], 3, {
      password: 'haslo1234',
    });
    const res = await fetch(`${BASE}/api/transfer/${init.transferId}/unlock`, {
      method: 'POST',
      headers: { 'X-Owner-Token': init.ownerToken },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toContain(`we_unlock_${init.transferId}=`);
  });

  it('stops listening after a burst of wrong guesses', async () => {
    const init = await createTransfer([{ path: 'y.txt', data: text('y') }], [], 3, {
      password: 'poprawne',
    });
    let last = 0;
    for (let i = 0; i < 14; i++) {
      last = (
        await fetch(`${BASE}/api/transfer/${init.transferId}/unlock`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: `zle-${i}` }),
        })
      ).status;
    }
    expect(last).toBe(429);
  });
});

describe('thumbnails', () => {
  const hasFfmpeg = Bun.which('ffmpeg') !== null;
  const hasX264 =
    hasFfmpeg && Bun.spawnSync(['ffmpeg', '-hide_banner', '-encoders']).stdout.toString().includes('libx264');
  const mediaDir = join(root, 'media');
  let transferId = '';
  let ownerToken = '';
  const ids: Record<string, number> = {};

  const thumbUrl = (name: string, size?: string) =>
    `${BASE}/api/transfer/${transferId}/thumb/${ids[name]}${size ? `?s=${size}` : ''}`;

  async function picture(res: Response) {
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/webp');
    return sharp(Buffer.from(await res.arrayBuffer())).metadata();
  }

  /** Renders a small media file with ffmpeg and returns its bytes. */
  function ffmpeg(name: string, args: string[]): Uint8Array {
    mkdirSync(mediaDir, { recursive: true });
    const out = join(mediaDir, name);
    const result = Bun.spawnSync(['ffmpeg', '-v', 'error', '-y', ...args, out]);
    if (result.exitCode !== 0) throw new Error(`ffmpeg failed for ${name}: ${result.stderr}`);
    return readFileSync(out);
  }

  it('makes a small square WebP of a photo', async () => {
    // Stored landscape with EXIF orientation 6: the camera was held upright.
    const photo = await sharp({ create: { width: 1600, height: 1000, channels: 3, background: '#c33' } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const payloads: Payload[] = [
      { path: 'media/photo.jpg', data: photo },
      {
        path: 'media/logo.svg',
        data: text('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="12"><rect width="24" height="12" fill="#09f"/></svg>'),
      },
      { path: 'media/notes.txt', data: text('not a picture') },
      // SVG under a raster name: libvips would pick its SVG file loader by
      // content, which may resolve <image href> against the upload folder.
      {
        path: 'media/fake.png',
        data: text('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><image href="photo.jpg" width="64" height="64"/></svg>'),
      },
    ];

    if (hasFfmpeg) {
      const cover = join(mediaDir, 'cover.png');
      mkdirSync(mediaDir, { recursive: true });
      await sharp({ create: { width: 300, height: 300, channels: 3, background: '#fa0' } }).png().toFile(cover);
      payloads.push(
        {
          path: 'media/clip.mp4',
          data: ffmpeg('clip.mp4', ['-f', 'lavfi', '-i', 'testsrc=duration=2:size=640x360:rate=25', '-c:v', 'mpeg4']),
        },
        { path: 'media/tone.wav', data: ffmpeg('tone.wav', ['-f', 'lavfi', '-i', 'sine=frequency=440:duration=1']) },
        ...(hasX264
          ? [{
              path: 'media/clip.mkv',
              data: ffmpeg('clip.mkv', [
                '-f', 'lavfi', '-i', 'testsrc=duration=2:size=320x240:rate=25', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
              ]),
            }]
          : []),
        {
          path: 'media/song.flac',
          data: ffmpeg('song.flac', [
            '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-i', cover,
            '-map', '0:a', '-map', '1:v', '-c:a', 'flac', '-c:v', 'png', '-disposition:v', 'attached_pic',
          ]),
        },
      );
    }

    const init = await createTransfer(payloads);
    transferId = init.transferId;
    ownerToken = init.ownerToken;
    const info = await (await fetch(`${BASE}/api/transfer/${transferId}`)).json();
    for (const entry of info.entries) ids[entry.name] = entry.id;

    const res = await fetch(thumbUrl('photo.jpg'));
    expect(res.headers.get('cache-control')).toMatch(/^private, max-age=[1-9]\d*$/);
    const meta = await picture(res);
    expect([meta.width, meta.height]).toEqual([384, 384]);
  });

  it('keeps the aspect ratio in the large size and stands the photo upright', async () => {
    const meta = await picture(await fetch(thumbUrl('photo.jpg', 'lg')));
    expect([meta.width, meta.height]).toEqual([800, 1280]);
  });

  it('serves repeats from the disk cache and answers 304 to a known ETag', async () => {
    const first = await fetch(thumbUrl('photo.jpg'));
    const etag = first.headers.get('etag');
    expect(etag).toBeTruthy();

    const again = await fetch(thumbUrl('photo.jpg'), { headers: { 'If-None-Match': etag! } });
    expect(again.status).toBe(304);

    const cached = readdirSync(join(thumbsDir, transferId)).filter((name) => name.endsWith('.webp'));
    expect(cached).toContain(`${ids['photo.jpg']}-sm.v1.webp`);
    expect(cached).toContain(`${ids['photo.jpg']}-lg.v1.webp`);
  });

  it('renders a tiny SVG at tile size instead of upscaling it', async () => {
    const meta = await picture(await fetch(thumbUrl('logo.svg')));
    expect([meta.width, meta.height]).toEqual([384, 384]);
  });

  it('refuses types without a picture and unknown sizes', async () => {
    expect((await fetch(thumbUrl('notes.txt'))).status).toBe(415);
    expect((await fetch(thumbUrl('photo.jpg', 'huge'))).status).toBe(400);
  });

  it('never renders SVG content read from a file', async () => {
    expect((await fetch(thumbUrl('fake.png'))).status).toBe(404);
  });

  it.if(hasX264)('publishes a rendition only once it is complete', async () => {
    const res = await fetch(`${BASE}/api/transfer/${transferId}/render/${ids['clip.mkv']}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('video/mp4');
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(0);

    const renders = readdirSync(join(uploadsDir, transferId, '.render'));
    expect(renders.some((name) => /^out-\d+\.mp4$/.test(name))).toBe(true);
    expect(renders.filter((name) => name.includes('.part.'))).toEqual([]);

    // The unplayable container still gets a frame for its tile.
    const frame = await picture(await fetch(thumbUrl('clip.mkv')));
    expect([frame.width, frame.height]).toEqual([320, 240]);
  }, 60_000);

  it.if(hasFfmpeg)('grabs a video frame and embedded cover art', async () => {
    // 640x360 is shorter than the tile: cropped to width, never enlarged.
    const frame = await picture(await fetch(thumbUrl('clip.mp4')));
    expect([frame.width, frame.height]).toEqual([384, 360]);
    // The frame cost an ffmpeg run, so the large size was cut from it right away.
    expect(existsSync(join(thumbsDir, transferId, `${ids['clip.mp4']}-lg.v1.webp`))).toBe(true);

    const cover = await picture(await fetch(thumbUrl('song.flac')));
    expect([cover.width, cover.height]).toEqual([300, 300]);
  });

  it.if(hasFfmpeg)('answers 404 for audio without cover art and remembers it', async () => {
    const res = await fetch(thumbUrl('tone.wav'));
    expect(res.status).toBe(404);
    expect(res.headers.get('cache-control')).toMatch(/^private, max-age=\d+$/);
    expect(existsSync(join(thumbsDir, transferId, `${ids['tone.wav']}-sm.v1.none`))).toBe(true);
  });

  it('deletes the thumbnails together with the transfer', async () => {
    expect(existsSync(join(thumbsDir, transferId))).toBe(true);
    const res = await fetch(`${BASE}/api/transfer/${transferId}`, {
      method: 'DELETE',
      headers: { 'X-Owner-Token': ownerToken },
    });
    expect(res.status).toBe(200);
    expect(existsSync(join(thumbsDir, transferId))).toBe(false);
  });
});

describe('single file transfers are never re-zipped', () => {
  it('returns the original bytes for one plain file', async () => {
    const data = text('just a plain text file');
    const init = await createTransfer([{ path: 'notes.txt', data }]);

    const info = await (await fetch(`${BASE}/api/transfer/${init.transferId}`)).json();
    expect(info.isSingleFile).toBe(true);

    const res = await fetch(`${BASE}/api/transfer/${init.transferId}/download`);
    expect(res.headers.get('content-type')).not.toBe('application/zip');
    expect(res.headers.get('content-disposition')).toContain('notes.txt');
    expect(await res.text()).toBe('just a plain text file');
  });

  it('gives back an uploaded zip byte for byte, not a zip of a zip', async () => {
    const inner = new JSZip();
    inner.file('inside.txt', 'payload');
    const zipBytes = new Uint8Array(await inner.generateAsync({ type: 'uint8array' }));

    const init = await createTransfer([{ path: 'archive.zip', data: zipBytes }]);
    const res = await fetch(`${BASE}/api/transfer/${init.transferId}/download`);
    const returned = new Uint8Array(await res.arrayBuffer());

    expect(returned.length).toBe(zipBytes.length);
    const reopened = await JSZip.loadAsync(returned);
    expect(reopened.file('inside.txt')).not.toBeNull();
    expect(reopened.file('archive.zip')).toBeNull();
  });
});

describe('hostile input', () => {
  it('cannot escape the uploads directory through file paths', async () => {
    const init = await createTransfer([
      { path: '../../../../../../tmp/pwned.txt', data: text('nope') },
      { path: 'C:\\Windows\\System32\\drivers\\etc\\hosts', data: text('nope') },
    ]);

    const info = await (await fetch(`${BASE}/api/transfer/${init.transferId}`)).json();
    const paths = info.entries.map((e: { path: string }) => e.path);
    expect(paths).toContain('tmp/pwned.txt');
    expect(paths).toContain('Windows/System32/drivers/etc/hosts');

    // Everything landed inside the transfer directory under opaque names.
    const stored = readdirSync(join(uploadsDir, init.transferId));
    expect(stored.every((name) => /^f\d{5}\.bin$/.test(name))).toBe(true);
  });

  it('rejects malformed ids, chunk indexes and oversized chunks', async () => {
    expect((await fetch(`${BASE}/api/transfer/..%2F..%2Fetc`)).status).toBe(404);
    expect((await fetch(`${BASE}/api/transfer/${'a'.repeat(60)}`)).status).toBe(404);

    const init = await createTransfer([{ path: 'a.txt', data: text('a') }]);
    const bad = await fetch(
      `${BASE}/api/transfer/${init.transferId}/file/0/chunk/../../../evil`,
      { method: 'PUT', body: 'x' },
    );
    expect(bad.status).toBeGreaterThanOrEqual(400);
  });

  it('refuses to complete a transfer whose payload never arrived', async () => {
    const res = await fetch(`${BASE}/api/transfer/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: [{ path: 'ghost.bin', size: 1024 }], expirationDays: 3 }),
    });
    const init = (await res.json()) as { transferId: string };

    const complete = await fetch(`${BASE}/api/transfer/${init.transferId}/complete`, {
      method: 'POST',
    });
    expect(complete.status).toBe(409);
    expect((await complete.json()).missing[0].path).toBe('ghost.bin');
  });

  it('round trips empty files and unicode paths', async () => {
    const init = await createTransfer([
      { path: 'pusty.txt', data: new Uint8Array(0) },
      { path: 'zdjęcia/wakacje ąćę.txt', data: text('zażółć gęślą jaźń') },
    ]);

    const res = await fetch(`${BASE}/api/transfer/${init.transferId}/download`);
    const zip = await JSZip.loadAsync(new Uint8Array(await res.arrayBuffer()), {
      checkCRC32: true,
    });

    expect((await zip.file('pusty.txt')!.async('uint8array')).length).toBe(0);
    expect(await zip.file('zdjęcia/wakacje ąćę.txt')!.async('string')).toBe(
      'zażółć gęślą jaźń',
    );
  });

  it('keeps progress honest when a chunk is uploaded twice', async () => {
    const data = new Uint8Array(7 * 1024 * 1024).fill(3);
    const res = await fetch(`${BASE}/api/transfer/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: [{ path: 'dup.bin', size: data.length }] }),
    });
    const init = (await res.json()) as { transferId: string };

    await uploadFile(init.transferId, 0, data);
    await uploadFile(init.transferId, 0, data); // full retry

    const info = await (await fetch(`${BASE}/api/transfer/${init.transferId}`)).json();
    expect(info.chunks_completed).toBe(2);
    expect(info.uploaded_size).toBe(data.length);
    expect(info.progress).toBe(100);
  });
});

describe('antivirus', () => {
  // EICAR: the industry standard harmless test signature every scanner flags.
  const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

  async function scannerPresent(): Promise<boolean> {
    try {
      const probe = Bun.spawn(['clamdscan', '--version'], { stdout: 'pipe', stderr: 'pipe' });
      return (await probe.exited) === 0;
    } catch {
      return false;
    }
  }

  it('destroys a transfer whose content trips the scanner', async () => {
    if (!(await scannerPresent())) {
      console.log('  (skipped: no clamd on this host)');
      return;
    }

    const res = await fetch(`${BASE}/api/transfer/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: [{ path: 'eicar.txt', size: EICAR.length }] }),
    });
    const init = (await res.json()) as { transferId: string };

    await uploadFile(init.transferId, 0, text(EICAR));
    await fetch(`${BASE}/api/transfer/${init.transferId}/complete`, { method: 'POST' });

    const verdict = await waitUntilReady(init.transferId);
    expect(verdict).toBe('infected');

    // Payload is gone from disk, and downloading is refused.
    expect(existsSync(join(uploadsDir, init.transferId))).toBe(false);
    const download = await fetch(`${BASE}/api/transfer/${init.transferId}/download`);
    expect(download.status).toBe(451);

    const info = await (await fetch(`${BASE}/api/transfer/${init.transferId}`)).json();
    expect(info.status).toBe('infected');
    expect(typeof info.threatName).toBe('string');
  });

  it('lets a clean transfer straight through', async () => {
    // createTransfer already waits for the verdict; reaching here means clean
    // content became downloadable.
    const init = await createTransfer([{ path: 'harmless.txt', data: text('zupełnie zwykły tekst') }]);
    const info = await (await fetch(`${BASE}/api/transfer/${init.transferId}`)).json();
    expect(info.status).toBe('ready');
  });
});

describe('expiration', () => {
  it('destroys payload and metadata once the transfer expires', async () => {
    const init = await createTransfer([{ path: 'secret.txt', data: text('classified') }]);
    const dir = join(uploadsDir, init.transferId);
    expect(existsSync(dir)).toBe(true);

    // The expiry is rewritten in exactly the format the application stores -
    // an ISO string - because comparing that against SQLite's own datetime()
    // output as plain text silently fails and files outlive their link.
    await stopServer();
    const db = new Database(join(dataDir, 'transfers.db'));
    db.run(`UPDATE transfers SET expires_at = ? WHERE id = ?`, [
      new Date(Date.now() - 3600_000).toISOString(),
      init.transferId,
    ]);
    const stored = db
      .query('SELECT expires_at FROM transfers WHERE id = ?')
      .get(init.transferId) as { expires_at: string };
    expect(stored.expires_at).toContain('T');
    db.close();
    await startServer();

    expect(existsSync(dir)).toBe(false);
    expect((await fetch(`${BASE}/api/transfer/${init.transferId}`)).status).toBe(404);
    expect((await fetch(`${BASE}/api/transfer/${init.transferId}/download`)).status).toBe(404);
  });

  it('reports an expired transfer as gone before the sweeper runs', async () => {
    const init = await createTransfer([{ path: 'later.txt', data: text('later') }]);

    await stopServer();
    const db = new Database(join(dataDir, 'transfers.db'));
    db.run(`UPDATE transfers SET expires_at = ? WHERE id = ?`, [
      new Date(Date.now() - 60_000).toISOString(),
      init.transferId,
    ]);
    db.close();
    await startServer();

    const res = await fetch(`${BASE}/api/transfer/${init.transferId}`);
    expect([404, 410]).toContain(res.status);
  });

  it('leaves an in-flight upload alone when the sweeper runs', async () => {
    const data = new Uint8Array(6 * 1024 * 1024).fill(9);
    const res = await fetch(`${BASE}/api/transfer/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: [{ path: 'inflight.bin', size: data.length }] }),
    });
    const init = (await res.json()) as { transferId: string };

    // Only the first half arrives, then the server restarts mid upload.
    await fetch(`${BASE}/api/transfer/${init.transferId}/file/0/chunk/0`, {
      method: 'PUT',
      body: data.slice(0, CHUNK_SIZE),
    });

    await stopServer();
    await startServer();

    await fetch(`${BASE}/api/transfer/${init.transferId}/file/0/chunk/1`, {
      method: 'PUT',
      body: data.slice(CHUNK_SIZE),
    });
    const complete = await fetch(`${BASE}/api/transfer/${init.transferId}/complete`, {
      method: 'POST',
    });
    expect(complete.status).toBe(200);

    // Let the scan (if any) settle before pulling the file back.
    expect(await waitUntilReady(init.transferId)).toBe('ready');

    const download = await fetch(`${BASE}/api/transfer/${init.transferId}/download`);
    expect(new Uint8Array(await download.arrayBuffer()).length).toBe(data.length);
  });
});
