/**
 * Download endpoints, deliberately served outside the Hono middleware chain.
 *
 * Any middleware that touches headers after a handler returns makes Hono
 * rebuild the Response. Rebuilding turns a Bun file blob into a plain stream,
 * which loses Content-Length and, for sliced files, silently ignores the end
 * of the range. Downloads are the one place where both matter, so they are
 * routed straight from Bun.serve and build their headers up front.
 */

import { ALLOWED_ORIGINS } from '../config';
import {
  getTransfer,
  getTransferFileById,
  getTransferFiles,
  incrementDownloadCount,
  isExpired,
  type Transfer,
  type TransferFile,
} from '../db';
import { ensureCrc } from '../lib/fileCrc';
import {
  contentDisposition,
  previewCsp,
  previewMime,
  safeDownloadMime,
} from '../lib/fileSafety';
import {
  ancestorDirs,
  basenameOf,
  isValidTransferId,
  sanitizeRelativePath,
} from '../lib/safePath';
import { fileSizeOrNull, legacyArchivePath, storagePath } from '../lib/storage';
import { createZipStream, planZip, type ZipEntry } from '../lib/zipStream';

const BASE_HEADERS: Record<string, string> = {
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

/**
 * Attachments are opaque payloads, so they are locked down as hard as a
 * response can be: if a browser ever decides to render one, it gets a
 * sandboxed document that may not load or run anything.
 *
 * Inline previews cannot carry this - it would stop the built in PDF viewer
 * from rendering. Their safety comes from the allow-list in fileSafety.ts:
 * only inert media types are ever served inline, so markup never reaches the
 * browser as a document in the first place.
 */
const ATTACHMENT_CSP = "default-src 'none'; sandbox";

function withCommonHeaders(
  headers: Record<string, string>,
  origin: string | null,
): Headers {
  const result = new Headers({ ...BASE_HEADERS, ...headers });
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    result.set('Access-Control-Allow-Origin', origin);
    result.set('Vary', 'Origin');
  }
  return result;
}

function jsonError(message: string, status: number, origin: string | null): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: withCommonHeaders({ 'Content-Type': 'application/json' }, origin),
  });
}

/* ----------------------------------------------------------------- zip */

/** Builds ZIP entries for a transfer, optionally limited to one subtree. */
async function buildZipEntries(
  transferId: string,
  files: TransferFile[],
  subtree: string | null,
): Promise<ZipEntry[]> {
  const prefix = subtree ? `${subtree}/` : '';
  const entries: ZipEntry[] = [];
  const seenDirs = new Set<string>();

  const addDir = (name: string) => {
    if (!name || seenDirs.has(name)) return;
    seenDirs.add(name);
    entries.push({ name, size: 0, crc: 0, isDir: true });
  };

  for (const file of files) {
    if (subtree && !file.rel_path.startsWith(prefix)) continue;
    const name = subtree ? file.rel_path.slice(prefix.length) : file.rel_path;
    if (!name) continue;

    if (file.is_dir) {
      for (const dir of ancestorDirs(`${name}/x`)) addDir(dir);
      continue;
    }

    const path = storagePath(transferId, file.storage_name);
    const size = fileSizeOrNull(path);
    if (size === null) {
      console.warn(`⚠️  missing payload for ${transferId}/${file.rel_path}`);
      continue;
    }

    for (const dir of ancestorDirs(name)) addDir(dir);

    entries.push({
      name,
      size,
      crc: await ensureCrc(transferId, file),
      isDir: false,
      open: () => Bun.file(path).stream() as ReadableStream<Uint8Array>,
    });
  }

  // Directories first so extractors create them before their contents.
  entries.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return entries;
}

function zipResponse(
  entries: ZipEntry[],
  filename: string,
  modified: Date,
  origin: string | null,
  headOnly: boolean,
): Response {
  const plan = planZip(entries, modified);
  const headers = withCommonHeaders(
    {
      'Content-Type': 'application/zip',
      'Content-Disposition': contentDisposition(filename),
      'Content-Security-Policy': ATTACHMENT_CSP,
      // Bun always answers streamed bodies with chunked encoding, so the exact
      // archive size travels in its own header for the UI to use.
      'X-Archive-Size': String(plan.totalSize),
      'Access-Control-Expose-Headers': 'X-Archive-Size, Content-Disposition',
    },
    origin,
  );

  if (headOnly) return new Response(null, { headers });
  return new Response(createZipStream(plan), { headers });
}

