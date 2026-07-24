export type PreviewKind =
  | 'image'
  | 'svg'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'text'
  | 'font'
  | 'image-render'
  | 'video-render'
  | 'model3d'
  | 'document'
  | 'archive'
  | 'medical';

export interface TransferEntry {
  id: number;
  index: number;
  /** Full relative path inside the transfer, e.g. "project/src/index.ts". */
  path: string;
  name: string;
  size: number;
  isDir: boolean;
  isDangerous: boolean;
  /** How the frontend should preview this file, decided by the backend. */
  previewKind: PreviewKind | null;
  previewable: boolean;
  /** Detected 360 panorama/video, to be shown in the sphere viewer. */
  is360: boolean;
}

export interface TransferInfo {
  id: string;
  status: 'pending' | 'uploading' | 'scanning' | 'ready' | 'infected' | 'expired';
  filename: string;
  total_size: number;
  uploaded_size: number;
  chunks_total: number;
  chunks_completed: number;
  created_at: string;
  expires_at: string;
  download_count: number;
  /** Nazwa zagrozenia, gdy antywirus cos znalazl. */
  threatName: string | null;
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
  /** Lifetime totals - everything ever sent. Only ever grows. */
  totalTransfers: number;
  totalBytes: number;
  totalGB: string;
  /** What the service is holding right now, pending expiry. */
  storedTransfers: number;
  storedBytes: number;
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
