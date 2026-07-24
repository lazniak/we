/**
 * Minimal, dependency free, streaming ZIP writer.
 *
 * Entries are stored uncompressed (method 0). That is deliberate:
 *
 *  - payloads are already on disk and are never re-compressed, so a folder of
 *    photos or video is not run through DEFLATE for nothing,
 *  - with STORE the exact byte length of the archive is known before a single
 *    byte is written, so downloads get a real Content-Length and the browser
 *    can show a genuine progress bar and ETA,
 *  - nothing is ever buffered in memory: the archive is produced as a stream.
 *
 * CRC32 values are computed once during upload and stored in the database, so
 * local headers are fully specified and no data descriptors are needed - that
 * is the most widely compatible form of ZIP.
 */

const U32_MAX = 0xffffffff;
const ZIP64_LIMIT = 0xfffffffe;

/* ------------------------------------------------------------------ CRC32 */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

/** zlib-style incremental CRC32. Pass 0 as the seed. */
export function crc32(seed: number, buf: Uint8Array): number {
  let c = ~seed;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (~c) >>> 0;
}

function gf2MatrixTimes(mat: Int32Array, vec: number): number {
  let sum = 0;
  let v = vec >>> 0;
  let i = 0;
  while (v) {
    if (v & 1) sum ^= mat[i];
    v >>>= 1;
    i++;
  }
  return sum;
}

function gf2MatrixSquare(square: Int32Array, mat: Int32Array): void {
  for (let n = 0; n < 32; n++) square[n] = gf2MatrixTimes(mat, mat[n]);
}

/**
 * zlib's crc32_combine: the CRC of A concatenated with B, given each CRC and
 * the length of B. Lets chunks that arrive out of order still produce the CRC
 * of the assembled file without re-reading it from disk.
 */
export function crc32Combine(crc1: number, crc2: number, len2: number): number {
  if (len2 <= 0) return crc1 >>> 0;

  const even = new Int32Array(32);
  const odd = new Int32Array(32);

  odd[0] = 0xedb88320 | 0;
  let row = 1;
  for (let n = 1; n < 32; n++) {
    odd[n] = row;
    row <<= 1;
  }

  gf2MatrixSquare(even, odd);
  gf2MatrixSquare(odd, even);

  let crc = crc1 | 0;
  let len = len2;
  for (;;) {
    gf2MatrixSquare(even, odd);
    if (len % 2 === 1) crc = gf2MatrixTimes(even, crc);
    len = Math.floor(len / 2);
    if (len === 0) break;

    gf2MatrixSquare(odd, even);
    if (len % 2 === 1) crc = gf2MatrixTimes(odd, crc);
    len = Math.floor(len / 2);
    if (len === 0) break;
  }

  return (crc ^ crc2) >>> 0;
}

/* -------------------------------------------------------------- ZIP layout */

export interface ZipEntry {
  /** Sanitised relative path. Directories must NOT carry a trailing slash. */
  name: string;
  size: number;
  crc: number;
  isDir: boolean;
  /** Opens the payload. Required for files, ignored for directories. */
  open?: () => ReadableStream<Uint8Array>;
}

interface PlannedEntry extends ZipEntry {
  nameBytes: Uint8Array;
  localOffset: number;
  zip64: boolean;
}

const encoder = new TextEncoder();

