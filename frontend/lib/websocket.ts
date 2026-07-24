import type { ProgressUpdate } from './types';

export type WebSocketCallback = (update: ProgressUpdate) => void;

const MAX_RECONNECT_ATTEMPTS = 6;
const PING_INTERVAL_MS = 25_000;

export class TransferWebSocket {
  private ws: WebSocket | null = null;
  private readonly transferId: string;
  private readonly callbacks = new Set<WebSocketCallback>();
  private reconnectAttempts = 0;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** Set by disconnect() so the close handler stops reconnecting. */
  private closed = false;

  constructor(transferId: string) {
    this.transferId = transferId;
  }

  connect(): void {
    if (this.closed) return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host =
      process.env.NODE_ENV === 'production' ? window.location.host : 'localhost:3001';

    let socket: WebSocket;
    try {
      socket = new WebSocket(`${protocol}//${host}/ws/${this.transferId}`);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = socket;

    socket.onopen = () => {
      this.reconnectAttempts = 0;
      this.pingTimer = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) socket.send('ping');
      }, PING_INTERVAL_MS);
    };

    socket.onmessage = (event) => {
      if (event.data === 'pong') return;
      try {
        const update = JSON.parse(event.data) as ProgressUpdate;
        this.callbacks.forEach((cb) => cb(update));
      } catch {
        /* ignore malformed frames */
      }
    };

    socket.onclose = () => {
      this.clearTimers();
      this.scheduleReconnect();
    };

    socket.onerror = () => {
      /* onclose always follows, reconnection is handled there */
    };
  }

  private scheduleReconnect(): void {
    if (this.closed || this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return;

    this.reconnectAttempts += 1;
    const delay = Math.min(15_000, 1_000 * 2 ** (this.reconnectAttempts - 1));
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  subscribe(callback: WebSocketCallback): () => void {
    this.callbacks.add(callback);
    return () => {
      this.callbacks.delete(callback);
    };
  }

  disconnect(): void {
    this.closed = true;
    this.clearTimers();
    this.callbacks.clear();

    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onopen = null;
      if (this.ws.readyState <= WebSocket.OPEN) this.ws.close();
      this.ws = null;
    }
  }

  private clearTimers(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
