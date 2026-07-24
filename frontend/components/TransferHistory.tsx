'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Clock, Copy, ExternalLink, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import {
  getTransferHistory,
  removeTransferFromHistory,
  type TransferHistoryItem,
} from '@/lib/transferHistory';
import { formatBytes, formatRemaining } from '@/lib/format';

export default function TransferHistory() {
  const [history, setHistory] = useState<TransferHistoryItem[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const reload = useCallback(() => setHistory(getTransferHistory()), []);

  useEffect(() => {
    reload();
    const interval = setInterval(reload, 30_000);
    return () => clearInterval(interval);
  }, [reload]);

  const handleCopy = async (item: TransferHistoryItem) => {
    const fullUrl = `${window.location.origin}${item.shareUrl}`;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopiedId(item.transferId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      window.prompt('Copy this link:', fullUrl);
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

  if (history.length === 0) return null;

  return (
    <div className="w-full max-w-xl mx-auto mt-6 px-4 animate-fade-in">
      <div className="glass rounded-2xl p-3 sm:p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-white/40 uppercase tracking-wider">Your transfers</span>
          <span className="text-xs text-white/30">{history.length}</span>
        </div>

        <div className="space-y-2">
          {history.map((item) => (
            <div
              key={item.transferId}
              className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.04] transition-all"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-xs text-white/70 truncate font-medium">{item.filename}</p>
                  {item.status === 'uploading' && (
                    <span className="text-[10px] text-accent-light/60 uppercase tracking-wider shrink-0">
                      uploading
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[10px] text-white/25 flex-wrap">
                  <span className="font-mono truncate">
                    {typeof window !== 'undefined'
                      ? `${window.location.host}${item.shareUrl}`
                      : item.shareUrl}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5" />
                    {formatRemaining(item.expiresAt)}
                  </span>
                  {item.size ? <span>{formatBytes(item.size)}</span> : null}
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => handleCopy(item)}
                  className={clsx(
                    'p-1.5 rounded-lg transition-all',
                    copiedId === item.transferId
                      ? 'bg-accent/20 text-accent-light'
                      : 'bg-white/5 hover:bg-white/10 text-white/40 hover:text-white/60',
                  )}
                  aria-label="Copy link"
                  title="Copy link"
                >
                  {copiedId === item.transferId ? (
                    <Check className="w-3 h-3" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </button>

                <a
                  href={item.shareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/40 hover:text-white/60 transition-all"
                  aria-label="Open in a new tab"
                  title="Open"
                >
                  <ExternalLink className="w-3 h-3" />
                </a>

                <button
                  onClick={() => handleDelete(item)}
                  className={clsx(
                    'rounded-lg transition-all flex items-center gap-1',
                    pendingDelete === item.transferId
                      ? 'bg-red-500/20 text-red-300 px-2 py-1.5 text-[10px] font-medium'
                      : 'bg-white/5 hover:bg-red-500/20 text-white/40 hover:text-red-400 p-1.5',
                  )}
                  aria-label="Delete transfer from the server"
                  title="Delete from the server"
                >
                  <Trash2 className="w-3 h-3" />
                  {pendingDelete === item.transferId && 'Sure?'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