function dosDateTime(input: Date): { time: number; date: number } {
  // An unparseable timestamp would otherwise write NaN into the headers and
  // produce an archive no tool can open.
  const date = Number.isFinite(input?.getTime?.()) ? input : new Date();
  const year = Math.max(1980, date.getFullYear());
  return {
    time:
      (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      (Math.floor(date.getSeconds() / 2) & 0x1f),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

export interface ZipPlan {
  entries: PlannedEntry[];
  /** Exact byte length of the finished archive. */
  totalSize: number;
  centralDirOffset: number;
  centralDirSize: number;
  needsZip64Eocd: boolean;
  modified: Date;
}

export function planZip(entries: ZipEntry[], modified: Date = new Date()): ZipPlan {
  const planned: PlannedEntry[] = [];
  let offset = 0;
  let centralDirSize = 0;
  let anyZip64 = false;

  for (const entry of entries) {
    const name = entry.isDir ? `${entry.name}/` : entry.name;
    const nameBytes = encoder.encode(name);
    const size = entry.isDir ? 0 : entry.size;
    const zip64 = size >= ZIP64_LIMIT || offset >= ZIP64_LIMIT;
    if (zip64) anyZip64 = true;

    planned.push({ ...entry, nameBytes, localOffset: offset, zip64, size });

    offset += 30 + nameBytes.length + (zip64 ? 20 : 0) + size;
    centralDirSize += 46 + nameBytes.length + (zip64 ? 28 : 0);
  }

  const centralDirOffset = offset;
  const needsZip64Eocd =
    anyZip64 ||
    planned.length > 0xffff ||
    centralDirSize >= ZIP64_LIMIT ||
    centralDirOffset >= ZIP64_LIMIT;

  const totalSize =
    centralDirOffset + centralDirSize + 22 + (needsZip64Eocd ? 56 + 20 : 0);

  return {
    entries: planned,
    totalSize,
    centralDirOffset,
    centralDirSize,
    needsZip64Eocd,
    modified,
  };
}

function localHeader(entry: PlannedEntry, modified: Date): Uint8Array {
  const extraLen = entry.zip64 ? 20 : 0;
  const buf = new Uint8Array(30 + entry.nameBytes.length + extraLen);
  const view = new DataView(buf.buffer);
  const { time, date } = dosDateTime(modified);

  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, entry.zip64 ? 45 : 20, true);
  view.setUint16(6, 0x0800, true); // UTF-8 names
  view.setUint16(8, 0, true); // stored
  view.setUint16(10, time, true);
  view.setUint16(12, date, true);
  view.setUint32(14, entry.crc >>> 0, true);
  view.setUint32(18, entry.zip64 ? U32_MAX : entry.size, true);
  view.setUint32(22, entry.zip64 ? U32_MAX : entry.size, true);
  view.setUint16(26, entry.nameBytes.length, true);
  view.setUint16(28, extraLen, true);

  buf.set(entry.nameBytes, 30);

  if (entry.zip64) {
    const off = 30 + entry.nameBytes.length;
    view.setUint16(off, 0x0001, true);
    view.setUint16(off + 2, 16, true);
    view.setBigUint64(off + 4, BigInt(entry.size), true);
    view.setBigUint64(off + 12, BigInt(entry.size), true);
  }

  return buf;
}

function centralHeader(entry: PlannedEntry, modified: Date): Uint8Array {
  const extraLen = entry.zip64 ? 28 : 0;
  const buf = new Uint8Array(46 + entry.nameBytes.length + extraLen);
  const view = new DataView(buf.buffer);
  const { time, date } = dosDateTime(modified);

  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, entry.zip64 ? 45 : 20, true); // made by MS-DOS
  view.setUint16(6, entry.zip64 ? 45 : 20, true);
  view.setUint16(8, 0x0800, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, time, true);
  view.setUint16(14, date, true);
  view.setUint32(16, entry.crc >>> 0, true);
  view.setUint32(20, entry.zip64 ? U32_MAX : entry.size, true);
  view.setUint32(24, entry.zip64 ? U32_MAX : entry.size, true);
  view.setUint16(28, entry.nameBytes.length, true);
  view.setUint16(30, extraLen, true);
  view.setUint16(32, 0, true); // comment length
  view.setUint16(34, 0, true); // disk number start
  view.setUint16(36, 0, true); // internal attributes
  view.setUint32(38, entry.isDir ? 0x10 : 0, true); // external attributes
  view.setUint32(42, entry.zip64 ? U32_MAX : entry.localOffset, true);

  buf.set(entry.nameBytes, 46);

  if (entry.zip64) {
    const off = 46 + entry.nameBytes.length;
    view.setUint16(off, 0x0001, true);
    view.setUint16(off + 2, 24, true);
    view.setBigUint64(off + 4, BigInt(entry.size), true);
    view.setBigUint64(off + 12, BigInt(entry.size), true);
    view.setBigUint64(off + 20, BigInt(entry.localOffset), true);
  }

  return buf;
}

function endRecords(plan: ZipPlan): Uint8Array {
  const count = plan.entries.length;
  const size = 22 + (plan.needsZip64Eocd ? 76 : 0);
  const buf = new Uint8Array(size);
  const view = new DataView(buf.buffer);
  let off = 0;

  if (plan.needsZip64Eocd) {
    view.setUint32(off, 0x06064b50, true);
    view.setBigUint64(off + 4, 44n, true);
    view.setUint16(off + 12, 45, true);
    view.setUint16(off + 14, 45, true);
    view.setUint32(off + 16, 0, true);
    view.setUint32(off + 20, 0, true);
    view.setBigUint64(off + 24, BigInt(count), true);
    view.setBigUint64(off + 32, BigInt(count), true);
    view.setBigUint64(off + 40, BigInt(plan.centralDirSize), true);
    view.setBigUint64(off + 48, BigInt(plan.centralDirOffset), true);
    off += 56;

    view.setUint32(off, 0x07064b50, true);
    view.setUint32(off + 4, 0, true);
    view.setBigUint64(off + 8, BigInt(plan.centralDirOffset + plan.centralDirSize), true);
    view.setUint32(off + 16, 1, true);
    off += 20;
  }

  view.setUint32(off, 0x06054b50, true);
  view.setUint16(off + 4, 0, true);
  view.setUint16(off + 6, 0, true);
  view.setUint16(off + 8, Math.min(count, 0xffff), true);
  view.setUint16(off + 10, Math.min(count, 0xffff), true);
  view.setUint32(off + 12, Math.min(plan.centralDirSize, U32_MAX), true);
  view.setUint32(off + 16, Math.min(plan.centralDirOffset, U32_MAX), true);
  view.setUint16(off + 20, 0, true);

  return buf;
}

/**
 * Produces the archive described by `plan` as a byte stream. The number of
 * bytes emitted is exactly `plan.totalSize`, provided every entry's payload is
 * still the size it was planned with.
 */
export function createZipStream(plan: ZipPlan): ReadableStream<Uint8Array> {
  const { entries, modified } = plan;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for (const entry of entries) {
          controller.enqueue(localHeader(entry, modified));

          if (entry.isDir || entry.size === 0) continue;
          if (!entry.open) throw new Error(`zip entry ${entry.name} has no source`);

          const reader = entry.open().getReader();
          let written = 0;
          try {
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              written += value.byteLength;
              if (written > entry.size) {
                throw new Error(`zip entry ${entry.name} grew while streaming`);
              }
              controller.enqueue(value);
            }
          } finally {
            reader.releaseLock();
          }

          if (written !== entry.size) {
            throw new Error(
              `zip entry ${entry.name} truncated (${written}/${entry.size})`,
            );
          }
        }

        for (const entry of entries) {
          controller.enqueue(centralHeader(entry, modified));
        }
        controller.enqueue(endRecords(plan));
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}
