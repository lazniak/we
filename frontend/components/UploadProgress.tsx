'use client';

import { AlertCircle, Check, Loader2, TriangleAlert, X } from 'lucide-react';
import clsx from 'clsx';
import { formatBytes, formatEta, formatSpeed, plural } from '@/lib/format';
import type { UploadState } from '@/lib/types';

interface UploadProgressProps {
  state: UploadState;
  onCancel?: () => void;
}

const HEADLINE: Record<UploadState['phase'], string> = {
  idle: '',
  preparing: 'Przygotowuję…',
  uploading: 'Wysyłanie',
  finishing: 'Kończę…',
  complete: 'Gotowe',
  error: 'Transfer nieudany',
};

export default function UploadProgress({ state, onCancel }: UploadProgressProps) {
  const { phase, fileCount, currentFile, totalSize, uploadedSize, progress, speed, eta } = state;

  const inFlight = phase === 'preparing' || phase === 'uploading' || phase === 'finishing';
  const isComplete = phase === 'complete';
  const isError = phase === 'error';

  return (
    <div className="w-full max-w-xl mx-auto px-4 animate-fade-in">
      <div className="glass rounded-2xl p-4 sm:p-6">
        <div className="flex justify-center mb-5">
          <div
            className={clsx(
              'w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-500',
              isComplete && 'bg-accent/15',
              isError && 'bg-red-500/15',
              inFlight && 'bg-white/5',
            )}
          >
            {isComplete ? (
              <Check className="w-6 h-6 text-accent" />
            ) : isError ? (
              <AlertCircle className="w-6 h-6 text-red-400" />
            ) : (
              <Loader2 className="w-6 h-6 text-accent/70 animate-spin" />
            )}
          </div>
        </div>

        <div className="text-center mb-5">
          <h3 className="font-display text-base font-semibold text-white/90 mb-1">
            {HEADLINE[phase]}
          </h3>
          <p className="text-xs text-white/40 truncate px-2">
            {phase === 'uploading' && currentFile
              ? currentFile
              : `${fileCount} ${plural(fileCount, 'plik', 'pliki', 'plików')} · ${formatBytes(totalSize)}`}
          </p>
        </div>

        {inFlight && (
          <>
            <div
              className="h-1.5 bg-white/5 rounded-full overflow-hidden mb-3"
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full progress-bar rounded-full transition-all duration-300 ease-out"
                style={{ width: `${Math.max(progress, phase === 'preparing' ? 4 : 0)}%` }}
              />
            </div>

            <div className="flex items-center justify-between gap-2 text-xs flex-wrap">
              <span className="text-white/40">
                <span className="text-white/60">{formatBytes(uploadedSize)}</span>
                <span className="text-white/20"> / </span>
                <span>{formatBytes(totalSize)}</span>
              </span>

              <div className="flex items-center gap-3">
                {speed !== null && <span className="text-white/30">{formatSpeed(speed)}</span>}
                {eta !== null && formatEta(eta) && (
                  <span className="text-white/30">zostało {formatEta(eta)}</span>
                )}
                <span className="text-accent font-semibold tabular-nums">{progress}%</span>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between gap-3 flex-wrap">
              <p className="flex items-center gap-2 text-[11px] text-amber-300/70">
                <TriangleAlert className="w-3.5 h-3.5 shrink-0" />
                Nie zamykaj tej karty, dopóki transfer się nie skończy.
              </p>

              {onCancel && (
                <button
                  onClick={onCancel}
                  className="flex items-center gap-1.5 text-[11px] text-white/40 hover:text-red-300 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-red-500/10"
                >
                  <X className="w-3 h-3" />
                  Anuluj
                </button>
              )}
            </div>
          </>
        )}

        {isComplete && (
          <p className="text-center text-xs text-white/40">
            Wysłano {formatBytes(totalSize)} — link powyżej już działa, możesz go udostępnić.
          </p>
        )}

        {isError && state.error && (
          <p className="text-center text-xs text-red-400/80">{state.error}</p>
        )}
      </div>
    </div>
  );
}
