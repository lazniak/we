export interface TransferHistoryItem {
  transferId: string;
  shareUrl: string;
  filename: string;
  expiresAt: string;
  createdAt: string;
  status: 'uploading' | 'ready' | 'expired';
}

const STORAGE_KEY = 'we_transfer_history';
const MAX_HISTORY = 10; // Keep last 10 transfers

function getRawHistory(): TransferHistoryItem[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (error) {
    console.error('Failed to get raw history:', error);
    return [];
  }
}

export function saveTransferToHistory(item: Omit<TransferHistoryItem, 'createdAt'>) {
  try {
    const history = getRawHistory();
    const newItem: TransferHistoryItem = {
      ...item,
      createdAt: new Date().toISOString(),
    };
    
    // Remove if already exists (update)
    const filtered = history.filter(h => h.transferId !== item.transferId);
    
    // Add to beginning
    const updated = [newItem, ...filtered].slice(0, MAX_HISTORY);
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (error) {
    console.error('Failed to save transfer history:', error);
    return [];
  }
}

export function getTransferHistory(): TransferHistoryItem[] {
  try {
    const history = getRawHistory();
    
    // Filter out expired transfers
    const now = new Date();
    const active = history.filter(item => {
      const expiresAt = new Date(item.expiresAt);
      return expiresAt > now;
    });
    
    // Update status for expired items
    const updated = history.map(item => {
      const expiresAt = new Date(item.expiresAt);
      if (expiresAt <= now && item.status !== 'expired') {
        return { ...item, status: 'expired' as const };
      }
      return item;
    });
    
    // Save updated history if changed
    const hasChanges = updated.some((item, idx) => {
      const original = history[idx];
      return !original || item.status !== original.status;
    });
    
    if (hasChanges) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    }
    
    return active;
  } catch (error) {
    console.error('Failed to get transfer history:', error);
    return [];
  }
}

export function updateTransferStatus(transferId: string, status: TransferHistoryItem['status']) {
  try {
    const history = getRawHistory();
    const updated = history.map(item => 
      item.transferId === transferId ? { ...item, status } : item
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (error) {
    console.error('Failed to update transfer status:', error);
    return [];
  }
}

export function removeTransferFromHistory(transferId: string) {
  try {
    const history = getRawHistory();
    const filtered = history.filter(item => item.transferId !== transferId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    return filtered;
  } catch (error) {
    console.error('Failed to remove transfer from history:', error);
    return [];
  }
}

export function clearTransferHistory() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear transfer history:', error);
  }
}
