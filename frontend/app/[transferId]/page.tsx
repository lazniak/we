'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  AlertCircle,
  Clock,
  Download,
  Eye,
  EyeOff,
  FileArchive,
  Flame,
  KeyRound,
  Loader2,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { api, triggerDownload } from '@/lib/api';
import { formatBytes, formatEta, formatRemaining, plural } from '@/lib/format';
import { TransferWebSocket } from '@/lib/websocket';
import FileBrowser from '@/components/FileBrowser';
import HoverBackdrop from '@/components/HoverBackdrop';
import HexartPromo from '@/components/HexartPromo';
import BusinessCard from '@/components/BusinessCard';
import Logo from '@/components/Logo';
import SiteFooter from '@/components/SiteFooter';
import { getOwnerToken } from '@/lib/transferHistory';
import type { ProgressUpdate, TransferInfo } from '@/lib/types';

type PageStatus =
  | 'loading'
  | 'uploading'
  | 'scanning'
  | 'ready'
  | 'infected'
  | 'locked'
  | 'consumed'
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
  const [lockedOneTime, setLockedOneTime] = useState(false);
  // One-time pickup: 'started' once this page began the download.
  const [pickup, setPickup] = useState<'idle' | 'started' | 'interrupted'>('idle');
  // The sender's own browser: its history holds this transfer's owner token.
  const [ownerToken, setOwnerToken] = useState<string | undefined>(undefined);
  const ownerUnlockTried = useRef(false);

  useEffect(() => {
    setOwnerToken(getOwnerToken(transferId));
  }, [transferId]);

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
        const body = await res.json().catch(() => null);
        setStatus(body?.status === 'consumed' ? 'consumed' : 'expired');
        return null;
      }
      if (res.status === 401) {
        const body = await res.json().catch(() => null);
        setLockedOneTime(Boolean(body?.oneTime));

        // The sender opening their own link (from the upload screen or the
        // history) is let in with the owner token, no password typed.
        const token = getOwnerToken(transferId);
        if (token && !ownerUnlockTried.current) {
          ownerUnlockTried.current = true;
          const unlock = await fetch(`${api.info(transferId)}/unlock`, {
            method: 'POST',
            headers: { 'X-Owner-Token': token },
          }).catch(() => null);
          if (unlock?.ok) return fetchTransfer();
        }

        setStatus('locked');
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

  // While a one-time download runs, watch for the moment the server destroys
  // the transfer (done) or releases it again (the download broke off).
  useEffect(() => {
    if (pickup !== 'started') return;
    // Two unclaimed reads in a row, so a browser that is slow to start the
    // download is not mistaken for one that broke off.
    let unclaimed = 0;
    const poll = setInterval(async () => {
      const data = await fetchTransfer();
      if (!data || data.status !== 'ready') return;
      unclaimed = data.claimed ? 0 : unclaimed + 1;
      if (unclaimed >= 2) setPickup('interrupted');
    }, 3000);
    return () => clearInterval(poll);
  }, [pickup, fetchTransfer]);

  const startOneTimeDownload = useCallback(async () => {
    // Re-check first: someone else may have started in the meantime, and a
    // refused download would otherwise land as a JSON file in Downloads.
    const fresh = await fetchTransfer();
    if (!fresh || fresh.status !== 'ready' || fresh.claimed) return;
    setPickup('started');
    triggerDownload(api.downloadAll(transferId));
  }, [fetchTransfer, transferId]);

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
  const oneTime = Boolean(transfer?.oneTime);
  const hasBrowser = entries.length > 0 && !oneTime;

  const downloadLabel = useMemo(() => {
    if (!transfer) return 'Pobierz';
    const size = formatBytes(transfer.total_size);
    return transfer.isSingleFile ? `Pobierz (${size})` : `Pobierz wszystko (${size})`;
  }, [transfer]);

  return (
    <main className="min-h-screen flex flex-col font-body relative overflow-hidden">
      <HoverBackdrop media={backdrop} />

      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-10 sm:py-12">
        <div className="mb-8">
          <Logo size="md" />
        </div>

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

          {status === 'consumed' && (
            <Notice
              icon={<Flame className="w-6 h-6 text-accent/70" />}
              title={pickup === 'started' ? 'Odebrano' : 'Transfer odebrany'}
              body={
                pickup === 'started'
                  ? 'Pliki są u Ciebie. Link był jednorazowy, więc transfer został właśnie usunięty z serwera.'
                  : 'Ten link był jednorazowy. Pliki zostały już pobrane i usunięte z serwera.'
              }
            />
          )}

          {status === 'locked' && (
            <PasswordGate
              transferId={transferId}
              oneTime={lockedOneTime}
              onUnlocked={() => void fetchTransfer()}
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
                Pliki dotarły i są właśnie skanowane. Zwykle trwa to kilka sekund.
                Strona odblokuje się sama.
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

          {status === 'ready' && transfer && oneTime && (
            <OneTimePickup
              transfer={transfer}
              isSender={Boolean(ownerToken)}
              pickup={pickup}
              onDownload={() => void startOneTimeDownload()}
            />
          )}

          {status === 'ready' && transfer && !oneTime && (
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
        {(status === 'ready' ||
          status === 'expired' ||
          status === 'not_found' ||
          status === 'consumed') && (
          <div className="w-full mx-auto max-w-xl px-4">
            <HexartPromo />
            <BusinessCard />
          </div>
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

function PasswordGate({
  transferId,
  oneTime,
  onUnlocked,
}: {
  transferId: string;
  oneTime: boolean;
  onUnlocked: () => void;
}) {
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${api.info(transferId)}/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        onUnlocked();
        return;
      }
      if (res.status === 429) setError('Za dużo prób. Spróbuj za kilka minut.');
      else if (res.status === 403) setError('Nieprawidłowe hasło.');
      else if (res.status === 410) onUnlocked();
      else setError('Nie udało się sprawdzić hasła. Spróbuj ponownie.');
    } catch {
      setError('Brak połączenia. Spróbuj ponownie.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="glass rounded-2xl p-6 animate-fade-in">
      <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-5">
        <KeyRound className="w-6 h-6 text-accent" />
      </div>
      <h1 className="font-display text-base font-semibold text-white/85 mb-1 text-center">
        Transfer chroniony hasłem
      </h1>
      <p className="text-xs text-white/40 text-center mb-5">
        Wpisz hasło od nadawcy, żeby zobaczyć i pobrać pliki.
        {oneTime && ' Link jest jednorazowy: po pobraniu pliki znikną.'}
      </p>

      <div className="relative">
        <input
          type={visible ? 'text' : 'password'}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Hasło"
          autoFocus
          autoComplete="off"
          spellCheck={false}
          className="input-glass w-full rounded-xl pl-4 pr-11 py-3 text-sm placeholder:text-white/25"
          aria-invalid={Boolean(error)}
        />
        <button
          type="button"
          onClick={() => setVisible((value) => !value)}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg text-white/35 hover:text-white/70 transition-colors"
          aria-label={visible ? 'Ukryj hasło' : 'Pokaż hasło'}
        >
          {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>

      {error && <p className="mt-3 text-xs text-red-300/85 text-center">{error}</p>}

      <button
        type="submit"
        disabled={!password || busy}
        className="mt-4 w-full py-3 text-sm btn-primary flex items-center justify-center gap-2"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
        Odblokuj
      </button>
    </form>
  );
}

function OneTimePickup({
  transfer,
  isSender,
  pickup,
  onDownload,
}: {
  transfer: TransferInfo;
  isSender: boolean;
  pickup: 'idle' | 'started' | 'interrupted';
  onDownload: () => void;
}) {
  const files = transfer.entries.filter((entry) => !entry.isDir);
  const shown = files.slice(0, 8);
  const busyElsewhere = Boolean(transfer.claimed) && pickup !== 'started';

  return (
    <div className="glass rounded-2xl p-4 sm:p-6 animate-fade-in">
      <div className="min-w-0 mb-4">
        <h1 className="font-display text-sm font-semibold text-white/85 truncate">
          {transfer.filename}
        </h1>
        <p className="text-xs text-white/35">
          {transfer.fileCount} {plural(transfer.fileCount, 'plik', 'pliki', 'plików')} ·{' '}
          {formatBytes(transfer.total_size)}
        </p>
      </div>

      <div className="glass-accent rounded-xl p-4 mb-4 flex items-start gap-3">
        <Flame className="w-5 h-5 text-accent-light shrink-0 mt-0.5" />
        <div>
          <p className="text-sm text-white/85 font-medium">Jednorazowy odbiór</p>
          <p className="text-xs text-white/50 leading-relaxed">
            Pobierz całość jednym kliknięciem. Po pobraniu pliki znikną z serwera, a link
            przestanie działać.
          </p>
        </div>
      </div>

      {shown.length > 0 && (
        <ul className="mb-4 space-y-1 max-h-60 overflow-y-auto custom-scrollbar">
          {shown.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-white/[0.02] text-xs"
            >
              <span className="truncate text-white/65">{entry.path}</span>
              <span className="shrink-0 text-white/30">{formatBytes(entry.size)}</span>
            </li>
          ))}
          {files.length > shown.length && (
            <li className="px-3 py-1 text-[11px] text-white/30">
              i jeszcze {files.length - shown.length}{' '}
              {plural(files.length - shown.length, 'plik', 'pliki', 'plików')}
            </li>
          )}
        </ul>
      )}

      {isSender && pickup === 'idle' && (
        <p className="mb-3 text-[11px] text-amber-300/75 text-center">
          To Twój transfer. Pobranie z tej przeglądarki też go zamknie.
        </p>
      )}

      {pickup === 'started' ? (
        <div className="rounded-xl bg-white/[0.03] p-4 text-center">
          <Loader2 className="w-5 h-5 text-accent animate-spin mx-auto mb-2" />
          <p className="text-sm text-white/75">Pobieranie trwa</p>
          <p className="text-xs text-white/40">
            Gdy się skończy, transfer zniknie z serwera. Postęp widać w pobranych plikach
            przeglądarki.
          </p>
        </div>
      ) : (
        <>
          {pickup === 'interrupted' && (
            <p className="mb-3 text-xs text-amber-300/80 text-center">
              Pobieranie zostało przerwane. Pliki nadal czekają, możesz spróbować ponownie.
            </p>
          )}
          <button
            onClick={onDownload}
            disabled={busyElsewhere}
            className="w-full py-3.5 text-sm btn-primary flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4" />
            {busyElsewhere
              ? 'Ktoś właśnie pobiera ten transfer'
              : `Pobierz i zamknij transfer (${formatBytes(transfer.total_size)})`}
          </button>
        </>
      )}

      <div className="mt-4 flex items-center justify-center gap-4 text-[11px] text-white/30 flex-wrap">
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          zostało {formatRemaining(transfer.expires_at)}
        </span>
        {!transfer.isSingleFile && <span>pobierane jako ZIP</span>}
      </div>
    </div>
  );
}
