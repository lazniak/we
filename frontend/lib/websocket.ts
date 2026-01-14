import type { ProgressUpdate } from './types';

export type WebSocketCallback = (update: ProgressUpdate) => void;

export class TransferWebSocket {
  private ws: WebSocket | null = null;
  private transferId: string;
  private callbacks: Set<WebSocketCallback> = new Set();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private pingInterval: NodeJS.Timeout | null = null;
  
  constructor(transferId: string) {
    this.transferId = transferId;
  }
  
  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = process.env.NODE_ENV === 'production' 
      ? window.location.host 
      : 'localhost:3001';
    
    this.ws = new WebSocket(`${protocol}//${host}/ws/${this.transferId}`);
    
    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
      
      // Start ping interval
      this.pingInterval = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send('ping');
        }
      }, 30000);
    };
    
    this.ws.onmessage = (event) => {
      if (event.data === 'pong') return;
      
      try {
        const update: ProgressUpdate = JSON.parse(event.data);
        this.callbacks.forEach(cb => cb(update));
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
      }
    };
    
    this.ws.onclose = () => {
      console.log('WebSocket disconnected');
      this.cleanup();
      
      // Attempt reconnection
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        setTimeout(() => this.connect(), 2000 * this.reconnectAttempts);
      }
    };
    
    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }
  
  subscribe(callback: WebSocketCallback): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }
  
  disconnect(): void {
    this.cleanup();
    this.ws?.close();
    this.ws = null;
  }
  
  private cleanup(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
}
