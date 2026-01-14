import { existsSync, rmSync, readdirSync } from 'fs';
import { join } from 'path';
import { getExpiredTransfers, deleteTransfer } from './db';

const UPLOADS_DIR = join(import.meta.dir, '../../uploads');
const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour

export function cleanupExpiredTransfers() {
  console.log('🧹 Running cleanup job...');
  
  const expiredTransfers = getExpiredTransfers();
  let cleaned = 0;
  
  for (const transfer of expiredTransfers) {
    try {
      // Delete the file
      const filePath = join(UPLOADS_DIR, `${transfer.id}.zip`);
      if (existsSync(filePath)) {
        rmSync(filePath, { force: true });
      }
      
      // Delete chunks folder if exists
      const chunksDir = join(UPLOADS_DIR, `${transfer.id}_chunks`);
      if (existsSync(chunksDir)) {
        rmSync(chunksDir, { recursive: true, force: true });
      }
      
      // Delete from database
      deleteTransfer(transfer.id);
      cleaned++;
      
      console.log(`  🗑️ Deleted expired transfer: ${transfer.id}`);
    } catch (error) {
      console.error(`  ❌ Failed to cleanup transfer ${transfer.id}:`, error);
    }
  }
  
  // Also clean up orphaned chunk directories
  if (existsSync(UPLOADS_DIR)) {
    const items = readdirSync(UPLOADS_DIR);
    for (const item of items) {
      if (item.endsWith('_chunks')) {
        const transferId = item.replace('_chunks', '');
        const mainFile = join(UPLOADS_DIR, `${transferId}.zip`);
        
        // If main file doesn't exist and chunks are old, clean up
        if (!existsSync(mainFile)) {
          const chunksDir = join(UPLOADS_DIR, item);
          try {
            rmSync(chunksDir, { recursive: true, force: true });
            console.log(`  🗑️ Deleted orphaned chunks: ${item}`);
            cleaned++;
          } catch (e) {
            // Ignore
          }
        }
      }
    }
  }
  
  console.log(`🧹 Cleanup complete. Removed ${cleaned} items.`);
}

export function startCleanupJob() {
  // Run immediately on startup
  cleanupExpiredTransfers();
  
  // Then run every hour
  setInterval(cleanupExpiredTransfers, CLEANUP_INTERVAL);
  
  console.log('⏰ Cleanup job scheduled (every 1 hour)');
}
