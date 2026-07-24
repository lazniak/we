'use client';

import { useState } from 'react';
import { Check, Copy, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { formatRemaining } from '@/lib/format';

interface ShareLinkProps {
  shareUrl: string;
  expiresAt?: string;
  isUploading?: boolean;
}

export default function ShareLink({ shareUrl, expiresAt, isUploading }: ShareLinkProps) {
  const [copied, setCopied] = useState(false);

  const fullUrl =
    typeof window !== 'undefined' ? `${window.location.origin}${shareUrl}` : shareUrl;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Skopiuj ten link:', fullUrl);
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto px-4 animate-fade-in">
      <div className={clsx('rounded-2xl p-4 sm:p-5', isUploading ? 'glass-accent' : 'glass')}>
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <span className="flex items-center gap-2 text-xs text-white/40 uppercase tracking-wider">
            {isUploading && <Loader2 className="w-3.5 h-3.5 text-accent-light animate-spin" />}
            {isUploading ? 'Link już działa' : 'Link do udostępnienia'}
          </span>
          {expiresAt && (
            <span className="text-[11px] text-white/25">{formatRemaining(expiresAt)}</span>
          )}
        </div>

        <div className="flex flex-col sm:flex-row items-stretch gap-2">
          <div className="flex-1 flex items-center bg-white/[0.02] rounded-xl px-4 py-3 border border-white/5 min-w-0">
            <span className="text-white/70 text-sm truncate font-mono w-full select-text">
              {fullUrl}
            </span>
          </div>

          <button
            onClick={handleCopy}
            className={clsx(
              'px-5 py-3 rounded-xl font-medium text-sm transition-all duration-200 flex items-center justify-center gap-2 shrink-0',
              copied
                ? 'bg-accent/20 text-accent-light border border-accent/30'
                : 'btn-primary',
            )}
          >
            {copied ? (
              <>
                <Check className="w-4 h-4" />
                Skopiowano
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                Kopiuj
              </>
            )}
          </button>
        </div>

        {isUploading && (
          <p className="mt-3 text-xs text-accent-light/60 text-center">
            Wyślij go teraz — odbiorca widzi postęp na żywo i pobierze pliki, gdy tylko dotrą.
          </p>
        )}
      </div>
    </div>
  );
}
