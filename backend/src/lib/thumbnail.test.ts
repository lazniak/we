import { afterAll, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import sharp from 'sharp';
import { findLargestJpeg, parseJpegAt, tiffOrientation } from './rawPreview';
import { cacheDirIsSafe, sweepCacheDir } from './thumbnail';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function jpeg(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#3a7' } }).jpeg().toBuffer();
}

/** Deterministic noise standing in for packed sensor data. */
function noise(length: number, seed: number): Buffer {
  const out = Buffer.alloc(length);
  let x = seed;
  for (let i = 0; i < length; i++) {
    x = (x * 1103515245 + 12345) >>> 0;
    out[i] = x >>> 24;
  }
  return out;
}

describe('embedded RAW preview', () => {
  it('finds the largest decodable JPEG among sensor noise and decoys', async () => {
    const small = await jpeg(160, 120);
    const large = await jpeg(1200, 800);
    const decoy = Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x04, 0x13, 0x37]); // a start marker, nothing after
    const buf = Buffer.concat([
      noise(4096, 1), small, noise(50_000, 2), decoy, noise(9000, 3), large, noise(70_000, 4),
    ]);

    const found = findLargestJpeg(buf);
    expect(found).not.toBeNull();
    expect(found!.width).toBe(1200);
    expect(found!.height).toBe(800);
    expect(buf.subarray(found!.offset, found!.offset + found!.length).equals(large)).toBe(true);

    const meta = await sharp(buf.subarray(found!.offset, found!.offset + found!.length)).metadata();
    expect(meta.width).toBe(1200);
  });

  it('rejects a JPEG cut off before its end marker', async () => {
    const whole = await jpeg(400, 300);
    expect(parseJpegAt(whole, 0)?.length).toBe(whole.length);
    expect(parseJpegAt(whole.subarray(0, whole.length - 200), 0)).toBeNull();
  });

  it('returns null when there is no usable JPEG at all', () => {
    expect(findLargestJpeg(noise(200_000, 9))).toBeNull();
  });

  /**
   * 64 start markers whose APP1 segments all jump to one shared block, so a
   * naive search would walk that block once per candidate.
   */
  function hostile(block: Buffer): Buffer {
    const count = 64;
    const heads: Buffer[] = [];
    for (let k = 0; k < count; k++) {
      // FF D8 FF E1 + length: the length skips every head after this one.
      const length = 2 + (count - k - 1) * 6;
      heads.push(Buffer.from([0xff, 0xd8, 0xff, 0xe1, length >> 8, length & 0xff]));
    }
    return Buffer.concat([...heads, block]);
  }

  it('caps the work a hostile layout can cause: scan data', () => {
    const frameAndScan = Buffer.from([
      0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x10, 0x00, 0x10, 0x01, 0x01, 0x11, 0x00,
      0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
    ]);
    const stuffed = Buffer.alloc(16 * 1024 * 1024);
    for (let i = 0; i < stuffed.length; i += 2) stuffed[i] = 0xff; // FF 00 FF 00 …, never an end

    const started = performance.now();
    expect(findLargestJpeg(hostile(Buffer.concat([frameAndScan, stuffed])))).toBeNull();
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it('caps the work a hostile layout can cause: fill bytes', () => {
    const started = performance.now();
    expect(findLargestJpeg(hostile(Buffer.alloc(16 * 1024 * 1024, 0xff)))).toBeNull();
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it('reads the orientation from a TIFF-shaped RAW header, both byte orders', () => {
    // Header + IFD0 with two entries: ImageWidth (0x0100), Orientation (0x0112).
    const le = Buffer.alloc(64);
    le.write('II', 0, 'latin1');
    le.writeUInt16LE(42, 2);
    le.writeUInt32LE(8, 4);
    le.writeUInt16LE(2, 8);
    le.writeUInt16LE(0x0100, 10);
    le.writeUInt16LE(3, 12);
    le.writeUInt32LE(1, 14);
    le.writeUInt16LE(6000, 18);
    le.writeUInt16LE(0x0112, 22);
    le.writeUInt16LE(3, 24);
    le.writeUInt32LE(1, 26);
    le.writeUInt16LE(6, 30);
    expect(tiffOrientation(le)).toBe(6);

    const be = Buffer.alloc(64);
    be.write('MM', 0, 'latin1');
    be.writeUInt16BE(42, 2);
    be.writeUInt32BE(8, 4);
    be.writeUInt16BE(1, 8);
    be.writeUInt16BE(0x0112, 10);
    be.writeUInt16BE(3, 12);
    be.writeUInt32BE(1, 14);
    be.writeUInt16BE(8, 18);
    expect(tiffOrientation(be)).toBe(8);

    expect(tiffOrientation(noise(64, 5))).toBe(1);
  });
});

describe('thumbnail cache retention', () => {
  const root = mkdtempSync(join(tmpdir(), 'we-thumbs-'));
  const now = Date.now();

  afterAll(() => rmSync(root, { recursive: true, force: true }));

  function file(dir: string, name: string, bytes: number, ageMs: number): string {
    mkdirSync(dir, { recursive: true });
    const path = join(dir, name);
    writeFileSync(path, Buffer.alloc(bytes, 1));
    const at = new Date(now - ageMs);
    utimesSync(path, at, at);
    return path;
  }

  it('drops idle, outdated, half-written and orphaned thumbnails, touches nothing else', () => {
    const dir = join(root, 'retention');
    const live = join(dir, 'liveTransfer01');
    const gone = join(dir, 'goneTransfer01');
    const goneShared = join(dir, 'goneTransfer02');

    const fresh = file(live, '1-sm.v1.webp', 100, HOUR);
    const idle = file(live, '2-sm.v1.webp', 100, 4 * DAY);
    const outdated = file(live, '3-sm.v0.webp', 100, HOUR);
    const tmpNew = file(live, '4-sm.v1.webp.tmp-1-abc', 100, 60_000);
    const tmpStale = file(live, '5-sm.v1.webp.tmp-1-def', 100, 2 * HOUR);
    const markerNew = file(live, '6-sm.v1.none', 0, 60_000);
    const markerOld = file(live, '7-sm.v1.none', 0, 2 * HOUR);
    const orphan = file(gone, '1-sm.v1.webp', 100, HOUR);
    const orphanShared = file(goneShared, '1-lg.v1.webp', 100, HOUR);
    // Nothing the cache did not write is ever deleted, however old.
    const foreignInLive = file(live, 'notes.txt', 10, 30 * DAY);
    const foreignInGone = file(goneShared, 'keep.me', 10, 30 * DAY);
    const stray = file(dir, 'stray.txt', 10, 30 * DAY);
    const oddFolder = file(join(dir, 'not a transfer'), '1-sm.v1.webp', 10, 30 * DAY);

    const result = sweepCacheDir({
      dir,
      now,
      ttlMs: 3 * DAY,
      maxBytes: 1024 * 1024,
      knownIds: new Set(['liveTransfer01']),
    });

    for (const path of [fresh, tmpNew, markerNew, foreignInLive, foreignInGone, stray, oddFolder]) {
      expect(existsSync(path)).toBe(true);
    }
    for (const path of [idle, outdated, tmpStale, markerOld, orphan, orphanShared]) {
      expect(existsSync(path)).toBe(false);
    }
    // An emptied folder goes; one still holding something else stays.
    expect(existsSync(gone)).toBe(false);
    expect(existsSync(goneShared)).toBe(true);
    expect(result.keptFiles).toBe(1);
    expect(result.keptBytes).toBe(100);
  });

  it('holds the cache under its ceiling, least recently used first', () => {
    const dir = join(root, 'ceiling');
    const a = join(dir, 'transferAAAA1');
    const b = join(dir, 'transferBBBB1');

    const oldest = file(a, '1-sm.v1.webp', 400, 5 * HOUR);
    const older = file(b, '1-lg.v1.webp', 400, 4 * HOUR);
    const recent = file(a, '2-sm.v1.webp', 400, 2 * HOUR);
    const newest = file(b, '2-sm.v1.webp', 400, HOUR);

    // 1600 bytes against a 1000 byte ceiling: trimmed to 90 % of it.
    const result = sweepCacheDir({ dir, now, ttlMs: 3 * DAY, maxBytes: 1000 });

    expect(existsSync(oldest)).toBe(false);
    expect(existsSync(older)).toBe(false);
    expect(existsSync(recent)).toBe(true);
    expect(existsSync(newest)).toBe(true);
    expect(result.keptBytes).toBe(800);
    expect(result.freedBytes).toBe(800);
  });

  it('empties the cache when asked to (disk running low)', () => {
    const dir = join(root, 'low-disk');
    const one = file(join(dir, 'transferCCCC1'), '1-sm.v1.webp', 50, HOUR);
    const result = sweepCacheDir({ dir, now, ttlMs: 3 * DAY, maxBytes: 1024, targetBytes: 0 });
    expect(existsSync(one)).toBe(false);
    expect(result.keptBytes).toBe(0);
  });

  it('is a no-op on a cache that does not exist yet', () => {
    const result = sweepCacheDir({ dir: join(root, 'missing'), now, ttlMs: DAY, maxBytes: 1 });
    expect(result.removed).toBe(0);
  });

  it('refuses a cache directory that overlaps the uploads or the database', () => {
    const uploads = join(root, 'srv', 'uploads');
    const data = join(root, 'srv', 'data');
    const guarded = [uploads, data];

    expect(cacheDirIsSafe(join(root, 'srv', 'cache', 'thumbs'), guarded)).toBe(true);
    expect(cacheDirIsSafe(join(root, 'srv', 'uploads-thumbs'), guarded)).toBe(true);
    expect(cacheDirIsSafe(uploads, guarded)).toBe(false);
    expect(cacheDirIsSafe(join(uploads, 'thumbs'), guarded)).toBe(false);
    expect(cacheDirIsSafe(join(root, 'srv'), guarded)).toBe(false);
    expect(cacheDirIsSafe(join(data, '..', 'data'), guarded)).toBe(false);
    expect(cacheDirIsSafe(resolve('/'), guarded)).toBe(false);
  });
});
