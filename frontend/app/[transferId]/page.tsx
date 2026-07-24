'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  AlertCircle,
  Clock,
  Download,
  FileArchive,
  Loader2,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { api, triggerDownload } from '@/lib/api';
import { formatBytes, formatEta, formatRemaining, plural } from '@/lib/format';
import { TransferWebSocket } from '@/lib/websocket';
import FileBrowser from '@/components/FileBrowser';
import HexartPromo from '@/components/HexartPromo';
import BusinessCard from '@/components/BusinessCard';
import Logo from '@/components/Logo';
import SiteFooter from '@/components/SiteFooter';
import type { ProgressUpdate, TransferInfo } from '@/lib/types';

type PageStatus =
  | 'loading'
  | 'uploading'
  | 'scanning'
  | 'ready'
  | 'infected'
  | 'expired'
  | 'not_found'
  | 'error';

export default function TransferPage() {
  const params = useParams();
  const transferId = String(params.transferId ?? '');

  const [status, setStatus] = useState<PageStatus>('loading');
  const [transfer, setTransfer] = useState<TransferInfo | null>(null);
  const [progress, setProgress] = useState(0);
  const [eta, setEta] = useState<number | null>(null);
  const [backdrop, setBackdrop] = useState<{ url: string; type: 'image' | 'video' } | null>(null);

  // Trzymane w ref, żeby efekt odpytujący nie restartował się przy każdej zmianie.
  const statusRef = useRef<PageStatus>('loading');
  statusRef.current = status;

  const fetchTransfer = useCallback(async (): Promise<TransferInfo | null> => {
    try {
      const res = await fetch(api.info(transferId), { cache: 'no-store' });

      if (res.status === 404) {
        setStatus('not_found');
        return null;
      }
      if (res.status === 410) {
        setStatus('expired');
        return null;
      }
      if (!res.ok) {
        setStatus('error');
        return null;
      }

      const data = (await res.json()) as TransferInfo;
      setTransfer(data);
      setProgress(data.progress ?? 0);

      if (data.status === 'ready') setStatus('ready');
      else if (data.status === 'scanning') setStatus('scanning');
      else if (data.status === 'infected') setStatus('infected');
      else if (data.status === 'expired') setStatus('expired');
      else setStatus('uploading');

      return data;
    } catch {
      setStatus('error');
      return null;
    }
  }, [transferId]);

  useEffect(() => {
    void fetchTransfer();
  }, [fetchTransfer]);

  // Podgląd postępu na żywo, gdy nadawca jeszcze wysyła.
  useEffect(() => {
    if (status !== 'uploading' && status !== 'scanning') return;

    const socket = new TransferWebSocket(transferId);

    const unsubscribe = socket.subscribe((update: ProgressUpdate) => {
      if (update.type === 'progress') {
        setProgress(update.progress ?? 0);
        setEta(update.eta ?? null);
        setTransfer((previous) =>
          previous
            ? {
                ...previous,
                uploaded_size: update.uploadedSize ?? previous.uploaded_size,
                total_size: update.totalSize ?? previous.total_size,
              }
            : previous,
        );
      } else if (update.type === 'complete') {
        setProgress(100);
        void fetchTransfer();
      }
    });

    socket.connect();

    // Odpytywanie jako zabezpieczenie, gdyby websocket się nie przebił.
    const poll = setInterval(() => {
      if (statusRef.current === 'uploading' || statusRef.current === 'scanning') {
        void fetchTransfer();
      }
    }, 2500);

    return () => {
      unsubscribe();
      socket.disconnect();
      clearInterval(poll);
    };
  }, [status, transferId, fetchTransfer]);

  const entries = transfer?.entries ?? [];
  const hasBrowser = entries.length > 0;

  const downloadLabel = useMemo(() => {
    if (!transfer) return 'Pobierz';
    const size = formatBytes(transfer.total_size);
    return transfer.isSingleFile ? `Pobierz (${size})` : `Pobierz wszystko (${size})`;
  }, [transfer]);

  return (
    <main className="min-h-screen flex flex-col font-body relative overflow-hidden">
      {backdrop && (
        <>
          {backdrop.type === 'image' ? (
            <div
              className="fixed inset-0 z-0 transition-opacity duration-500"
              style={{
                backgroundImage: `url(${backdrop.url})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                opacity: 0.1,
              }}
            />
          ) : (
            <video
              src={backdrop.url}
              className="fixed inset-0 z-0 w-full h-full object-cover opacity-[0.12]"
              autoPlay
              loop
              muted
              playsInline
            />
          )}
          <div className="fixed inset-0 z-0 bg-gradient-to-b from-black/60 via-black/40 to-black/60" />
        </>
      )}

      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-10 sm:py-12">
        <a href="/" className="mb-8 hover:opacity-80 transition-opacity">
          <Logo size="md" />
        </a>

        <div className={hasBrowser ? 'w-full max-w-4xl' : 'w-full max-w-md'}>
          {status === 'loading' && (
            <div className="text-center animate-fade-in">
              <Loader2 className="w-8 h-8 text-accent/40 animate-spin mx-auto mb-4" />
              <p className="text-sm text-white/40">Wczytywanie…</p>
            </div>
          )}

          {status === 'not_found' && (
            <Notice
              icon={<AlertCircle className="w-6 h-6 text-white/30" />}
              title="Nie znaleziono"
              body="Ten transfer nie istnieje, został usunięty albo już wygasł."
            />
          )}

          {status === 'expired' && (
            <Notice
              icon={<Clock className="w-6 h-6 text-white/30" />}
              title="Link wygasł"
              body="Ten transfer wygasł, a pliki zostały trwale usunięte z serwera."
            />
          )}

          {status === 'scanning' && (
            <div className="glass rounded-2xl p-6 animate-fade-in text-center">
              <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-5">
                <ShieldCheck className="w-6 h-6 text-accent animate-pulse" />
              </div>
              <h1 className="font-display text-base font-semibold text-white/80 mb-1">
                Sprawdzanie antywirusowe
              </h1>
              <p className="text-xs text-white/40">
                Pliki dotarły i są właśnie skanowane. Zwykle trwa to kilka sekund —
                strona odblokuje się sama.
              </p>
            </div>
          )}

          {status === 'infected' && (
            <div className="glass rounded-2xl p-6 animate-fade-in text-center border border-red-500/20">
              <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-5">
                <ShieldAlert className="w-6 h-6 text-red-400" />
              </div>
              <h1 className="font-display text-lg text-white/85 mb-2">
                Transfer zablokowany
              </h1>
              <p className="text-sm text-white/45 mb-4">
                Skaner antywirusowy wykrył zagrożenie, więc pliki zostały natychmiast
                usunięte z serwera. Nic nie da się już pobrać.
              </p>
              {transfer?.threatName && (
                <p className="text-[11px] text-red-300/60 font-mono mb-5 break-all">
                  {transfer.threatName}
                </p>
              )}
              <a href="/" className="text-xs text-accent hover:text-accent-light transition-colors">
                Wyślij własne pliki
              </a>
            </div>
          )}

          {status === 'error' && (
            <div className="text-center animate-fade-in">
              <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-5">
                <AlertCircle className="w-6 h-6 text-red-400/60" />
              </div>
              <h1 className="font-display text-lg text-white/80 mb-2">Coś poszło nie tak</h1>
              <button
                onClick={() => window.location.reload()}
                className="text-xs text-accent hover:text-accent-light transition-colors"
              >
                Spróbuj ponownie
              </button>
            </div>
          )}

          {status === 'uploading' && transfer && (
            <div className="glass rounded-2xl p-6 animate-fade-in">
              <div className="flex justify-center mb-5">
                <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 text-accent animate-spin" />
                </div>
              </div>

              <div className="text-center mb-5">
                <h1 className="font-display text-base font-semibold text-white/80 mb-1">
                  Trwa wysyłanie
                </h1>
                <p className="text-xs text-white/40">
                  Nadawca jeszcze przesyła pliki. Ta strona odświeża się sama.
                </p>
              </div>

              <div className="flex items-center gap-3 p-3 bg-white/[0.02] rounded-xl mb-5">
                <FileArchive className="w-8 h-8 text-white/20 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white/70 truncate">{transfer.filename}</p>
                  <p className="text-xs text-white/30">{formatBytes(transfer.total_size)}</p>
                </div>
              </div>

              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden mb-3">
                <div
                  className="h-full progress-bar rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-white/40">
                  {formatBytes(transfer.uploaded_size)} / {formatBytes(transfer.total_size)}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-accent font-semibold tabular-nums">{progress}%</span>
                  {eta !== null && formatEta(eta) && (
                    <span className="text-white/30">zostało {formatEta(eta)}</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {status === 'ready' && transfer && (
            <div className="glass rounded-2xl p-4 sm:p-6 animate-fade-in">
              <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                <div className="min-w-0">
                  <h1 className="font-display text-sm font-semibold text-white/85 truncate">
                    {transfer.filename}
                  </h1>
                  <p className="text-xs text-white/35">
                    {transfer.fileCount}{' '}
                    {plural(transfer.fileCount, 'plik', 'pliki', 'plików')} ·{' '}
                    {formatBytes(transfer.total_size)}
                  </p>
                </div>
              </div>

              {hasBrowser ? (
                <FileBrowser
                  transferId={transferId}
                  entries={entries}
                  onHoverMedia={(url, type) => setBackdrop(url && type ? { url, type } : null)}
                />
              ) : (
                <div className="flex items-center gap-3 p-3 bg-white/[0.02] rounded-xl mb-5">
                  <FileArchive className="w-8 h-8 text-accent/50 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white/70 truncate">{transfer.filename}</p>
                    <p className="text-xs text-white/30">{formatBytes(transfer.total_size)}</p>
                  </div>
                </div>
              )}

              <button
                onClick={() => triggerDownload(api.downloadAll(transferId))}
                className="mt-4 w-full py-3.5 text-sm btn-primary flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                {downloadLabel}
              </button>

              <div className="mt-4 flex items-center justify-center gap-4 text-[11px] text-white/30 flex-wrap">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  zostało {formatRemaining(transfer.expires_at)}
                </span>
                {transfer.download_count > 0 && (
                  <span>
                    {transfer.download_count}{' '}
                    {plural(transfer.download_count, 'pobranie', 'pobrania', 'pobrań')}
                  </span>
                )}
                {!transfer.isSingleFile && <span>przy pobieraniu pakowane do ZIP</span>}
              </div>
            </div>
          )}
        </div>

        {/* Odbiorca to zwykle ktoś, kto jeszcze nie zna studia — reklama i
            wizytówka lądują pod podglądem/przeglądarką plików. */}
        {(status === 'ready' || status === 'expired' || status === 'not_found') && (
          <>
            <HexartPromo />
            <BusinessCard />
          </>
        )}
      </div>

      <SiteFooter />
    </main>
  );
}

function Notice({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="text-center animate-fade-in">
      <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-5">
        {icon}
      </div>
      <h1 className="font-display text-lg text-white/80 mb-2">{title}</h1>
      <p className="text-sm text-white/40 mb-6">{body}</p>
      <a href="/" className="text-xs text-accent hover:text-accent-light transition-colors">
        Wyślij własne pliki
      </a>
    </div>
  );
}
