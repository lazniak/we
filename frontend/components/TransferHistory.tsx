'use client';

import { useState, useEffect } from 'react';
import { Copy, Check, ExternalLink, Clock, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import { getTransferHistory, removeTransferFromHistory, type TransferHistoryItem } from '@/lib/transferHistory';
import { formatBytes } from '@/lib/format';

export default function TransferHistory() {
  const [history, setHistory] = useState<TransferHistoryItem[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    const loadHistory = () => {
      const items = getTransferHistory();
      setHistory(items);
    };

    loadHistory();
    const interval = setInterval(loadHistory, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const handleCopy = async (item: TransferHistoryItem) => {
    const fullUrl = `${window.location.origin}${item.shareUrl}`;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopiedId(item.transferId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleDelete = async (transferId: string) => {
    // Delete from server first
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      await fetch(`${apiUrl}/api/transfer/${transferId}`, {
        method: 'DELETE',
      });
    } catch (err) {
      console.error('Failed to delete from server:', err);
    }
    
    // Remove from local history
    removeTransferFromHistory(transferId);
    const updated = getTransferHistory();
    setHistory(updated);
  };

  const formatExpiry = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffHours = Math.ceil(diffMs / (1000 * 60 * 60));
    
    if (diffHours <= 0) return 'Expired';
    if (diffHours < 24) return `${diffHours}h`;
    const diffDays = Math.ceil(diffHours / 24);
    return `${diffDays}d`;
  };

  if (history.length === 0) return null;

  return (
    <div className="w-full max-w-xl mx-auto mt-6 px-4 animate-fade-in">
      <div className="glass rounded-2xl p-3 sm:p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-white/40 uppercase tracking-wider">Recent transfers</span>
          <span className="text-xs text-white/30">{history.length}</span>
        </div>
        
        <div className="space-y-2">
          {history.map((item) => (
            <div
              key={item.transferId}
              className={clsx(
                'flex items-center gap-3 p-3 rounded-xl transition-all',
                'bg-white/[0.02] hover:bg-white/[0.04]',
                item.status === 'expired' && 'opacity-50'
              )}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-xs text-white/70 truncate font-medium">
                    {item.filename}
                  </p>
                  {item.status === 'uploading' && (
                    <span className="text-[10px] text-accent-light/60 uppercase tracking-wider">
                      Uploading
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-white/30 font-mono truncate">
                    {typeof window !== 'undefined' ? `${window.location.host}${item.shareUrl}` : item.shareUrl}
                  </span>
                  <div className="flex items-center gap-1 text-[10px] text-white/20">
                    <Clock className="w-2.5 h-2.5" />
                    {formatExpiry(item.expiresAt)}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={() => handleCopy(item)}
                  className={clsx(
                    'p-1.5 rounded-lg transition-all',
                    copiedId === item.transferId
                      ? 'bg-accent/20 text-accent-light'
                      : 'bg-white/5 hover:bg-white/10 text-white/40 hover:text-white/60'
                  )}
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
                  title="Open in new tab"
                >
                  <ExternalLink className="w-3 h-3" />
                </a>
                
                <button
                  onClick={() => handleDelete(item.transferId)}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-all"
                  title="del transfer"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
