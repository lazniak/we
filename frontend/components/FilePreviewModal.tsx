'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Loader2, X } from 'lucide-react';
import { api, triggerDownload } from '@/lib/api';
import { formatBytes } from '@/lib/format';
import { isAudioFile, isImageFile, isPdfFile, isTextFile, isVideoFile } from './FileIcon';
import type { TransferEntry } from '@/lib/types';

interface FilePreviewModalProps {
  transferId: string;
  entries: TransferEntry[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

export default function FilePreviewModal({
  transferId,
  entries,
  index,
  onIndexChange,
  onClose,
}: FilePreviewModalProps) {
  const entry = entries[index];
  const [textContent, setTextContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const goto = useCallback(
    (delta: number) => {
      if (entries.length < 2) return;
      onIndexChange((index + delta + entries.length) % entries.length);
    },
    [entries.length, index, onIndexChange],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') goto(1);
      if (event.key === 'ArrowLeft') goto(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goto, onClose]);

  // Text previews are fetched with a hard cap so a huge log cannot lock the tab.
  useEffect(() => {
    setTextContent(null);
    if (!entry || !isTextFile(entry.name)) return;

    const controller = new AbortController();
    setLoading(true);

    fetch(api.preview(transferId, entry.id), {
      signal: controller.signal,
      headers: { Range: 'bytes=0-262143' },
    })
      .then((res) => (res.ok ? res.text() : Promise.reject(new Error('preview failed'))))
      .then((text) => setTextContent(text))
      .catch(() => setTextContent(null))
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [entry, transferId]);

  if (!entry) return null;

  const url = api.preview(transferId, entry.id);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/85 backdrop-blur-md animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={entry.name}
    >
      <div
        className="flex items-center gap-3 px-4 py-3 border-b border-white/10 shrink-0"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white/90 truncate font-medium">{entry.name}</p>
          <p className="text-xs text-white/40 truncate">
            {entry.path !== entry.name && <span className="mr-2">{entry.path}</span>}
            {formatBytes(entry.size)}
          </p>
        </div>

        <button
          onClick={() => triggerDownload(api.downloadFile(transferId, entry.id))}
          className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Pobierz ten plik"
        >
          <Download className="w-4 h-4" />
        </button>
        <button
          onClick={onClose}
          className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Zamknij podgląd"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center min-h-0 p-4 sm:p-8">
        {entries.length > 1 && (
          <button
            onClick={(event) => {
              event.stopPropagation();
              goto(-1);
            }}
            className="absolute left-2 sm:left-4 p-3 rounded-full bg-white/5 hover:bg-white/15 text-white/70 transition-colors z-10"
            aria-label="Poprzedni plik"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}

        <div
          className="max-w-full max-h-full flex items-center justify-center"
          onClick={(event) => event.stopPropagation()}
        >
          {isImageFile(entry.name) && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={url}
              alt={entry.name}
              className="max-w-full max-h-[75vh] object-contain rounded-lg shadow-2xl"
            />
          )}

          {isVideoFile(entry.name) && (
            <video
              src={url}
              className="max-w-full max-h-[75vh] rounded-lg shadow-2xl"
              controls
              autoPlay
              playsInline
            />
          )}

          {isAudioFile(entry.name) && (
            <div className="glass rounded-2xl p-8 w-[min(90vw,28rem)]">
              <audio src={url} className="w-full" controls autoPlay />
            </div>
          )}

          {isPdfFile(entry.name) && (
            <iframe
              src={url}
              title={entry.name}
              className="w-[min(92vw,60rem)] h-[78vh] rounded-lg bg-white"
            />
          )}

          {isTextFile(entry.name) && (
            <div className="glass rounded-2xl p-4 w-[min(92vw,60rem)] h-[78vh] overflow-auto">
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin text-white/40 mx-auto mt-8" />
              ) : (
                <pre className="text-xs text-white/70 whitespace-pre-wrap break-words select-text font-mono">
                  {textContent ?? 'Podgląd niedostępny.'}
                </pre>
              )}
            </div>
          )}
        </div>

        {entries.length > 1 && (
          <button
            onClick={(event) => {
              event.stopPropagation();
              goto(1);
            }}
            className="absolute right-2 sm:right-4 p-3 rounded-full bg-white/5 hover:bg-white/15 text-white/70 transition-colors z-10"
            aria-label="Następny plik"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        )}
      </div>

      {entries.length > 1 && (
        <div className="text-center pb-4 text-xs text-white/30 shrink-0">
          {index + 1} / {entries.length}
        </div>
      )}
    </div>
  );
}
