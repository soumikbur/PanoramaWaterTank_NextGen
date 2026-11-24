/**
 * Panorama Water Tank Monitor — Unified MQTT Service.
 * Subscribes to live telemetry on topic 0023004D4B42501120353332.
 * Validates, normalizes, and handles reconnects + 30-second stale watchdog.
 */

// @ts-ignore
import Paho from 'paho-mqtt';
import { Logger } from './logger';
import { LiveTelemetryPayload, MqttConnectionStatus, MqttGpsFix } from '../types';
import { deviceProfileService } from './deviceProfileService';

export interface ParsedMqttGps {
  lat: number | null;
  long: number | null;
  alt: number | null;
  sats: number | null;
  accuracy: number | null;
  gpsFix: boolean;
}

/** Validate raw MQTT telemetry GPS fields; rejects NaN, out-of-range, (0,0), and explicit no-fix flags. */
export function parseValidGps(parsed: Record<string, any>): ParsedMqttGps {
  const alt = typeof parsed.alt === 'number' && Number.isFinite(parsed.alt) ? parsed.alt : null;
  const rawSats = parsed.sats ?? parsed.satellites ?? parsed.sat_count;
  const sats = typeof rawSats === 'number' && Number.isFinite(rawSats) && rawSats >= 0 ? rawSats : null;
  const rawAcc = parsed.accuracy ?? parsed.hdop;
  const accuracy = typeof rawAcc === 'number' && Number.isFinite(rawAcc) && rawAcc >= 0 ? rawAcc : null;

  const explicitNoFix =
    parsed.gps_valid === false ||
    parsed.has_valid_fix === false ||
    parsed.gpsValid === false ||
    parsed.fix === 0 ||
    parsed.fix === false;

  const rawLat = parsed.lat;
  const rawLon = parsed.long !== undefined ? parsed.long : parsed.lon;
  const validLat = typeof rawLat === 'number' && Number.isFinite(rawLat) && rawLat >= -90 && rawLat <= 90;
  const validLon = typeof rawLon === 'number' && Number.isFinite(rawLon) && rawLon >= -180 && rawLon <= 180;
  const notNullIsland = validLat && validLon && !(rawLat === 0 && rawLon === 0);

  if (explicitNoFix || !notNullIsland) {
    return { lat: null, long: null, alt, sats, accuracy, gpsFix: false };
  }

  return { lat: rawLat, long: rawLon, alt, sats, accuracy, gpsFix: true };
}

export const DEFAULT_MQTT_TOPIC = '002F00654B42501320353332';
export const DEFAULT_DEVICE_UID = '002F00654B42501320353332';
export const LEGACY_DEFAULT_MQTT_TOPIC = '0023004D4B42501120353332';
export const DEFAULT_STALE_TIMEOUT_MS = 180000; // 180 seconds (nominal 90s upload task + jitter headroom)
export const STALE_TIMEOUT_MS = 30000; // Fast watchdog timeout for local/test runner

export const CENTRAL_FLEET_TOPIC = 'panorama/central/fleet/v2';
export const CENTRAL_DEVICES_TOPIC = 'panorama/central/devices/v2';
export const CENTRAL_SETTINGS_TOPIC = 'panorama/central/settings/v2';
export const CENTRAL_USERS_TOPIC = 'panorama/central/users/v2';
export const CENTRAL_DELTA_SYNC_TOPIC = 'panorama/central/sync/v2';
export const SYNC_EVENTS_TOPIC = 'panorama/sync/events';
export const SYNC_WILDCARD_TOPIC = 'panorama/sync/#';

export type MqttPayloadType = 'JSON' | 'TEXT' | 'BINARY' | 'INVALID';

export interface ClassifiedMqttPayload {
  payloadType: MqttPayloadType;
  payloadString: string;
  payloadSize: number;
  isJson: boolean;
  jsonKind: 'object' | 'array' | null;
  parsedJson: any;
  isEmpty: boolean;
  error?: string;
}

/**
 * Safely decode & classify any incoming MQTT payload (JSON object, JSON array,
 * plain text, empty payload, malformed JSON, or binary/non-UTF-8 bytes).
 * Never throws and never discards non-JSON payloads.
 */
export function classifyMqttPayload(
  input: { payloadBytes?: Uint8Array | ArrayBuffer; payloadString?: string } | string | object
): ClassifiedMqttPayload {
  let payloadStr = '';
  let payloadSize = 0;
  let isBinary = false;
  let bytes: Uint8Array | null = null;

  if (typeof input === 'string') {
    payloadStr = input;
    payloadSize = typeof Blob !== 'undefined' ? new Blob([input]).size : input.length;
  } else if (input && typeof input === 'object' && !('payloadBytes' in input) && !('payloadString' in input)) {
    const serialized = JSON.stringify(input, null, 2);
    const jsonKind = Array.isArray(input) ? 'array' : 'object';
    return {
      payloadType: 'JSON',
      payloadString: serialized,
      payloadSize: typeof Blob !== 'undefined' ? new Blob([serialized]).size : serialized.length,
      isJson: true,
      jsonKind,
      parsedJson: input,
      isEmpty: false,
    };
  } else if (input && typeof input === 'object') {
    const msg = input as any;
    try {
      if (msg.payloadBytes instanceof Uint8Array) {
        bytes = msg.payloadBytes;
      } else if (msg.payloadBytes instanceof ArrayBuffer) {
        bytes = new Uint8Array(msg.payloadBytes);
      }
    } catch {
      bytes = null;
    }

    if (bytes) {
      payloadSize = bytes.byteLength;
      if (bytes.byteLength === 0) {
        payloadStr = '';
      } else {
        // Check for NUL bytes or excessive non-printable control characters
        let controlCount = 0;
        let hasNull = false;
        for (let i = 0; i < bytes.length; i++) {
          const b = bytes[i];
          if (b === 0) {
            hasNull = true;
            break;
          }
          if (b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d) {
            controlCount++;
          }
        }
        if (hasNull || controlCount / bytes.length > 0.1) {
          isBinary = true;
        } else {
          try {
            if (typeof TextDecoder !== 'undefined') {
              payloadStr = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
            } else {
              payloadStr = typeof msg.payloadString === 'string' ? msg.payloadString : '';
            }
          } catch {
            isBinary = true;
          }
        }
      }
    } else {
      // Fallback when payloadBytes is unavailable; guard Paho's payloadString getter against UTF-8 throws
      try {
        payloadStr = typeof msg.payloadString === 'string' ? msg.payloadString : '';
        payloadSize = typeof Blob !== 'undefined' ? new Blob([payloadStr]).size : payloadStr.length;
      } catch {
        isBinary = true;
      }
    }
  }

  if (isBinary) {
    const hexPreview = bytes
      ? Array.from(bytes.slice(0, 64))
          .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
          .join(' ') + (bytes.length > 64 ? ' ...' : '')
      : '(non-UTF-8 binary payload)';
    return {
      payloadType: 'BINARY',
      payloadString: `[BINARY ${payloadSize} B] ${hexPreview}`,
      payloadSize,
      isJson: false,
      jsonKind: null,
      parsedJson: null,
      isEmpty: payloadSize === 0,
    };
  }

  const trimmed = payloadStr.trim();
  if (trimmed.length === 0) {
    return {
      payloadType: 'TEXT',
      payloadString: payloadStr,
      payloadSize,
      isJson: false,
      jsonKind: null,
      parsedJson: null,
      isEmpty: true,
    };
  }

  const looksLikeJson = trimmed.startsWith('{') || trimmed.startsWith('[');
  if (looksLikeJson) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed !== null && typeof parsed === 'object') {
        return {
          payloadType: 'JSON',
          payloadString: payloadStr,
          payloadSize,
          isJson: true,
          jsonKind: Array.isArray(parsed) ? 'array' : 'object',
          parsedJson: parsed,
          isEmpty: false,
        };
      }
    } catch (e: any) {
      return {
        payloadType: 'INVALID',
        payloadString: payloadStr,
        payloadSize,
        isJson: false,
        jsonKind: null,
        parsedJson: null,
        isEmpty: false,
        error: e?.message || 'Invalid JSON syntax',
      };
    }
  }

  // Plain-text payload (e.g. "hello", status logs, AT responses) — valid non-JSON message
  return {
    payloadType: 'TEXT',
    payloadString: payloadStr,
    payloadSize,
    isJson: false,
    jsonKind: null,
    parsedJson: null,
    isEmpty: false,
  };
}

