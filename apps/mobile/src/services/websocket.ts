/**
 * Centralized WebSocket Connection Manager for Panorama SCADA.
 *
 * Implements:
 * - Single managed connection singleton per application session.
 * - Formal connection state machine: CONNECTING | CONNECTED | DISCONNECTED | RECONNECTING | ERROR.
 * - HTTP preflight health check probe before creating WebSocket to prevent browser console error floods.
 * - Exponential backoff with randomized jitter and retry ceilings.
 * - Network awareness (navigator.onLine, 'online' / 'offline' event recovery).
 * - Heartbeat / ping-pong keepalive and stale connection detection (30s ping, 45s stale drop).
 * - Clean teardown on window unload and resource cleanup to prevent memory leaks.
 */

import { Logger } from './logger';
import {
  resolveWsUrl,
  resolveHealthUrl,
  DEFAULT_PRODUCTION_WS_URL,
} from '../config/apiConfig';

export type WebSocketStatus = 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING' | 'ERROR';
export type EventCallback = (data: any) => void;
export type StatusCallback = (status: WebSocketStatus) => void;

const PING_INTERVAL_MS = 30000;
const STALE_TIMEOUT_MS = 45000;
const MAX_CONSECUTIVE_FAILURES = 5;
const IDLE_POLL_INTERVAL_MS = 60000;

export const PRODUCTION_WS_URL = DEFAULT_PRODUCTION_WS_URL;

export function getWsUrl(): string {
  return resolveWsUrl();
}

export function getHttpHealthUrl(wsUrl?: string): string {
  return resolveHealthUrl(wsUrl);
}

export class WebSocketService {
  private static instance: WebSocketService;
  private ws: WebSocket | null = null;
  private status: WebSocketStatus = 'DISCONNECTED';
  private eventListeners: Map<string, Set<EventCallback>> = new Map();
  private statusListeners: Set<StatusCallback> = new Set();

  private reconnectAttempts = 0;
  private reconnectTimer: any = null;
  private pingIntervalTimer: any = null;
  private idlePollTimer: any = null;
  private isDestroyed = false;
  private isConnecting = false;
  private isOffline = false;
  private lastMessageReceivedTime = 0;
  private networkListenersBound = false;
  private standbyLogged = false;

  private constructor() {
    this.bindNetworkListeners();
  }

  static getInstance(): WebSocketService {
    if (!this.instance) {
      this.instance = new WebSocketService();
    }
    return this.instance;
  }

  private bindNetworkListeners(): void {
    if (this.networkListenersBound || typeof window === 'undefined') return;
    this.networkListenersBound = true;

    window.addEventListener('online', () => {
      this.isOffline = false;
      Logger.info('WEBSOCKET', 'WebSocketService', 'Network connection restored. Initiating WebSocket reconnection.');
      this.reconnectAttempts = 0;
      this.clearAllTimers();
      this.connect();
    });

    window.addEventListener('offline', () => {
      this.isOffline = true;
      Logger.warn('WEBSOCKET', 'WebSocketService', 'Network connection lost. Setting WebSocket status to DISCONNECTED.');
      this.clearAllTimers();
      if (this.ws) {
        try {
          this.ws.close();
        } catch {
          // ignore
        }
        this.ws = null;
      }
      this.setStatus('DISCONNECTED');
    });

    window.addEventListener('beforeunload', () => {
      this.disconnect();
    });

    window.addEventListener('storage', (e: StorageEvent) => {
      if (e.key === 'panorama_backend_url') {
        Logger.info('WEBSOCKET', 'WebSocketService', 'Backend URL updated in storage. Reconnecting.');
        this.reconnect();
      }
    });

    window.addEventListener('panorama:backend-url-changed', () => {
      Logger.info('WEBSOCKET', 'WebSocketService', 'Custom backend URL changed. Reconnecting.');
      this.reconnect();
    });
  }