/* ---------------------------------------------------------------- files */

/** Streams a stored file as a blob so Bun can report a real Content-Length. */
function fileResponse(
  path: string,
  size: number,
  mime: string,
  disposition: string,
  rangeHeader: string | null,
  origin: string | null,
  headOnly: boolean,
  csp: string | null = null,
): Response {
  const extra: Record<string, string> = {
    'Content-Type': mime,
    'Content-Disposition': disposition,
    'Accept-Ranges': 'bytes',
    'Access-Control-Expose-Headers': 'Content-Disposition',
  };
  if (!disposition.startsWith('inline')) extra['Content-Security-Policy'] = ATTACHMENT_CSP;
  if (csp) extra['Content-Security-Policy'] = csp;

  const headers = withCommonHeaders(extra, origin);

  const match = rangeHeader?.match(/^bytes=(\d*)-(\d*)$/);
  if (match && size > 0) {
    const hasStart = match[1] !== '';
    const hasEnd = match[2] !== '';

    let start: number;
    let end: number;
    if (!hasStart && hasEnd) {
      start = Math.max(0, size - Number(match[2])); // suffix range
      end = size - 1;
    } else {
      start = hasStart ? Number(match[1]) : 0;
      end = hasEnd ? Math.min(Number(match[2]), size - 1) : size - 1;
    }

    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) {
      const bad = withCommonHeaders({ 'Content-Range': `bytes */${size}` }, origin);
      return new Response(null, { status: 416, headers: bad });
    }

    headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
    return new Response(headOnly ? null : Bun.file(path).slice(start, end + 1), {
      status: 206,
      headers,
    });
  }

  if (headOnly) {
    headers.set('Content-Length', String(size));
    return new Response(null, { headers });
  }
  return new Response(Bun.file(path), { headers });
}

async function serveSingleFile(
  transfer: Transfer,
  fileId: number,
  inline: boolean,
  rangeHeader: string | null,
  origin: string | null,
  headOnly: boolean,
): Promise<Response> {
  if (!Number.isSafeInteger(fileId)) return jsonError('File not found', 404, origin);

  const file = getTransferFileById(transfer.id, fileId);
  if (!file || file.is_dir) return jsonError('File not found', 404, origin);

  const path = storagePath(transfer.id, file.storage_name);
  const size = fileSizeOrNull(path);
  if (size === null) return jsonError('File not found', 404, origin);

  const name = basenameOf(file.rel_path);

  // Preview is judged purely on how the content can be shown, not on whether a
  // download of it would be runnable. A .py or .js is dangerous to download
  // (it is handed over zipped below) yet perfectly safe to preview, because a
  // preview is served as text/plain and cannot execute. Only types with no
  // inert representation at all are refused here.
  if (inline) {
    const mime = previewMime(file.rel_path);
    if (!mime) return jsonError('Preview not available for this file type', 415, origin);
    return fileResponse(
      path,
      size,
      mime,
      contentDisposition(name, true),
      rangeHeader,
      origin,
      headOnly,
      previewCsp(file.rel_path),
    );
  }

  // Downloading is where runnability matters: executables and scripts go out
  // inside a ZIP so nothing treats the result as ready to run.
  if (file.is_dangerous) {
    incrementDownloadCount(transfer.id);
    const entries: ZipEntry[] = [
      {
        name,
        size,
        crc: await ensureCrc(transfer.id, file),
        isDir: false,
        open: () => Bun.file(path).stream() as ReadableStream<Uint8Array>,
      },
    ];
    return zipResponse(entries, `${name}.zip`, new Date(transfer.created_at), origin, headOnly);
  }

  if (!headOnly) incrementDownloadCount(transfer.id);
  return fileResponse(
    path,
    size,
    safeDownloadMime(file.rel_path),
    contentDisposition(name),
    rangeHeader,
    origin,
    headOnly,
  );
}

