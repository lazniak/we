import {
  MAX_PATH_DEPTH,
  MAX_PATH_LENGTH,
  MAX_PATH_SEGMENT_LENGTH,
} from '../config';

/** nanoid(12) alphabet; a little slack so older ids keep working. */
const TRANSFER_ID_RE = /^[A-Za-z0-9_-]{8,24}$/;

export function isValidTransferId(id: unknown): id is string {
  return typeof id === 'string' && TRANSFER_ID_RE.test(id);
}

/** Windows device names that cannot be used as a path segment. */
const RESERVED_SEGMENTS = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;

/**
 * Control characters plus every byte Windows rejects in a filename.
 * Built from a string so no literal control bytes end up in the source.
 */
const ILLEGAL_CHARS = new RegExp('[\\u0000-\\u001f\\u007f<>:"\\\\|?*]', 'g');

function sanitizeSegment(raw: string): string {
  let seg = raw.replace(ILLEGAL_CHARS, '_');

  // Windows silently drops trailing dots and spaces, which would let
  // "evil.exe." resolve back to "evil.exe" after extraction.
  seg = seg.replace(/[. ]+$/g, '').trim();

  if (!seg || seg === '.' || seg === '..') return '';

  if (RESERVED_SEGMENTS.test(seg)) seg = `_${seg}`;

  if (seg.length > MAX_PATH_SEGMENT_LENGTH) {
    const dot = seg.lastIndexOf('.');
    const ext = dot > 0 && seg.length - dot <= 12 ? seg.slice(dot) : '';
    seg = seg.slice(0, MAX_PATH_SEGMENT_LENGTH - ext.length) + ext;
  }

  return seg;
}

/**
 * Turn a browser supplied relative path into something that is safe both as a
 * ZIP entry name (zip-slip) and as a display value. It is never used to build
 * an on-disk path - payloads are stored under opaque generated names - but
 * recipients extract these names, so they still have to be harmless.
 */
export function sanitizeRelativePath(input: unknown, fallback = 'file'): string {
  if (typeof input !== 'string' || !input) return fallback;

  // Normalise separators and drop any drive letter / UNC prefix.
  let path = input.replace(/\\/g, '/');
  path = path.replace(/^[a-zA-Z]:/, '');
  path = path.replace(/^\/+/, '');

  const segments: string[] = [];
  for (const raw of path.split('/')) {
    const seg = sanitizeSegment(raw);
    if (!seg) continue; // drops "", "." and ".." - traversal cannot survive
    segments.push(seg);
    if (segments.length >= MAX_PATH_DEPTH) break;
  }

  if (segments.length === 0) return fallback;

  let result = segments.join('/');
  if (result.length > MAX_PATH_LENGTH) {
    // Keep the basename, drop the leading directories.
    result = segments[segments.length - 1].slice(0, MAX_PATH_LENGTH);
  }

  return result || fallback;
}

/** Directory portion of a sanitised relative path ('' for a root level file). */
export function dirnameOf(relPath: string): string {
  const idx = relPath.lastIndexOf('/');
  return idx === -1 ? '' : relPath.slice(0, idx);
}

export function basenameOf(relPath: string): string {
  const idx = relPath.lastIndexOf('/');
  return idx === -1 ? relPath : relPath.slice(idx + 1);
}

/**
 * All ancestor directories of a path, shallowest first.
 * "a/b/c.txt" -> ["a", "a/b"]
 */
export function ancestorDirs(relPath: string): string[] {
  const parts = relPath.split('/');
  parts.pop();
  const out: string[] = [];
  let acc = '';
  for (const part of parts) {
    acc = acc ? `${acc}/${part}` : part;
    out.push(acc);
  }
  return out;
}

/**
 * Ensures every entry has a unique path. Collisions are resolved the way a
 * file manager would: "photo.jpg", "photo (2).jpg", ...
 */
export function dedupePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  return paths.map((path) => {
    let candidate = path;
    if (!seen.has(candidate.toLowerCase())) {
      seen.add(candidate.toLowerCase());
      return candidate;
    }

    const dir = dirnameOf(path);
    const base = basenameOf(path);
    const dot = base.lastIndexOf('.');
    const stem = dot > 0 ? base.slice(0, dot) : base;
    const ext = dot > 0 ? base.slice(dot) : '';

    let n = 2;
    do {
      const name = `${stem} (${n})${ext}`;
      candidate = dir ? `${dir}/${name}` : name;
      n++;
    } while (seen.has(candidate.toLowerCase()) && n < 10000);

    seen.add(candidate.toLowerCase());
    return candidate;
  });
}
