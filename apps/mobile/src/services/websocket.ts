/**
 * WebSocket Live Stream Service.
 * Connects to the FastAPI WebSocket endpoint with auto-reconnection and event dispatching.
 */

export type WebSocketStatus = 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED';
export type EventCallback = (data: any) => void;
export type StatusCallback = (status: WebSocketStatus) => void;

export function getWsUrl(): string {
  // 1. Check custom user backend setting
  if (typeof window !== 'undefined' && window.localStorage) {
    const custom = window.localStorage.getItem('panorama_backend_url');
    if (custom && custom.trim()) {
      const clean = custom.trim().replace(/\/+$/, '');
      const wsProto = clean.startsWith('https://') ? 'wss://' : 'ws://';
      const hostPath = clean.replace(/^https?:\/\//, '');
      return `${wsProto}${hostPath}/ws/live`;
    }
  }

  // 2. Check environment variables
  const configured =
    (typeof process !== 'undefined' && (process.env?.WS_URL || process.env?.REACT_APP_WS_URL || process.env?.VITE_WS_URL)) ||
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_WS_URL);
  if (configured && String(configured).trim()) {
    return String(configured).trim();
  }

  // 3. Localhost development environments
  if (typeof window !== 'undefined' && window.location) {
    const host = window.location.hostname || '';
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'ws://127.0.0.1:8000/api/v1/ws/live';
    }
  }

  // 4. Capacitor native environment
  if (typeof window !== 'undefined' && (window as any).Capacitor) {
    return 'wss://panorama-water-tank-backend.onrender.com/api/v1/ws/live';
  }

  // 5. Default production backend fallback
  return 'wss://panorama-water-tank-backend.onrender.com/api/v1/ws/live';
}

export class WebSocketService {
  private static instance: WebSocketService;
  private ws: WebSocket | null = null;
  private status: WebSocketStatus = 'DISCONNECTED';
  private eventListeners: Map<string, Set<EventCallback>> = new Map();
  private statusListeners: Set<StatusCallback> = new Set();
  private reconnectAttempts = 0;
  private reconnectTimer: any = null;
  private isDestroyed = false;

  private constructor() {}

  static getInstance(): WebSocketService {
    if (!this.instance) {
      this.instance = new WebSocketService();
    }
    return this.instance;
  }

  connect(): void {
    const wsUrl = getWsUrl();
    if (!wsUrl) {
      this.setStatus('DISCONNECTED');
      return;
    }
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.isDestroyed = false;
    this.setStatus('RECONNECTING');

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.setStatus('CONNECTED');
        console.info(`[WebSocket] Connected successfully to ${wsUrl}`);
      };

      this.ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          if (parsed && parsed.event) {
            this.dispatchEvent(parsed.event, parsed.data || parsed);
          }
        } catch (e) {
          console.error('[WebSocket] Failed to parse frame:', e);
        }
      };

      this.ws.onclose = () => {
        this.setStatus('DISCONNECTED');
        this.scheduleReconnect();
      };

      this.ws.onerror = (err) => {
        console.warn('[WebSocket] Connection error:', err);
        this.ws?.close();
      };
    } catch (e) {
      this.setStatus('DISCONNECTED');
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.isDestroyed) return;
    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts) + Math.random() * 500, 10000);

    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  on(event: string, callback: EventCallback): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);

    return () => {
      this.eventListeners.get(event)?.delete(callback);
    };
  }

  onStatusChange(callback: StatusCallback): () => void {
    this.statusListeners.add(callback);
    callback(this.status);
    return () => {
      this.statusListeners.delete(callback);
    };
  }

  private dispatchEvent(event: string, data: any): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach((callback) => {
        try {
          callback(data);
        } catch (e) {
          console.error(`[WebSocket] Error in handler for event '${event}':`, e);
        }
      });
    }
  }

  private setStatus(status: WebSocketStatus): void {
    if (this.status !== status) {
      this.status = status;
      this.statusListeners.forEach((callback) => {
        try {
          callback(status);
        } catch (e) {
          console.error('[WebSocket] Error in status callback:', e);
        }
      });
    }
  }

  getStatus(): WebSocketStatus {
    return this.status;
  }

  disconnect(): void {
    this.isDestroyed = true;
    clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setStatus('DISCONNECTED');
  }
}

export const wsService = WebSocketService.getInstance();