/* --------------------------------------------------------------- router */

const ROUTE = /^\/api\/transfer\/([^/]+)\/(download|file|preview)(?:\/([^/]+))?$/;

/**
 * Returns a Response for download style requests, or null when the request
 * belongs to the regular Hono application.
 */
export async function handleDownloadRequest(
  req: Request,
  url: URL,
): Promise<Response | null> {
  if (req.method !== 'GET' && req.method !== 'HEAD') return null;

  const match = ROUTE.exec(url.pathname);
  if (!match) return null;

  const [, rawId, kind, param] = match;
  const origin = req.headers.get('origin');
  const headOnly = req.method === 'HEAD';

  if (!isValidTransferId(rawId)) return jsonError('Transfer not found', 404, origin);

  const transfer = getTransfer(rawId);
  if (!transfer) return jsonError('Transfer not found', 404, origin);
  if (isExpired(transfer)) return jsonError('This transfer has expired', 410, origin);
  if (transfer.status === 'infected') {
    return jsonError('Pliki zostaly usuniete: antywirus wykryl zagrozenie', 451, origin);
  }
  if (transfer.status === 'scanning') {
    return jsonError('Trwa sprawdzanie antywirusowe, sprobuj za chwile', 425, origin);
  }
  if (transfer.status !== 'ready') return jsonError('Transfer not ready', 425, origin);

  const range = req.headers.get('range');

  if (kind === 'file' || kind === 'preview') {
    return serveSingleFile(
      transfer,
      Number(param),
      kind === 'preview',
      range,
      origin,
      headOnly,
    );
  }

  // Links produced by the previous frontend used ?fileId=
  const legacyFileId = url.searchParams.get('fileId');
  if (legacyFileId) {
    return serveSingleFile(transfer, Number(legacyFileId), false, range, origin, headOnly);
  }

  const files = getTransferFiles(transfer.id);

  // Archive produced by the pre-rework backend.
  if (files.length === 0) {
    const archive = legacyArchivePath(transfer.id);
    const size = fileSizeOrNull(archive);
    if (size === null) return jsonError('File not found', 404, origin);
    if (!headOnly) incrementDownloadCount(transfer.id);
    const name = transfer.filename.endsWith('.zip')
      ? transfer.filename
      : `${transfer.filename}.zip`;
    return fileResponse(
      archive,
      size,
      'application/zip',
      contentDisposition(name),
      range,
      origin,
      headOnly,
    );
  }

  const subtreeParam = url.searchParams.get('path');
  const subtree = subtreeParam ? sanitizeRelativePath(subtreeParam, '') : '';

  if (subtree) {
    const inside = files.filter(
      (f) => f.rel_path === subtree || f.rel_path.startsWith(`${subtree}/`),
    );
    if (inside.length === 0) return jsonError('Folder not found', 404, origin);

    if (!headOnly) incrementDownloadCount(transfer.id);
    const entries = await buildZipEntries(transfer.id, inside, subtree);
    return zipResponse(
      entries,
      `${basenameOf(subtree)}.zip`,
      new Date(transfer.created_at),
      origin,
      headOnly,
    );
  }

  const payloads = files.filter((f) => !f.is_dir);

  // A single plain file goes back exactly as it arrived. This is what keeps a
  // ZIP the sender uploaded from coming back wrapped in a second ZIP.
  if (payloads.length === 1 && files.length === 1 && !payloads[0].is_dangerous) {
    return serveSingleFile(transfer, payloads[0].id, false, range, origin, headOnly);
  }

  if (!headOnly) incrementDownloadCount(transfer.id);
  const entries = await buildZipEntries(transfer.id, files, null);
  const zipName = transfer.filename.toLowerCase().endsWith('.zip')
    ? `${transfer.filename.slice(0, -4)}_files.zip`
    : `${transfer.filename}.zip`;
  return zipResponse(entries, zipName, new Date(transfer.created_at), origin, headOnly);
}