  private clearAllTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.pingIntervalTimer) {
      clearInterval(this.pingIntervalTimer);
      this.pingIntervalTimer = null;
    }
    if (this.idlePollTimer) {
      clearInterval(this.idlePollTimer);
      this.idlePollTimer = null;
    }
  }

  /**
   * Health check preflight probe.
   * Tests if the backend HTTP service is alive before instantiating WebSocket,
   * avoiding browser C++ network error spam for unreachable hosts.
   */
  public async checkBackendHealth(wsUrl: string): Promise<boolean> {
    if (typeof window === 'undefined' || typeof fetch === 'undefined') return true;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;

    // Static hosting guard: if on github.io or pages.dev without custom backend override
    if (typeof window !== 'undefined' && window.location && window.location.hostname) {
      const host = window.location.hostname;
      if (host.endsWith('github.io') || host.endsWith('pages.dev')) {
        const hasCustom = typeof window.localStorage !== 'undefined' && Boolean(window.localStorage.getItem('panorama_backend_url'));
        if (!hasCustom) {
          try {
            const statusRes = await fetch('./backend-status.json', { cache: 'no-store' });
            if (statusRes.ok) {
              const statusData = await statusRes.json();
              if (statusData && statusData.available === false) {
                return false;
              }
            }
          } catch {
            return false;
          }
        }
      }
    }

    const healthUrl = getHttpHealthUrl(wsUrl);
    try {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeoutId = controller ? setTimeout(() => controller.abort(), 3500) : null;

      const res = await fetch(healthUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller?.signal,
        cache: 'no-store',
      });

      if (timeoutId) clearTimeout(timeoutId);
      return res.ok || res.status === 200 || res.status === 304;
    } catch {
      // Backend is unreachable or network timed out
      return false;
    }
  }

  private startIdlePoll(wsUrl?: string): void {
    if (this.isDestroyed) return;
    this.setStatus('DISCONNECTED');
    if (!this.standbyLogged) {
      this.standbyLogged = true;
      const target = wsUrl ? getHttpHealthUrl(wsUrl) : 'remote endpoint';
      Logger.info(
        'WEBSOCKET',
        'WebSocketService',
        `Remote backend currently offline or unmapped at ${target}. Standby mode active (polling every 60s). Real-time telemetry is running via HiveMQ MQTT.`
      );
    }
    if (!this.idlePollTimer) {
      this.idlePollTimer = setInterval(async () => {
        if (this.status !== 'CONNECTED' && !this.isDestroyed) {
          const currentWs = getWsUrl();
          if (currentWs) {
            const healthy = await this.checkBackendHealth(currentWs);
            if (healthy) {
              this.standbyLogged = false;
              if (this.idlePollTimer) {
                clearInterval(this.idlePollTimer);
                this.idlePollTimer = null;
              }
              this.reconnectAttempts = 0;
              this.connect();
            }
          }
        }
      }, IDLE_POLL_INTERVAL_MS);
    }
  }

  async connect(): Promise<void> {
    if (this.isDestroyed) return;

    if (this.isOffline || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
      this.setStatus('DISCONNECTED');
      return;
    }

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    if (this.isConnecting) return;
    this.isConnecting = true;

    const wsUrl = getWsUrl();
    if (!wsUrl) {
      this.isConnecting = false;
      this.setStatus('DISCONNECTED');
      return;
    }

    this.setStatus(this.reconnectAttempts > 0 ? 'RECONNECTING' : 'CONNECTING');

    // Pre-flight health probe if prior attempts failed or host is remote
    const isLocal = wsUrl.includes('127.0.0.1') || wsUrl.includes('localhost');
    if (!isLocal || this.reconnectAttempts > 1) {
      const isHealthy = await this.checkBackendHealth(wsUrl);
      if (!isHealthy) {
        this.isConnecting = false;
        this.startIdlePoll(wsUrl);
        return;
      }
    }

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.standbyLogged = false;
        if (this.idlePollTimer) {
          clearInterval(this.idlePollTimer);
          this.idlePollTimer = null;
        }
        this.lastMessageReceivedTime = Date.now();
        this.setStatus('CONNECTED');
        Logger.info('WEBSOCKET', 'WebSocketService', `WebSocket connected successfully to ${wsUrl}`);
        this.startHeartbeat();
      };

      this.ws.onmessage = (event) => {
        this.lastMessageReceivedTime = Date.now();
        try {
          const parsed = JSON.parse(event.data);
          if (parsed && (parsed.event || parsed.type)) {
            const eventName = parsed.event || parsed.type;
            if (eventName === 'PONG') {
              return;
            }
            this.dispatchEvent(eventName, parsed.data || parsed);
          }
        } catch {
          // Non-JSON frame (e.g. raw text ping/pong)
        }
      };

      this.ws.onclose = (event) => {
        this.isConnecting = false;
        this.stopHeartbeat();
        const wasConnected = this.status === 'CONNECTED';
        if (this.isOffline || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
          this.setStatus('DISCONNECTED');
          return;
        }
        this.setStatus('DISCONNECTED');
        Logger.info(
          'WEBSOCKET',
          'WebSocketService',
          `WebSocket closed (code: ${event.code}, reason: ${event.reason || 'none'}).`,
          'onclose'
        );
        if (!this.isDestroyed) {
          this.scheduleReconnect(wasConnected);
        }
      };

      this.ws.onerror = () => {
        this.isConnecting = false;
        // On error, let onclose handle cleanup and state transition
      };
    } catch (err: any) {
      this.isConnecting = false;
      this.setStatus('DISCONNECTED');
      this.scheduleReconnect();
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.pingIntervalTimer = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        this.stopHeartbeat();
        return;
      }

      // Check for stale connection
      if (Date.now() - this.lastMessageReceivedTime > STALE_TIMEOUT_MS) {
        Logger.warn('WEBSOCKET', 'WebSocketService', 'Connection became stale (no heartbeat/telemetry in 45s). Reconnecting.');
        try {
          this.ws.close();
        } catch {
          // ignore
        }
        return;
      }

      // Send ping keepalive
      try {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      } catch {
        // ignore send error
      }
    }, PING_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.pingIntervalTimer) {
      clearInterval(this.pingIntervalTimer);
      this.pingIntervalTimer = null;
    }
  }

  private scheduleReconnect(wasConnected = false): void {
    if (this.isDestroyed) return;

    if (this.isOffline || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
      Logger.info('WEBSOCKET', 'WebSocketService', 'Device offline. Reconnect paused until network is restored.');
      this.setStatus('DISCONNECTED');
      return;
    }

    if (wasConnected) {
      this.reconnectAttempts = 1;
    } else {
      this.reconnectAttempts++;
    }

    // If retry ceiling reached, pause retries and switch to quiet idle polling
    if (this.reconnectAttempts > 3) {
      this.setStatus('DISCONNECTED');
      this.startIdlePoll();
      return;
    }

    // Exponential backoff with randomized jitter: base 2s, factor 1.5, jitter +-500ms, cap 25s
    const base = 2000 * Math.pow(1.5, Math.min(this.reconnectAttempts - 1, 6));
    const jitter = Math.random() * 1000 - 500;
    const delay = Math.min(Math.max(base + jitter, 1500), 25000);

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.setStatus('RECONNECTING');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  on(event: string, callback: EventCallback): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);

    return () => {
      this.off(event, callback);
    };
  }

  addEventListener(event: string, callback: EventCallback): () => void {
    return this.on(event, callback);
  }

  removeEventListener(event: string, callback: EventCallback): void {
    this.off(event, callback);
  }

  addListener(event: string, callback: EventCallback): () => void {
    return this.on(event, callback);
  }

  removeListener(event: string, callback: EventCallback): void {
    this.off(event, callback);
  }

  off(event: string, callback: EventCallback): void {
    this.eventListeners.get(event)?.delete(callback);
  }

  emit(event: string, data?: any): void {
    this.dispatchEvent(event, data);
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
          Logger.error('WEBSOCKET', 'WebSocketService', `Error in handler for event '${event}'`, 'dispatch', e);
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
          Logger.error('WEBSOCKET', 'WebSocketService', 'Error in status listener callback', 'setStatus', e);
        }
      });
    }
  }

  getStatus(): WebSocketStatus {
    return this.status;
  }

  reconnect(): void {
    this.standbyLogged = false;
    this.disconnect();
    this.isDestroyed = false;
    this.reconnectAttempts = 0;
    this.connect();
  }

  disconnect(): void {
    this.isDestroyed = true;
    this.isConnecting = false;
    this.clearAllTimers();
    this.stopHeartbeat();
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
    this.setStatus('DISCONNECTED');
  }
}

export const wsService = WebSocketService.getInstance();
