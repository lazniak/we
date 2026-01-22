import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { existsSync, mkdirSync, writeFileSync, readdirSync, readFileSync, unlinkSync, createWriteStream, createReadStream } from 'fs';
import { join } from 'path';
import { 
  createTransfer, 
  getTransfer, 
  updateTransferProgress, 
  completeTransfer,
  incrementDownloadCount 
} from '../db';
import { broadcastProgress } from '../websocket';

const UPLOADS_DIR = join(import.meta.dir, '../../../uploads');
const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB

// Ensure uploads directory exists
if (!existsSync(UPLOADS_DIR)) {
  mkdirSync(UPLOADS_DIR, { recursive: true });
}

export const transferRoutes = new Hono();

// Initialize a new transfer - generates link before upload starts
transferRoutes.post('/init', async (c) => {
  try {
    const body = await c.req.json();
    const { filename, totalSize, chunksTotal, expirationDays } = body;
    
    if (!filename || !totalSize || !chunksTotal) {
      return c.json({ error: 'Missing required fields' }, 400);
    }
    
    // Validate expiration days (3-7 days)
    const days = Math.max(3, Math.min(7, expirationDays || 3));
    
    const transferId = nanoid(12);
    const transfer = createTransfer(transferId, filename, totalSize, chunksTotal, days);
    
    // Create chunks directory
    const chunksDir = join(UPLOADS_DIR, `${transferId}_chunks`);
    mkdirSync(chunksDir, { recursive: true });
    
    console.log(`📤 Transfer initiated: ${transferId} (${filename}, ${(totalSize / 1024 / 1024).toFixed(2)} MB)`);
    
    return c.json({
      transferId,
      uploadUrl: `/api/transfer/${transferId}/chunk`,
      shareUrl: `/${transferId}`,
      expiresAt: transfer.expires_at,
    });
  } catch (error) {
    console.error('Init error:', error);
    return c.json({ error: 'Failed to initialize transfer' }, 500);
  }
});

// Upload a chunk
transferRoutes.put('/:id/chunk/:chunkIndex', async (c) => {
  try {
    const { id, chunkIndex } = c.req.param();
    const transfer = getTransfer(id);
    
    if (!transfer) {
      return c.json({ error: 'Transfer not found' }, 404);
    }
    
    if (transfer.status === 'ready') {
      return c.json({ error: 'Transfer already complete' }, 400);
    }
    
    const chunkData = await c.req.arrayBuffer();
    const chunkBuffer = Buffer.from(chunkData);
    
    // Save chunk to disk
    const chunksDir = join(UPLOADS_DIR, `${id}_chunks`);
    const chunkPath = join(chunksDir, `chunk_${chunkIndex.padStart(6, '0')}`);
    writeFileSync(chunkPath, chunkBuffer);
    
    // Update progress in database
    const updatedTransfer = updateTransferProgress(id, parseInt(chunkIndex), chunkBuffer.length);
    
    if (updatedTransfer) {
      const progress = Math.round((updatedTransfer.chunks_completed / updatedTransfer.chunks_total) * 100);
      
      // Broadcast progress to any connected clients (receivers)
      broadcastProgress(id, {
        type: 'progress',
        transferId: id,
        progress,
        uploadedSize: updatedTransfer.uploaded_size,
        totalSize: updatedTransfer.total_size,
        chunksCompleted: updatedTransfer.chunks_completed,
        chunksTotal: updatedTransfer.chunks_total,
        status: 'uploading',
      });
    }
    
    return c.json({ 
      success: true, 
      chunkIndex: parseInt(chunkIndex),
      chunksCompleted: updatedTransfer?.chunks_completed || 0,
    });
  } catch (error) {
    console.error('Chunk upload error:', error);
    return c.json({ error: 'Failed to upload chunk' }, 500);
  }
});

