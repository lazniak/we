'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import TermsContent from './TermsContent';

export default function TermsModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Regulamin serwisu"
    >
      <div
        className="glass-strong rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/10 shrink-0">
          <h1 className="font-display text-base font-semibold text-white/90">Regulamin serwisu</h1>
          <button
            onClick={onClose}
            className="p-2 -m-2 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Zamknij regulamin"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto custom-scrollbar px-5 py-5">
          <TermsContent />
        </div>
      </div>
    </div>
  );
}
