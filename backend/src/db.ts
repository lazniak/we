import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// Ensure data directory exists
const dataDir = join(import.meta.dir, '../../data');
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

const dbPath = join(dataDir, 'transfers.db');
export const db = new Database(dbPath);

export interface Transfer {
  id: string;
  status: 'pending' | 'uploading' | 'ready' | 'expired';
  filename: string;
  total_size: number;
  uploaded_size: number;
  chunks_total: number;
  chunks_completed: number;
  created_at: string;
  expires_at: string;
  download_count: number;
}

export interface Stats {
  id: number;
  total_transfers: number;
  total_bytes: number;
  updated_at: string;
}

export function initDb() {
  // Create transfers table
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

  // Create stats table
  db.run(`
    CREATE TABLE IF NOT EXISTS stats (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      total_transfers INTEGER DEFAULT 0,
      total_bytes INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Initialize stats row if not exists
  const stats = db.query('SELECT * FROM stats WHERE id = 1').get();
  if (!stats) {
    db.run('INSERT INTO stats (id, total_transfers, total_bytes) VALUES (1, 0, 0)');
  }

  console.log('📦 Database initialized');
}

// Transfer operations
export function createTransfer(id: string, filename: string, totalSize: number, chunksTotal: number, expirationDays: number = 3): Transfer {
  const expiresAt = new Date(Date.now() + expirationDays * 24 * 60 * 60 * 1000).toISOString();
  
  db.run(`
    INSERT INTO transfers (id, filename, total_size, chunks_total, expires_at, status)
    VALUES (?, ?, ?, ?, ?, 'pending')
  `, [id, filename, totalSize, chunksTotal, expiresAt]);
  
  return getTransfer(id)!;
}

export function getTransfer(id: string): Transfer | undefined {
  return db.query('SELECT * FROM transfers WHERE id = ?').get(id) as Transfer | undefined;
}

export function updateTransferProgress(id: string, chunkIndex: number, chunkSize: number): Transfer | undefined {
  db.run(`
    UPDATE transfers 
    SET chunks_completed = chunks_completed + 1,
        uploaded_size = uploaded_size + ?,
        status = 'uploading'
    WHERE id = ?
  `, [chunkSize, id]);
  
  return getTransfer(id);
}

export function completeTransfer(id: string): Transfer | undefined {
  db.run(`
    UPDATE transfers 
    SET status = 'ready'
    WHERE id = ?
  `, [id]);
  
  // Update global stats
  const transfer = getTransfer(id);
  if (transfer) {
    db.run(`
      UPDATE stats 
      SET total_transfers = total_transfers + 1,
          total_bytes = total_bytes + ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `, [transfer.total_size]);
  }
  
  return transfer;
}

export function incrementDownloadCount(id: string): void {
  db.run('UPDATE transfers SET download_count = download_count + 1 WHERE id = ?', [id]);
}

export function getExpiredTransfers(): Transfer[] {
  return db.query(`
    SELECT * FROM transfers 
    WHERE expires_at < datetime('now') OR status = 'expired'
  `).all() as Transfer[];
}

export function deleteTransfer(id: string): void {
  db.run('DELETE FROM transfers WHERE id = ?', [id]);
}

export function getStats(): Stats {
  return db.query('SELECT * FROM stats WHERE id = 1').get() as Stats;
}

export function getActiveTransfersCount(): number {
  const result = db.query(`
    SELECT COUNT(*) as count FROM transfers 
    WHERE status IN ('pending', 'uploading')
  `).get() as { count: number };
  return result.count;
}
