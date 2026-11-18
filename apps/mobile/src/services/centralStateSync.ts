/**
 * Panorama Water Tank Monitor — Centralized Multi-User Backend Sync Service.
 *
 * Connects all browser sessions (including independent browsers and incognito tabs)
 * to the central SQLite-backed FastAPI sync API (`GET/PUT /api/sync/state`) and
 * real-time WebSocket broadcast hub (`WS /api/sync/ws`).
 *
 * Features:
 * - Authoritative DB hydration on startup, refresh, login/logout, and reconnect.
 * - Real-time WebSocket event fan-out with automatic exponential backoff (1s -> 30s).
 * - Deduplication via bounded event_id / mutation_id cache.
 * - Automatic 15s fallback polling when WebSocket is temporarily unavailable.
 * - Graceful degradation if remote sync endpoint is temporarily waking or offline.
 */

import { DEFAULT_HTTPS_RECEIVER_HEALTH_URL } from '../config/apiConfig';

export type SyncNamespace = 'fleet' | 'devices' | 'settings' | 'users';
export type CentralSyncStatus = 'CONNECTED' | 'CONNECTING' | 'POLLING' | 'OFFLINE';

export interface RemoteSyncMeta {
  namespace: SyncNamespace;
  eventType: string;
  eventId?: string;
  entityId?: string;
  version: number;
  updatedAt: number;
  mutationId?: string;
  authoritative: boolean;
}

export type NamespaceUpdateCallback = (data: any, meta: RemoteSyncMeta) => void;
export type CentralStatusCallback = (status: CentralSyncStatus) => void;

const WS_PING_MS = 25000;
const FALLBACK_POLL_MS = 15000;
const MAX_BACKOFF_MS = 30000;

export function resolveCentralSyncBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const override = (window as any).__PANORAMA_SYNC_BASE_URL__;
    if (typeof override === 'string' && override.trim()) {
      return override.trim().replace(/\/+$/, '');
    }
    const host = window.location?.hostname || '';
    const port = window.location?.port || '';
    // Local development against HTTPS_Server directly on same origin
    if ((host === 'localhost' || host === '127.0.0.1') && (port === '8000' || port === '8443')) {
      return window.location.origin.replace(/\/+$/, '');
    }
  }
  return DEFAULT_HTTPS_RECEIVER_HEALTH_URL.replace(/\/api\/health$/i, '');
}

class CentralStateSyncService {
  private static instance: CentralStateSyncService;
  private ws: WebSocket | null = null;
  private status: CentralSyncStatus = 'OFFLINE';
  private started = false;
  private destroyed = false;
  private syncSupported = true;
  private reconnectAttempts = 0;
  private reconnectTimer: any = null;
  private pingTimer: any = null;
  private fallbackPollTimer: any = null;
  private networkBound = false;

  private seenEventIds: Set<string> = new Set();
  private lastAppliedVersions: Record<SyncNamespace, number> = {
    fleet: 0,
    devices: 0,
    settings: 0,
    users: 0,
  };
  private listeners: Record<SyncNamespace, Set<NamespaceUpdateCallback>> = {
    fleet: new Set(),
    devices: new Set(),
    settings: new Set(),
    users: new Set(),
  };
  private statusListeners: Set<CentralStatusCallback> = new Set();

  static getInstance(): CentralStateSyncService {
    if (!CentralStateSyncService.instance) {
      CentralStateSyncService.instance = new CentralStateSyncService();
    }
    return CentralStateSyncService.instance;
  }

  public start(): void {
    if (typeof window === 'undefined' || this.started) return;
    this.started = true;
    this.destroyed = false;
    this.bindNetworkListeners();
    this.pullAllState().then((ok) => {
      if (ok) {
        this.connectWebSocket();
      } else {
        // Still try WebSocket if pull failed transiently (unless endpoint is 404 unsupported)
        if (this.syncSupported) {
          this.scheduleReconnect();
        }
      }
    });
  }

  public stop(): void {
    this.destroyed = true;
    this.started = false;
    this.clearTimers();
    if (this.ws) {
      try {
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this.setStatus('OFFLINE');
  }

  private bindNetworkListeners(): void {
    if (this.networkBound || typeof window === 'undefined') return;
    this.networkBound = true;

    window.addEventListener('online', () => {
      if (this.destroyed) return;
      this.syncSupported = true;
      this.reconnectAttempts = 0;
      this.clearTimers();
      // Authoritative pull + WS reconnect on network recovery
      this.pullAllState().then((ok) => {
        if (ok) this.connectWebSocket();
        else if (this.syncSupported) this.scheduleReconnect();
      });
    });

    window.addEventListener('offline', () => {
      this.clearTimers();
      if (this.ws) {
        try {
          this.ws.close();
        } catch {}
        this.ws = null;
      }
      this.setStatus('OFFLINE');
    });

    window.addEventListener('beforeunload', () => {
      this.stop();
    });
  }

  private clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.fallbackPollTimer) {
      clearInterval(this.fallbackPollTimer);
      this.fallbackPollTimer = null;
    }
  }

