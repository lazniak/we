'use client';

import { useState } from 'react';
import { Copy, Check, Loader2 } from 'lucide-react';
import clsx from 'clsx';

interface ShareLinkProps {
  shareUrl: string;
  expiresAt?: string;
  isUploading?: boolean;
}

export default function ShareLink({ shareUrl, expiresAt, isUploading }: ShareLinkProps) {
  const [copied, setCopied] = useState(false);
  
  const fullUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}${shareUrl}` 
    : shareUrl;
  
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };
  
  return (
    <div className="w-full max-w-xl mx-auto animate-fade-in">
      <div className={clsx(
        'rounded-2xl p-5',
        isUploading ? 'glass-accent' : 'glass'
      )}>
        <div className="flex items-center gap-2 mb-3">
          {isUploading && (
            <Loader2 className="w-3.5 h-3.5 text-accent-light animate-spin" />
          )}
          <span className="text-xs text-white/40 uppercase tracking-wider">
            {isUploading ? 'Link ready' : 'Share link'}
          </span>
        </div>
        
        <div className="flex items-stretch gap-2">
          <div className="flex-1 flex items-center bg-white/[0.02] rounded-xl px-4 py-3 border border-white/5">
            <span className="text-white/70 text-sm truncate font-mono">
              {fullUrl}
            </span>
          </div>
          
          <button
            onClick={handleCopy}
            className={clsx(
              'px-5 rounded-xl font-medium text-sm transition-all duration-200 flex items-center gap-2',
              copied 
                ? 'bg-accent/20 text-accent-light border border-accent/30'
                : 'btn-primary'
            )}
          >
            {copied ? (
              <>
                <Check className="w-4 h-4" />
                Copied
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                Copy
              </>
            )}
          </button>
        </div>
        
        {isUploading && (
          <p className="mt-3 text-xs text-accent-light/60 text-center">
            Share now — recipients see live progress
          </p>
        )}
      </div>
    </div>
  );
}
