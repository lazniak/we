import { Hono } from 'hono';
import { getStats, getActiveTransfersCount } from '../db';

export const statsRoutes = new Hono();

// Get global statistics
statsRoutes.get('/', async (c) => {
  const stats = getStats();
  const activeTransfers = getActiveTransfersCount();
  
  return c.json({
    totalTransfers: stats.total_transfers,
    totalBytes: stats.total_bytes,
    totalGB: (stats.total_bytes / (1024 * 1024 * 1024)).toFixed(2),
    activeTransfers,
    updatedAt: stats.updated_at,
  });
});