export interface RawMqttFrame {
  id: string;
  topic: string;
  payloadString: string;
  payloadSize: number;
  payloadType: MqttPayloadType;
  jsonKind?: 'object' | 'array' | null;
  isEmpty?: boolean;
  qos: number;
  retained: boolean;
  receivedAt: number;
  receivedAtFormatted: string;
  deviceTimestamp: string | null;
  uid: string | null;
  isJson: boolean;
  parsedJson: any;
  error?: string;
}

export function formatMqttTimestamp(date: Date = new Date()): string {
  const pad = (n: number, z = 2) => String(n).padStart(z, '0');
  const d = pad(date.getDate());
  const m = pad(date.getMonth() + 1);
  const y = date.getFullYear();
  const hr = pad(date.getHours());
  const min = pad(date.getMinutes());
  const sec = pad(date.getSeconds());
  const ms = pad(date.getMilliseconds(), 3);
  return `${y}-${m}-${d} ${hr}:${min}:${sec}.${ms}`;
}

export function formatMqttMessageBlock(frame: RawMqttFrame): string {
  const payloadFormatted =
    frame.isJson && frame.parsedJson
      ? JSON.stringify(frame.parsedJson, null, 4)
      : frame.payloadString;
  return `[${frame.receivedAtFormatted}] MQTT MESSAGE RECEIVED\n\nTOPIC:\n${frame.topic}\n\nPAYLOAD:\n${payloadFormatted}`;
}

export type TelemetryCallback = (payload: LiveTelemetryPayload) => void;
export type MqttStatusCallback = (status: MqttConnectionStatus) => void;

export type { MqttGpsFix } from '../types/telemetry';

export interface MqttBrokerDiagnostics {
  brokerName: string;
  host: string;
  port: number;
  path: string;
  protocol: string;
  mqttVersion: string;
  transportSecurity: string;
  websocketConnected: boolean;
  mqttSessionConnected: boolean;
  cleanSession?: boolean;
  keepAliveSeconds?: number;
  connectionUptimeMs?: number | null;
  reconnectAttempts?: number;
  messagesReceivedTotal?: number;
  messagesSentTotal?: number;
  lastError?: string | null;
  lastConnectedAt?: number | null;
  lastDisconnectedAt?: number | null;
  connectedAt?: number | null;
  disconnectedAt?: number | null;
  authMode?: string;
  certValidation?: string;
  brokerReachable?: string;
  connectionLatencyMs?: number;
  autoReconnect?: boolean;
  totalBrokerMessages?: number;
  useSSL?: boolean;
}

export class MqttService {
  private static instance: MqttService;
  private client: any = null;
  private status: MqttConnectionStatus = 'DISCONNECTED';
  private topicSubscribed = false;
  private telemetryListeners: Set<TelemetryCallback> = new Set();
  private statusListeners: Set<MqttStatusCallback> = new Set();
  private fleetSyncListeners: Set<(event: any) => void> = new Set();
  private deviceSyncListeners: Set<(event: any) => void> = new Set();
  private centralFleetListeners: Set<(event: any) => void> = new Set();
  private centralDeviceListeners: Set<(event: any) => void> = new Set();
  private centralSettingsListeners: Set<(event: any) => void> = new Set();
  private centralUsersListeners: Set<(event: any) => void> = new Set();
  private centralDeltaListeners: Set<(event: any) => void> = new Set();
  private syncEventListeners: Set<(event: any) => void> = new Set();
  private rawMessageListeners: Set<(frame: RawMqttFrame) => void> = new Set();
  private rawMessageHistory: RawMqttFrame[] = [];
  private dynamicSubscriptions: Map<string, number> = new Map();
  private seenSyncEventIds: Map<string, number> = new Map();
  private reconnectTimer: any = null;
  private staleTimer: any = null;
  private reconnectAttempts = 0;
  private lastTelemetry: LiveTelemetryPayload | null = null;
  private lastValidGps: MqttGpsFix | null = null;
  private gpsWaypoints: MqttGpsFix[] = [];
  private trainGpsFixes: Map<string, MqttGpsFix> = new Map();
  private trainGpsWaypoints: Map<string, MqttGpsFix[]> = new Map();
  private lastPayloadSignature = '';
  private lastMessageReceivedTime = 0;
  private historyBuffer: LiveTelemetryPayload[] = [];
  private isDestroyed = false;
  private isConnecting = false;
  private intentionalDisconnect = false;
  private networkListenersBound = false;

  private brokerHost: string = 'broker.hivemq.com';
  private brokerPort: number = 8884;
  private brokerPath: string = '/mqtt';
  private useSSL: boolean = true;
  private topic: string = DEFAULT_MQTT_TOPIC;
  private watchdogTimeoutMs: number = STALE_TIMEOUT_MS;

