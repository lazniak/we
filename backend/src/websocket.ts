import type { ServerWebSocket } from 'bun';

interface WSData {
  transferId: string;
}

// Store active WebSocket connections by transferId
export const clients = new Map<string, Set<ServerWebSocket<WSData>>>();

export function setupWebSocket(clientsMap: Map<string, Set<ServerWebSocket<WSData>>>) {
  return {
    open(ws: ServerWebSocket<WSData>) {
      const { transferId } = ws.data;
      console.log(`🔌 WebSocket connected for transfer: ${transferId}`);
      
      if (!clientsMap.has(transferId)) {
        clientsMap.set(transferId, new Set());
      }
      clientsMap.get(transferId)!.add(ws);
    },
    
    message(ws: ServerWebSocket<WSData>, message: string | Buffer) {
      // Handle ping/pong for keep-alive
      if (message === 'ping') {
        ws.send('pong');
      }
    },
    
    close(ws: ServerWebSocket<WSData>) {
      const { transferId } = ws.data;
      console.log(`🔌 WebSocket disconnected for transfer: ${transferId}`);
      
      const transferClients = clientsMap.get(transferId);
      if (transferClients) {
        transferClients.delete(ws);
        if (transferClients.size === 0) {
          clientsMap.delete(transferId);
        }
      }
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
  eta?: number; // milliseconds
  status?: string;
  error?: string;
}

export function broadcastProgress(transferId: string, update: ProgressUpdate) {
  const transferClients = clients.get(transferId);
  if (!transferClients) return;
  
  const message = JSON.stringify(update);
  for (const client of transferClients) {
    try {
      client.send(message);
    } catch (e) {
      console.error('Failed to send WebSocket message:', e);
    }
  }
}
