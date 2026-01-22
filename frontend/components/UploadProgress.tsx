'use client';

import { Loader2, FileArchive, Check, AlertCircle } from 'lucide-react';
import clsx from 'clsx';
import { formatBytes, formatEta } from '@/lib/format';
import type { UploadState } from '@/lib/types';

interface UploadProgressProps {
  state: UploadState;
}

export default function UploadProgress({ state }: UploadProgressProps) {
  const { phase, filename, totalSize, uploadedSize, progress, eta } = state;
  
  const isZipping = phase === 'zipping';
  const isUploading = phase === 'uploading';
  const isComplete = phase === 'complete';
  const isError = phase === 'error';
  
  return (
    <div className="w-full max-w-xl mx-auto px-4 animate-fade-in">
      <div className="glass rounded-2xl p-4 sm:p-6">
        {/* Status Icon */}
        <div className="flex justify-center mb-5">
          <div className={clsx(
            'w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-500',
            isComplete && 'bg-accent/20',
            isError && 'bg-red-500/20',
            (isZipping || isUploading) && 'bg-white/5'
          )}>
            {isComplete ? (
              <Check className="w-6 h-6 text-accent-light" />
            ) : isError ? (
              <AlertCircle className="w-6 h-6 text-red-400" />
            ) : (
              <Loader2 className="w-6 h-6 text-white/50 animate-spin" />
            )}
          </div>
        </div>
        
        {/* Status Text */}
        <div className="text-center mb-5">
          <h3 className="text-base font-medium text-white/90 mb-1">
            {isZipping && 'Compressing...'}
            {isUploading && 'Uploading...'}
            {isComplete && 'Complete'}
            {isError && 'Failed'}
          </h3>
          
          {filename && (
            <div className="flex items-center justify-center gap-2 text-xs text-white/40">
              <FileArchive className="w-3.5 h-3.5" />
              <span className="truncate max-w-xs">{filename}</span>
            </div>
          )}
        </div>
        
        {/* Progress Bar */}
        {(isZipping || isUploading) && (
          <div className="mb-3">
            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div 
                className="h-full progress-bar rounded-full transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
        
        {/* Progress Details */}
        {(isZipping || isUploading) && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-white/40">
              {isZipping ? (
                `${progress}%`
              ) : (
                <>
                  <span className="text-white/60">{formatBytes(uploadedSize)}</span>
                  <span className="text-white/20"> / </span>
                  <span>{formatBytes(totalSize)}</span>
                </>
              )}
            </span>
            
            <div className="flex items-center gap-3">
              <span className="text-white/60 font-medium">{progress}%</span>
              {isUploading && eta !== null && (
                <span className="text-white/30">
                  {formatEta(eta)}
                </span>
              )}
            </div>
          </div>
        )}
        
        {/* Error Message */}
        {isError && state.error && (
          <p className="text-center text-xs text-red-400/80 mt-3">
            {state.error}
          </p>
        )}
      </div>
    </div>
  );
}
