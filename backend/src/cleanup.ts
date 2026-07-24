import { existsSync, readdirSync, rmSync, statSync } from 'fs';
import { join } from 'path';
import {
  CLEANUP_INTERVAL_MS,
  HARD_MAX_AGE_MS,
  INCOMPLETE_UPLOAD_TTL_MS,
  ORPHAN_GRACE_MS,
  UPLOADS_DIR,
} from './config';
import { deleteTransfer, getAllTransferIds, getTransfersToPurge } from './db';

function remove(path: string): boolean {
  if (!existsSync(path)) return false;
  try {
    rmSync(path, { recursive: true, force: true });
    return true;
  } catch (error) {
    console.error(`  ❌ could not remove ${path}:`, error);
    return false;
  }
}

/** Every on-disk artefact belonging to a transfer id. */
function pathsFor(id: string): string[] {
  return [
    join(UPLOADS_DIR, id),
    join(UPLOADS_DIR, `${id}.zip`),
    join(UPLOADS_DIR, `${id}_chunks`),
  ];
}

function ageOf(path: string): number {
  try {
    const stats = statSync(path);
    return Date.now() - Math.max(stats.mtimeMs, stats.birthtimeMs || 0);
  } catch {
    return 0;
  }
}

/** Maps an uploads/ entry name back to the transfer id that owns it. */
function idFromEntry(entry: string): string {
  if (entry.endsWith('_chunks')) return entry.slice(0, -'_chunks'.length);
  if (entry.endsWith('.zip')) return entry.slice(0, -'.zip'.length);
  return entry;
}

export function cleanupExpiredTransfers(): void {
  const started = Date.now();
  let purged = 0;
  let orphans = 0;

  // 1. Expired transfers, plus uploads that stalled and never completed.
  for (const transfer of getTransfersToPurge(INCOMPLETE_UPLOAD_TTL_MS)) {
    try {
      for (const path of pathsFor(transfer.id)) remove(path);
      deleteTransfer(transfer.id);
      purged++;
      console.log(
        `  🗑️  purged ${transfer.id} (${transfer.status}, expired ${transfer.expires_at})`,
      );
    } catch (error) {
      console.error(`  ❌ failed to purge ${transfer.id}:`, error);
    }
  }

  // 2. Anything on disk that no longer has a database row.
  //
  // The previous implementation deleted "<id>_chunks" whenever "<id>.zip" was
  // missing, which wiped the chunks of every upload that happened to be in
  // flight when the job ran. Ownership is now decided by the database, and an
  // orphan still gets a grace period before it is touched.
  if (existsSync(UPLOADS_DIR)) {
    const known = getAllTransferIds();

    for (const entry of readdirSync(UPLOADS_DIR)) {
      const id = idFromEntry(entry);
      const path = join(UPLOADS_DIR, entry);
      const age = ageOf(path);

      if (known.has(id)) {
        // Row still exists: only the hard retention backstop may act, so a
        // forgotten row can never keep bytes alive forever.
        if (age > HARD_MAX_AGE_MS) {
          if (remove(path)) {
            deleteTransfer(id);
            orphans++;
            console.log(`  🧨 retention cap reached, removed ${entry}`);
          }
        }
        continue;
      }

      if (age > ORPHAN_GRACE_MS) {
        if (remove(path)) {
          orphans++;
          console.log(`  🗑️  removed orphan ${entry}`);
        }
      }
    }
  }

  const ms = Date.now() - started;
  if (purged || orphans) {
    console.log(`🧹 Cleanup: ${purged} expired, ${orphans} orphaned (${ms}ms)`);
  }
}

export function startCleanupJob(): void {
  cleanupExpiredTransfers();

  const timer = setInterval(cleanupExpiredTransfers, CLEANUP_INTERVAL_MS);
  // Never hold the process open just for the sweep.
  if (typeof timer === 'object' && 'unref' in timer) timer.unref();

  console.log(
    `⏰ Cleanup job scheduled every ${Math.round(CLEANUP_INTERVAL_MS / 60000)} min`,
  );
}
