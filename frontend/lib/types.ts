export interface TransferFile {
  id: number;
  filename: string;
  size: number;
  mimeType?: string;
  thumbnailPath?: string;
}

export interface TransferInfo {
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
  progress: number;
  files?: TransferFile[];
}

export interface InitTransferResponse {
  transferId: string;
  uploadUrl: string;
  shareUrl: string;
  expiresAt: string;
}

export interface ProgressUpdate {
  type: 'progress' | 'complete' | 'error';
  transferId: string;
  progress?: number;
  uploadedSize?: number;
  totalSize?: number;
  chunksCompleted?: number;
  chunksTotal?: number;
  eta?: number;
  status?: string;
  error?: string;
}

export interface Stats {
  totalTransfers: number;
  totalBytes: number;
  totalGB: string;
  activeTransfers: number;
  updatedAt: string;
}

export interface UploadState {
  phase: 'idle' | 'zipping' | 'uploading' | 'complete' | 'error';
  transferId: string | null;
  shareUrl: string | null;
  filename: string | null;
  totalSize: number;
  uploadedSize: number;
  progress: number;
  eta: number | null;
  startTime: number | null;
  error: string | null;
}
