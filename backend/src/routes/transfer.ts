import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { existsSync, mkdirSync, rmSync } from 'fs';
import {
  CHUNK_SIZE,
  DEFAULT_EXPIRATION_DAYS,
  MAX_CHUNK_BYTES,
  MAX_EXPIRATION_DAYS,
  MAX_FILES_PER_TRANSFER,
  MAX_FILE_BYTES,
  MAX_TRANSFER_BYTES,
  MIN_EXPIRATION_DAYS,
  RATE_LIMIT_MAX_TRANSFERS,
  RATE_LIMIT_WINDOW_MS,
} from '../config';
import {
  addTransferFile,
  clearChunks,
  completeTransfer,
  createTransfer,
  deleteTransfer,
  getFileChunks,
  getTransfer,
  getTransferFileByIndex,
  getTransferFiles,
  isExpired,
  markUploading,
  recordChunk,
  refreshProgress,
  setFileCrc,
  type Transfer,
} from '../db';
import { broadcastProgress } from '../websocket';
import {
  ancestorDirs,
  basenameOf,
  dedupePaths,
  isValidTransferId,
  sanitizeRelativePath,
} from '../lib/safePath';
import { isDangerousFile, previewMime } from '../lib/fileSafety';
import { computeCrcFromDisk } from '../lib/fileCrc';
import {
  ensureUploadsDir,
  fileSizeOrNull,
  legacyArchivePath,
  legacyChunksDir,
  storageNameFor,
  storagePath,
  transferDir,
  writeChunkAt,
} from '../lib/storage';
import { crc32, crc32Combine } from '../lib/zipStream';

ensureUploadsDir();

export const transferRoutes = new Hono();

/* ------------------------------------------------------------ rate limit */

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function clientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return c.req.header('x-real-ip') || 'unknown';
}

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);

  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    if (rateBuckets.size > 10_000) {
      for (const [key, value] of rateBuckets) {
        if (value.resetAt <= now) rateBuckets.delete(key);
      }
    }
    return false;
  }

  bucket.count += 1;
  return bucket.count > RATE_LIMIT_MAX_TRANSFERS;
}

/* --------------------------------------------------------------- helpers */

/** Looks up a transfer, rejecting anything that is not a well formed id. */
function loadTransfer(id: string): Transfer | null {
  if (!isValidTransferId(id)) return null;
  return getTransfer(id) ?? null;
}

function transferDisplayName(paths: string[]): string {
  if (paths.length === 1) return basenameOf(paths[0]);

  const roots = new Set(paths.map((p) => p.split('/')[0]));
  if (roots.size === 1 && paths.some((p) => p.includes('/'))) {
    return [...roots][0];
  }

  return `transfer_${new Date().toISOString().slice(0, 10)}`;
}

