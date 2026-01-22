import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { existsSync, mkdirSync, writeFileSync, readdirSync, readFileSync, unlinkSync, createWriteStream, createReadStream } from 'fs';
import { join } from 'path';
import { 
  createTransfer, 
  getTransfer, 
  updateTransferProgress, 
  completeTransfer,
  incrementDownloadCount,
  addTransferFile,
  getTransferFiles,
  deleteTransferFiles,
  deleteTransfer
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
    const { filename, totalSize, chunksTotal, expirationDays, files, isZip } = body;
    
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
    
    // If not ZIP and we have file list, create directory for individual files
    if (!isZip && files && Array.isArray(files)) {
      const filesDir = join(UPLOADS_DIR, transferId);
      mkdirSync(filesDir, { recursive: true });
    }
    
    console.log(`📤 Transfer initiated: ${transferId} (${filename}, ${(totalSize / 1024 / 1024).toFixed(2)} MB, ${isZip ? 'ZIP' : 'multi-file'})`);
    
    return c.json({
      transferId,
      uploadUrl: `/api/transfer/${transferId}/chunk`,
      shareUrl: `/${transferId}`,
      expiresAt: transfer.expires_at,
      isZip: isZip || false,
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

// Upload single file (non-chunked, for <10 files)
transferRoutes.post('/:id/file', async (c) => {
  try {
    const { id } = c.req.param();
    const transfer = getTransfer(id);
    
    if (!transfer) {
      return c.json({ error: 'Transfer not found' }, 404);
    }
    
    const formData = await c.req.formData();
    const file = formData.get('file') as File;
    const filename = formData.get('filename') as string;
    const originalFilename = formData.get('originalFilename') as string || filename;
    
    if (!file || !filename) {
      return c.json({ error: 'Missing file or filename' }, 400);
    }
    
    // Save file
    const filesDir = join(UPLOADS_DIR, id);
    mkdirSync(filesDir, { recursive: true });
    const filePath = join(filesDir, filename);
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    writeFileSync(filePath, fileBuffer);
    
    // Detect MIME type
    const mimeType = file.type || 'application/octet-stream';
    
    // Generate thumbnail for images
    let thumbnailPath: string | undefined;
    if (mimeType.startsWith('image/')) {
      try {
        thumbnailPath = await generateThumbnail(fileBuffer, id, filename);
      } catch (e) {
        console.error('Failed to generate thumbnail:', e);
      }
    }
    
    // Add to database
    addTransferFile(id, filename, originalFilename, file.size, filePath, mimeType, thumbnailPath);
    
    return c.json({ 
      success: true,
      filename,
      size: file.size,
    });
  } catch (error) {
    console.error('File upload error:', error);
    return c.json({ error: 'Failed to upload file' }, 500);
  }
});

// Generate thumbnail for image (WebP) - placeholder for now
// TODO: Implement proper thumbnail generation using sharp or similar
async function generateThumbnail(imageBuffer: Buffer, transferId: string, filename: string): Promise<string | undefined> {
  try {
    // For now, we'll generate thumbnails on the frontend
    // Backend can store the original image path and frontend will create thumbnails
    // This is a placeholder - actual implementation would use sharp or canvas
    return undefined;
  } catch (e) {
    console.error('Thumbnail generation error:', e);
    return undefined;
  }
}

// Complete the transfer - merge chunks or finalize multi-file
transferRoutes.post('/:id/complete', async (c) => {
  try {
    const { id } = c.req.param();
    const transfer = getTransfer(id);
    
    if (!transfer) {
      return c.json({ error: 'Transfer not found' }, 404);
    }
    
    // Check if chunks directory exists and has chunks
    const chunksDir = join(UPLOADS_DIR, `${id}_chunks`);
    const outputPath = join(UPLOADS_DIR, `${id}.zip`);
    
    if (existsSync(chunksDir)) {
      const chunkFiles = readdirSync(chunksDir)
        .filter(f => f.startsWith('chunk_'))
        .sort();
      
      if (chunkFiles.length > 0) {
        // Merge chunks into final ZIP file
        console.log(`📦 Merging ${chunkFiles.length} chunks for transfer: ${id}`);
        
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
        
        console.log(`✅ Chunks merged to: ${outputPath}`);
        
        // Remove chunks directory
        try {
          const { rmSync } = await import('fs');
          rmSync(chunksDir, { recursive: true, force: true });
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    }
    // For multi-file, files are already saved via /file endpoint
    
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
  
  // Get files if transfer is ready
  const files = transfer.status === 'ready' ? getTransferFiles(id) : [];
  
  return c.json({
    ...transfer,
    progress,
    files: files.map(f => ({
      id: f.id,
      filename: f.original_filename,
      size: f.size,
      mimeType: f.mime_type,
      thumbnailPath: f.thumbnail_path,
    })),
  });
});

// Delete transfer completely
transferRoutes.delete('/:id', async (c) => {
  try {
    const { id } = c.req.param();
    const transfer = getTransfer(id);
    
    if (!transfer) {
      return c.json({ error: 'Transfer not found' }, 404);
    }
    
    const { rmSync } = await import('fs');
    
    // Delete ZIP file if exists
    const zipPath = join(UPLOADS_DIR, `${id}.zip`);
    if (existsSync(zipPath)) {
      try { unlinkSync(zipPath); } catch (e) { /* ignore */ }
    }
    
    // Delete individual files directory if exists
    const filesDir = join(UPLOADS_DIR, id);
    if (existsSync(filesDir)) {
      try { rmSync(filesDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
    }
    
    // Delete chunks directory if exists
    const chunksDir = join(UPLOADS_DIR, `${id}_chunks`);
    if (existsSync(chunksDir)) {
      try { rmSync(chunksDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
    }
    
    // Delete from database
    deleteTransferFiles(id);
    deleteTransfer(id);
    
    console.log(`🗑️ Transfer deleted: ${id}`);
    
    return c.json({ success: true });
  } catch (error) {
    console.error('Delete error:', error);
    return c.json({ error: 'Failed to delete transfer' }, 500);
  }
});

// Download file (ZIP or single file)
transferRoutes.get('/:id/download', async (c) => {
  const { id } = c.req.param();
  const fileId = c.req.query('fileId'); // Optional: download specific file
  
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
  
  // If fileId is provided, download specific file
  if (fileId) {
    const files = getTransferFiles(id);
    const file = files.find(f => f.id.toString() === fileId);
    
    if (!file) {
      return c.json({ error: 'File not found' }, 404);
    }
    
    const filePath = file.file_path;
    if (!existsSync(filePath)) {
      return c.json({ error: 'File not found on disk' }, 404);
    }
    
    incrementDownloadCount(id);
    
    const { statSync } = await import('fs');
    const stats = statSync(filePath);
    const fileSize = stats.size;
    const fileStream = createReadStream(filePath);
    
    // Detect MIME type
    const mimeType = file.mime_type || 'application/octet-stream';
    const encodedFilename = encodeURIComponent(file.original_filename);
    const contentDisposition = `attachment; filename*=UTF-8''${encodedFilename}`;
    
    c.header('Content-Type', mimeType);
    c.header('Content-Disposition', contentDisposition);
    c.header('Content-Length', String(fileSize));
    c.header('Cache-Control', 'no-cache, no-store, must-revalidate');
    
    return c.body(fileStream);
  }
  
  // Otherwise download ZIP
  const filePath = join(UPLOADS_DIR, `${id}.zip`);
  
  if (!existsSync(filePath)) {
    // If no ZIP, check if we have individual files - create ZIP on the fly
    const files = getTransferFiles(id);
    if (files.length > 0) {
      // Create ZIP from individual files
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      
      for (const file of files) {
        if (existsSync(file.file_path)) {
          const fileData = readFileSync(file.file_path);
          zip.file(file.original_filename, fileData);
        }
      }
      
      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
      const zipPath = join(UPLOADS_DIR, `${id}.zip`);
      writeFileSync(zipPath, zipBuffer);
    } else {
      return c.json({ error: 'File not found' }, 404);
    }
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
