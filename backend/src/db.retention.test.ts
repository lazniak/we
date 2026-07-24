import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const root = mkdtempSync(join(tmpdir(), 'we-db-'));
process.env.DATA_DIR = join(root, 'data');
process.env.UPLOADS_DIR = join(root, 'uploads');

// Imported after the environment is set, because the module opens the
// database as soon as it loads.
const dbModule = await import('./db');
const { createTransfer, db, deleteTransfer, getTransfersToPurge, initDb } = dbModule;

const DAY_MS = 24 * 60 * 60 * 1000;

beforeAll(() => initDb());

afterAll(() => {
  // Windows keeps the file locked until the handle is closed.
  db.close();
  try {
    rmSync(root, { recursive: true, force: true });
  } catch {
    /* the OS will clean the temp directory up */
  }
});

function makeTransfer(id: string, expirationDays: number) {
  createTransfer({
    id,
    filename: 'x',
    totalSize: 1,
    chunksTotal: 1,
    expirationDays,
    ownerToken: 't',
    fileCount: 1,
  });
}

function setExpiry(id: string, at: Date) {
  db.run('UPDATE transfers SET expires_at = ? WHERE id = ?', [at.toISOString(), id]);
}

function purgedIds(): string[] {
  return getTransfersToPurge(DAY_MS).map((t) => t.id);
}

describe('retention query', () => {
  it('purges a transfer whose ISO expiry is in the past', () => {
    makeTransfer('expired00001', 3);
    setExpiry('expired00001', new Date(Date.now() - 60_000));

    expect(purgedIds()).toContain('expired00001');
    deleteTransfer('expired00001');
  });

  it('purges an expiry that passed only minutes ago on the same calendar day', () => {
    // The failure this guards against: comparing an ISO string against
    // SQLite's "YYYY-MM-DD HH:MM:SS" as plain text keeps files alive until
    // the date rolls over, hours after the link stopped working.
    makeTransfer('sameday00001', 3);
    setExpiry('sameday00001', new Date(Date.now() - 5 * 60_000));

    expect(purgedIds()).toContain('sameday00001');
    deleteTransfer('sameday00001');
  });

  it('keeps a transfer that has not expired yet', () => {
    makeTransfer('future000001', 3);
    expect(purgedIds()).not.toContain('future000001');
    deleteTransfer('future000001');
  });

  it('keeps an upload that started moments ago', () => {
    // The mirror image of the bug above: a fresh upload must never look like
    // it has been stalled for a day.
    makeTransfer('inflight0001', 3);
    db.run(`UPDATE transfers SET status = 'uploading' WHERE id = ?`, ['inflight0001']);

    expect(purgedIds()).not.toContain('inflight0001');
    deleteTransfer('inflight0001');
  });

  it('purges an upload that stalled longer than the ttl', () => {
    makeTransfer('stalled00001', 3);
    db.run(
      `UPDATE transfers SET status = 'uploading', created_at = datetime('now', '-30 hours') WHERE id = ?`,
      ['stalled00001'],
    );

    expect(purgedIds()).toContain('stalled00001');
    deleteTransfer('stalled00001');
  });
});
