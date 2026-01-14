const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
const PARALLEL_UPLOADS = 3;

export interface ChunkUploadProgress {
  chunksCompleted: number;
  chunksTotal: number;
  uploadedBytes: number;
  totalBytes: number;
  progress: number;
  eta: number | null;
}

export interface ChunkedUploadOptions {
  file: Blob;
  transferId: string;
  onProgress: (progress: ChunkUploadProgress) => void;
  onComplete: () => void;
  onError: (error: Error) => void;
}

export async function uploadChunked({
  file,
  transferId,
  onProgress,
  onComplete,
  onError,
}: ChunkedUploadOptions): Promise<void> {
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  let completedChunks = 0;
  let uploadedBytes = 0;
  const startTime = Date.now();
  
  // Create array of chunk indices
  const chunkIndices = Array.from({ length: totalChunks }, (_, i) => i);
  
  // Upload chunks in parallel batches
  const uploadChunk = async (chunkIndex: number): Promise<void> => {
    const start = chunkIndex * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunk = file.slice(start, end);
    
    const response = await fetch(`/api/transfer/${transferId}/chunk/${chunkIndex}`, {
      method: 'PUT',
      body: chunk,
      headers: {
        'Content-Type': 'application/octet-stream',
      },
    });
    
    if (!response.ok) {
      throw new Error(`Chunk ${chunkIndex} upload failed: ${response.statusText}`);
    }
    
    completedChunks++;
    uploadedBytes += chunk.size;
    
    // Calculate ETA
    const elapsedMs = Date.now() - startTime;
    const bytesPerMs = uploadedBytes / elapsedMs;
    const remainingBytes = file.size - uploadedBytes;
    const etaMs = bytesPerMs > 0 ? remainingBytes / bytesPerMs : null;
    
    onProgress({
      chunksCompleted: completedChunks,
      chunksTotal: totalChunks,
      uploadedBytes,
      totalBytes: file.size,
      progress: Math.round((completedChunks / totalChunks) * 100),
      eta: etaMs,
    });
  };
  
  try {
    // Process chunks in parallel batches
    for (let i = 0; i < chunkIndices.length; i += PARALLEL_UPLOADS) {
      const batch = chunkIndices.slice(i, i + PARALLEL_UPLOADS);
      await Promise.all(batch.map(uploadChunk));
    }
    
    // Complete the transfer
    const completeResponse = await fetch(`/api/transfer/${transferId}/complete`, {
      method: 'POST',
    });
    
    if (!completeResponse.ok) {
      throw new Error('Failed to complete transfer');
    }
    
    onComplete();
  } catch (error) {
    onError(error instanceof Error ? error : new Error('Upload failed'));
  }
}

export function calculateChunksTotal(fileSize: number): number {
  return Math.ceil(fileSize / CHUNK_SIZE);
}
