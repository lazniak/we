'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy, ExternalLink, Flame, KeyRound, Loader2, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import {
  getTransferHistory,
  removeTransferFromHistory,
  updateTransferStatus,
  type TransferHistoryItem,
} from '@/lib/transferHistory';
import { api } from '@/lib/api';
import { formatBytes, formatCountdown, plural } from '@/lib/format';
import { useNow, useReducedMotion } from '@/lib/hooks';
import type { PreviewKind, TransferInfo } from '@/lib/types';

/** Kinds the server can draw a thumbnail for. */
const THUMBABLE: PreviewKind[] = ['image', 'svg', 'image-render', 'video', 'video-render', 'audio'];
const MAX_REEL = 6;
const REEL_STEP_MS = 2400;

interface TransferHistoryProps {
  /** Transfer shown elsewhere on the page right now (the one uploading). */
  excludeId?: string | null;
  /** Changing this re-reads the stored list, e.g. when an upload finishes. */
  refreshKey?: string | number;
}

/**
 * The sender's own transfers, kept in this browser. Each strip opens its link
 * in a new tab, counts down to expiry, and wears the transfer's pictures
 * behind it: dim at rest, slowly cross-fading through them on hover.
 */
export default function TransferHistory({ excludeId, refreshKey }: TransferHistoryProps) {
  const [history, setHistory] = useState<TransferHistoryItem[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [thumbIds, setThumbIds] = useState<Record<string, number[]>>({});
  const now = useNow(1000);

  const reload = useCallback(() => setHistory(getTransferHistory()), []);

  useEffect(() => {
    reload();
    const interval = setInterval(reload, 30_000);
    return () => clearInterval(interval);
  }, [reload, refreshKey]);

  // Ask the server once per transfer what is left of it and which files have a
  // picture. The owner token lets this through a password and a one-time lock
  // without using anything up.
  const checked = useRef(new Set<string>());
  useEffect(() => {
    for (const item of history) {
      if (checked.current.has(item.transferId) || item.status === 'consumed') continue;
      if (item.transferId === excludeId) continue;
      checked.current.add(item.transferId);

      void (async () => {
        try {
          const res = await fetch(api.info(item.transferId), {
            cache: 'no-store',
            headers: item.ownerToken ? { 'X-Owner-Token': item.ownerToken } : undefined,
          });

          if (res.status === 404) {
            removeTransferFromHistory(item.transferId);
            reload();
            return;
          }
          if (res.status === 410) {
            const body = await res.json().catch(() => null);
            if (body?.status === 'consumed') updateTransferStatus(item.transferId, 'consumed');
            else removeTransferFromHistory(item.transferId);
            reload();
            return;
          }
          if (!res.ok) return;

          const info = (await res.json()) as TransferInfo;
          if (info.status === 'ready' && item.status !== 'ready') {
            updateTransferStatus(item.transferId, 'ready');
            reload();
          }

          const ids = (info.entries ?? [])
            .filter((entry) => !entry.isDir && entry.previewKind && THUMBABLE.includes(entry.previewKind))
            .slice(0, MAX_REEL)
            .map((entry) => entry.id);
          if (ids.length > 0) setThumbIds((previous) => ({ ...previous, [item.transferId]: ids }));
        } catch {
          /* the strip just stays without pictures */
        }
      })();
    }
  }, [history, excludeId, reload]);

  const handleCopy = async (item: TransferHistoryItem) => {
    const fullUrl = `${window.location.origin}${item.shareUrl}`;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopiedId(item.transferId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      window.prompt('Skopiuj ten link:', fullUrl);
    }
  };

  const handleDelete = async (item: TransferHistoryItem) => {
    if (pendingDelete !== item.transferId) {
      setPendingDelete(item.transferId);
      setTimeout(
        () => setPendingDelete((current) => (current === item.transferId ? null : current)),
        4000,
      );
      return;
    }

    setPendingDelete(null);
    try {
      await fetch(`/api/transfer/${item.transferId}`, {
        method: 'DELETE',
        headers: item.ownerToken ? { 'X-Owner-Token': item.ownerToken } : undefined,
      });
    } catch {
      /* the retention sweep will get it eventually */
    }

    removeTransferFromHistory(item.transferId);
    reload();
  };

  const visible = history.filter((item) => item.transferId !== excludeId);
  if (visible.length === 0) return null;

  return (
    <div className="w-full max-w-xl mx-auto mt-6 px-4 animate-fade-in">
      <div className="glass rounded-2xl p-3 sm:p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-white/40 uppercase tracking-wider">Twoje transfery</span>
          <span className="text-xs text-white/30">{visible.length}</span>
        </div>

        <ul className="space-y-2">
          {visible.map((item) => (
            <HistoryStrip
              key={item.transferId}
              item={item}
              now={now}
              thumbIds={thumbIds[item.transferId] ?? []}
              copied={copiedId === item.transferId}
              confirmDelete={pendingDelete === item.transferId}
              onCopy={() => handleCopy(item)}
              onDelete={() => handleDelete(item)}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}

function HistoryStrip({
  item,
  now,
  thumbIds,
  copied,
  confirmDelete,
  onCopy,
  onDelete,
}: {
  item: TransferHistoryItem;
  now: number | null;
  thumbIds: number[];
  copied: boolean;
  confirmDelete: boolean;
  onCopy: () => void;
  onDelete: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const consumed = item.status === 'consumed';
  const uploading = item.status === 'uploading';

  const expiresAt = new Date(item.expiresAt).getTime();
  const createdAt = new Date(item.createdAt).getTime();
  const remaining = now === null ? null : Math.max(0, expiresAt - now);
  const lifetime = Math.max(1, expiresAt - createdAt);
  const lifeLeft = remaining === null ? 1 : Math.min(1, remaining / lifetime);

  const host = typeof window !== 'undefined' ? window.location.host : '';

  return (
    <li
      className={clsx(
        'group relative overflow-hidden rounded-xl border transition-colors duration-300',
        consumed
          ? 'border-white/[0.04] bg-white/[0.01]'
          : 'border-white/[0.05] bg-white/[0.02] hover:border-accent/25',
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setHovered(true)}
      onBlurCapture={() => setHovered(false)}
    >
      {!consumed && (
        <HistoryReel
          transferId={item.transferId}
          ownerToken={item.ownerToken}
          ids={thumbIds}
          active={hovered}
        />
      )}
      {/* Keeps the text legible over the pictures: solid where the words are,
          open on the right where the images show. */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#0a0a0c] from-10% via-[#0a0a0c]/75 via-45% to-[#0a0a0c]/15" />

      {/* The whole strip is the link; the buttons sit above it. */}
      <a
        href={item.shareUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute inset-0 z-[1] rounded-xl focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent/60"
        aria-label={`Otwórz ${item.filename} w nowej karcie`}
      />

      <div className="pointer-events-none relative z-[2] flex items-center gap-3 p-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 min-w-0">
            <p
              className={clsx(
                'text-xs truncate font-medium transition-colors',
                consumed ? 'text-white/40' : 'text-white/80 group-hover:text-white',
              )}
            >
              {item.filename}
            </p>
            {item.oneTime && !consumed && (
              <Flame className="w-3 h-3 shrink-0 text-accent-light/70" aria-label="Znika po odbiorze" />
            )}
            {item.passwordProtected && (
              <KeyRound className="w-3 h-3 shrink-0 text-white/40" aria-label="Chroniony hasłem" />
            )}
          </div>
          <div className="flex items-center gap-2 text-[10px] text-white/30 min-w-0">
            <span className="font-mono truncate">
              {host}
              {item.shareUrl}
            </span>
            {item.size ? <span className="shrink-0">{formatBytes(item.size)}</span> : null}
            {item.fileCount && item.fileCount > 1 ? (
              <span className="shrink-0">
                {item.fileCount} {plural(item.fileCount, 'plik', 'pliki', 'plików')}
              </span>
            ) : null}
          </div>
        </div>

        {/* Countdown to the link's end */}
        <div className="shrink-0 text-right">
          {consumed ? (
            <span className="font-label text-[11px] uppercase tracking-[0.12em] text-white/35">
              odebrany
            </span>
          ) : uploading ? (
            <span className="flex items-center gap-1 font-label text-[11px] uppercase tracking-[0.12em] text-accent-light/70">
              <Loader2 className="w-3 h-3 animate-spin" />
              wysyłanie
            </span>
          ) : (
            <>
              <span className="block font-label text-[9px] uppercase tracking-[0.14em] text-white/25">
                wygasa za
              </span>
              <span className="block font-label text-sm tabular-nums tracking-wide text-white/70">
                {remaining === null ? ' ' : formatCountdown(remaining)}
              </span>
            </>
          )}
        </div>

        <div className="pointer-events-auto flex items-center gap-1.5 shrink-0">
          {!consumed && (
            <button
              onClick={onCopy}
              className={clsx(
                'p-1.5 rounded-lg transition-all',
                copied
                  ? 'bg-accent/20 text-accent-light'
                  : 'bg-black/30 hover:bg-white/10 text-white/45 hover:text-white/70',
              )}
              aria-label="Kopiuj link"
              title="Kopiuj link"
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            </button>
          )}

          <span
            className="hidden sm:inline-flex p-1.5 rounded-lg text-white/30 group-hover:text-accent-light transition-colors"
            aria-hidden="true"
          >
            <ExternalLink className="w-3 h-3" />
          </span>

          <button
            onClick={onDelete}
            className={clsx(
              'rounded-lg transition-all flex items-center gap-1',
              confirmDelete
                ? 'bg-red-500/20 text-red-300 px-2 py-1.5 text-[10px] font-medium'
                : 'bg-black/30 hover:bg-red-500/20 text-white/45 hover:text-red-400 p-1.5',
            )}
            aria-label={consumed ? 'Usuń z listy' : 'Usuń transfer z serwera'}
            title={consumed ? 'Usuń z listy' : 'Usuń z serwera'}
          >
            <Trash2 className="w-3 h-3" />
            {confirmDelete && 'Na pewno?'}
          </button>
        </div>
      </div>

      {/* How much of the link's life is left, as a hairline along the bottom. */}
      {!consumed && !uploading && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-px bg-white/[0.04]">
          <div
            className="h-full bg-accent/60 transition-[width] duration-1000 ease-linear"
            style={{ width: `${lifeLeft * 100}%` }}
          />
        </div>
      )}
    </li>
  );
}

/**
 * Pictures behind a strip. Only the first is fetched up front; the rest load
 * on the first hover. Thumbnails are fetched with the owner token, so they
 * show even for password protected and one-time transfers.
 */
function HistoryReel({
  transferId,
  ownerToken,
  ids,
  active,
}: {
  transferId: string;
  ownerToken?: string;
  ids: number[];
  active: boolean;
}) {
  const [urls, setUrls] = useState<(string | null)[]>([]);
  const [index, setIndex] = useState(0);
  const [wantAll, setWantAll] = useState(false);
  const reducedMotion = useReducedMotion();
  const requested = useRef(new Set<number>());
  const created = useRef<string[]>([]);

  useEffect(() => {
    if (active) setWantAll(true);
  }, [active]);

  useEffect(() => {
    const wanted = wantAll ? ids : ids.slice(0, 1);
    wanted.forEach((fileId, position) => {
      if (requested.current.has(fileId)) return;
      requested.current.add(fileId);

      void (async () => {
        try {
          const res = await fetch(api.thumb(transferId, fileId), {
            headers: ownerToken ? { 'X-Owner-Token': ownerToken } : undefined,
          });
          if (!res.ok) return;
          const url = URL.createObjectURL(await res.blob());
          created.current.push(url);
          setUrls((previous) => {
            const next = [...previous];
            next[position] = url;
            return next;
          });
        } catch {
          /* a missing picture just leaves a gap in the reel */
        }
      })();
    });
  }, [ids, wantAll, transferId, ownerToken]);

  useEffect(() => {
    const list = created.current;
    return () => list.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const loaded = urls.filter((url): url is string => Boolean(url));

  // Slow cross-fade while hovered; back to the first picture when left alone.
  useEffect(() => {
    if (!active || reducedMotion || loaded.length < 2) {
      if (!active) setIndex(0);
      return;
    }
    const id = window.setInterval(
      () => setIndex((current) => (current + 1) % loaded.length),
      REEL_STEP_MS,
    );
    return () => window.clearInterval(id);
  }, [active, reducedMotion, loaded.length]);

  if (loaded.length === 0) return null;

  return (
    <div
      className="pointer-events-none absolute inset-y-0 right-0 w-3/4 opacity-60 saturate-[0.7] transition-[opacity,filter] duration-[600ms] ease-out group-hover:opacity-95 group-hover:saturate-100"
      aria-hidden="true"
    >
      {loaded.map((url, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={url}
          src={url}
          alt=""
          draggable={false}
          className={clsx(
            'absolute inset-0 h-full w-full object-cover',
            i === index % loaded.length ? 'opacity-100 scale-[1.08]' : 'opacity-0 scale-100',
          )}
          style={{
            transitionProperty: 'opacity, transform',
            transitionDuration: '1200ms, 7000ms',
            transitionTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94), linear',
          }}
        />
      ))}
    </div>
  );
}