/** Removes every on-disk artefact belonging to a transfer. */
export function purgeTransferFromDisk(id: string): void {
  if (!isValidTransferId(id)) return;
  for (const path of [transferDir(id), legacyChunksDir(id), legacyArchivePath(id)]) {
    try {
      rmSync(path, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
}

/* ------------------------------------------------------------------ init */

interface IncomingFile {
  path: string;
  size: number;
  type?: string;
}

transferRoutes.post('/init', async (c) => {
  try {
    if (rateLimited(clientIp(c))) {
      return c.json({ error: 'Too many transfers, try again later' }, 429);
    }

    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return c.json({ error: 'Invalid request body' }, 400);
    }

    const incoming: IncomingFile[] = Array.isArray(body.files) ? body.files : [];
    const incomingDirs: string[] = Array.isArray(body.dirs) ? body.dirs : [];

    if (incoming.length === 0) {
      return c.json({ error: 'No files provided' }, 400);
    }
    if (incoming.length + incomingDirs.length > MAX_FILES_PER_TRANSFER) {
      return c.json(
        { error: `A transfer may contain at most ${MAX_FILES_PER_TRANSFER} entries` },
        400,
      );
    }

    const sizes = incoming.map((f) => {
      const size = Number(f?.size);
      return Number.isFinite(size) && size >= 0 ? Math.floor(size) : -1;
    });

    if (sizes.some((s) => s < 0)) return c.json({ error: 'Invalid file size' }, 400);
    if (sizes.some((s) => s > MAX_FILE_BYTES)) {
      return c.json({ error: 'A single file exceeds the size limit' }, 400);
    }

    const totalSize = sizes.reduce((acc, s) => acc + s, 0);
    if (totalSize > MAX_TRANSFER_BYTES) {
      return c.json({ error: 'Transfer exceeds the 5GB limit' }, 400);
    }

    const filePaths = dedupePaths(
      incoming.map((f, i) => sanitizeRelativePath(f?.path, `file_${i + 1}`)),
    );

    const requestedDays = Number(body.expirationDays);
    const days = Number.isFinite(requestedDays)
      ? Math.max(MIN_EXPIRATION_DAYS, Math.min(MAX_EXPIRATION_DAYS, Math.floor(requestedDays)))
      : DEFAULT_EXPIRATION_DAYS;

    const transferId = nanoid(12);
    const ownerToken = nanoid(32);
    const chunksTotal = sizes.reduce(
      (acc, size) => acc + Math.max(1, Math.ceil(size / CHUNK_SIZE)),
      0,
    );

    mkdirSync(transferDir(transferId), { recursive: true });

    createTransfer({
      id: transferId,
      filename: transferDisplayName(filePaths),
      totalSize,
      chunksTotal,
      expirationDays: days,
      ownerToken,
      fileCount: incoming.length,
    });

    // Explicit directory rows keep empty folders alive through the round trip.
    const knownDirs = new Set<string>();
    for (const path of filePaths) {
      for (const dir of ancestorDirs(path)) knownDirs.add(dir);
    }
    for (const raw of incomingDirs) {
      const dir = sanitizeRelativePath(raw, '');
      if (dir && dir !== 'file') {
        knownDirs.add(dir);
        for (const parent of ancestorDirs(dir)) knownDirs.add(parent);
      }
    }

    filePaths.forEach((relPath, index) => {
      const storageName = storageNameFor(index);
      addTransferFile({
        transferId,
        fileIndex: index,
        relPath,
        storageName,
        filePath: storagePath(transferId, storageName),
        size: sizes[index],
        mimeType: typeof incoming[index]?.type === 'string' ? incoming[index].type! : null,
        isDir: false,
        isDangerous: isDangerousFile(relPath),
      });
    });

    let dirIndex = filePaths.length;
    for (const dir of [...knownDirs].sort()) {
      addTransferFile({
        transferId,
        fileIndex: dirIndex++,
        relPath: dir,
        storageName: '',
        filePath: '',
        size: 0,
        mimeType: null,
        isDir: true,
        isDangerous: false,
      });
    }

    console.log(
      `📤 Transfer ${transferId}: ${incoming.length} file(s), ` +
        `${(totalSize / 1024 / 1024).toFixed(1)} MB, ${days}d`,
    );

    return c.json({
      transferId,
      ownerToken,
      shareUrl: `/${transferId}`,
      expiresAt: getTransfer(transferId)!.expires_at,
      chunkSize: CHUNK_SIZE,
      totalSize,
      files: filePaths.map((path, index) => ({
        index,
        path,
        size: sizes[index],
        chunks: Math.max(1, Math.ceil(sizes[index] / CHUNK_SIZE)),
      })),
    });
  } catch (error) {
    console.error('Init error:', error);
    return c.json({ error: 'Failed to initialize transfer' }, 500);
  }
});

/* ----------------------------------------------------------- chunk upload */

transferRoutes.put('/:id/file/:index/chunk/:chunkIndex', async (c) => {
  try {
    const { id, index, chunkIndex } = c.req.param();

    const transfer = loadTransfer(id);
    if (!transfer) return c.json({ error: 'Transfer not found' }, 404);
    if (isExpired(transfer)) return c.json({ error: 'Transfer expired' }, 410);
    if (transfer.status === 'ready') {
      return c.json({ error: 'Transfer already complete' }, 409);
    }

    const fileIndex = Number(index);
    const chunkNo = Number(chunkIndex);
    if (
      !Number.isSafeInteger(fileIndex) ||
      fileIndex < 0 ||
      !Number.isSafeInteger(chunkNo) ||
      chunkNo < 0
    ) {
      return c.json({ error: 'Invalid chunk reference' }, 400);
    }

    const file = getTransferFileByIndex(id, fileIndex);
    if (!file || file.is_dir) return c.json({ error: 'Unknown file' }, 404);

    const offset = chunkNo * CHUNK_SIZE;
    if (offset > file.size) return c.json({ error: 'Chunk out of range' }, 400);

    if (Number(c.req.header('content-length') || 0) > MAX_CHUNK_BYTES) {
      return c.json({ error: 'Chunk too large' }, 413);
    }

    const data = new Uint8Array(await c.req.arrayBuffer());
    if (data.byteLength > MAX_CHUNK_BYTES) {
      return c.json({ error: 'Chunk too large' }, 413);
    }
    if (offset + data.byteLength > file.size) {
      return c.json({ error: 'Chunk exceeds declared file size' }, 400);
    }

    writeChunkAt(storagePath(id, file.storage_name), offset, data);

    const isNew = recordChunk(id, fileIndex, chunkNo, data.byteLength, crc32(0, data));
    markUploading(id);

    const updated = refreshProgress(id);
    if (updated && isNew) {
      const progress =
        updated.chunks_total > 0
          ? Math.min(100, Math.round((updated.chunks_completed / updated.chunks_total) * 100))
          : 0;

      broadcastProgress(id, {
        type: 'progress',
        transferId: id,
        progress,
        uploadedSize: updated.uploaded_size,
        totalSize: updated.total_size,
        chunksCompleted: updated.chunks_completed,
        chunksTotal: updated.chunks_total,
        status: 'uploading',
      });
    }

    return c.json({
      success: true,
      chunksCompleted: updated?.chunks_completed ?? 0,
      chunksTotal: updated?.chunks_total ?? 0,
    });
  } catch (error) {
    console.error('Chunk upload error:', error);
    return c.json({ error: 'Failed to upload chunk' }, 500);
  }
});

/* -------------------------------------------------------------- complete */

transferRoutes.post('/:id/complete', async (c) => {
  try {
    const { id } = c.req.param();
    const transfer = loadTransfer(id);
    if (!transfer) return c.json({ error: 'Transfer not found' }, 404);
    if (isExpired(transfer)) return c.json({ error: 'Transfer expired' }, 410);

    if (transfer.status === 'ready') {
      return c.json({
        success: true,
        status: 'ready',
        totalSize: transfer.total_size,
        downloadUrl: `/api/transfer/${id}/download`,
      });
    }

    const files = getTransferFiles(id);
    const missing: { index: number; path: string; expected: number; received: number }[] = [];
    let actualTotal = 0;

    for (const file of files) {
      if (file.is_dir) continue;

      const path = storagePath(id, file.storage_name);
      const onDisk = fileSizeOrNull(path) ?? 0;

      if (onDisk !== file.size) {
        missing.push({
          index: file.file_index,
          path: file.rel_path,
          expected: file.size,
          received: onDisk,
        });
        continue;
      }

      // Rebuild the file CRC from the chunk ledger; fall back to a full read
      // when the ledger is incomplete (resumed upload, restarted server, ...).
      const chunks = getFileChunks(id, file.file_index);
      const ledgerBytes = chunks.reduce((acc, ch) => acc + ch.size, 0);

      let crc: number;
      if (chunks.length > 0 && ledgerBytes === onDisk) {
        crc = 0;
        for (const chunk of chunks) crc = crc32Combine(crc, chunk.crc32 >>> 0, chunk.size);
      } else {
        crc = onDisk === 0 ? 0 : await computeCrcFromDisk(path);
      }

      setFileCrc(file.id, crc, onDisk, onDisk);
      actualTotal += onDisk;
    }

    if (missing.length > 0) {
      return c.json({ error: 'Upload incomplete', missing: missing.slice(0, 50) }, 409);
    }

    const completed = completeTransfer(id, actualTotal);
    clearChunks(id);

    broadcastProgress(id, {
      type: 'complete',
      transferId: id,
      progress: 100,
      uploadedSize: actualTotal,
      totalSize: actualTotal,
      status: 'ready',
    });

    console.log(`✅ Transfer complete: ${id} (${(actualTotal / 1024 / 1024).toFixed(1)} MB)`);

    return c.json({
      success: true,
      status: completed?.status ?? 'ready',
      totalSize: actualTotal,
      downloadUrl: `/api/transfer/${id}/download`,
    });
  } catch (error) {
    console.error('Complete error:', error);
    return c.json({ error: 'Failed to complete transfer' }, 500);
  }
});

/* ------------------------------------------------------------------ info */

transferRoutes.get('/:id', (c) => {
  const { id } = c.req.param();
  c.header('Cache-Control', 'private, no-store, max-age=0');

  const transfer = loadTransfer(id);
  if (!transfer) return c.json({ error: 'Transfer not found' }, 404);

  // An expired transfer leaks nothing beyond the fact that the id once existed.
  if (isExpired(transfer)) {
    return c.json({ id: transfer.id, status: 'expired', error: 'This transfer has expired' }, 410);
  }

  const progress =
    transfer.chunks_total > 0
      ? Math.min(100, Math.round((transfer.chunks_completed / transfer.chunks_total) * 100))
      : 0;

  const rows = transfer.status === 'ready' ? getTransferFiles(id) : [];
  const entries = rows.map((file) => ({
    id: file.id,
    index: file.file_index,
    path: file.rel_path,
    name: basenameOf(file.rel_path),
    size: file.is_dir ? 0 : file.size,
    isDir: file.is_dir === 1,
    isDangerous: file.is_dangerous === 1,
    previewable: !file.is_dir && previewMime(file.rel_path) !== null,
  }));

  const fileEntries = entries.filter((e) => !e.isDir);

  return c.json({
    id: transfer.id,
    status: transfer.status,
    filename: transfer.filename,
    total_size: transfer.total_size,
    uploaded_size: transfer.uploaded_size,
    chunks_total: transfer.chunks_total,
    chunks_completed: transfer.chunks_completed,
    created_at: transfer.created_at,
    expires_at: transfer.expires_at,
    download_count: transfer.download_count,
    progress,
    entries,
    fileCount: fileEntries.length,
    /** True when downloading gives back exactly the file that was uploaded. */
    isSingleFile:
      fileEntries.length === 1 && entries.length === 1 && !fileEntries[0].isDangerous,
    isLegacyArchive:
      transfer.status === 'ready' && rows.length === 0 && existsSync(legacyArchivePath(id)),
  });
});

/* ---------------------------------------------------------------- delete */

transferRoutes.delete('/:id', (c) => {
  try {
    const { id } = c.req.param();
    const transfer = loadTransfer(id);
    if (!transfer) return c.json({ error: 'Transfer not found' }, 404);

    const provided = c.req.header('x-owner-token') || '';
    if (transfer.owner_token) {
      if (provided !== transfer.owner_token) return c.json({ error: 'Not allowed' }, 403);
    } else {
      // Rows created before owner tokens existed have no credential to check;
      // knowing the unguessable id is all they ever had.
      console.warn(`🔓 delete without owner token (legacy transfer ${id})`);
    }

    purgeTransferFromDisk(id);
    deleteTransfer(id);

    console.log(`🗑️  Transfer deleted: ${id}`);
    return c.json({ success: true });
  } catch (error) {
    console.error('Delete error:', error);
    return c.json({ error: 'Failed to delete transfer' }, 500);
  }
});
