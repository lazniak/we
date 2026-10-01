'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Download, X } from 'lucide-react';
import { installInstructions } from '@/lib/pwa';
import { usePwa } from './PwaProvider';

export default function InstallButton() {
  const { installed, ready, platform, userAgent, install } = usePwa();
  const [showHelp, setShowHelp] = useState(false);
  const [busy, setBusy] = useState(false);

  const onInstall = async () => {
    setBusy(true);
    try {
      if (!(await install())) setShowHelp(true);
    } finally {
      setBusy(false);
    }
  };

  if (!ready || installed) return null;
  return (
    <>
      <button
        type="button"
        onClick={onInstall}
        disabled={busy}
        title="Zainstaluj HEXART Transfer"
        className="inline-flex items-center gap-1 text-[11px] text-white/50 transition-colors hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:opacity-50"
      >
        <Download className="h-3 w-3" aria-hidden="true" />
        Install
      </button>
      {showHelp && <InstallHelp instructions={installInstructions(platform, userAgent)} onClose={() => setShowHelp(false)} />}
    </>
  );
}

function InstallHelp({ instructions, onClose }: {
  instructions: ReturnType<typeof installInstructions>;
  onClose(): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => { if (element?.open) element.close(); };
  }, []);

  return (
    <dialog
      ref={dialog}
      aria-labelledby="install-title"
      aria-describedby="install-description"
      onCancel={onClose}
      onClose={onClose}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
      }}
      className="install-dialog m-auto w-[calc(100%_-_2rem)] max-w-md border border-white/15 bg-[#0a0a0c] p-6 text-left text-white shadow-2xl sm:p-8"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-label text-xs font-medium uppercase tracking-[0.12em] text-accent">{instructions.device}</p>
          <h2 id="install-title" className="mt-2 font-display text-2xl font-semibold">Zainstaluj HEXART Transfer</h2>
        </div>
        <button type="button" autoFocus onClick={onClose} aria-label="Zamknij instrukcję instalacji" className="-mr-2 -mt-2 p-2 text-white/60 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <p id="install-description" className="mt-4 text-sm leading-relaxed text-[#b0b8c4]">Wysyłaj i odbieraj pliki w osobnym oknie aplikacji.</p>
      <ol className="mt-6 list-decimal space-y-4 pl-5 text-sm leading-relaxed text-white/85">
        {instructions.steps.map((step) => <li key={step} className="pl-1">{step}</li>)}
      </ol>
      <p className="mt-6 border-t border-white/10 pt-4 text-xs leading-relaxed text-[#b0b8c4]">{instructions.note}</p>
      {instructions.helpUrl && (
        <a href={instructions.helpUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-1 text-xs text-accent hover:text-accent-light">
          Instrukcja Apple <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
        </a>
      )}
    </dialog>
  );
}