  private setStatus(next: CentralSyncStatus): void {
    if (this.status === next) return;
    this.status = next;
    this.statusListeners.forEach((cb) => {
      try {
        cb(next);
      } catch {}
    });
  }

  public getStatus(): CentralSyncStatus {
    return this.status;
  }

  public onStatusChange(cb: CentralStatusCallback): () => void {
    this.statusListeners.add(cb);
    cb(this.status);
    return () => this.statusListeners.delete(cb);
  }

  public onRemoteUpdate(namespace: SyncNamespace, cb: NamespaceUpdateCallback): () => void {
    this.listeners[namespace].add(cb);
    return () => this.listeners[namespace].delete(cb);
  }

  private recordSeenEvent(id?: string): boolean {
    if (!id) return false;
    if (this.seenEventIds.has(id)) return true;
    this.seenEventIds.add(id);
    if (this.seenEventIds.size > 500) {
      const oldest = this.seenEventIds.values().next().value;
      if (oldest) this.seenEventIds.delete(oldest);
    }
    return false;
  }

  private applyRemoteRecord(
    namespace: SyncNamespace,
    record: {
      data: any;
      version?: number;
      updated_at?: number;
      mutation_id?: string;
      event_id?: string;
      event_type?: string;
      entity_id?: string;
    },
    authoritative: boolean
  ): void {
    if (!record || !record.data || typeof record.data !== 'object') return;
    if (record.event_id && this.recordSeenEvent(record.event_id)) return;

    const version = typeof record.version === 'number' ? record.version : (record.data.version || 0);
    const updatedAt = typeof record.updated_at === 'number' ? record.updated_at : (record.data.updatedAt || 0);

    // Ignore stale out-of-order updates older than already applied server version
    if (version > 0 && version < this.lastAppliedVersions[namespace]) {
      return;
    }
    if (version > 0) {
      this.lastAppliedVersions[namespace] = version;
    }

    const meta: RemoteSyncMeta = {
      namespace,
      eventType: record.event_type || 'STATE_SNAPSHOT',
      eventId: record.event_id,
      entityId: record.entity_id,
      version,
      updatedAt,
      mutationId: record.mutation_id || record.data.mutationId,
      authoritative,
    };

    this.listeners[namespace].forEach((cb) => {
      try {
        cb(record.data, meta);
      } catch (err) {
        console.error(`[CentralStateSync] Listener error for ${namespace}:`, err);
      }
    });

    if (typeof window !== 'undefined' && record.event_type && record.event_type !== 'STATE_SNAPSHOT') {
      window.dispatchEvent(
        new CustomEvent('panorama:sync-event', {
          detail: {
            event_id: record.event_id,
            event_type: record.event_type,
            entity_type: namespace === 'fleet' ? 'TRAIN' : namespace.toUpperCase(),
            entity_id: record.entity_id || '',
            version,
            payload: record.data,
          },
        })
      );
    }
  }

  /**
   * Fetch all authoritative namespaces from central SQLite backend (`GET /api/sync/state`).
   */
  public async pullAllState(): Promise<boolean> {
    if (typeof fetch === 'undefined') return false;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.setStatus('OFFLINE');
      return false;
    }

