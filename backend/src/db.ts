import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { DATA_DIR } from './config';
import { isDangerousFile } from './lib/fileSafety';

if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

export const db = new Database(join(DATA_DIR, 'transfers.db'));

// WAL keeps readers (downloads) from blocking writers (chunk uploads).
db.run('PRAGMA journal_mode = WAL');
db.run('PRAGMA synchronous = NORMAL');
db.run('PRAGMA foreign_keys = ON');
db.run('PRAGMA busy_timeout = 5000');

export type TransferStatus =
  | 'pending'
  | 'uploading'
  /** Payload landed, waiting on the antivirus verdict. Not downloadable yet. */
  | 'scanning'
  | 'ready'
  /** A threat was named; the payload has been destroyed. */
  | 'infected'
  | 'expired';

export interface Transfer {
  id: string;
  status: TransferStatus;
  filename: string;
  total_size: number;
  uploaded_size: number;
  chunks_total: number;
  chunks_completed: number;
  created_at: string;
  expires_at: string;
  download_count: number;
  owner_token: string | null;
  file_count: number;
  completed_at: string | null;
  threat_name: string | null;
}

export interface Stats {
  id: number;
  total_transfers: number;
  total_bytes: number;
  updated_at: string;
}

export interface TransferFile {
  id: number;
  transfer_id: string;
  filename: string;
  original_filename: string;
  size: number;
  mime_type: string | null;
  thumbnail_path: string | null;
  file_path: string;
  created_at: string;
  file_index: number;
  rel_path: string;
  is_dir: number;
  is_dangerous: number;
  crc32: number | null;
  received_bytes: number;
  storage_name: string;
}

/* --------------------------------------------------------------- schema */

