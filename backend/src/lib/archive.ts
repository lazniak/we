import { extensionOf } from './fileSafety';
import { run } from './subprocess';
import { ARCHIVE_MAX_ENTRIES } from '../config';

export interface ArchiveEntry {
  path: string;
  size: number;
  isDir: boolean;
}

export interface ArchiveListing {
  entries: ArchiveEntry[];
  truncated: boolean;
  method: 'zip' | 'tar' | '7z';
}

const ZIP_EXTS = new Set([
  'zip', 'zipx', 'jar', 'war', 'ear', 'apk', 'xpi', 'crx', 'whl', 'egg', 'aar',
]);
const TAR_EXTS = new Set(['tar', 'gz', 'tgz', 'bz2', 'tbz', 'tbz2', 'xz', 'txz', 'lz', 'tlz', 'zst', 'tzst']);

function isTarCompound(name: string): boolean {
  return /\.tar\.(gz|bz2|xz|zst|lz)$/i.test(name);
}

/* --------------------------------------------------------- native ZIP */

async function readSlice(path: string, start: number, end: number): Promise<DataView> {
  const buf = await Bun.file(path).slice(start, end).arrayBuffer();
  return new DataView(buf);
}

/**
 * Reads a ZIP's central directory - only the tail and the directory region,
 * never the whole file - and returns its entries. Handles Zip64.
 */
async function listZip(path: string, totalSize: number): Promise<ArchiveListing> {
  const tailLen = Math.min(totalSize, 65557 + 22);
  const tail = await readSlice(path, totalSize - tailLen, totalSize);

  // Find the End Of Central Directory record from the back.
  let eocd = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error('EOCD not found');

  let count = tail.getUint16(eocd + 10, true);
  let cdSize = tail.getUint32(eocd + 12, true);
  let cdOffset = tail.getUint32(eocd + 16, true);

  // Zip64: the 32-bit fields are maxed out and the real values live earlier.
  if (cdOffset === 0xffffffff || count === 0xffff) {
    for (let i = eocd - 20; i >= 0; i--) {
      if (tail.getUint32(i, true) === 0x07064b50) {
        const z64Offset = Number(tail.getBigUint64(i + 8, true));
        const z64 = await readSlice(path, z64Offset, z64Offset + 56);
        if (z64.getUint32(0, true) === 0x06064b50) {
          count = Number(z64.getBigUint64(24, true));
          cdSize = Number(z64.getBigUint64(40, true));
          cdOffset = Number(z64.getBigUint64(48, true));
        }
        break;
      }
    }
  }

  const cd = await readSlice(path, cdOffset, cdOffset + cdSize);
  const decoder = new TextDecoder('utf-8');
  const entries: ArchiveEntry[] = [];
  let offset = 0;
  let truncated = false;

  while (offset + 46 <= cd.byteLength && entries.length < ARCHIVE_MAX_ENTRIES) {
    if (cd.getUint32(offset, true) !== 0x02014b50) break;

    const nameLen = cd.getUint16(offset + 28, true);
    const extraLen = cd.getUint16(offset + 30, true);
    const commentLen = cd.getUint16(offset + 32, true);
    let size = cd.getUint32(offset + 24, true);

    const nameBytes = new Uint8Array(cd.buffer, cd.byteOffset + offset + 46, nameLen);
    const name = decoder.decode(nameBytes);

    // Zip64 extra field carries the real uncompressed size when maxed out.
    if (size === 0xffffffff) {
      let ep = offset + 46 + nameLen;
      const extraEnd = ep + extraLen;
      while (ep + 4 <= extraEnd) {
        const id = cd.getUint16(ep, true);
        const len = cd.getUint16(ep + 2, true);
        if (id === 0x0001 && len >= 8) size = Number(cd.getBigUint64(ep + 4, true));
        ep += 4 + len;
      }
    }

    entries.push({ path: name.replace(/\/+$/, ''), size, isDir: name.endsWith('/') });
    offset += 46 + nameLen + extraLen + commentLen;
  }

  if (entries.length >= ARCHIVE_MAX_ENTRIES) truncated = true;
  return { entries, truncated, method: 'zip' };
}

/* ------------------------------------------------------------- tar (CLI) */

async function listTar(path: string): Promise<ArchiveListing> {
  const result = await run(['tar', '-tvf', path], 60_000);
  if (result.code !== 0 && !result.stdout) {
    throw new Error(`tar failed: ${result.stderr.slice(0, 160)}`);
  }

  const entries: ArchiveEntry[] = [];
  let truncated = false;

  for (const line of result.stdout.split('\n')) {
    if (!line.trim()) continue;
    if (entries.length >= ARCHIVE_MAX_ENTRIES) {
      truncated = true;
      break;
    }
    // perms owner/group size YYYY-MM-DD HH:MM name[ -> link]
    const match = line.match(/^([dlbcps-])\S*\s+\S+\s+(\d+)\s+[\d-]+\s+[\d:]+\s+(.+)$/);
    if (!match) continue;
    const isDir = match[1] === 'd';
    const size = Number(match[2]);
    const name = match[3].split(' -> ')[0].replace(/\/+$/, '');
    if (name) entries.push({ path: name, size: isDir ? 0 : size, isDir });
  }

  return { entries, truncated, method: 'tar' };
}

/* -------------------------------------------------------------- 7z (CLI) */

async function list7z(path: string): Promise<ArchiveListing> {
  const result = await run(['7z', 'l', '-slt', '-ba', path], 60_000);
  if (result.code !== 0 && !result.stdout) {
    throw new Error(`7z failed: ${result.stderr.slice(0, 160)}`);
  }

  const entries: ArchiveEntry[] = [];
  let truncated = false;
  let cur: { path?: string; size?: number; dir?: boolean } = {};

  const flush = () => {
    if (cur.path) {
      entries.push({ path: cur.path.replace(/[\\/]+$/, '').replace(/\\/g, '/'), size: cur.size ?? 0, isDir: !!cur.dir });
    }
    cur = {};
  };

  for (const line of result.stdout.split('\n')) {
    if (!line.trim()) {
      flush();
      if (entries.length >= ARCHIVE_MAX_ENTRIES) {
        truncated = true;
        break;
      }
      continue;
    }
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (key === 'Path') cur.path = value;
    else if (key === 'Size') cur.size = Number(value) || 0;
    else if (key === 'Folder') cur.dir = value === '+';
    else if (key === 'Attributes' && /^D/.test(value)) cur.dir = true;
  }
  flush();

  return { entries, truncated, method: '7z' };
}

/** Lists an archive's structure. Never reads or exposes file contents. */
export async function listArchive(
  path: string,
  relName: string,
  totalSize: number,
): Promise<ArchiveListing> {
  const ext = extensionOf(relName);

  if (ZIP_EXTS.has(ext)) {
    try {
      return await listZip(path, totalSize);
    } catch (error) {
      console.warn(`zip parse fell back to 7z for ${relName}: ${(error as Error).message}`);
      return list7z(path);
    }
  }

  if (TAR_EXTS.has(ext) || isTarCompound(relName)) {
    return listTar(path);
  }

  return list7z(path);
}