    const baseUrl = resolveCentralSyncBaseUrl();
    const url = `${baseUrl}/api/sync/state`;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 8000) : null;
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller?.signal,
        cache: 'no-store',
      });

      if (res.status === 404) {
        // Backend deployment does not yet expose /api/sync/state; stop polling & fall back cleanly
        this.syncSupported = false;
        this.clearTimers();
        this.setStatus('OFFLINE');
        return false;
      }
      if (!res.ok) return false;

      const json = await res.json();
      const namespaces = json?.namespaces;
      if (namespaces && typeof namespaces === 'object') {
        (['fleet', 'devices', 'settings', 'users'] as SyncNamespace[]).forEach((ns) => {
          const rec = namespaces[ns];
          if (rec && rec.data) {
            this.applyRemoteRecord(ns, { ...rec, event_type: 'STATE_SNAPSHOT' }, true);
          }
        });
      }
      return true;
    } catch {
      return false;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * Persist namespace mutation to central SQLite backend (`PUT /api/sync/state/{namespace}`).
   * Backend commits to SQLite first, then broadcasts to all connected WebSocket clients.
   */
  public async pushNamespace(
    namespace: SyncNamespace,
    data: Record<string, any>,
    eventType: string = 'STATE_UPDATED',
    entityId?: string
  ): Promise<boolean> {
    if (typeof fetch === 'undefined' || !this.syncSupported) return false;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;

    const baseUrl = resolveCentralSyncBaseUrl();
    const url = `${baseUrl}/api/sync/state/${namespace}`;
    try {
      const res = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          event_type: eventType,
          entity_id: entityId || undefined,
          mutation_id: data?.mutationId || undefined,
          data,
        }),
        cache: 'no-store',
      });
      if (res.status === 404) {
        this.syncSupported = false;
        return false;
      }
      if (!res.ok) return false;
      const committed = await res.json();
      if (committed?.event_id) {
        this.recordSeenEvent(committed.event_id);
      }
      if (typeof committed?.version === 'number') {
        this.lastAppliedVersions[namespace] = Math.max(this.lastAppliedVersions[namespace], committed.version);
      }
      return true;
    } catch {
      return false;
    }
  }

  private connectWebSocket(): void {
    if (this.destroyed || !this.syncSupported || typeof WebSocket === 'undefined') return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;

    const baseUrl = resolveCentralSyncBaseUrl();
    const wsProto = baseUrl.startsWith('https://') ? 'wss://' : 'ws://';
    const wsUrl = `${wsProto}${baseUrl.replace(/^https?:\/\//, '')}/api/sync/ws`;

    this.setStatus('CONNECTING');
    try {
      const ws = new WebSocket(wsUrl);
      this.ws = ws;

      ws.onopen = () => {
        if (this.ws !== ws) return;
        this.reconnectAttempts = 0;
        if (this.fallbackPollTimer) {
          clearInterval(this.fallbackPollTimer);
          this.fallbackPollTimer = null;
        }
        this.setStatus('CONNECTED');
        this.startPing();
      };

      ws.onmessage = (evt) => {
        if (this.ws !== ws) return;
        try {
          const msg = JSON.parse(evt.data);
          if (!msg || typeof msg !== 'object') return;
          if (msg.type === 'PONG') return;

          if (msg.event_type === 'STATE_SNAPSHOT' && msg.namespaces) {
            (['fleet', 'devices', 'settings', 'users'] as SyncNamespace[]).forEach((ns) => {
              const rec = msg.namespaces[ns];
              if (rec && rec.data) {
                this.applyRemoteRecord(ns, { ...rec, event_type: 'STATE_SNAPSHOT' }, true);
              }
            });
            return;
          }

          const ns = msg.namespace as SyncNamespace;
          if (ns && this.listeners[ns] && msg.data) {
            this.applyRemoteRecord(ns, msg, true);
          }
        } catch {
          // Ignore malformed non-JSON control frames
        }
      };

      ws.onclose = () => {
        if (this.ws !== ws) return;
        this.ws = null;
        if (this.pingTimer) {
          clearInterval(this.pingTimer);
          this.pingTimer = null;
        }
        if (!this.destroyed) {
          this.startFallbackPolling();
          this.scheduleReconnect();
        }
      };

      ws.onerror = () => {
        // onclose handles cleanup and retry
      };
    } catch {
      this.startFallbackPolling();
      this.scheduleReconnect();
    }
  }

  private startPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ type: 'ping' }));
        } catch {}
      }
    }, WS_PING_MS);
  }

  private startFallbackPolling(): void {
    if (this.destroyed || !this.syncSupported || this.fallbackPollTimer) return;
    this.setStatus('POLLING');
    this.fallbackPollTimer = setInterval(() => {
      if (!this.destroyed && this.syncSupported && (!this.ws || this.ws.readyState !== WebSocket.OPEN)) {
        this.pullAllState();
      }
    }, FALLBACK_POLL_MS);
  }

  private scheduleReconnect(): void {
    if (this.destroyed || !this.syncSupported) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

    this.reconnectAttempts += 1;
    const delay = Math.min(1000 * Math.pow(2, Math.min(this.reconnectAttempts - 1, 5)), MAX_BACKOFF_MS);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectWebSocket();
    }, delay);
  }
}

export const centralStateSync = CentralStateSyncService.getInstance();

if (typeof window !== 'undefined') {
  (window as any).panoramaCentralSync = centralStateSync;
}
