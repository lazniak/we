import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import JSZip from 'jszip';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const PORT = 3199;
const BASE = `http://127.0.0.1:${PORT}`;
const CHUNK_SIZE = 5 * 1024 * 1024;

const root = mkdtempSync(join(tmpdir(), 'we-e2e-'));
const uploadsDir = join(root, 'uploads');
const dataDir = join(root, 'data');

let server: ReturnType<typeof Bun.spawn> | null = null;

async function startServer() {
  server = Bun.spawn(['bun', 'src/index.ts'], {
    cwd: import.meta.dir.replace(/[\\/]src$/, ''),
    env: {
      ...process.env,
      PORT: String(PORT),
      UPLOADS_DIR: uploadsDir,
      DATA_DIR: dataDir,
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

async function createTransfer(payloads: Payload[], dirs: string[] = [], expirationDays = 3) {
  const res = await fetch(`${BASE}/api/transfer/init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
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
  await waitUntilReady(init.transferId);

  return init;
}

/** Polls until the transfer leaves the scanning state. */
async function waitUntilReady(transferId: string): Promise<string> {
  for (let i = 0; i < 100; i++) {
    const info = await (await fetch(`${BASE}/api/transfer/${transferId}`)).json();
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

    const preview = await fetch(`${BASE}/api/transfer/${transferId}/preview/${exe.id}`);
    expect(preview.status).toBe(415);
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

    // Anything outside the allow-list is still refused outright.
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