function columnNames(table: string): Set<string> {
  const rows = db.query(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return new Set(rows.map((r) => r.name));
}

function addColumn(table: string, column: string, definition: string) {
  if (!columnNames(table).has(column)) {
    db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

/**
 * Re-applies the executable policy to every stored file on startup. Rows
 * written before the flag existed get classified, and widening the list in
 * fileSafety.ts takes effect for transfers that are already on disk.
 */
function reclassifyDangerousFiles(): void {
  const rows = db
    .query('SELECT id, rel_path, is_dir, is_dangerous FROM transfer_files')
    .all() as { id: number; rel_path: string; is_dir: number; is_dangerous: number }[];

  const update = db.prepare('UPDATE transfer_files SET is_dangerous = ? WHERE id = ?');
  let changed = 0;

  for (const row of rows) {
    const expected = row.is_dir ? 0 : isDangerousFile(row.rel_path ?? '') ? 1 : 0;
    if (expected !== row.is_dangerous) {
      update.run(expected, row.id);
      changed++;
    }
  }

  if (changed > 0) console.log(`🔒 Re-classified ${changed} file(s) against the executable list`);
}

export function initDb() {
  db.run(`
    CREATE TABLE IF NOT EXISTS transfers (
      id TEXT PRIMARY KEY,
      status TEXT DEFAULT 'pending',
      filename TEXT,
      total_size INTEGER,
      uploaded_size INTEGER DEFAULT 0,
      chunks_total INTEGER,
      chunks_completed INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME,
      download_count INTEGER DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS stats (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      total_transfers INTEGER DEFAULT 0,
      total_bytes INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS transfer_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transfer_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      size INTEGER NOT NULL,
      mime_type TEXT,
      thumbnail_path TEXT,
      file_path TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS transfer_chunks (
      transfer_id TEXT NOT NULL,
      file_index INTEGER NOT NULL,
      chunk_index INTEGER NOT NULL,
      size INTEGER NOT NULL,
      crc32 INTEGER NOT NULL,
      PRIMARY KEY (transfer_id, file_index, chunk_index)
    )
  `);

  // Migrations for databases created before the multi-file rework.
  addColumn('transfers', 'owner_token', 'TEXT');
  addColumn('transfers', 'file_count', 'INTEGER DEFAULT 0');
  addColumn('transfers', 'completed_at', 'DATETIME');
  addColumn('transfers', 'threat_name', 'TEXT');
  addColumn('transfer_files', 'file_index', 'INTEGER DEFAULT 0');
  addColumn('transfer_files', 'rel_path', 'TEXT');
  addColumn('transfer_files', 'is_dir', 'INTEGER DEFAULT 0');
  addColumn('transfer_files', 'is_dangerous', 'INTEGER DEFAULT 0');
  addColumn('transfer_files', 'crc32', 'INTEGER');
  addColumn('transfer_files', 'received_bytes', 'INTEGER DEFAULT 0');
  addColumn('transfer_files', 'storage_name', 'TEXT');

  // Backfill rows written by the previous schema.
  db.run(`UPDATE transfer_files SET rel_path = original_filename WHERE rel_path IS NULL`);
  db.run(`UPDATE transfer_files SET storage_name = filename WHERE storage_name IS NULL`);
  db.run(`UPDATE transfer_files SET received_bytes = size WHERE received_bytes IS NULL OR received_bytes = 0`);

  // Foreign keys were not enforced before, so deleted transfers left their
  // file rows behind. Nothing can reach them - every lookup goes through the
  // transfer - so they are pure dead weight.
  const orphans = db.run(
    `DELETE FROM transfer_files
      WHERE transfer_id NOT IN (SELECT id FROM transfers)`,
  );
  if (orphans.changes > 0) {
    console.log(`🧹 Removed ${orphans.changes} orphaned file row(s)`);
  }

  db.run(`DELETE FROM transfer_chunks WHERE transfer_id NOT IN (SELECT id FROM transfers)`);

  reclassifyDangerousFiles();

  db.run(`CREATE INDEX IF NOT EXISTS idx_transfer_files_transfer_id ON transfer_files(transfer_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_transfer_files_index ON transfer_files(transfer_id, file_index)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_transfers_expires ON transfers(expires_at)`);

  if (!db.query('SELECT id FROM stats WHERE id = 1').get()) {
    db.run('INSERT INTO stats (id, total_transfers, total_bytes) VALUES (1, 0, 0)');
  }

  console.log('📦 Database initialized');
}

/* ------------------------------------------------------------ transfers */

export function createTransfer(params: {
  id: string;
  filename: string;
  totalSize: number;
  chunksTotal: number;
  expirationDays: number;
  ownerToken: string;
  fileCount: number;
}): Transfer {
  const expiresAt = new Date(
    Date.now() + params.expirationDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  db.run(
    `INSERT INTO transfers
       (id, filename, total_size, chunks_total, expires_at, status, owner_token, file_count)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
    [
      params.id,
      params.filename,
      params.totalSize,
      params.chunksTotal,
      expiresAt,
      params.ownerToken,
      params.fileCount,
    ],
  );

  return getTransfer(params.id)!;
}

export function getTransfer(id: string): Transfer | undefined {
  return db.query('SELECT * FROM transfers WHERE id = ?').get(id) as
    | Transfer
    | undefined;
}

export function isExpired(transfer: Transfer): boolean {
  return new Date(transfer.expires_at).getTime() <= Date.now();
}

export function markUploading(id: string): void {
  db.run(`UPDATE transfers SET status = 'uploading' WHERE id = ? AND status = 'pending'`, [id]);
}

/**
 * Recomputes progress from the chunk ledger, so a retried or duplicated chunk
 * can never inflate the counters past 100%.
 */
export function refreshProgress(id: string): Transfer | undefined {
  db.run(
    `UPDATE transfers SET
       chunks_completed = (SELECT COUNT(*) FROM transfer_chunks WHERE transfer_id = ?),
       uploaded_size    = (SELECT COALESCE(SUM(size), 0) FROM transfer_chunks WHERE transfer_id = ?)
     WHERE id = ?`,
    [id, id, id],
  );
  return getTransfer(id);
}

export function completeTransfer(
  id: string,
  totalSize: number,
  status: 'ready' | 'scanning' = 'ready',
): Transfer | undefined {
  const before = getTransfer(id);
  if (!before) return undefined;

  db.run(
    `UPDATE transfers
       SET status = ?, total_size = ?, uploaded_size = ?, completed_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [status, totalSize, totalSize, id],
  );

  // Statistics are counted once per transfer, no matter how often the client
  // retries the complete call.
  if (before.status !== 'ready' && before.status !== 'scanning') {
    db.run(
      `UPDATE stats
         SET total_transfers = total_transfers + 1,
             total_bytes = total_bytes + ?,
             updated_at = CURRENT_TIMESTAMP
       WHERE id = 1`,
      [totalSize],
    );
  }

  return getTransfer(id);
}

/** Records the antivirus verdict once the scan finishes. */
export function setScanVerdict(id: string, threat: string | null): Transfer | undefined {
  db.run('UPDATE transfers SET status = ?, threat_name = ? WHERE id = ?', [
    threat ? 'infected' : 'ready',
    threat,
    id,
  ]);
  return getTransfer(id);
}

/** Transfers left mid-scan by a restart, so the sweep can finish the job. */
export function getScanningTransfers(): Transfer[] {
  return db.query(`SELECT * FROM transfers WHERE status = 'scanning'`).all() as Transfer[];
}

export function incrementDownloadCount(id: string): void {
  db.run('UPDATE transfers SET download_count = download_count + 1 WHERE id = ?', [id]);
}

export function deleteTransfer(id: string): void {
  db.run('DELETE FROM transfer_chunks WHERE transfer_id = ?', [id]);
  db.run('DELETE FROM transfer_files WHERE transfer_id = ?', [id]);
  db.run('DELETE FROM transfers WHERE id = ?', [id]);
}

/**
 * Everything past its expiry, or stalled mid-upload for too long.
 *
 * Both sides of every comparison go through datetime(). expires_at is written
 * as an ISO string ("2026-07-26T22:49:25.301Z") while created_at uses SQLite's
 * own "2026-07-26 22:49:25". Comparing those as plain strings is wrong in both
 * directions - it hides expired transfers until the calendar day rolls over,
 * and it makes uploads that started today look a day old.
 */
export function getTransfersToPurge(incompleteTtlMs: number): Transfer[] {
  const staleModifier = `-${Math.max(1, Math.round(incompleteTtlMs / 1000))} seconds`;

  return db
    .query(
      `SELECT * FROM transfers
        WHERE datetime(expires_at) <= datetime('now')
           OR status = 'expired'
           OR (status IN ('pending', 'uploading')
               AND datetime(created_at) <= datetime('now', ?))`,
    )
    .all(staleModifier) as Transfer[];
}

export function getAllTransferIds(): Set<string> {
  const rows = db.query('SELECT id FROM transfers').all() as { id: string }[];
  return new Set(rows.map((r) => r.id));
}

export function getStats(): Stats {
  return db.query('SELECT * FROM stats WHERE id = 1').get() as Stats;
}

/**
 * What the service is holding right now. Distinct from the stats table, which
 * is a lifetime counter that only ever goes up.
 */
export function getStoredTotals(): { transfers: number; bytes: number } {
  const row = db
    .query(
      `SELECT COUNT(*) AS transfers, COALESCE(SUM(total_size), 0) AS bytes
         FROM transfers
        WHERE datetime(expires_at) > datetime('now')
          AND status IN ('ready', 'scanning')`,
    )
    .get() as { transfers: number; bytes: number };
  return row;
}

export function getActiveTransfersCount(): number {
  const result = db
    .query(
      `SELECT COUNT(*) as count FROM transfers
        WHERE status IN ('pending', 'uploading')
          AND datetime(expires_at) > datetime('now')`,
    )
    .get() as { count: number };
  return result.count;
}

/* -------------------------------------------------------- transfer files */

export function addTransferFile(entry: {
  transferId: string;
  fileIndex: number;
  relPath: string;
  storageName: string;
  filePath: string;
  size: number;
  mimeType: string | null;
  isDir: boolean;
  isDangerous: boolean;
}): void {
  db.run(
    `INSERT INTO transfer_files
       (transfer_id, filename, original_filename, size, mime_type, file_path,
        file_index, rel_path, is_dir, is_dangerous, crc32, received_bytes, storage_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?)`,
    [
      entry.transferId,
      entry.storageName,
      entry.relPath,
      entry.size,
      entry.mimeType,
      entry.filePath,
      entry.fileIndex,
      entry.relPath,
      entry.isDir ? 1 : 0,
      entry.isDangerous ? 1 : 0,
      entry.storageName,
    ],
  );
}

export function getTransferFiles(transferId: string): TransferFile[] {
  return db
    .query('SELECT * FROM transfer_files WHERE transfer_id = ? ORDER BY file_index ASC, id ASC')
    .all(transferId) as TransferFile[];
}

export function getTransferFileByIndex(
  transferId: string,
  fileIndex: number,
): TransferFile | undefined {
  return db
    .query('SELECT * FROM transfer_files WHERE transfer_id = ? AND file_index = ?')
    .get(transferId, fileIndex) as TransferFile | undefined;
}

export function getTransferFileById(
  transferId: string,
  id: number,
): TransferFile | undefined {
  return db
    .query('SELECT * FROM transfer_files WHERE transfer_id = ? AND id = ?')
    .get(transferId, id) as TransferFile | undefined;
}

export function setFileCrc(id: number, crc: number, receivedBytes: number, size: number): void {
  db.run('UPDATE transfer_files SET crc32 = ?, received_bytes = ?, size = ? WHERE id = ?', [
    crc >>> 0,
    receivedBytes,
    size,
    id,
  ]);
}

export function deleteTransferFiles(transferId: string): void {
  db.run('DELETE FROM transfer_files WHERE transfer_id = ?', [transferId]);
}

/* -------------------------------------------------------------- chunks */

/** Returns true when this chunk had not been recorded before. */
export function recordChunk(
  transferId: string,
  fileIndex: number,
  chunkIndex: number,
  size: number,
  crc: number,
): boolean {
  const existing = db
    .query(
      'SELECT size FROM transfer_chunks WHERE transfer_id = ? AND file_index = ? AND chunk_index = ?',
    )
    .get(transferId, fileIndex, chunkIndex) as { size: number } | undefined;

  db.run(
    `INSERT INTO transfer_chunks (transfer_id, file_index, chunk_index, size, crc32)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(transfer_id, file_index, chunk_index)
     DO UPDATE SET size = excluded.size, crc32 = excluded.crc32`,
    [transferId, fileIndex, chunkIndex, size, crc >>> 0],
  );

  return existing === undefined;
}

export function getFileChunks(
  transferId: string,
  fileIndex: number,
): { chunk_index: number; size: number; crc32: number }[] {
  return db
    .query(
      `SELECT chunk_index, size, crc32 FROM transfer_chunks
        WHERE transfer_id = ? AND file_index = ? ORDER BY chunk_index ASC`,
    )
    .all(transferId, fileIndex) as { chunk_index: number; size: number; crc32: number }[];
}

export function clearChunks(transferId: string): void {
  db.run('DELETE FROM transfer_chunks WHERE transfer_id = ?', [transferId]);
}