  private constructor() {
    this.initConfiguration();
    this.bindNetworkListeners();
  }

  private bindNetworkListeners(): void {
    if (this.networkListenersBound || typeof window === 'undefined') return;
    this.networkListenersBound = true;

    window.addEventListener('online', () => {
      if (this.intentionalDisconnect || this.isDestroyed) return;
      if (this.client && this.client.isConnected && this.client.isConnected()) return;
      console.info('[MQTT] Browser online — restoring MQTT broker connection...');
      this.reconnectAttempts = 0;
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
      this.connect();
    });

    window.addEventListener('offline', () => {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
      this.topicSubscribed = false;
      this.clearStaleTimer();
      this.isConnecting = false;
      this.setStatus('DISCONNECTED');
    });

    window.addEventListener('beforeunload', () => {
      this.disconnect();
    });
  }

  private cleanupClient(): void {
    const oldClient = this.client;
    this.client = null;
    if (!oldClient) return;
    try {
      oldClient.onConnectionLost = () => {};
      oldClient.onMessageArrived = () => {};
      if (oldClient.isConnected && oldClient.isConnected()) {
        oldClient.disconnect();
      }
    } catch {
      // ignore teardown errors on already-closed socket
    }
  }

  static getInstance(): MqttService {
    if (!MqttService.instance) {
      MqttService.instance = new MqttService();
    }
    return MqttService.instance;
  }

