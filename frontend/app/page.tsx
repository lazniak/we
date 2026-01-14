'use client';

import { useState, useCallback } from 'react';
import DropZone from '@/components/DropZone';
import UploadProgress from '@/components/UploadProgress';
import ShareLink from '@/components/ShareLink';
import Stats from '@/components/Stats';
import TransferHistory from '@/components/TransferHistory';
import { zipFiles, generateZipFilename } from '@/lib/zipper';
import { uploadChunked, calculateChunksTotal } from '@/lib/chunker';
import { saveTransferToHistory, updateTransferStatus } from '@/lib/transferHistory';
import type { UploadState, InitTransferResponse } from '@/lib/types';

const initialState: UploadState = {
  phase: 'idle',
  transferId: null,
  shareUrl: null,
  filename: null,
  totalSize: 0,
  uploadedSize: 0,
  progress: 0,
  eta: null,
  startTime: null,
  error: null,
};

export default function HomePage() {
  const [state, setState] = useState<UploadState>(initialState);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);

  const handleFilesSelected = useCallback(async (files: File[]) => {
    try {
      const filename = `${generateZipFilename(files)}.zip`;
      
      setState(prev => ({
        ...prev,
        phase: 'zipping',
        filename: generateZipFilename(files),
        progress: 0,
      }));

      const zipPromise = zipFiles(files, (progress) => {
        setState(prev => ({
          ...prev,
          progress: progress.percent,
        }));
      });

      const estimatedSize = files.reduce((acc, f) => acc + f.size, 0);
      const estimatedChunks = calculateChunksTotal(estimatedSize);
      
      const initResponse = await fetch('/api/transfer/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename,
          totalSize: estimatedSize,
          chunksTotal: estimatedChunks,
        }),
      });

      if (!initResponse.ok) {
        throw new Error('Failed to initialize transfer');
      }

      const { transferId, shareUrl, expiresAt: expires } = 
        await initResponse.json() as InitTransferResponse;

      setExpiresAt(expires);
      setState(prev => ({
        ...prev,
        transferId,
        shareUrl,
      }));

      // Save to history immediately
      saveTransferToHistory({
        transferId,
        shareUrl,
        filename,
        expiresAt: expires,
        status: 'uploading',
      });

      const zipBlob = await zipPromise;
      const totalSize = zipBlob.size;
      const chunksTotal = calculateChunksTotal(totalSize);

      setState(prev => ({
        ...prev,
        phase: 'uploading',
        filename,
        totalSize,
        uploadedSize: 0,
        progress: 0,
        startTime: Date.now(),
      }));

      await uploadChunked({
        file: zipBlob,
        transferId,
        onProgress: (progress) => {
          setState(prev => ({
            ...prev,
            uploadedSize: progress.uploadedBytes,
            progress: progress.progress,
            eta: progress.eta,
          }));
        },
        onComplete: () => {
          setState(prev => ({
            ...prev,
            phase: 'complete',
            progress: 100,
          }));
          
          // Update history status
          if (transferId) {
            updateTransferStatus(transferId, 'ready');
          }
        },
        onError: (error) => {
          setState(prev => ({
            ...prev,
            phase: 'error',
            error: error.message,
          }));
        },
      });

    } catch (error) {
      setState(prev => ({
        ...prev,
        phase: 'error',
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      }));
    }
  }, []);

  const handleReset = () => {
    setState(initialState);
    setExpiresAt(null);
  };

  const showDropZone = state.phase === 'idle';
  const showProgress = state.phase === 'zipping' || state.phase === 'uploading';
  const showShareLink = state.shareUrl !== null;
  const isComplete = state.phase === 'complete';

  return (
    <main className="min-h-screen flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        {/* Hero */}
        {showDropZone && (
          <div className="text-center mb-10 animate-fade-in">
            <h1 className="text-2xl font-medium text-white/80 mb-3 tracking-tight">
              we.pablogfx.com
            </h1>
            <p className="text-sm text-white/40 max-w-sm mx-auto">
              Share files up to 5GB. No signup. Links expire in 3 days.
            </p>
          </div>
        )}
        
        <div className="w-full space-y-4">
          {showDropZone && (
            <DropZone 
              onFilesSelected={handleFilesSelected}
              disabled={state.phase !== 'idle'}
            />
          )}
          
          {showShareLink && (
            <ShareLink 
              shareUrl={state.shareUrl!} 
              expiresAt={expiresAt || undefined}
              isUploading={showProgress}
            />
          )}
          
          {showProgress && (
            <UploadProgress state={state} />
          )}
          
          {isComplete && (
            <div className="flex justify-center mt-4">
              <button
                onClick={handleReset}
                className="text-xs text-white/30 hover:text-white/60 transition-colors"
              >
                Transfer another
              </button>
            </div>
          )}
        </div>
        
        {showDropZone && (
          <>
            <Stats />
            <TransferHistory />
          </>
        )}
      </div>
      
      <footer className="py-6 px-8">
        <p className="text-center text-[11px] text-white/20">
          Encrypted transfer · Auto-delete after 3 days
        </p>
      </footer>
    </main>
  );
}
