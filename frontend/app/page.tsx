'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import DropZone, { type FilesMetadata } from '@/components/DropZone';
import UploadProgress from '@/components/UploadProgress';
import ShareLink from '@/components/ShareLink';
import Stats from '@/components/Stats';
import TransferHistory from '@/components/TransferHistory';
import Logo from '@/components/Logo';
import { finishTransfer, UploadAbortedError, uploadFiles } from '@/lib/uploader';
import {
  getOwnerToken,
  removeTransferFromHistory,
  saveTransferToHistory,
  updateTransferStatus,
} from '@/lib/transferHistory';
import type { InitTransferResponse, UploadState } from '@/lib/types';

const initialState: UploadState = {
  phase: 'idle',
  transferId: null,
  shareUrl: null,
  filename: null,
  fileCount: 0,
  currentFile: null,
  totalSize: 0,
  uploadedSize: 0,
  progress: 0,
  speed: null,
  eta: null,
  startTime: null,
  error: null,
};

export default function HomePage() {
  const [state, setState] = useState<UploadState>(initialState);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const isBusy =
    state.phase === 'preparing' || state.phase === 'uploading' || state.phase === 'finishing';

  // Closing the tab mid upload throws the transfer away, so the browser is
  // asked to confirm. Browsers only honour this after a real interaction,
  // which uploading always involves.
  useEffect(() => {
    if (!isBusy) return;

    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
      return '';
    };

    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isBusy]);

  const handleFilesSelected = useCallback(async (metadata: FilesMetadata) => {
    const { files, paths, dirs, expirationDays } = metadata;
    if (files.length === 0) return;

    const controller = new AbortController();
    abortRef.current = controller;

    const totalSize = files.reduce((acc, file) => acc + file.size, 0);

    setState({
      ...initialState,
      phase: 'preparing',
      fileCount: files.length,
      totalSize,
      startTime: Date.now(),
    });

    try {
      const response = await fetch('/api/transfer/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expirationDays,
          dirs,
          files: files.map((file, index) => ({
            path: paths[index] || file.name,
            size: file.size,
            type: file.type,
          })),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new Error(detail?.error || 'Could not start the transfer');
      }

      const init = (await response.json()) as InitTransferResponse;

      setExpiresAt(init.expiresAt);
      setState((previous) => ({
        ...previous,
        phase: 'uploading',
        transferId: init.transferId,
        shareUrl: init.shareUrl,
        filename: init.files.length === 1 ? init.files[0].path : `${init.files.length} files`,
        totalSize: init.totalSize,
      }));

      saveTransferToHistory({
        transferId: init.transferId,
        shareUrl: init.shareUrl,
        filename: init.files.length === 1 ? init.files[0].path : `${init.files.length} files`,
        expiresAt: init.expiresAt,
        status: 'uploading',
        ownerToken: init.ownerToken,
        size: init.totalSize,
        fileCount: init.files.length,
      });

      await uploadFiles({
        transferId: init.transferId,
        chunkSize: init.chunkSize,
        plan: init.files,
        blobs: files,
        signal: controller.signal,
        onProgress: (progress) =>
          setState((previous) => ({
            ...previous,
            uploadedSize: progress.uploadedBytes,
            progress: progress.progress,
            speed: progress.speed,
            eta: progress.eta,
            currentFile: progress.currentFile,
          })),
      });

      setState((previous) => ({ ...previous, phase: 'finishing', progress: 100 }));
      await finishTransfer(init.transferId, controller.signal);

      setState((previous) => ({ ...previous, phase: 'complete', progress: 100, eta: null }));
      updateTransferStatus(init.transferId, 'ready');
    } catch (error) {
      if (error instanceof UploadAbortedError || controller.signal.aborted) {
        setState(initialState);
        setExpiresAt(null);
        return;
      }

      setState((previous) => ({
        ...previous,
        phase: 'error',
        error: error instanceof Error ? error.message : 'Something went wrong',
      }));
    } finally {
      abortRef.current = null;
    }
  }, []);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;

    // The half uploaded payload is dropped straight away instead of waiting
    // for the retention sweep to notice it.
    const transferId = state.transferId;
    if (transferId) {
      const ownerToken = getOwnerToken(transferId);
      fetch(`/api/transfer/${transferId}`, {
        method: 'DELETE',
        headers: ownerToken ? { 'X-Owner-Token': ownerToken } : undefined,
      }).catch(() => undefined);
      removeTransferFromHistory(transferId);
    }

    setState(initialState);
    setExpiresAt(null);
  }, [state.transferId]);

  const handleReset = () => {
    setState(initialState);
    setExpiresAt(null);
  };

  const showDropZone = state.phase === 'idle';
  const showShareLink = state.shareUrl !== null;

  return (
    <main className="min-h-screen flex flex-col font-body">
      <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-10 sm:py-12">
        <div className="mb-8">
          <Logo size="lg" showTagline />
        </div>

        {showDropZone && (
          <div className="text-center mb-8 animate-fade-in">
            <p className="text-sm text-white/40 max-w-sm mx-auto">
              Share up to 5GB. No signup. Folders keep their structure. Links expire in 3–7 days.
            </p>
          </div>
        )}

        <div className="w-full space-y-4">
          {showDropZone && (
            <DropZone onFilesSelected={handleFilesSelected} disabled={state.phase !== 'idle'} />
          )}

          {showShareLink && (
            <ShareLink
              shareUrl={state.shareUrl!}
              expiresAt={expiresAt || undefined}
              isUploading={isBusy}
            />
          )}

          {(isBusy || state.phase === 'error' || state.phase === 'complete') && (
            <UploadProgress state={state} onCancel={isBusy ? handleCancel : undefined} />
          )}

          {(state.phase === 'complete' || state.phase === 'error') && (
            <div className="flex justify-center">
              <button
                onClick={handleReset}
                className="text-xs text-white/30 hover:text-white/60 transition-colors px-4 py-2"
              >
                {state.phase === 'error' ? 'Start over' : 'Transfer another'}
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
    </main>
  );
}
