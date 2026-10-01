'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Download, X } from 'lucide-react';
import { installInstructions } from '@/lib/pwa';
import { usePwa } from './PwaProvider';

export default function InstallButton() {
  const { installed, ready, canInstall, platform, userAgent, install } = usePwa();
  const [showHelp, setShowHelp] = useState(false);
  const [busy, setBusy] = useState(false);

  const onInstall = async () => {
    setBusy(true);
    try {
      setShowHelp(!(await install()));
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
        className="chamfer chamfer-sm chamfer-line inline-flex min-h-[44px] items-center gap-2 border border-accent/35 bg-accent/[0.06] px-3 text-[13px] font-medium text-accent transition-colors hover:border-accent/65 hover:bg-accent/10 hover:text-accent-light focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent disabled:opacity-50"
      >
        <Download className="h-[18px] w-[18px]" aria-hidden="true" />
        Install
      </button>
      {showHelp && <InstallHelp instructions={installInstructions(platform, userAgent)} canInstall={canInstall} busy={busy} onInstall={onInstall} onClose={() => setShowHelp(false)} />}
    </>
  );
}

function InstallHelp({ instructions, canInstall, busy, onInstall, onClose }: {
  instructions: ReturnType<typeof installInstructions>;
  canInstall: boolean;
  busy: boolean;
  onInstall(): Promise<void>;
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
      {canInstall ? (
        <button type="button" onClick={onInstall} disabled={busy} className="chamfer chamfer-sm mt-6 inline-flex min-h-11 items-center gap-2 bg-accent px-4 text-sm font-medium text-[#0a0a0c] hover:bg-accent-light focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-white disabled:opacity-50">
          <Download className="h-4 w-4" aria-hidden="true" />
          {busy ? 'Otwieranie instalatora…' : 'Zainstaluj aplikację'}
        </button>
      ) : (
        <>
          <ol className="mt-6 list-decimal space-y-4 pl-5 text-sm leading-relaxed text-white/85">
            {instructions.steps.map((step) => <li key={step} className="pl-1">{step}</li>)}
          </ol>
          <p className="mt-6 border-t border-white/10 pt-4 text-xs leading-relaxed text-[#b0b8c4]">{instructions.note}</p>
        </>
      )}
      {!canInstall && instructions.helpUrl && (
        <a href={instructions.helpUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-1 text-xs text-accent hover:text-accent-light">
          Instrukcja Apple <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
        </a>
      )}
    </dialog>
  );
}
