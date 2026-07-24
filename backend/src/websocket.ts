import type { ServerWebSocket } from 'bun';

interface WSData {
  transferId: string;
}

/** Active progress subscribers, keyed by transfer id. */
export const clients = new Map<string, Set<ServerWebSocket<WSData>>>();

const MAX_CLIENTS_PER_TRANSFER = 50;
const MAX_TOTAL_CLIENTS = 2000;

let totalClients = 0;

export function setupWebSocket(clientsMap: Map<string, Set<ServerWebSocket<WSData>>>) {
  return {
    open(ws: ServerWebSocket<WSData>) {
      const { transferId } = ws.data;

      if (totalClients >= MAX_TOTAL_CLIENTS) {
        ws.close(1013, 'Too many connections');
        return;
      }

      let set = clientsMap.get(transferId);
      if (!set) {
        set = new Set();
        clientsMap.set(transferId, set);
      }
      if (set.size >= MAX_CLIENTS_PER_TRANSFER) {
        ws.close(1013, 'Too many watchers');
        return;
      }

      set.add(ws);
      totalClients++;
    },

    message(ws: ServerWebSocket<WSData>, message: string | Buffer) {
      if (message === 'ping') ws.send('pong');
    },

    close(ws: ServerWebSocket<WSData>) {
      const { transferId } = ws.data;
      const set = clientsMap.get(transferId);
      if (!set) return;

      if (set.delete(ws)) totalClients = Math.max(0, totalClients - 1);
      if (set.size === 0) clientsMap.delete(transferId);
    },
  };
}

export interface ProgressUpdate {
  type: 'progress' | 'complete' | 'error';
  transferId: string;
  progress?: number;
  uploadedSize?: number;
  totalSize?: number;
  chunksCompleted?: number;
  chunksTotal?: number;
  eta?: number;
  status?: string;
  error?: string;
}

export function broadcastProgress(transferId: string, update: ProgressUpdate) {
  const subscribers = clients.get(transferId);
  if (!subscribers || subscribers.size === 0) return;

  const message = JSON.stringify(update);
  for (const client of subscribers) {
    try {
      client.send(message);
    } catch {
      /* the close handler will clean this connection up */
    }
  }
}
