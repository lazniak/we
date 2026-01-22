'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Download, Loader2, Clock, FileArchive, AlertCircle } from 'lucide-react';
import clsx from 'clsx';
import { formatBytes, formatEta } from '@/lib/format';
import { TransferWebSocket } from '@/lib/websocket';
import FilePreview from '@/components/FilePreview';
import type { TransferInfo, ProgressUpdate } from '@/lib/types';

type PageStatus = 'loading' | 'uploading' | 'ready' | 'expired' | 'not_found' | 'error';

export default function TransferPage() {
  const params = useParams();
  const transferId = params.transferId as string;
  
  const [status, setStatus] = useState<PageStatus>('loading');
  const [transfer, setTransfer] = useState<TransferInfo | null>(null);
  const [progress, setProgress] = useState(0);
  const [eta, setEta] = useState<number | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  
  const fetchTransfer = useCallback(async () => {
    try {
      const res = await fetch(`/api/transfer/${transferId}`);
      
      if (res.status === 404) {
        setStatus('not_found');
        return null;
      }
      
      if (!res.ok) {
        setStatus('error');
        return null;
      }
      
      const data: TransferInfo = await res.json();
      setTransfer(data);
      setProgress(data.progress || 0);
      
      if (data.status === 'expired') {
        setStatus('expired');
      } else if (data.status === 'ready') {
        setStatus('ready');
      } else if (data.status === 'uploading' || data.status === 'pending') {
        setStatus('uploading');
      }
      
      return data;
    } catch (err) {
      console.error('Failed to fetch transfer:', err);
      setStatus('error');
      return null;
    }
  }, [transferId]);
  
  useEffect(() => {
    fetchTransfer();
  }, [fetchTransfer]);
  
  useEffect(() => {
    if (status !== 'uploading') return;
    
    const ws = new TransferWebSocket(transferId);
    
    const unsubscribe = ws.subscribe((update: ProgressUpdate) => {
      if (update.type === 'progress') {
        setProgress(update.progress || 0);
        setEta(update.eta || null);
        if (update.uploadedSize && transfer) {
          setTransfer(prev => prev ? { ...prev, uploaded_size: update.uploadedSize! } : null);
        }
      } else if (update.type === 'complete') {
        setStatus('ready');
        setProgress(100);
        fetchTransfer();
      }
    });
    
    ws.connect();
    const pollInterval = setInterval(fetchTransfer, 3000);
    
    return () => {
      unsubscribe();
      ws.disconnect();
      clearInterval(pollInterval);
    };
  }, [status, transferId, fetchTransfer, transfer]);
  
  const handleDownload = async (fileId?: number) => {
    if (!transfer || status !== 'ready') return;
    setIsDownloading(true);
    try {
      if (fileId !== undefined) {
        // Download specific file
        window.location.href = `/api/transfer/${transferId}/download?fileId=${fileId}`;
      } else {
        // Download all (ZIP)
        window.location.href = `/api/transfer/${transferId}/download`;
      }
    } catch (err) {
      console.error('Download failed:', err);
    } finally {
      setTimeout(() => setIsDownloading(false), 2000);
    }
  };
  
  const formatExpiry = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffHours = Math.ceil(diffMs / (1000 * 60 * 60));
    
    if (diffHours <= 0) return 'Expired';
    if (diffHours < 24) return `${diffHours}h left`;
    const diffDays = Math.ceil(diffHours / 24);
    return `${diffDays}d left`;
  };
  
  return (
    <main className="min-h-screen flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          
          {/* Loading */}
          {status === 'loading' && (
            <div className="text-center animate-fade-in">
              <Loader2 className="w-8 h-8 text-white/30 animate-spin mx-auto mb-4" />
              <p className="text-sm text-white/40">Loading...</p>
            </div>
          )}
          
          {/* Not Found */}
          {status === 'not_found' && (
            <div className="text-center animate-fade-in">
              <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-5">
                <AlertCircle className="w-6 h-6 text-white/30" />
              </div>
              <h1 className="text-lg font-medium text-white/80 mb-2">Not found</h1>
              <p className="text-sm text-white/40 mb-6">This transfer doesn't exist or has been deleted.</p>
              <a href="/" className="text-xs text-accent-light hover:text-accent transition-colors">
                Create new transfer
              </a>
            </div>
          )}
          
          {/* Expired */}
          {status === 'expired' && (
            <div className="text-center animate-fade-in">
              <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-5">
                <Clock className="w-6 h-6 text-white/30" />
              </div>
              <h1 className="text-lg font-medium text-white/80 mb-2">Expired</h1>
              <p className="text-sm text-white/40 mb-6">This transfer has expired.</p>
              <a href="/" className="text-xs text-accent-light hover:text-accent transition-colors">
                Create new transfer
              </a>
            </div>
          )}
          
          {/* Uploading */}
          {status === 'uploading' && transfer && (
            <div className="glass rounded-2xl p-6 animate-fade-in">
              <div className="flex justify-center mb-5">
                <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 text-accent-light animate-spin" />
                </div>
              </div>
              
              <div className="text-center mb-5">
                <h1 className="text-base font-medium text-white/80 mb-1">Uploading...</h1>
                <p className="text-xs text-white/40">Sender is uploading this file</p>
              </div>
              
              <div className="flex items-center gap-3 p-3 bg-white/[0.02] rounded-xl mb-5">
                <FileArchive className="w-8 h-8 text-white/20" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white/70 truncate">{transfer.filename}</p>
                  <p className="text-xs text-white/30">{formatBytes(transfer.total_size)}</p>
                </div>
              </div>
              
              <div className="mb-3">
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div 
                    className="h-full progress-bar rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
              
              <div className="flex items-center justify-between text-xs">
                <span className="text-white/40">
                  {formatBytes(transfer.uploaded_size)} / {formatBytes(transfer.total_size)}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-white/60 font-medium">{progress}%</span>
                  {eta !== null && <span className="text-white/30">{formatEta(eta)}</span>}
                </div>
              </div>
            </div>
          )}
          
          {/* Ready */}
          {status === 'ready' && transfer && (
            <div className="glass rounded-2xl p-6 animate-fade-in">
              {/* Show file list if multiple individual files */}
              {transfer.files && transfer.files.length > 0 ? (
                <>
                  {/* Header with file count */}
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-medium text-white/70">
                      {transfer.files.length} {transfer.files.length === 1 ? 'file' : 'files'}
                    </h2>
                    <span className="text-xs text-white/40">{formatBytes(transfer.total_size)}</span>
                  </div>
                  
                  {/* File list with previews */}
                  <div className="space-y-2 mb-5 max-h-80 overflow-y-auto custom-scrollbar">
                    {transfer.files.map((file) => (
                      <FilePreview
                        key={file.id}
                        file={file}
                        transferId={transferId}
                        onDownload={(fileId) => handleDownload(fileId)}
                      />
                    ))}
                  </div>
                  
                  {/* Download All button */}
                  <button
                    onClick={() => handleDownload()}
                    disabled={isDownloading}
                    className={clsx(
                      'w-full py-3.5 rounded-xl font-medium text-sm transition-all duration-200',
                      'btn-primary flex items-center justify-center gap-2'
                    )}
                  >
                    {isDownloading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                    {isDownloading ? 'Starting...' : `Download All (${formatBytes(transfer.total_size)})`}
                  </button>
                </>
              ) : (
                <>
                  {/* Single ZIP file display */}
                  <div className="flex items-center gap-3 p-3 bg-white/[0.02] rounded-xl mb-5">
                    <FileArchive className="w-8 h-8 text-accent/50" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white/70 truncate">{transfer.filename}</p>
                      <p className="text-xs text-white/30">{formatBytes(transfer.total_size)}</p>
                    </div>
                  </div>
                  
                  <button
                    onClick={() => handleDownload()}
                    disabled={isDownloading}
                    className={clsx(
                      'w-full py-3.5 rounded-xl font-medium text-sm transition-all duration-200',
                      'btn-primary flex items-center justify-center gap-2'
                    )}
                  >
                    {isDownloading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                    {isDownloading ? 'Starting...' : 'Download'}
                  </button>
                </>
              )}
              
              <div className="mt-4 flex items-center justify-center gap-4 text-[11px] text-white/30">
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatExpiry(transfer.expires_at)}
                </div>
                {transfer.download_count > 0 && (
                  <span>{transfer.download_count} download{transfer.download_count > 1 ? 's' : ''}</span>
                )}
              </div>
            </div>
          )}
          
          {/* Error */}
          {status === 'error' && (
            <div className="text-center animate-fade-in">
              <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-5">
                <AlertCircle className="w-6 h-6 text-red-400/60" />
              </div>
              <h1 className="text-lg font-medium text-white/80 mb-2">Error</h1>
              <p className="text-sm text-white/40 mb-6">Something went wrong.</p>
              <button
                onClick={() => window.location.reload()}
                className="text-xs text-accent-light hover:text-accent transition-colors"
              >
                Try again
              </button>
            </div>
          )}
        </div>
        
        {/* Link to home */}
        <div className="mt-8 text-center">
          <a
            href="/"
            className="text-xs text-white/40 hover:text-accent-light transition-colors"
          >
            ← Send your own files
          </a>
        </div>
      </div>
      
      <footer className="py-6 px-8">
        <p className="text-center text-[11px] text-white/20">
          Encrypted transfer · Auto-delete after 3 days
        </p>
      </footer>
    </main>
  );
}