  private initConfiguration(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      const savedHost = localStorage.getItem('panorama_mqtt_host');
      const savedPort = localStorage.getItem('panorama_mqtt_port');
      const savedTopic = localStorage.getItem('panorama_mqtt_topic');
      const savedSsl = localStorage.getItem('panorama_mqtt_ssl');

      if (savedHost) this.brokerHost = savedHost;
      if (savedPort) this.brokerPort = parseInt(savedPort, 10);
      if (savedTopic && savedTopic !== LEGACY_DEFAULT_MQTT_TOPIC) {
        this.topic = savedTopic;
      } else {
        this.topic = DEFAULT_MQTT_TOPIC;
      }
      if (savedSsl !== null) this.useSSL = savedSsl === 'true';
    }
    this.dynamicSubscriptions.set(DEFAULT_MQTT_TOPIC, 0);
    if (this.topic && this.topic !== DEFAULT_MQTT_TOPIC) {
      this.dynamicSubscriptions.set(this.topic, 0);
    }
  }

  connect(): void {
    if (this.isConnecting) {
      return;
    }
    if (this.client && this.client.isConnected && this.client.isConnected()) {
      return;
    }

    this.isDestroyed = false;
    this.intentionalDisconnect = false;

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.setStatus('DISCONNECTED');
      return;
    }

    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;

    // Clean up any stale client instance before creating a fresh one (prevents duplicate clients/ghost disconnects)
    this.cleanupClient();

    this.isConnecting = true;
    this.setStatus('CONNECTING');

    const clientId = `panorama-web-${Math.random().toString(16).substring(2, 10)}`;

    try {
      const ClientConstructor = (Paho && (Paho.Client || (Paho as any).default?.Client)) || (window as any).Paho?.MQTT?.Client;
      if (!ClientConstructor) {
        this.isConnecting = false;
        console.warn('[MQTT] Paho.Client constructor not available in runtime.');
        this.setStatus('DISCONNECTED');
        this.scheduleReconnect();
        return;
      }

      const client = new ClientConstructor(
        this.brokerHost,
        this.brokerPort,
        this.brokerPath,
        clientId
      );
      this.client = client;

      client.onConnectionLost = (responseObject: any) => {
        // Ignore callbacks from stale/replaced client instances or intentional disconnects
        if (this.client !== client) return;
        this.isConnecting = false;
        this.topicSubscribed = false;
        this.clearStaleTimer();
        this.setStatus('DISCONNECTED');

        if (this.intentionalDisconnect || this.isDestroyed || responseObject?.errorCode === 0) {
          return;
        }

        const errorMsg = responseObject?.errorMessage || 'Socket closed unexpectedly';
        console.info('[MQTT] Connection lost, scheduling reconnect:', errorMsg);
        this.cleanupClient();
        this.scheduleReconnect();
      };

      client.onMessageArrived = (message: any) => {
        if (this.client !== client) return;
        try {
          const destination = message.destinationName || message.topic || '';
          const qos = typeof message.qos === 'number' ? message.qos : 0;
          const retained = Boolean(message.retained);
          const receivedDate = new Date();
          const receivedAt = receivedDate.getTime();
          const receivedAtFormatted = formatMqttTimestamp(receivedDate);

          // Step 1 & 2: Safely decode & classify payload (JSON | TEXT | BINARY | INVALID)
          const classified = classifyMqttPayload(message);

          let deviceTimestamp: string | null = null;
          let uid: string | null = null;
          if (classified.payloadType === 'JSON' && classified.jsonKind === 'object' && classified.parsedJson) {
            const p = classified.parsedJson;
            if (p.time != null) deviceTimestamp = String(p.time);
            else if (p.timestamp != null) deviceTimestamp = String(p.timestamp);
            if (p.uid) uid = String(p.uid);
            else if (p.deviceId) uid = String(p.deviceId);
            else if (p.device_id) uid = String(p.device_id);
          }

          if (!uid && destination) {
            const parts = destination.split('/');
            uid = parts[0] || parts[parts.length - 1] || null;
          }

          const frame: RawMqttFrame = {
            id: `mqtt-${receivedAt}-${Math.random().toString(36).substring(2, 7)}`,
            topic: destination,
            payloadString: classified.payloadString,
            payloadSize: classified.payloadSize,
            payloadType: classified.payloadType,
            jsonKind: classified.jsonKind,
            isEmpty: classified.isEmpty,
            qos,
            retained,
            receivedAt,
            receivedAtFormatted,
            deviceTimestamp,
            uid,
            isJson: classified.isJson,
            parsedJson: classified.parsedJson,
            error: classified.error,
          };

          // Step 3: Always deliver every received frame to the Serial Monitor (never discard!)
          const maxRaw = deviceProfileService.getActiveProfile().maxTelemetryHistoryBuffer || 150;
          this.rawMessageHistory.push(frame);
          if (this.rawMessageHistory.length > maxRaw) {
            this.rawMessageHistory.shift();
          }

          this.rawMessageListeners.forEach((cb) => {
            try {
              cb(frame);
            } catch (err) {
              console.error('[MQTT] Raw message listener error:', err);
            }
          });

          // Step 4: Only pass valid JSON payloads to sync & telemetry interpreters (plain text / empty / binary stop cleanly here)
          if (classified.payloadType !== 'JSON') {
            return;
          }

          const payloadStr = classified.payloadString;
          if (destination === SYNC_EVENTS_TOPIC || destination.startsWith('panorama/sync/')) {
            this.handleSyncEvent(payloadStr);
            return;
          }
          if (destination === CENTRAL_FLEET_TOPIC) {
            this.handleCentralFleetSync(payloadStr);
            return;
          }
          if (destination === CENTRAL_DEVICES_TOPIC) {
            this.handleCentralDeviceSync(payloadStr);
            return;
          }
          if (destination === CENTRAL_SETTINGS_TOPIC) {
            this.handleCentralSettingsSync(payloadStr);
            return;
          }
          if (destination === CENTRAL_USERS_TOPIC) {
            this.handleCentralUsersSync(payloadStr);
            return;
          }
          if (destination === CENTRAL_DELTA_SYNC_TOPIC) {
            this.handleCentralDeltaSync(payloadStr);
            this.handleSyncEvent(payloadStr);
            return;
          }
          if (destination === 'panorama/fleet/sync') {
            this.handleFleetSync(payloadStr);
            this.handleSyncEvent(payloadStr);
            return;
          }
          if (destination === 'panorama/devices/sync') {
            this.handleDeviceSync(payloadStr);
            this.handleSyncEvent(payloadStr);
            return;
          }
          this.handleIncomingPayload(payloadStr, destination, classified.parsedJson);
        } catch (e) {
          console.error('[MQTT] Error processing message frame:', e);
        }
      };

      const connectOptions: any = {
        useSSL: this.useSSL,
        timeout: 10,
        keepAliveInterval: 30,
        cleanSession: true,
        onSuccess: () => {
          if (this.client !== client || this.intentionalDisconnect) return;
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          this.setStatus('CONNECTED');
          console.info(`[MQTT] Connected to ${this.brokerHost}:${this.brokerPort}. Restoring subscriptions...`);
          try {
            // Deduplicate all subscriptions into a single map (avoids redundant overlapping SUBSCRIBE packets that can trip broker limits)
            const subs = new Map<string, number>();
            subs.set(SYNC_EVENTS_TOPIC, 1);
            subs.set(SYNC_WILDCARD_TOPIC, 1);
            subs.set(CENTRAL_FLEET_TOPIC, 1);
            subs.set(CENTRAL_DEVICES_TOPIC, 1);
            subs.set(CENTRAL_SETTINGS_TOPIC, 1);
            subs.set(CENTRAL_USERS_TOPIC, 1);
            subs.set(CENTRAL_DELTA_SYNC_TOPIC, 1);
            subs.set('panorama/fleet/sync', 1);
            subs.set('panorama/devices/sync', 1);
            subs.set('panorama/telemetry/#', 0);

            if (this.topic) {
              subs.set(this.topic, 0);
              subs.set(`${this.topic}/s`, 0);
            }
            if (DEFAULT_MQTT_TOPIC) {
              subs.set(DEFAULT_MQTT_TOPIC, 0);
              subs.set(`${DEFAULT_MQTT_TOPIC}/s`, 0);
            }

            // User-selected dynamic subscriptions take precedence with exact chosen topic & QoS
            this.dynamicSubscriptions.forEach((qos, top) => {
              subs.set(top, qos);
            });

            subs.forEach((qos, top) => {
              try {
                client.subscribe(top, { qos });
              } catch (subItemErr) {
                console.warn(`[MQTT] Failed to subscribe to ${top}:`, subItemErr);
              }
            });

            this.topicSubscribed = true;
          } catch (subErr) {
            this.topicSubscribed = false;
            console.error('[MQTT] Failed to restore subscriptions:', subErr);
          }
        },
        onFailure: (err: any) => {
          if (this.client !== client) return;
          this.isConnecting = false;
          this.topicSubscribed = false;
          console.info('[MQTT] Connection attempt failed, will retry with backoff:', err?.errorMessage || err);
          this.setStatus('DISCONNECTED');
          this.cleanupClient();
          this.scheduleReconnect();
        },
      };

      client.connect(connectOptions);
    } catch (err) {
      this.isConnecting = false;
      console.error('[MQTT] Exception starting MQTT connection:', err);
      this.setStatus('DISCONNECTED');
      this.cleanupClient();
      this.scheduleReconnect();
    }
  }

  /**
   * Parse, validate, and dispatch incoming telemetry payload (supports JSON object or array of telemetry objects).
   * Plain-text or non-JSON payloads return null cleanly without throwing or logging console warnings.
   */
  handleIncomingPayload(rawString: string, topicName?: string, preParsed?: any): LiveTelemetryPayload | null {
    let parsed: any = preParsed;
    if (parsed === undefined) {
      if (!rawString || typeof rawString !== 'string') {
        return null;
      }
      const classified = classifyMqttPayload(rawString);
      if (classified.payloadType !== 'JSON') {
        return null;
      }
      parsed = classified.parsedJson;
    }

    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    // Handle JSON array of telemetry records cleanly without crashing
    if (Array.isArray(parsed)) {
      let lastProcessed: LiveTelemetryPayload | null = null;
      for (const item of parsed) {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          const res = this.handleIncomingPayload(rawString, topicName, item);
          if (res) lastProcessed = res;
        }
      }
      return lastProcessed;
    }

    // Validate and sanitize required fields according to contract (supports both STM32 compact keys & WLI HTTPS keys):
    const topicUid = topicName ? topicName.split('/')[0].trim() : '';
    const uid = String(parsed.uid || parsed.deviceId || parsed.device_id || topicUid || DEFAULT_DEVICE_UID).trim();
    const trno = String(parsed.trno || parsed.trainNumber || parsed.train_number || '').trim();
    const chno = String(parsed.chno || parsed.coachNumber || parsed.coach_id || '').trim();

    const gps = parseValidGps(parsed);
    const speed = typeof parsed.speed === 'number' && Number.isFinite(parsed.speed) && parsed.speed >= 0 ? parsed.speed : 0;
    const time = typeof parsed.time === 'string'
      ? parsed.time
      : parsed.timestamp != null
        ? String(parsed.timestamp)
        : new Date().toLocaleTimeString('en-US', { hour12: false });

    const cm1 = typeof parsed.cm1 === 'number' && parsed.cm1 >= 0
      ? parsed.cm1
      : typeof parsed.water_level_cm === 'number' && parsed.water_level_cm >= 0
        ? parsed.water_level_cm
        : (typeof parsed.primaryHeight === 'number' ? parsed.primaryHeight : 0);
    const cm2 = typeof parsed.cm2 === 'number' && parsed.cm2 >= 0 ? parsed.cm2 : (typeof parsed.secondaryHeight === 'number' ? parsed.secondaryHeight : 0);

    const wlp1 = typeof parsed.wlp1 === 'number'
      ? Math.max(0, Math.min(100, parsed.wlp1))
      : typeof parsed.water_level_percentage === 'number'
        ? Math.max(0, Math.min(100, parsed.water_level_percentage))
        : (typeof parsed.primaryLevel === 'number' ? parsed.primaryLevel : 0);
    const wlp2 = typeof parsed.wlp2 === 'number' ? Math.max(0, Math.min(100, parsed.wlp2)) : (typeof parsed.secondaryLevel === 'number' ? parsed.secondaryLevel : 0);

    const wlv1 = typeof parsed.wlv1 === 'boolean' ? parsed.wlv1 : (typeof parsed.wlvl === 'boolean' ? parsed.wlvl : true);
    const wlv2 = typeof parsed.wlv2 === 'boolean' ? parsed.wlv2 : true;

    const bat = typeof parsed.bat === 'number'
      ? Math.max(0, Math.min(100, parsed.bat))
      : typeof parsed.battery_voltage === 'number'
        ? Math.max(0, Math.min(100, parsed.battery_voltage))
        : (typeof parsed.batteryPercent === 'number' ? parsed.batteryPercent : 85);

    // Duplicate message detection
    const signature = `${uid}-${trno}-${chno}-${gps.lat}-${gps.long}-${speed}-${gps.gpsFix}-${cm1}-${cm2}-${wlp1}-${wlp2}-${bat}-${time}`;
    const now = Date.now();
    if (signature === this.lastPayloadSignature && now - this.lastMessageReceivedTime < 1000) {
      return this.lastTelemetry;
    }
    this.lastPayloadSignature = signature;
    this.lastMessageReceivedTime = now;

    const telemetry: LiveTelemetryPayload = {
      uid,
      lat: gps.lat,
      long: gps.long,
      alt: gps.alt,
      sats: gps.sats,
      accuracy: gps.accuracy,
      gpsFix: gps.gpsFix,
      speed,
      time,
      cm1,
      cm2,
      wlp1,
      wlp2,
      wlv1,
      wlv2,
      bat,
      chno,
      trno,
      receivedAt: now,
      isStale: false,
    };

    if (gps.gpsFix && gps.lat !== null && gps.long !== null) {
      const fixRecord: MqttGpsFix = {
        lat: gps.lat,
        long: gps.long,
        alt: gps.alt,
        speed,
        sats: gps.sats,
        accuracy: gps.accuracy,
        time,
        receivedAt: now,
        uid,
        trno,
        chno,
      };
      this.lastValidGps = fixRecord;
      if (trno) {
        this.trainGpsFixes.set(trno.trim(), fixRecord);
        const trainWps = this.trainGpsWaypoints.get(trno.trim()) || [];
        const prevTrn = trainWps[trainWps.length - 1];
        if (!prevTrn || prevTrn.lat !== fixRecord.lat || prevTrn.long !== fixRecord.long) {
          trainWps.push(fixRecord);
          if (trainWps.length > 100) trainWps.shift();
          this.trainGpsWaypoints.set(trno.trim(), trainWps);
        }
      }
      const prev = this.gpsWaypoints[this.gpsWaypoints.length - 1];
      if (!prev || prev.lat !== fixRecord.lat || prev.long !== fixRecord.long) {
        this.gpsWaypoints.push(fixRecord);
        if (this.gpsWaypoints.length > 200) {
          this.gpsWaypoints.shift();
        }
      }
    }

    const maxBuffer = deviceProfileService.getActiveProfile().maxTelemetryHistoryBuffer || 150;
    this.lastTelemetry = telemetry;
    this.historyBuffer.unshift(telemetry);
    if (this.historyBuffer.length > maxBuffer) {
      this.historyBuffer.pop();
    }

    this.setStatus('CONNECTED');
    this.resetStaleTimer();

    // Dispatch to subscribers via adaptive batch scheduler
    this.scheduleTelemetryDispatch(telemetry);

    return telemetry;
  }

  private pendingDispatchTelemetry: LiveTelemetryPayload | null = null;
  private dispatchTimer: any = null;
  private lastDispatchTime: number = 0;

  private scheduleTelemetryDispatch(telemetry: LiveTelemetryPayload): void {
    this.pendingDispatchTelemetry = telemetry;
    const interval = deviceProfileService.getActiveProfile().mqttBatchIntervalMs || 100;
    const now = Date.now();
    const elapsed = now - this.lastDispatchTime;

    if (elapsed >= interval && !this.dispatchTimer) {
      this.flushTelemetryDispatch();
      return;
    }

    if (!this.dispatchTimer) {
      this.dispatchTimer = setTimeout(() => {
        this.dispatchTimer = null;
        this.flushTelemetryDispatch();
      }, Math.max(10, interval - elapsed));
    }
  }

  private flushTelemetryDispatch(): void {
    if (!this.pendingDispatchTelemetry) return;
    const t = this.pendingDispatchTelemetry;
    this.pendingDispatchTelemetry = null;
    this.lastDispatchTime = Date.now();

    this.telemetryListeners.forEach((listener) => {
      try {
        listener(t);
      } catch (listenerErr) {
        console.error('[MQTT] Error in telemetry listener:', listenerErr);
      }
    });
  }

  private resetStaleTimer(): void {
    this.clearStaleTimer();
    this.staleTimer = setTimeout(() => {
      if (this.status === 'CONNECTED') {
        Logger.info('MQTT', 'Watchdog', `No telemetry received for ${STALE_TIMEOUT_MS / 1000}s. Transitioning to STALE standby.`);
        this.setStatus('STALE');
        if (this.lastTelemetry) {
          this.lastTelemetry = { ...this.lastTelemetry, isStale: true };
          this.telemetryListeners.forEach((l) => l(this.lastTelemetry!));
        }
      }
    }, STALE_TIMEOUT_MS);
  }

  private clearStaleTimer(): void {
    if (this.staleTimer) {
      clearTimeout(this.staleTimer);
      this.staleTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.isDestroyed || this.intentionalDisconnect) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

    this.reconnectAttempts++;
    // Exponential backoff: 1s -> 2s -> 4s -> 8s -> 16s -> max 30s
    const delay = Math.min(1000 * Math.pow(2, Math.min(this.reconnectAttempts - 1, 5)), 30000);

    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private setStatus(newStatus: MqttConnectionStatus): void {
    if (this.status !== newStatus) {
      this.status = newStatus;
      this.statusListeners.forEach((listener) => {
        try {
          listener(newStatus);
        } catch (e) {
          console.error('[MQTT] Error in status listener:', e);
        }
      });
    }
  }

  onTelemetry(callback: TelemetryCallback): () => void {
    this.telemetryListeners.add(callback);
    if (this.lastTelemetry) {
      callback(this.lastTelemetry);
    }
    return () => this.telemetryListeners.delete(callback);
  }

  onStatusChange(callback: MqttStatusCallback): () => void {
    this.statusListeners.add(callback);
    callback(this.status);
    return () => this.statusListeners.delete(callback);
  }

  getStatus(): MqttConnectionStatus {
    return this.status;
  }

  isIntentionalDisconnect(): boolean {
    return this.intentionalDisconnect;
  }

  getLastTelemetry(): LiveTelemetryPayload | null {
    return this.lastTelemetry;
  }

  getLastValidGps(): MqttGpsFix | null {
    return this.lastValidGps;
  }

  getTrainGpsFix(trainNumber: string): MqttGpsFix | null {
    if (!trainNumber) return null;
    return this.trainGpsFixes.get(trainNumber.trim()) || null;
  }

  getAllTrainGpsFixes(): Record<string, MqttGpsFix> {
    const res: Record<string, MqttGpsFix> = {};
    this.trainGpsFixes.forEach((val, key) => {
      res[key] = val;
    });
    return res;
  }

  getTrainGpsWaypoints(trainNumber: string): MqttGpsFix[] {
    if (!trainNumber) return [];
    const list = this.trainGpsWaypoints.get(trainNumber.trim());
    return list ? [...list] : [];
  }

  getGpsWaypoints(): MqttGpsFix[] {
    return [...this.gpsWaypoints];
  }

  getTelemetryHistory(filter?: { trno?: string; chno?: string }): LiveTelemetryPayload[] {
    if (!filter) return [...this.historyBuffer];
    return this.historyBuffer.filter((item) => {
      if (filter.trno && item.trno !== filter.trno) return false;
      if (filter.chno && item.chno !== filter.chno) return false;
      return true;
    });
  }

  isTopicSubscribed(): boolean {
    return this.topicSubscribed;
  }

  getTopic(): string {
    return this.topic;
  }

  private handleFleetSync(rawString: string): void {
    try {
      const data = JSON.parse(rawString);
      console.info('[MQTT] Fleet sync frame received:', data);
      for (const cb of this.fleetSyncListeners) {
        try {
          cb(data);
        } catch (e) {
          console.error('[MQTT] Error in fleet sync listener:', e);
        }
      }
    } catch (e) {
      console.warn('[MQTT] Invalid fleet sync JSON payload:', e);
    }
  }

  private handleDeviceSync(rawString: string): void {
    try {
      const data = JSON.parse(rawString);
      console.info('[MQTT] Device sync frame received:', data);
      for (const cb of this.deviceSyncListeners) {
        try {
          cb(data);
        } catch (e) {
          console.error('[MQTT] Error in device sync listener:', e);
        }
      }
    } catch (e) {
      console.warn('[MQTT] Invalid device sync JSON payload:', e);
    }
  }

  onFleetSync(cb: (event: any) => void): () => void {
    this.fleetSyncListeners.add(cb);
    return () => {
      this.fleetSyncListeners.delete(cb);
    };
  }

  onDeviceSync(cb: (event: any) => void): () => void {
    this.deviceSyncListeners.add(cb);
    return () => {
      this.deviceSyncListeners.delete(cb);
    };
  }

  private isDuplicateSyncEvent(eventId?: string, mutationId?: string): boolean {
    const now = Date.now();
    if (this.seenSyncEventIds.size > 500) {
      for (const [id, ts] of this.seenSyncEventIds.entries()) {
        if (now - ts > 60000) {
          this.seenSyncEventIds.delete(id);
        }
      }
    }
    const checkId = eventId || mutationId;
    if (!checkId) return false;
    if (this.seenSyncEventIds.has(checkId)) {
      return true;
    }
    this.seenSyncEventIds.set(checkId, now);
    if (eventId && mutationId) {
      this.seenSyncEventIds.set(mutationId, now);
    }
    return false;
  }

  private handleSyncEvent(rawString: string): void {
    try {
      const event = JSON.parse(rawString);
      if (!event || typeof event !== 'object') return;

      // Normalize ad-hoc frames to standard AuthoritativeSyncEvent envelope
      if (!event.entity_type || !event.event_type) {
        if (event.action === 'create_train') {
          event.event_type = 'TRAIN_CREATED';
          event.entity_type = 'TRAIN';
          event.operation = 'CREATE';
          event.entity_id = event.train?.train_number || event.train_number || '';
          event.payload = event.train || event;
        } else if (event.action === 'update_train') {
          event.event_type = 'TRAIN_UPDATED';
          event.entity_type = 'TRAIN';
          event.operation = 'UPDATE';
          event.entity_id = event.train_number || '';
          event.payload = event.data || event;
        } else if (event.action === 'delete_train') {
          event.event_type = 'TRAIN_DELETED';
          event.entity_type = 'TRAIN';
          event.operation = 'DELETE';
          event.entity_id = event.train_number || '';
          event.payload = event;
        } else if (event.action === 'coach_change') {
          event.entity_type = 'COACH';
          event.entity_id = event.train_number || '';
          event.payload = event;
          if (event.deleted_coach_number) {
            event.event_type = 'COACH_DELETED';
            event.operation = 'DELETE';
          } else if (event.old_coach_number && event.new_coach_number) {
            event.event_type = 'COACH_RENAMED';
            event.operation = 'UPDATE';
          } else if (event.coach_numbers) {
            event.event_type = 'COACHES_REORDERED';
            event.operation = 'REORDER';
          } else if (event.coach_number && (event.coach_category || event.tank_1_name || event.device_uid !== undefined)) {
            event.event_type = 'COACH_CREATED';
            event.operation = 'CREATE';
          } else {
            event.event_type = 'COACH_UPDATED';
            event.operation = 'UPDATE';
          }
        } else if (event.action === 'create_device') {
          event.event_type = 'DEVICE_CREATED';
          event.entity_type = 'DEVICE';
          event.operation = 'CREATE';
          event.entity_id = event.device?.uid || event.uid || '';
          event.payload = event.device || event;
        } else if (event.action === 'update_device') {
          event.event_type = 'DEVICE_UPDATED';
          event.entity_type = 'DEVICE';
          event.operation = 'UPDATE';
          event.entity_id = event.deviceId || event.device?.uid || event.uid || '';
          event.payload = event.data || event.device || event;
        } else if (event.action === 'delete_device') {
          event.event_type = 'DEVICE_DELETED';
          event.entity_type = 'DEVICE';
          event.operation = 'DELETE';
          event.entity_id = event.id || event.uid || '';
          event.payload = event;
        } else if (event.type === 'FLEET_UPDATE') {
          event.event_type = 'FLEET_SYNC';
          event.entity_type = 'TRAIN';
          event.operation = 'UPDATE';
          event.payload = event;
        } else if (event.type === 'DEVICE_UPDATE') {
          event.event_type = 'DEVICE_SYNC';
          event.entity_type = 'DEVICE';
          event.operation = 'UPDATE';
          event.payload = event;
        }
      }

      if (this.isDuplicateSyncEvent(event.event_id, event.mutation_id)) {
        return;
      }
      console.info(`[MQTT] Sync event received [${event.event_type || 'UNKNOWN'}] [${event.entity_type}:${event.entity_id}:${event.operation}]:`, event);
      for (const cb of this.syncEventListeners) {
        try {
          cb(event);
        } catch (e) {
          console.error('[MQTT] Error in sync event listener:', e);
        }
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('panorama:sync-event', { detail: event }));
      }
    } catch (e) {
      console.warn('[MQTT] Invalid sync event JSON payload:', e);
    }
  }

  private handleCentralFleetSync(rawString: string): void {
    try {
      const data = JSON.parse(rawString);
      console.info('[MQTT] Central fleet state frame received');
      for (const cb of this.centralFleetListeners) {
        try {
          cb(data);
        } catch (e) {
          console.error('[MQTT] Error in central fleet sync listener:', e);
        }
      }
    } catch (e) {
      console.warn('[MQTT] Invalid central fleet JSON payload:', e);
    }
  }

  private handleCentralDeviceSync(rawString: string): void {
    try {
      const data = JSON.parse(rawString);
      console.info('[MQTT] Central device state frame received');
      for (const cb of this.centralDeviceListeners) {
        try {
          cb(data);
        } catch (e) {
          console.error('[MQTT] Error in central device sync listener:', e);
        }
      }
    } catch (e) {
      console.warn('[MQTT] Invalid central device JSON payload:', e);
    }
  }

  private handleCentralSettingsSync(rawString: string): void {
    try {
      const data = JSON.parse(rawString);
      console.info('[MQTT] Central settings frame received');
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('panorama_system_config', JSON.stringify(data));
        window.dispatchEvent(new CustomEvent('panorama:settings-updated', { detail: data }));
      }
      for (const cb of this.centralSettingsListeners) {
        try {
          cb(data);
        } catch (e) {
          console.error('[MQTT] Error in central settings sync listener:', e);
        }
      }
    } catch (e) {
      console.warn('[MQTT] Invalid central settings JSON payload:', e);
    }
  }

  private handleCentralUsersSync(rawString: string): void {
    try {
      const data = JSON.parse(rawString);
      console.info('[MQTT] Central users frame received');
      if (typeof window !== 'undefined' && window.localStorage) {
        if (Array.isArray(data.users)) {
          window.localStorage.setItem('panorama_users_store', JSON.stringify(data.users));
        }
        if (Array.isArray(data.registrations)) {
          window.localStorage.setItem('panorama_registrations_store', JSON.stringify(data.registrations));
        }
        window.dispatchEvent(new CustomEvent('panorama:users-updated'));
      }
      for (const cb of this.centralUsersListeners) {
        try {
          cb(data);
        } catch (e) {
          console.error('[MQTT] Error in central users sync listener:', e);
        }
      }
    } catch (e) {
      console.warn('[MQTT] Invalid central users JSON payload:', e);
    }
  }

  private handleCentralDeltaSync(rawString: string): void {
    try {
      const data = JSON.parse(rawString);
      console.info('[MQTT] Central delta sync frame received:', data);
      for (const cb of this.centralDeltaListeners) {
        try {
          cb(data);
        } catch (e) {
          console.error('[MQTT] Error in central delta sync listener:', e);
        }
      }
    } catch (e) {
      console.warn('[MQTT] Invalid central delta sync JSON payload:', e);
    }
  }

  onCentralFleetSync(cb: (event: any) => void): () => void {
    this.centralFleetListeners.add(cb);
    return () => {
      this.centralFleetListeners.delete(cb);
    };
  }

  onCentralDeviceSync(cb: (event: any) => void): () => void {
    this.centralDeviceListeners.add(cb);
    return () => {
      this.centralDeviceListeners.delete(cb);
    };
  }

  onCentralSettingsSync(cb: (event: any) => void): () => void {
    this.centralSettingsListeners.add(cb);
    return () => {
      this.centralSettingsListeners.delete(cb);
    };
  }

  onCentralUsersSync(cb: (event: any) => void): () => void {
    this.centralUsersListeners.add(cb);
    return () => {
      this.centralUsersListeners.delete(cb);
    };
  }

  onCentralDeltaSync(cb: (event: any) => void): () => void {
    this.centralDeltaListeners.add(cb);
    return () => {
      this.centralDeltaListeners.delete(cb);
    };
  }

  onSyncEvent(cb: (event: any) => void): () => void {
    this.syncEventListeners.add(cb);
    return () => {
      this.syncEventListeners.delete(cb);
    };
  }

  publish(topic: string, payload: any, retained: boolean = false, qos: number = 1): boolean {
    if (!this.client || !this.client.isConnected || !this.client.isConnected()) {
      return false;
    }
    try {
      const MessageConstructor =
        (Paho && (Paho.Message || (Paho as any).default?.Message)) ||
        (window as any).Paho?.MQTT?.Message;
      if (!MessageConstructor) return false;
      const str = typeof payload === 'string' ? payload : JSON.stringify(payload);
      const msg = new MessageConstructor(str);
      msg.destinationName = topic;
      msg.qos = qos;
      if (retained) {
        msg.retained = true;
      }
      this.client.send(msg);
      return true;
    } catch (err) {
      console.warn('[MQTT] Failed to publish message:', err);
      return false;
    }
  }

  /**
   * Broadcast an authoritative synchronization event envelope over MQTT bus (QoS 1).
   */
  publishSyncEvent(event: {
    event_id?: string;
    event_type: string;
    entity_type: string;
    entity_id: string;
    operation: string;
    payload: any;
    version?: number;
    timestamp?: string;
    mutation_id?: string;
  }): boolean {
    const fullEvent = {
      event_id: event.event_id || `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      event_type: event.event_type,
      entity_type: event.entity_type,
      entity_id: String(event.entity_id || ''),
      operation: event.operation,
      payload: event.payload || {},
      data: event.payload || {},
      version: event.version || Date.now(),
      timestamp: event.timestamp || new Date().toISOString(),
      mutation_id: event.mutation_id || `mut_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    };

    // Mark as locally seen to prevent self-echo loop
    this.seenSyncEventIds.set(fullEvent.event_id, Date.now());
    this.seenSyncEventIds.set(fullEvent.mutation_id, Date.now());

    // Broadcast across primary sync topics with QoS 1 guarantee
    const p1 = this.publish(SYNC_EVENTS_TOPIC, fullEvent, false, 1);
    this.publish(`panorama/sync/${fullEvent.entity_type.toLowerCase()}`, fullEvent, false, 1);
    this.publish(`panorama/sync/${fullEvent.event_type.toLowerCase()}`, fullEvent, false, 1);
    if (fullEvent.entity_type === 'TRAIN' || fullEvent.entity_type === 'COACH') {
      this.publish('panorama/fleet/sync', fullEvent, false, 1);
      this.publish(CENTRAL_DELTA_SYNC_TOPIC, fullEvent, false, 1);
    } else if (fullEvent.entity_type === 'DEVICE') {
      this.publish('panorama/devices/sync', fullEvent, false, 1);
      this.publish(CENTRAL_DELTA_SYNC_TOPIC, fullEvent, false, 1);
    }
    return p1;
  }

  public subscribeTopic(topic: string, qos: number = 0): boolean {
    const cleanTopic = topic.trim();
    if (!cleanTopic) return false;
    this.dynamicSubscriptions.set(cleanTopic, qos);
    if (this.client && this.client.isConnected && this.client.isConnected()) {
      try {
        this.client.subscribe(cleanTopic, { qos });
        console.info(`[MQTT] Subscribed to topic: ${cleanTopic} (QoS ${qos})`);
        return true;
      } catch (err) {
        console.error(`[MQTT] Failed to subscribe to ${cleanTopic}:`, err);
        return false;
      }
    }
    return true;
  }

  public unsubscribeTopic(topic: string): boolean {
    const cleanTopic = topic.trim();
    if (!cleanTopic) return false;
    this.dynamicSubscriptions.delete(cleanTopic);
    if (this.client && this.client.isConnected && this.client.isConnected()) {
      try {
        this.client.unsubscribe(cleanTopic);
        console.info(`[MQTT] Unsubscribed from topic: ${cleanTopic}`);
        return true;
      } catch (err) {
        console.error(`[MQTT] Failed to unsubscribe from ${cleanTopic}:`, err);
        return false;
      }
    }
    return true;
  }

  public getSubscribedTopics(): string[] {
    return Array.from(this.dynamicSubscriptions.keys());
  }

  public onRawMessage(callback: (frame: RawMqttFrame) => void): () => void {
    this.rawMessageListeners.add(callback);
    return () => {
      this.rawMessageListeners.delete(callback);
    };
  }

  public getRawMessages(): RawMqttFrame[] {
    return [...this.rawMessageHistory];
  }

  public clearRawMessages(): void {
    this.rawMessageHistory = [];
  }

  public injectMessage(topic: string, payload: string | object | Uint8Array, qos: number = 0, retained: boolean = false): RawMqttFrame {
    const receivedDate = new Date();
    const receivedAt = receivedDate.getTime();
    const receivedAtFormatted = formatMqttTimestamp(receivedDate);
    const classified =
      payload instanceof Uint8Array
        ? classifyMqttPayload({ payloadBytes: payload })
        : classifyMqttPayload(payload);

    let deviceTimestamp: string | null = null;
    let uid: string | null = null;
    if (classified.payloadType === 'JSON' && classified.jsonKind === 'object' && classified.parsedJson) {
      const p = classified.parsedJson;
      if (p.time != null) deviceTimestamp = String(p.time);
      else if (p.timestamp != null) deviceTimestamp = String(p.timestamp);
      if (p.uid) uid = String(p.uid);
      else if (p.deviceId) uid = String(p.deviceId);
      else if (p.device_id) uid = String(p.device_id);
    }

    if (!uid && topic) {
      const parts = topic.split('/');
      uid = parts[0] || parts[parts.length - 1] || null;
    }

    const frame: RawMqttFrame = {
      id: `mqtt-${receivedAt}-${Math.random().toString(36).substring(2, 7)}`,
      topic,
      payloadString: classified.payloadString,
      payloadSize: classified.payloadSize,
      payloadType: classified.payloadType,
      jsonKind: classified.jsonKind,
      isEmpty: classified.isEmpty,
      qos,
      retained,
      receivedAt,
      receivedAtFormatted,
      deviceTimestamp,
      uid,
      isJson: classified.isJson,
      parsedJson: classified.parsedJson,
      error: classified.error,
    };

    this.rawMessageHistory.push(frame);
    if (this.rawMessageHistory.length > 1000) {
      this.rawMessageHistory.shift();
    }

    this.rawMessageListeners.forEach((cb) => {
      try {
        cb(frame);
      } catch (err) {
        console.error('[MQTT] Raw message listener error:', err);
      }
    });

    if (classified.payloadType === 'JSON') {
      this.handleIncomingPayload(classified.payloadString, topic, classified.parsedJson);
    }

    return frame;
  }

  public isConnected(): boolean {
    return this.status === 'CONNECTED';
  }

  public getBrokerInfo(): {
    host: string;
    port: number;
    path: string;
    useSSL: boolean;
    status: MqttConnectionStatus;
  } {
    return {
      host: this.brokerHost,
      port: this.brokerPort,
      path: this.brokerPath,
      useSSL: this.useSSL,
      status: this.status,
    };
  }

  public reconfigureBroker(host: string, port: number, path: string = '/mqtt', useSSL: boolean = true): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem('panorama_mqtt_host', host);
      localStorage.setItem('panorama_mqtt_port', String(port));
      localStorage.setItem('panorama_mqtt_ssl', String(useSSL));
    }
    this.brokerHost = host;
    this.brokerPort = port;
    this.brokerPath = path;
    this.useSSL = useSSL;
    this.disconnect();
    setTimeout(() => {
      this.connect();
    }, 500);
  }

  disconnect(): void {
    this.intentionalDisconnect = true;
    this.isDestroyed = true;
    this.isConnecting = false;
    this.topicSubscribed = false;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.clearStaleTimer();
    this.cleanupClient();
    this.setStatus('DISCONNECTED');
  }
}

export const mqttService = MqttService.getInstance();

if (typeof window !== 'undefined') {
  (window as any).panoramaMqttService = mqttService;
}
