import { Hono } from 'hono';
import { getActiveTransfersCount, getStats, getStoredTotals } from '../db';

export const statsRoutes = new Hono();

statsRoutes.get('/', (c) => {
  const stats = getStats();
  const stored = getStoredTotals();

  c.header('Cache-Control', 'public, max-age=30');

  return c.json({
    // Lifetime totals: everything that ever went through the service. These
    // only ever grow and say nothing about what is on disk.
    totalTransfers: stats.total_transfers,
    totalBytes: stats.total_bytes,
    totalGB: (stats.total_bytes / 1024 ** 3).toFixed(2),

    // What is actually being held right now, and will delete itself on expiry.
    storedTransfers: stored.transfers,
    storedBytes: stored.bytes,

    activeTransfers: getActiveTransfersCount(),
    updatedAt: stats.updated_at,
  });
});
