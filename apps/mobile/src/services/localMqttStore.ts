/**
 * localMqttStore.ts
 *
 * Local caching and persistence for MQTT per-topic latest retained records.
 * Provides instant offline access across app restarts and network disruptions,
 * syncing bidirectionally with the authoritative PostgreSQL backend.
 */

import { MqttLatestTopicRecord } from '../types/telemetry';
import { WebSocketService } from './websocket';

const STORAGE_KEY = 'panorama_mqtt_latest_topics_v1';

class LocalMqttStore {
  private inMemoryCache: Map<string, MqttLatestTopicRecord> = new Map();
  private listeners: Set<(topic: string, record: MqttLatestTopicRecord) => void> = new Set();
  private initialized = false;

  constructor() {
    this.hydrateFromStorage();
    this.bindWebSocketListener();
  }

  private bindWebSocketListener(): void {
    if (typeof window === 'undefined') return;
    try {
      WebSocketService.getInstance().on('MQTT_TOPIC_UPDATE', (data: any) => {
        if (data && data.topic) {
          this.saveRecord(data as MqttLatestTopicRecord);
        }
      });
    } catch (e) {
      console.warn('[LocalMqttStore] Could not attach WebSocket listener:', e);
    }
  }

  private hydrateFromStorage(): void {
    if (this.initialized) return;
    this.initialized = true;

    if (typeof window === 'undefined' || !window.localStorage) return;

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item && item.topic) {
              this.inMemoryCache.set(item.topic, item);
            }
          }
        }
      }
    } catch (e) {
      console.warn('[LocalMqttStore] Failed to hydrate cache:', e);
    }
  }

  private persistToStorage(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const arr = Array.from(this.inMemoryCache.values());
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
    } catch (e) {
      console.warn('[LocalMqttStore] Failed to persist cache:', e);
    }
  }

  public getLatest(topic: string): MqttLatestTopicRecord | null {
    if (!topic) return null;
    return this.inMemoryCache.get(topic.trim()) || null;
  }

  public getAll(): MqttLatestTopicRecord[] {
    return Array.from(this.inMemoryCache.values());
  }

  public saveRecord(record: MqttLatestTopicRecord): void {
    if (!record || !record.topic) return;
    const cleanTopic = record.topic.trim();

    const existing = this.inMemoryCache.get(cleanTopic);
    if (existing && existing.received_at && record.received_at) {
      const existingDate = new Date(existing.received_at).getTime();
      const newDate = new Date(record.received_at).getTime();
      // Out-of-order protection in client cache
      if (newDate < existingDate) {
        return;
      }
    }

    this.inMemoryCache.set(cleanTopic, { ...record, topic: cleanTopic });
    this.persistToStorage();

    for (const listener of this.listeners) {
      try {
        listener(cleanTopic, record);
      } catch (e) {
        console.error('[LocalMqttStore] Listener error:', e);
      }
    }
  }

  public saveBatch(records: MqttLatestTopicRecord[]): void {
    if (!Array.isArray(records)) return;
    for (const rec of records) {
      if (rec && rec.topic) {
        const cleanTopic = rec.topic.trim();
        const existing = this.inMemoryCache.get(cleanTopic);
        if (existing && existing.received_at && rec.received_at) {
          const existingDate = new Date(existing.received_at).getTime();
          const newDate = new Date(rec.received_at).getTime();
          if (newDate < existingDate) continue;
        }
        this.inMemoryCache.set(cleanTopic, { ...rec, topic: cleanTopic });
      }
    }
    this.persistToStorage();
  }

  public subscribe(callback: (topic: string, record: MqttLatestTopicRecord) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }
}

export const localMqttStore = new LocalMqttStore();
