export interface TransferHistoryItem {
  transferId: string;
  shareUrl: string;
  filename: string;
  expiresAt: string;
  createdAt: string;
  status: 'uploading' | 'ready' | 'expired';
  /** Proves ownership when deleting. Never leaves this browser otherwise. */
  ownerToken?: string;
  size?: number;
  fileCount?: number;
}

const STORAGE_KEY = 'we_transfer_history';
const MAX_HISTORY = 12;

function read(): TransferHistoryItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(items: TransferHistoryItem[]): TransferHistoryItem[] {
  if (typeof window === 'undefined') return items;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* quota or private mode - history is a convenience, not a requirement */
  }
  return items;
}

export function saveTransferToHistory(
  item: Omit<TransferHistoryItem, 'createdAt'>,
): TransferHistoryItem[] {
  const existing = read().find((h) => h.transferId === item.transferId);
  const entry: TransferHistoryItem = {
    ...existing,
    ...item,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };

  const rest = read().filter((h) => h.transferId !== item.transferId);
  return write([entry, ...rest].slice(0, MAX_HISTORY));
}

/** Transfers that have not expired yet, newest first. */
export function getTransferHistory(): TransferHistoryItem[] {
  const now = Date.now();
  const all = read();
  const alive = all.filter((item) => new Date(item.expiresAt).getTime() > now);

  if (alive.length !== all.length) write(alive);
  return alive;
}

export function getOwnerToken(transferId: string): string | undefined {
  return read().find((h) => h.transferId === transferId)?.ownerToken;
}

export function updateTransferStatus(
  transferId: string,
  status: TransferHistoryItem['status'],
  patch: Partial<TransferHistoryItem> = {},
): TransferHistoryItem[] {
  return write(
    read().map((item) =>
      item.transferId === transferId ? { ...item, ...patch, status } : item,
    ),
  );
}

export function removeTransferFromHistory(transferId: string): TransferHistoryItem[] {
  return write(read().filter((item) => item.transferId !== transferId));
}

export function clearTransferHistory(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
