export interface TransferEntry {
  id: number;
  index: number;
  /** Full relative path inside the transfer, e.g. "project/src/index.ts". */
  path: string;
  name: string;
  size: number;
  isDir: boolean;
  isDangerous: boolean;
  previewable: boolean;
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
  entries: TransferEntry[];
  fileCount: number;
  /** Downloading returns the uploaded file untouched, with no ZIP around it. */
  isSingleFile: boolean;
  isLegacyArchive: boolean;
}

export interface InitTransferFile {
  index: number;
  path: string;
  size: number;
  chunks: number;
}

export interface InitTransferResponse {
  transferId: string;
  ownerToken: string;
  shareUrl: string;
  expiresAt: string;
  chunkSize: number;
  totalSize: number;
  files: InitTransferFile[];
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

export type UploadPhase = 'idle' | 'preparing' | 'uploading' | 'finishing' | 'complete' | 'error';

export interface UploadState {
  phase: UploadPhase;
  transferId: string | null;
  shareUrl: string | null;
  filename: string | null;
  fileCount: number;
  currentFile: string | null;
  totalSize: number;
  uploadedSize: number;
  progress: number;
  speed: number | null;
  eta: number | null;
  startTime: number | null;
  error: string | null;
}
