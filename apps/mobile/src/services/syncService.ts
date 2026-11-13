/**
 * Panorama Water Tank Monitor — Centralized Real-Time Sync Service.
 *
 * Coordinates authoritative synchronization between Central FastAPI Backend,
 * WebSocket live stream, MQTT message broker, and local client state.
 * Implements deduplication, auto-reconnection recovery, and authoritative state reconciliation.
 */

import { wsService } from './websocket';
import { mqttService, CENTRAL_DELTA_SYNC_TOPIC } from './mqttService';
import { localFleetStore } from './localFleetStore';
import { deviceRegistry } from './deviceRegistry';

export type SyncState = 'SYNCHRONIZED' | 'SYNCHRONIZING' | 'OFFLINE';

export interface AuthoritativeSyncEvent {
  event_id: string;
  event_type: string;
  timestamp: string;
  data: any;
}

export type SyncStateCallback = (state: SyncState, lastSyncTime: Date | null) => void;
export type SyncEventCallback = (event: AuthoritativeSyncEvent) => void;

class SyncService {
  private static instance: SyncService;
  private state: SyncState = 'SYNCHRONIZING';
  private lastSyncTime: Date | null = null;
  private stateListeners: Set<SyncStateCallback> = new Set();
  private eventListeners: Set<SyncEventCallback> = new Set();
  private seenEventIds: Set<string> = new Set();
  private maxSeenIds = 500;
  private isReconciling = false;
  private reconcileDebounceTimer: any = null;

  private constructor() {
    this.initListeners();
  }

  static getInstance(): SyncService {
    if (!this.instance) {
      this.instance = new SyncService();
    }
    return this.instance;
  }

  private initListeners(): void {
    if (typeof window === 'undefined') return;

    // 1. Listen for browser online/offline events
    window.addEventListener('online', () => {
      console.info('[SyncService] Network restored (online). Reconciling state...');
      this.setState('SYNCHRONIZING');
      this.scheduleReconciliation(500);
    });

    window.addEventListener('offline', () => {
      console.warn('[SyncService] Network lost (offline).');
      this.setState('OFFLINE');
    });

    // 2. Listen for WebSocket status changes
    wsService.onStatusChange((wsStatus) => {
      if (wsStatus === 'CONNECTED') {
        this.scheduleReconciliation(300);
      } else if (wsStatus === 'RECONNECTING') {
        if (this.state !== 'OFFLINE') this.setState('SYNCHRONIZING');
      }
    });

    // 3. Listen for WebSocket events (all required events)
    const requiredEvents = [
      'TRAIN_CREATED',
      'TRAIN_UPDATED',
      'TRAIN_DELETED',
      'REGION_UPDATED',
      'COACH_CREATED',
      'COACH_UPDATED',
      'COACH_DELETED',
      'DEVICE_CREATED',
      'DEVICE_UPDATED',
      'DEVICE_DELETED',
      'FLEET_SYNC',
      'DEVICE_SYNC',
    ];

    for (const evt of requiredEvents) {
      wsService.on(evt, (envelope: any) => {
        this.handleInboundSyncEvent(envelope, 'WS');
      });
    }

    // 4. Listen for MQTT sync events
    mqttService.onCentralDeltaSync((delta: any) => {
      this.handleInboundSyncEvent(delta, 'MQTT');
    });

    mqttService.onFleetSync((fleetEvent: any) => {
      this.handleInboundSyncEvent(fleetEvent, 'MQTT');
    });

    mqttService.onDeviceSync((devEvent: any) => {
      this.handleInboundSyncEvent(devEvent, 'MQTT');
    });
  }

  /**
   * Deduplicate and process incoming synchronization frames from WebSocket or MQTT.
   */
  public handleInboundSyncEvent(rawEnvelope: any, source: 'WS' | 'MQTT'): void {
    if (!rawEnvelope || typeof rawEnvelope !== 'object') return;

    const eventId = rawEnvelope.event_id || rawEnvelope.mutationId || rawEnvelope.id;
    if (eventId) {
      if (this.seenEventIds.has(eventId)) {
        // Discard duplicate event already processed from another transport
        return;
      }
      this.seenEventIds.add(eventId);
      if (this.seenEventIds.size > this.maxSeenIds) {
        const oldest = this.seenEventIds.values().next().value;
        if (oldest) this.seenEventIds.delete(oldest);
      }
    }

    const eventType = rawEnvelope.event_type || rawEnvelope.event || rawEnvelope.action || rawEnvelope.type || 'SYNC';
    const payload = rawEnvelope.data !== undefined ? rawEnvelope.data : rawEnvelope;

    const standardEvent: AuthoritativeSyncEvent = {
      event_id: eventId || `gen-${Date.now()}`,
      event_type: eventType,
      timestamp: rawEnvelope.timestamp || new Date().toISOString(),
      data: payload,
    };

    console.info(`[SyncService] Authoritative event [${eventType}] received via ${source}.`);

    // Notify registered event listeners (e.g. AppContext)
    for (const cb of this.eventListeners) {
      try {
        cb(standardEvent);
      } catch (err) {
        console.error('[SyncService] Error in event listener callback:', err);
      }
    }

    // Automatically trigger state reconciliation if this is a mutation
    this.scheduleReconciliation(200);
  }

  /**
   * Debounced authoritative reconciliation with central server.
   */
  public scheduleReconciliation(delayMs = 300): void {
    clearTimeout(this.reconcileDebounceTimer);
    this.reconcileDebounceTimer = setTimeout(() => {
      this.reconcileWithServer();
    }, delayMs);
  }

  /**
   * Fetch latest authoritative fleet and device state from backend and sync caches.
   */
  public async reconcileWithServer(): Promise<boolean> {
    if (this.isReconciling) return false;
    this.isReconciling = true;
    this.setState('SYNCHRONIZING');

    try {
      // Trigger local storage / broadcast reconciliation
      window.dispatchEvent(new CustomEvent('panorama:request-authoritative-sync'));
      this.lastSyncTime = new Date();
      this.setState('SYNCHRONIZED');
      return true;
    } catch (e) {
      console.warn('[SyncService] Reconciliation failed:', e);
      this.setState('OFFLINE');
      return false;
    } finally {
      this.isReconciling = false;
    }
  }

  public getState(): SyncState {
    return this.state;
  }

  public getLastSyncTime(): Date | null {
    return this.lastSyncTime;
  }

  public setState(nextState: SyncState): void {
    if (this.state === nextState && nextState !== 'SYNCHRONIZED') return;
    this.state = nextState;
    if (nextState === 'SYNCHRONIZED') {
      this.lastSyncTime = new Date();
    }
    for (const cb of this.stateListeners) {
      try {
        cb(this.state, this.lastSyncTime);
      } catch (e) {
        console.error('[SyncService] Error in state listener:', e);
      }
    }
  }

  public onStateChange(callback: SyncStateCallback): () => void {
    this.stateListeners.add(callback);
    callback(this.state, this.lastSyncTime);
    return () => this.stateListeners.delete(callback);
  }

  public onSyncEvent(callback: SyncEventCallback): () => void {
    this.eventListeners.add(callback);
    return () => this.eventListeners.delete(callback);
  }
}

export const syncService = SyncService.getInstance();