// Complete the transfer - merge chunks
transferRoutes.post('/:id/complete', async (c) => {
  try {
    const { id } = c.req.param();
    const transfer = getTransfer(id);
    
    if (!transfer) {
      return c.json({ error: 'Transfer not found' }, 404);
    }
    
    const chunksDir = join(UPLOADS_DIR, `${id}_chunks`);
    const outputPath = join(UPLOADS_DIR, `${id}.zip`);
    
    // Read and sort chunk files
    const chunkFiles = readdirSync(chunksDir)
      .filter(f => f.startsWith('chunk_'))
      .sort();
    
    // Merge chunks into final file
    const writeStream = createWriteStream(outputPath);
    
    for (const chunkFile of chunkFiles) {
      const chunkPath = join(chunksDir, chunkFile);
      const chunkData = readFileSync(chunkPath);
      writeStream.write(chunkData);
      unlinkSync(chunkPath); // Delete chunk after merging
    }
    
    writeStream.end();
    
    // Wait for write to complete
    await new Promise<void>((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });
    
    // Remove chunks directory
    try {
      const { rmSync } = await import('fs');
      rmSync(chunksDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }
    
    // Mark transfer as complete
    const completedTransfer = completeTransfer(id);
    
    // Broadcast completion to connected clients
    broadcastProgress(id, {
      type: 'complete',
      transferId: id,
      progress: 100,
      status: 'ready',
    });
    
    console.log(`✅ Transfer complete: ${id}`);
    
    return c.json({ 
      success: true,
      status: 'ready',
      downloadUrl: `/api/transfer/${id}/download`,
    });
  } catch (error) {
    console.error('Complete error:', error);
    return c.json({ error: 'Failed to complete transfer' }, 500);
  }
});

// Get transfer info
transferRoutes.get('/:id', async (c) => {
  const { id } = c.req.param();
  const transfer = getTransfer(id);
  
  if (!transfer) {
    return c.json({ error: 'Transfer not found' }, 404);
  }
  
  // Check if expired
  if (new Date(transfer.expires_at) < new Date()) {
    return c.json({ 
      ...transfer,
      status: 'expired',
      error: 'This transfer has expired' 
    });
  }
  
  const progress = transfer.chunks_total > 0 
    ? Math.round((transfer.chunks_completed / transfer.chunks_total) * 100) 
    : 0;
  
  return c.json({
    ...transfer,
    progress,
  });
});

// Download file
transferRoutes.get('/:id/download', async (c) => {
  const { id } = c.req.param();
  const transfer = getTransfer(id);
  
  if (!transfer) {
    return c.json({ error: 'Transfer not found' }, 404);
  }
  
  if (transfer.status !== 'ready') {
    return c.json({ error: 'Transfer not ready for download' }, 400);
  }
  
  // Check if expired
  if (new Date(transfer.expires_at) < new Date()) {
    return c.json({ error: 'This transfer has expired' }, 410);
  }
  
  const filePath = join(UPLOADS_DIR, `${id}.zip`);
  
  if (!existsSync(filePath)) {
    return c.json({ error: 'File not found' }, 404);
  }
  
  // Increment download count
  incrementDownloadCount(id);
  
  const filename = transfer.filename.endsWith('.zip') 
    ? transfer.filename 
    : `${transfer.filename}.zip`;
  
  // Get file size using fs.statSync for accurate size
  const { statSync } = await import('fs');
  const stats = statSync(filePath);
  const fileSize = stats.size;
  
  // Create read stream for large files
  const fileStream = createReadStream(filePath);
  
  // Encode filename for proper handling of special characters (Polish, etc.)
  // Use RFC 5987 encoding for UTF-8 filenames
  // Only use filename* to avoid issues with special characters in quoted strings
  const encodedFilename = encodeURIComponent(filename);
  const contentDisposition = `attachment; filename*=UTF-8''${encodedFilename}`;
  
  // Set headers
  c.header('Content-Type', 'application/zip');
  c.header('Content-Disposition', contentDisposition);
  c.header('Content-Length', String(fileSize));
  c.header('Cache-Control', 'no-cache, no-store, must-revalidate');
  c.header('Pragma', 'no-cache');
  c.header('Expires', '0');
  
  // Return stream using c.body() with stream
  return c.body(fileStream);
});
