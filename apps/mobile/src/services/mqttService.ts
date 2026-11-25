/**
 * Panorama Water Tank Monitor — Unified MQTT Service.
 * Subscribes to live telemetry on topic 0023004D4B42501120353332.
 * Validates, normalizes, and handles reconnects + 30-second stale watchdog.
 */

// @ts-ignore
import Paho from 'paho-mqtt';
import { Logger } from './logger';
import { LiveTelemetryPayload, MqttClientConfiguration, MqttConnectionStatus, MqttGpsFix } from '../types';
import { deviceProfileService } from './deviceProfileService';
import { nativeBridge } from './nativeBridge';

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

export const DEFAULT_MQTT_TOPIC = '0023004D4B42501120353332';
export const DEFAULT_SIMULATOR_TOPIC = '/sensor/topic/soumik';
export const DEFAULT_DEVICE_UID = '0023004D4B42501120353332';
export const LEGACY_DEFAULT_MQTT_TOPIC = '';
export const DEFAULT_STALE_TIMEOUT_MS = 180000; // 180 seconds (matches hardware wak=180s interval + jitter)
export const STALE_TIMEOUT_MS = 180000;

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

export type MqttStatusDisplay =
  | 'Connecting'
  | 'Connected'
  | 'Disconnected'
  | 'Reconnecting'
  | 'Subscription Failed'
  | 'Connection Error'
  | 'Stale';

export function getMqttStatusDisplay(status: MqttConnectionStatus): MqttStatusDisplay {
  switch (status) {
    case 'CONNECTED':
      return 'Connected';
    case 'CONNECTING':
      return 'Connecting';
    case 'RECONNECTING':
      return 'Reconnecting';
    case 'SUBSCRIPTION_ERROR':
      return 'Subscription Failed';
    case 'CONNECTION_ERROR':
      return 'Connection Error';
    case 'STALE':
      return 'Stale';
    default:
      return 'Disconnected';
  }
}

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
  reconnectCount?: number;
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
  status?: MqttConnectionStatus;
  statusDisplay?: MqttStatusDisplay;
  subscribedTopics?: string[];
  subscriptionAck?: boolean;
  subscriptionAckAt?: number | null;
  subscriptionError?: string | null;
  lastMessageAt?: number | null;
  lastParsingError?: string | null;
  parseErrorCount?: number;
  lastUidMismatch?: string | null;
  clientId?: string;
  defaultQos?: 0 | 1 | 2;
  connectionTimeoutSeconds?: number;
  hasPassword?: boolean;
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
  private registeredDeviceUids: Set<string> = new Set([DEFAULT_DEVICE_UID]);
  private confirmedSubscriptions: Set<string> = new Set();
  private seenSyncEventIds: Map<string, number> = new Map();
  private reconnectTimer: any = null;
  private connectTimeoutTimer: any = null;
  private reconfigureTimer: any = null;
  private staleTimer: any = null;
  private reconnectAttempts = 0;
  private lastTelemetry: LiveTelemetryPayload | null = null;
  private lastTelemetryByUid: Map<string, LiveTelemetryPayload> = new Map();
  private lastReceivedAtByUid: Map<string, number> = new Map();
  private staleEmittedUids: Set<string> = new Set();
  private offlineEmittedUids: Set<string> = new Set();
  private lastValidGps: MqttGpsFix | null = null;
  private gpsWaypoints: MqttGpsFix[] = [];
  private trainGpsFixes: Map<string, MqttGpsFix> = new Map();
  private trainGpsWaypoints: Map<string, MqttGpsFix[]> = new Map();
  private lastPayloadSignature = '';
  private lastMessageReceivedTime = 0;
  private messagesReceivedTotal = 0;
  private messagesSentTotal = 0;
  private lastError: string | null = null;
  private lastConnectedAt: number | null = null;
  private lastDisconnectedAt: number | null = null;
  private connectionLatencyMs = 0;
  private subscriptionAck = false;
  private subscriptionAckAt: number | null = null;
  private subscriptionError: string | null = null;
  private lastParsingError: string | null = null;
  private parseErrorCount = 0;
  private lastUidMismatch: string | null = null;
  private historyBuffer: LiveTelemetryPayload[] = [];
  private isDestroyed = false;
  private isConnecting = false;
  private intentionalDisconnect = false;
  private networkListenersBound = false;
  private unsubscribeNativeNetwork: (() => void) | null = null;

  private brokerHost: string = 'broker.hivemq.com';
  private brokerPort: number = 8884;
  private brokerPath: string = '/mqtt';
  private useSSL: boolean = true;
  private clientId: string = '';
  private username: string = '';
  private password: string = '';
  private keepAliveSeconds: number = 30;
  private connectionTimeoutSeconds: number = 12;
  private defaultQos: 0 | 1 | 2 = 0;
  private autoReconnect: boolean = true;
  private topic: string = DEFAULT_MQTT_TOPIC;
  private watchdogOverrideMs: number | null = null;

  public getWatchdogTimeoutMs(): number {
    if (this.watchdogOverrideMs !== null && Number.isFinite(this.watchdogOverrideMs)) {
      return Math.max(5000, this.watchdogOverrideMs);
    }
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const saved = window.localStorage.getItem('panorama_telemetry_timeout_sec');
        if (saved) {
          const parsed = parseInt(saved, 10);
          if (Number.isFinite(parsed) && parsed >= 10 && parsed <= 3600) {
            return parsed * 1000;
          }
        }
      } catch {}
    }
    return DEFAULT_STALE_TIMEOUT_MS;
  }

  public setWatchdogTimeoutMs(ms: number | null): void {
    this.watchdogOverrideMs = ms !== null && Number.isFinite(ms) ? Math.max(5000, ms) : null;
    if (this.status === 'CONNECTED' && this.lastTelemetry && !this.lastTelemetry.isStale) {
      this.resetStaleTimer();
    }
  }

  private constructor() {
    this.initConfiguration();
    this.bindNetworkListeners();
  }

  private bindNetworkListeners(): void {
    if (this.networkListenersBound || typeof window === 'undefined') return;
    this.networkListenersBound = true;

    let lastNativeConnected: boolean | null = null;
    const triggerImmediateReconnect = (reason: string) => {
      if (this.intentionalDisconnect || this.isDestroyed || this.isConnecting) return;
      if (this.client && this.client.isConnected && this.client.isConnected() && this.status === 'CONNECTED') return;
      console.info(`[MQTT] ${reason} — restoring MQTT broker connection...`);
      this.reconnectAttempts = 0;
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
      this.cleanupClient();
      this.connect();
    };

    const handleNetworkDrop = (reason: string) => {
      clearTimeout(this.reconnectTimer);
      clearTimeout(this.connectTimeoutTimer);
      this.reconnectTimer = null;
      this.connectTimeoutTimer = null;
      this.topicSubscribed = false;
      this.subscriptionAck = false;
      this.confirmedSubscriptions.clear();
      this.clearStaleTimer();
      this.isConnecting = false;
      this.cleanupClient();
      this.lastDisconnectedAt = Date.now();
      this.lastError = reason;
      this.setStatus('DISCONNECTED');
    };

    window.addEventListener('online', () => {
      triggerImmediateReconnect('Browser network online');
    });

    window.addEventListener('offline', () => {
      handleNetworkDrop('Network connection lost (offline)');
    });

    window.addEventListener('panorama:app_resumed', () => {
      if (this.intentionalDisconnect || this.isDestroyed) return;
      if (this.client && this.client.isConnected && this.client.isConnected() && this.status === 'CONNECTED') {
        this.restoreSubscriptions(this.client);
      } else {
        triggerImmediateReconnect('Capacitor app resumed in foreground');
      }
    });

    window.addEventListener('panorama:app_paused', () => {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    });

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          triggerImmediateReconnect('Document became visible');
        }
      });
    }

    this.unsubscribeNativeNetwork = nativeBridge.onNetworkChange((netStatus) => {
      if (netStatus.connected) {
        const wasOffline = lastNativeConnected === false;
        lastNativeConnected = true;
        if (!wasOffline && (this.isConnecting || (this.client?.isConnected?.() && this.status === 'CONNECTED'))) {
          return;
        }
        triggerImmediateReconnect(`Capacitor network restored (${netStatus.connectionType})`);
      } else {
        lastNativeConnected = false;
        handleNetworkDrop('Mobile network offline');
      }
    });

    window.addEventListener('beforeunload', () => {
      this.unsubscribeNativeNetwork?.();
      this.disconnect();
    });
  }

  private cleanupClient(): void {
    clearTimeout(this.connectTimeoutTimer);
    this.connectTimeoutTimer = null;
    this.isConnecting = false;
    const oldClient = this.client;
    this.client = null;
    this.confirmedSubscriptions.clear();
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
      const savedPath = localStorage.getItem('panorama_mqtt_path');
      const savedTopic = localStorage.getItem('panorama_mqtt_topic');
      const savedSsl = localStorage.getItem('panorama_mqtt_ssl');
      const savedClientId = localStorage.getItem('panorama_mqtt_client_id');
      const savedUsername = localStorage.getItem('panorama_mqtt_username');
      const savedKeepAlive = localStorage.getItem('panorama_mqtt_keepalive');
      const savedTimeout = localStorage.getItem('panorama_mqtt_timeout');
      const savedQos = localStorage.getItem('panorama_mqtt_qos');
      const savedAutoReconnect = localStorage.getItem('panorama_mqtt_auto_reconnect');

      if (savedHost) this.brokerHost = savedHost.trim();
      if (savedPort) {
        const parsedPort = parseInt(savedPort, 10);
        if (Number.isFinite(parsedPort) && parsedPort > 0 && parsedPort <= 65535) {
          this.brokerPort = parsedPort;
        }
      }
      if (savedPath) this.brokerPath = savedPath.startsWith('/') ? savedPath : `/${savedPath}`;
      if (savedSsl !== null) this.useSSL = savedSsl === 'true';
      if (savedClientId) this.clientId = savedClientId.trim();
      if (savedUsername) this.username = savedUsername;
      if (savedKeepAlive) {
        const ka = parseInt(savedKeepAlive, 10);
        if (Number.isFinite(ka) && ka >= 5 && ka <= 3600) this.keepAliveSeconds = ka;
      }
      if (savedTimeout) {
        const to = parseInt(savedTimeout, 10);
        if (Number.isFinite(to) && to >= 3 && to <= 120) this.connectionTimeoutSeconds = to;
      }
      if (savedQos === '0' || savedQos === '1' || savedQos === '2') {
        this.defaultQos = Number(savedQos) as 0 | 1 | 2;
      }
      if (savedAutoReconnect !== null) {
        this.autoReconnect = savedAutoReconnect !== 'false';
      }

      try {
        if (typeof window.sessionStorage !== 'undefined') {
          const sec = window.sessionStorage.getItem('panorama_mqtt_session_secret');
          if (sec) this.password = sec;
        }
      } catch {
        // ignore restricted sessionStorage
      }

      // Browser/WebView Paho requires MQTT over WebSockets; normalize raw TCP HiveMQ ports if previously saved
      if (this.brokerHost === 'broker.hivemq.com' && (this.brokerPort === 8883 || this.brokerPort === 1883)) {
        this.brokerPort = this.brokerPort === 1883 && !this.useSSL ? 8000 : 8884;
        this.useSSL = this.brokerPort === 8884;
        this.brokerPath = '/mqtt';
      }

      if (savedTopic) {
        this.topic = savedTopic.trim();
      } else {
        this.topic = DEFAULT_MQTT_TOPIC;
      }

      const savedSelectedDevice = localStorage.getItem('panorama_mqtt_selected_device');
      const savedTargetTopic = localStorage.getItem('panorama_mqtt_target_topic');
      if (savedSelectedDevice && savedSelectedDevice.trim()) {
        this.dynamicSubscriptions.set(savedSelectedDevice.trim(), this.defaultQos);
      }
      if (savedTargetTopic && savedTargetTopic.trim()) {
        this.dynamicSubscriptions.set(savedTargetTopic.trim(), this.defaultQos);
      }

      // Seed registered device UIDs from localStorage without creating circular imports
      try {
        const regRaw = localStorage.getItem('panorama_device_registry');
        if (regRaw) {
          const arr = JSON.parse(regRaw);
          if (Array.isArray(arr)) {
            arr.forEach((d: any) => {
              const uid = typeof d?.uid === 'string' ? d.uid.trim().toUpperCase() : '';
              if (/^[0-9A-Fa-f]{24}$/.test(uid) && d?.registrationStatus !== 'DISCOVERED') {
                this.registeredDeviceUids.add(uid);
              }
            });
          }
        }
      } catch {
        // ignore storage parse failure
      }
    }
    this.dynamicSubscriptions.set(DEFAULT_MQTT_TOPIC, this.defaultQos);
    this.dynamicSubscriptions.set(`${DEFAULT_MQTT_TOPIC}/#`, this.defaultQos);
    this.dynamicSubscriptions.set(DEFAULT_SIMULATOR_TOPIC, this.defaultQos);
    if (this.topic && this.topic !== DEFAULT_MQTT_TOPIC) {
      this.dynamicSubscriptions.set(this.topic, this.defaultQos);
    }
  }

  private isInternalSyncTopic(topic: string): boolean {
    return (
      topic === SYNC_EVENTS_TOPIC ||
      topic.startsWith('panorama/sync/') ||
      topic === CENTRAL_FLEET_TOPIC ||
      topic === CENTRAL_DEVICES_TOPIC ||
      topic === CENTRAL_SETTINGS_TOPIC ||
      topic === CENTRAL_USERS_TOPIC ||
      topic === CENTRAL_DELTA_SYNC_TOPIC ||
      topic === 'panorama/fleet/sync' ||
      topic === 'panorama/devices/sync'
    );
  }

  private subscribeWithAck(client: any, topic: string, qos: number, isRetry: boolean = false): void {
    if (!client || !client.isConnected || !client.isConnected()) return;
    const clean = topic.trim();
    if (!clean) return;
    const isTelemetryTarget = !this.isInternalSyncTopic(clean);
    if (this.confirmedSubscriptions.has(clean) && !isRetry) {
      return;
    }
    this.confirmedSubscriptions.add(clean);

    try {
      client.subscribe(clean, {
        qos,
        timeout: 10,
        onSuccess: () => {
          if (this.client !== client) return;
          this.confirmedSubscriptions.add(clean);
          if (isTelemetryTarget) {
            this.topicSubscribed = true;
            this.subscriptionAck = true;
            this.subscriptionAckAt = Date.now();
            this.subscriptionError = null;
            if (this.status === 'SUBSCRIPTION_ERROR') {
              this.setStatus('CONNECTED');
            }
          }
          console.info(`[MQTT] SUBACK confirmed for topic: ${clean} (QoS ${qos})`);
        },
        onFailure: (err: any) => {
          if (this.client !== client) return;
          this.confirmedSubscriptions.delete(clean);
          const errMsg = err?.errorMessage || 'Broker rejected subscription';
          if (isTelemetryTarget) {
            this.subscriptionError = `Topic "${clean}": ${errMsg}`;
            this.lastError = this.subscriptionError;
            console.warn(`[MQTT] Subscription rejected for ${clean}:`, errMsg);
            const hasConfirmedTelemetry = Array.from(this.confirmedSubscriptions).some(
              (t) => !this.isInternalSyncTopic(t)
            );
            if (!hasConfirmedTelemetry) {
              this.topicSubscribed = false;
              this.subscriptionAck = false;
              this.setStatus('SUBSCRIPTION_ERROR');
            }
            if (!isRetry && clean === DEFAULT_MQTT_TOPIC) {
              setTimeout(() => {
                if (this.client === client && client.isConnected?.() && !this.confirmedSubscriptions.has(clean)) {
                  this.subscribeWithAck(client, clean, 0, true);
                }
              }, 3000);
            }
          }
        },
      });
    } catch (subErr: any) {
      if (isTelemetryTarget) {
        this.subscriptionError = `Topic "${clean}": ${subErr?.message || 'Subscribe exception'}`;
        this.lastError = this.subscriptionError;
        this.setStatus('SUBSCRIPTION_ERROR');
      }
    }
  }

  private buildSubscriptionMap(): Map<string, number> {
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

    if (DEFAULT_MQTT_TOPIC) {
      subs.set(DEFAULT_MQTT_TOPIC, this.defaultQos);
      subs.set(`${DEFAULT_MQTT_TOPIC}/#`, this.defaultQos);
    }
    if (DEFAULT_SIMULATOR_TOPIC) {
      subs.set(DEFAULT_SIMULATOR_TOPIC, this.defaultQos);
    }
    this.registeredDeviceUids.forEach((uid) => {
      if (uid) {
        subs.set(uid, this.defaultQos);
        subs.set(`${uid}/#`, this.defaultQos);
      }
    });
    if (this.topic) {
      subs.set(this.topic, this.defaultQos);
    }
    this.dynamicSubscriptions.forEach((qos, top) => {
      if (top) subs.set(top, qos);
    });
    return subs;
  }

  private restoreSubscriptions(client: any): void {
    const subs = this.buildSubscriptionMap();
    subs.forEach((qos, top) => {
      if (!this.confirmedSubscriptions.has(top)) {
        this.subscribeWithAck(client, top, qos);
      }
    });
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
      this.lastError = 'Device network offline';
      this.setStatus('DISCONNECTED');
      return;
    }

    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    clearTimeout(this.connectTimeoutTimer);
    this.connectTimeoutTimer = null;

    // Clean up any stale client instance before creating a fresh one (prevents duplicate clients/ghost disconnects)
    this.cleanupClient();

    this.isConnecting = true;
    this.subscriptionAck = false;
    this.topicSubscribed = false;
    this.subscriptionError = null;
    this.setStatus('CONNECTING');

    const connectStartedAt = Date.now();
    const clientId = this.clientId.trim() || `panorama-web-${Math.random().toString(16).substring(2, 10)}`;

    try {
      const ClientConstructor = (Paho && (Paho.Client || (Paho as any).default?.Client)) || (window as any).Paho?.MQTT?.Client;
      if (!ClientConstructor) {
        this.isConnecting = false;
        this.lastError = 'MQTT WebSocket client unavailable in runtime';
        console.warn('[MQTT] Paho.Client constructor not available in runtime.');
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
        clearTimeout(this.connectTimeoutTimer);
        this.connectTimeoutTimer = null;
        this.isConnecting = false;
        this.topicSubscribed = false;
        this.subscriptionAck = false;
        this.confirmedSubscriptions.clear();
        this.clearStaleTimer();
        this.lastDisconnectedAt = Date.now();

        if (this.intentionalDisconnect || this.isDestroyed || responseObject?.errorCode === 0) {
          this.setStatus('DISCONNECTED');
          return;
        }

        const errorMsg = responseObject?.errorMessage || 'WebSocket connection lost unexpectedly';
        this.lastError = errorMsg;
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
          this.messagesReceivedTotal += 1;
          this.lastMessageReceivedTime = receivedAt;
          const receivedAtFormatted = formatMqttTimestamp(receivedDate);

          // Step 1 & 2: Safely decode & classify payload (JSON | TEXT | BINARY | INVALID)
          const classified = classifyMqttPayload(message);
          if (classified.payloadType === 'INVALID') {
            this.parseErrorCount += 1;
            this.lastParsingError = `${destination}: ${classified.error || 'Invalid JSON payload'}`;
            console.warn('[MQTT] JSON syntax error:', this.lastParsingError);
          }

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
            uid = parts.find((seg: string) => /^[0-9A-Fa-f]{24}$/.test(seg)) || parts[0] || parts[parts.length - 1] || null;
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

          // Step 4: Only pass valid JSON payloads to sync & telemetry interpreters
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

      const timeoutMs = Math.max(3, this.connectionTimeoutSeconds) * 1000;
      this.connectTimeoutTimer = setTimeout(() => {
        if (this.client === client && this.isConnecting) {
          this.isConnecting = false;
          this.lastError = `Connection timeout after ${this.connectionTimeoutSeconds}s`;
          this.lastDisconnectedAt = Date.now();
          console.warn('[MQTT]', this.lastError);
          this.cleanupClient();
          this.scheduleReconnect();
        }
      }, timeoutMs);

      const connectOptions: any = {
        useSSL: this.useSSL,
        timeout: this.connectionTimeoutSeconds,
        keepAliveInterval: this.keepAliveSeconds,
        cleanSession: true,
        ...(this.username.trim()
          ? {
              userName: this.username.trim(),
              ...(this.password.length > 0 ? { password: this.password } : {}),
            }
          : {}),
        onSuccess: () => {
          if (this.client !== client || this.intentionalDisconnect) return;
          clearTimeout(this.connectTimeoutTimer);
          this.connectTimeoutTimer = null;
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          this.lastConnectedAt = Date.now();
          this.connectionLatencyMs = Math.max(1, this.lastConnectedAt - connectStartedAt);
          this.lastError = null;
          this.setStatus('CONNECTED');
          console.info(`[MQTT] Connected (${this.useSSL ? 'wss' : 'ws'}://${this.brokerHost}:${this.brokerPort}${this.brokerPath}) in ${this.connectionLatencyMs}ms. Subscribing...`);
          this.restoreSubscriptions(client);
        },
        onFailure: (err: any) => {
          if (this.client !== client) return;
          clearTimeout(this.connectTimeoutTimer);
          this.connectTimeoutTimer = null;
          this.isConnecting = false;
          this.topicSubscribed = false;
          this.subscriptionAck = false;
          this.lastDisconnectedAt = Date.now();
          const rawErr = err?.errorMessage || 'Broker TLS/WebSocket connection failed';
          this.lastError = this.password ? rawErr.split(this.password).join('[REDACTED]') : rawErr;
          console.info('[MQTT] Connection attempt failed:', this.lastError);
          this.cleanupClient();
          this.scheduleReconnect();
        },
      };

      client.connect(connectOptions);
    } catch (err: any) {
      clearTimeout(this.connectTimeoutTimer);
      this.connectTimeoutTimer = null;
      this.isConnecting = false;
      this.lastDisconnectedAt = Date.now();
      this.lastError = err?.message || 'Exception starting MQTT connection';
      console.error('[MQTT] Exception starting MQTT connection:', err);
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

    // Non-telemetry config/control packets (e.g. {"wak":180,"wtrhig":100,"ser":"0"}) belong in Raw Monitor only
    const telemetryMetricKeys = [
      'cm1', 'cm2', 'wlp1', 'wlp2', 'wlv1', 'wlv2', 'bat', 'temp', 'press',
      'lat', 'long', 'lon', 'speed', 'water_level_cm', 'water_level_percentage',
      'primaryHeight', 'secondaryHeight', 'primaryLevel', 'secondaryLevel',
      'battery_voltage', 'batteryPercent',
    ];
    if (!telemetryMetricKeys.some((k) => parsed[k] !== undefined)) {
      return null;
    }

    const validationErrors: string[] = [];
    const readFiniteNumber = (keys: string[], fieldLabel: string, min?: number, max?: number): number | null => {
      for (const k of keys) {
        if (parsed[k] !== undefined && parsed[k] !== null) {
          const rawVal = parsed[k];
          const v =
            typeof rawVal === 'number'
              ? rawVal
              : typeof rawVal === 'string' && rawVal.trim() !== ''
              ? Number(rawVal.trim())
              : NaN;
          if (!Number.isFinite(v)) {
            validationErrors.push(`${fieldLabel}: expected number, got ${typeof rawVal}`);
            return null;
          }
          if (min !== undefined && v < min) {
            validationErrors.push(`${fieldLabel}: value ${v} below ${min}`);
            return null;
          }
          if (max !== undefined && v > max) {
            return Math.min(max, v);
          }
          return v;
        }
      }
      return null;
    };

    const readStrictBoolean = (keys: string[], fieldLabel: string): boolean | null => {
      for (const k of keys) {
        if (parsed[k] !== undefined && parsed[k] !== null) {
          const v = parsed[k];
          if (typeof v !== 'boolean') {
            validationErrors.push(`${fieldLabel}: expected boolean, got ${typeof v}`);
            return null;
          }
          return v;
        }
      }
      return null;
    };

    // Validate and extract UID, compare topic UID vs payload UID without silently discarding valid messages
    const topicSegments = topicName ? topicName.split('/').map((s) => s.trim()).filter(Boolean) : [];
    const topicUid = topicSegments.find((s) => /^[0-9A-Fa-f]{24}$/.test(s)) || (topicSegments.length === 1 ? topicSegments[0] : '');
    const rawPayloadUid = parsed.uid ?? parsed.deviceId ?? parsed.device_id;
    const payloadUid = rawPayloadUid != null && typeof rawPayloadUid === 'string' ? rawPayloadUid.trim() : '';
    if (rawPayloadUid !== undefined && rawPayloadUid !== null && typeof rawPayloadUid !== 'string') {
      validationErrors.push(`uid: expected string, got ${typeof rawPayloadUid}`);
    }

    const uidMismatch = Boolean(
      payloadUid &&
      topicUid &&
      /^[0-9A-Fa-f]{24}$/.test(topicUid) &&
      payloadUid.toUpperCase() !== topicUid.toUpperCase()
    );
    if (uidMismatch) {
      this.lastUidMismatch = `Topic UID (${topicUid}) != Payload UID (${payloadUid}) at ${formatMqttTimestamp()}`;
      console.warn('[MQTT]', this.lastUidMismatch);
    }

    const uid = (payloadUid || topicUid || DEFAULT_DEVICE_UID).trim().toUpperCase();
    const trno = String(parsed.trno ?? parsed.trainNumber ?? parsed.train_number ?? '').trim();
    const chno = String(parsed.chno ?? parsed.coachNumber ?? parsed.coach_id ?? '').trim();

    const gps = parseValidGps(parsed);
    const speed = readFiniteNumber(['speed'], 'speed', 0);
    const time = typeof parsed.time === 'string'
      ? parsed.time
      : parsed.timestamp != null
        ? String(parsed.timestamp)
        : new Date().toLocaleTimeString('en-US', { hour12: false });

    const cm1 = readFiniteNumber(['cm1', 'water_level_cm', 'primaryHeight'], 'cm1', 0);
    const cm2 = readFiniteNumber(['cm2', 'secondaryHeight'], 'cm2', 0);
    const wlp1 = readFiniteNumber(['wlp1', 'water_level_percentage', 'primaryLevel'], 'wlp1', 0, 100);
    const wlp2 = readFiniteNumber(['wlp2', 'secondaryLevel'], 'wlp2', 0, 100);
    const wlv1 = readStrictBoolean(['wlv1', 'wlvl'], 'wlv1');
    const wlv2 = readStrictBoolean(['wlv2'], 'wlv2');
    const bat = readFiniteNumber(['bat', 'battery_voltage', 'batteryPercent'], 'bat', 0, 100);
    const temp = readFiniteNumber(['temp', 'temperature', 'temperature_c'], 'temp');
    const press = readFiniteNumber(['press', 'pressure', 'atmPressure'], 'press');

    if (validationErrors.length > 0) {
      this.parseErrorCount += 1;
      this.lastParsingError = `${topicName || uid}: ${validationErrors.join('; ')}`;
      console.warn('[MQTT] Telemetry field validation warning:', this.lastParsingError);
    }

    const hasAnySensorReading =
      cm1 !== null || cm2 !== null || wlp1 !== null || wlp2 !== null ||
      bat !== null || temp !== null || press !== null || gps.gpsFix;
    if (!hasAnySensorReading) {
      return null;
    }

    // Duplicate message detection
    const signature = `${uid}-${trno}-${chno}-${gps.lat}-${gps.long}-${speed}-${gps.gpsFix}-${cm1}-${cm2}-${wlp1}-${wlp2}-${wlv1}-${wlv2}-${bat}-${temp}-${press}-${time}`;
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
      temp,
      press,
      chno,
      trno,
      receivedAt: now,
      isStale: false,
      topic: topicName || undefined,
      topicUid: topicUid || undefined,
      uidMismatch,
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
    const uidKey = (telemetry.uid || DEFAULT_DEVICE_UID).trim().toUpperCase();
    this.lastTelemetry = telemetry;
    this.lastTelemetryByUid.set(uidKey, telemetry);
    this.lastReceivedAtByUid.set(uidKey, now);
    this.staleEmittedUids.delete(uidKey);
    this.offlineEmittedUids.delete(uidKey);
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

  // Map by UID so concurrent telemetry bursts from multiple devices never overwrite each other.
  private pendingDispatchTelemetry: Map<string, LiveTelemetryPayload> = new Map();
  private dispatchTimer: any = null;
  private lastDispatchTime: number = 0;

  private scheduleTelemetryDispatch(telemetry: LiveTelemetryPayload): void {
    const uidKey = telemetry.uid?.trim().toUpperCase() || telemetry.topic || 'UNKNOWN';
    this.pendingDispatchTelemetry.set(uidKey, telemetry);
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
    if (this.pendingDispatchTelemetry.size === 0) return;
    const batch = Array.from(this.pendingDispatchTelemetry.values());
    this.pendingDispatchTelemetry.clear();
    this.lastDispatchTime = Date.now();

    batch.forEach((t) => {
      this.telemetryListeners.forEach((listener) => {
        try {
          listener(t);
        } catch (listenerErr) {
          console.error('[MQTT] Error in telemetry listener:', listenerErr);
        }
      });
    });
  }

  private resetStaleTimer(): void {
    this.clearStaleTimer();
    const timeoutMs = this.getWatchdogTimeoutMs();
    const offlineMs = timeoutMs * 2;
    const now = Date.now();
    let nextDelayMs = Number.POSITIVE_INFINITY;

    this.lastReceivedAtByUid.forEach((receivedAt, uid) => {
      if (!this.staleEmittedUids.has(uid)) {
        nextDelayMs = Math.min(nextDelayMs, Math.max(50, receivedAt + timeoutMs - now));
      } else if (!this.offlineEmittedUids.has(uid)) {
        nextDelayMs = Math.min(nextDelayMs, Math.max(50, receivedAt + offlineMs - now));
      }
    });

    if (!Number.isFinite(nextDelayMs)) {
      if (!this.lastTelemetry || this.lastTelemetry.isStale) return;
      nextDelayMs = timeoutMs;
    }

    this.staleTimer = setTimeout(() => {
      const checkNow = Date.now();
      const staleLimitMs = this.getWatchdogTimeoutMs();
      const offlineLimitMs = staleLimitMs * 2;
      let anyFresh = false;
      let hasPendingOffline = false;

      this.lastReceivedAtByUid.forEach((receivedAt, uid) => {
        const elapsed = checkNow - receivedAt;
        const payload = this.lastTelemetryByUid.get(uid);
        if (elapsed < staleLimitMs) {
          anyFresh = true;
          hasPendingOffline = true;
          return;
        }
        if (elapsed >= offlineLimitMs) {
          if (!this.offlineEmittedUids.has(uid)) {
            this.offlineEmittedUids.add(uid);
            this.staleEmittedUids.add(uid);
            if (payload) {
              const expired = { ...payload, isStale: true, isOfflineTimeout: true } as LiveTelemetryPayload & { isOfflineTimeout?: boolean };
              this.lastTelemetryByUid.set(uid, expired);
              if (this.lastTelemetry?.uid?.trim().toUpperCase() === uid) {
                this.lastTelemetry = expired;
              }
              this.telemetryListeners.forEach((l) => l(expired));
            }
          }
          return;
        }
        hasPendingOffline = true;
        if (!this.staleEmittedUids.has(uid)) {
          this.staleEmittedUids.add(uid);
          if (payload) {
            const stalePayload: LiveTelemetryPayload = { ...payload, isStale: true };
            this.lastTelemetryByUid.set(uid, stalePayload);
            if (this.lastTelemetry?.uid?.trim().toUpperCase() === uid) {
              this.lastTelemetry = stalePayload;
            }
            this.telemetryListeners.forEach((l) => l(stalePayload));
          }
        }
      });

      if (!anyFresh && this.status === 'CONNECTED') {
        Logger.info('MQTT', 'Watchdog', `No telemetry received for ${Math.round(staleLimitMs / 1000)}s. Transitioning to STALE standby.`);
        this.setStatus('STALE');
        if (this.lastTelemetry && !this.lastTelemetry.isStale) {
          this.lastTelemetry = { ...this.lastTelemetry, isStale: true };
          this.telemetryListeners.forEach((l) => l(this.lastTelemetry!));
        }
      }

      if (hasPendingOffline && (this.status === 'CONNECTED' || this.status === 'STALE')) {
        this.resetStaleTimer();
      }
    }, nextDelayMs);
  }

  private clearStaleTimer(): void {
    if (this.staleTimer) {
      clearTimeout(this.staleTimer);
      this.staleTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.isDestroyed || this.intentionalDisconnect) {
      this.setStatus('DISCONNECTED');
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.setStatus('DISCONNECTED');
      return;
    }
    if (!this.autoReconnect) {
      this.setStatus(this.lastError ? 'CONNECTION_ERROR' : 'DISCONNECTED');
      return;
    }

    this.reconnectAttempts++;
    // Exponential backoff: 1s -> 2s -> 4s -> 8s -> 16s -> max 30s
    const delay = Math.min(1000 * Math.pow(2, Math.min(this.reconnectAttempts - 1, 5)), 30000);
    this.setStatus('RECONNECTING');

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

  getLatestTelemetryForUid(uid: string): LiveTelemetryPayload | null {
    const clean = (uid || '').trim().toUpperCase();
    if (!clean) return null;
    return this.lastTelemetryByUid.get(clean) || null;
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

  public syncRegisteredDeviceUids(uids: string[]): void {
    const next = new Set<string>([DEFAULT_DEVICE_UID]);
    uids.forEach((raw) => {
      const clean = typeof raw === 'string' ? raw.trim() : '';
      if (/^[0-9A-Fa-f]{24}$/.test(clean)) {
        next.add(clean.toUpperCase());
      }
    });

    const isConnected = Boolean(this.client && this.client.isConnected && this.client.isConnected());
    next.forEach((uid) => {
      const subTopic = `${uid}/#`;
      if (!this.registeredDeviceUids.has(uid) || (isConnected && !this.confirmedSubscriptions.has(uid))) {
        this.registeredDeviceUids.add(uid);
        if (isConnected) {
          this.subscribeWithAck(this.client, uid, 0);
        }
      }
      if (isConnected && !this.confirmedSubscriptions.has(subTopic)) {
        this.subscribeWithAck(this.client, subTopic, 0);
      }
    });

    this.registeredDeviceUids.forEach((oldUid) => {
      if (!next.has(oldUid)) {
        this.registeredDeviceUids.delete(oldUid);
        if (isConnected && oldUid !== this.topic && !this.dynamicSubscriptions.has(oldUid)) {
          try {
            this.client.unsubscribe(oldUid);
            this.confirmedSubscriptions.delete(oldUid);
            this.client.unsubscribe(`${oldUid}/#`);
            this.confirmedSubscriptions.delete(`${oldUid}/#`);
          } catch {}
        }
      }
    });
  }

  public subscribeTopic(topic: string, qos: number = 0): boolean {
    const cleanTopic = topic.trim();
    if (!cleanTopic) return false;
    this.dynamicSubscriptions.set(cleanTopic, qos);
    if (this.client && this.client.isConnected && this.client.isConnected()) {
      this.subscribeWithAck(this.client, cleanTopic, qos);
      return true;
    }
    return true;
  }

  public unsubscribeTopic(topic: string, forceUnsubscribeRegistered: boolean = false): boolean {
    const cleanTopic = topic.trim();
    if (!cleanTopic) return false;
    const normUpper = cleanTopic.toUpperCase();
    const baseUid = normUpper.endsWith('/#') ? normUpper.slice(0, -2) : normUpper;
    const isProtectedCoreTopic =
      cleanTopic === DEFAULT_MQTT_TOPIC ||
      cleanTopic === `${DEFAULT_MQTT_TOPIC}/#` ||
      cleanTopic === DEFAULT_SIMULATOR_TOPIC ||
      this.registeredDeviceUids.has(baseUid);
    if (!forceUnsubscribeRegistered && isProtectedCoreTopic) {
      return true;
    }
    this.dynamicSubscriptions.delete(cleanTopic);
    if (this.client && this.client.isConnected && this.client.isConnected()) {
      try {
        this.client.unsubscribe(cleanTopic);
        this.confirmedSubscriptions.delete(cleanTopic);
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
    const merged = new Set<string>([
      ...this.confirmedSubscriptions,
      ...this.registeredDeviceUids,
      ...this.dynamicSubscriptions.keys(),
    ]);
    return Array.from(merged).filter((t) => !this.isInternalSyncTopic(t));
  }

  public getRegisteredTelemetryTopics(): string[] {
    return Array.from(new Set<string>([...this.registeredDeviceUids, ...this.dynamicSubscriptions.keys()]));
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

  public getBrokerDiagnostics(): MqttBrokerDiagnostics {
    const now = Date.now();
    const isConnected = this.status === 'CONNECTED' || this.status === 'STALE';
    return {
      brokerName: this.brokerHost === 'broker.hivemq.com' ? 'HiveMQ Public Broker' : this.brokerHost,
      host: this.brokerHost,
      port: this.brokerPort,
      path: this.brokerPath,
      protocol: this.useSSL ? 'wss' : 'ws',
      mqttVersion: '3.1.1',
      transportSecurity: this.useSSL ? 'TLS 1.2+ (WSS)' : 'Unencrypted WebSocket (WS)',
      websocketConnected: Boolean(this.client && this.client.isConnected && this.client.isConnected()),
      mqttSessionConnected: isConnected,
      cleanSession: true,
      keepAliveSeconds: this.keepAliveSeconds,
      connectionTimeoutSeconds: this.connectionTimeoutSeconds,
      connectionUptimeMs: isConnected && this.lastConnectedAt ? Math.max(0, now - this.lastConnectedAt) : null,
      reconnectAttempts: this.reconnectAttempts,
      reconnectCount: this.reconnectAttempts,
      messagesReceivedTotal: this.messagesReceivedTotal,
      messagesSentTotal: this.messagesSentTotal,
      totalBrokerMessages: this.messagesReceivedTotal,
      lastError: this.lastError,
      lastConnectedAt: this.lastConnectedAt,
      lastDisconnectedAt: this.lastDisconnectedAt,
      connectedAt: this.lastConnectedAt,
      disconnectedAt: this.lastDisconnectedAt,
      authMode: this.username.trim() ? 'Username/Password' : 'Anonymous',
      certValidation: this.useSSL ? 'Enabled (Platform TLS CA)' : 'N/A (WS)',
      brokerReachable: isConnected ? 'Reachable' : this.status === 'CONNECTING' || this.status === 'RECONNECTING' ? 'Probing' : 'Unreachable',
      connectionLatencyMs: this.connectionLatencyMs,
      autoReconnect: this.autoReconnect,
      useSSL: this.useSSL,
      status: this.status,
      statusDisplay: getMqttStatusDisplay(this.status),
      subscribedTopics: this.getSubscribedTopics(),
      subscriptionAck: this.subscriptionAck,
      subscriptionAckAt: this.subscriptionAckAt,
      subscriptionError: this.subscriptionError,
      lastMessageAt: this.lastMessageReceivedTime || null,
      lastParsingError: this.lastParsingError,
      parseErrorCount: this.parseErrorCount,
      lastUidMismatch: this.lastUidMismatch,
      clientId: this.clientId.trim() || '(auto-generated)',
      defaultQos: this.defaultQos,
      hasPassword: Boolean(this.password),
    };
  }

  public getStatusDisplay(): MqttStatusDisplay {
    return getMqttStatusDisplay(this.status);
  }

  public getConfiguration(): MqttClientConfiguration {
    return {
      host: this.brokerHost,
      port: this.brokerPort,
      protocol: this.useSSL ? 'wss' : 'ws',
      path: this.brokerPath,
      clientId: this.clientId,
      username: this.username,
      hasPassword: Boolean(this.password),
      keepAliveSeconds: this.keepAliveSeconds,
      connectionTimeoutSeconds: this.connectionTimeoutSeconds,
      defaultQos: this.defaultQos,
      autoReconnect: this.autoReconnect,
      useSSL: this.useSSL,
      topic: this.topic,
    };
  }

  public validateConfiguration(
    cfg: Partial<MqttClientConfiguration> & { password?: string; clearPassword?: boolean }
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const host = (cfg.host ?? this.brokerHost).trim();
    const port = Number(cfg.port ?? this.brokerPort);
    const rawPath = (cfg.path ?? this.brokerPath).trim();
    const username = (cfg.username ?? this.username).trim();
    const effectivePwd = cfg.clearPassword
      ? ''
      : (typeof cfg.password === 'string' && cfg.password.length > 0 ? cfg.password : this.password);
    const ka = Number(cfg.keepAliveSeconds ?? this.keepAliveSeconds);
    const to = Number(cfg.connectionTimeoutSeconds ?? this.connectionTimeoutSeconds);
    const qos = Number(cfg.defaultQos ?? this.defaultQos);

    if (!host) {
      errors.push('Broker Host is required.');
    } else if (/^https?:\/\/|^wss?:\/\/|^mqtts?:\/\//i.test(host) || /[\s/]/.test(host)) {
      errors.push('Broker Host must be a hostname or IP without protocol scheme or spaces.');
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      errors.push('Broker Port must be an integer between 1 and 65535.');
    }
    if (!rawPath || !rawPath.startsWith('/')) {
      errors.push('WebSocket Path must start with "/" (e.g. /mqtt).');
    }
    if (effectivePwd && !username) {
      errors.push('Username is required when a password is specified (MQTT 3.1.1).');
    }
    if (!Number.isFinite(ka) || ka < 5 || ka > 3600) {
      errors.push('Keep Alive must be between 5 and 3600 seconds.');
    }
    if (!Number.isFinite(to) || to < 3 || to > 120) {
      errors.push('Connection Timeout must be between 3 and 120 seconds.');
    }
    if (qos !== 0 && qos !== 1 && qos !== 2) {
      errors.push('QoS must be 0, 1, or 2.');
    }
    return { valid: errors.length === 0, errors };
  }

  public saveConfiguration(
    cfg: Partial<MqttClientConfiguration> & { password?: string; clearPassword?: boolean; reconnect?: boolean }
  ): { ok: boolean; errors: string[] } {
    const validation = this.validateConfiguration(cfg);
    if (!validation.valid) {
      return { ok: false, errors: validation.errors };
    }

    const useSSL = cfg.useSSL ?? (cfg.protocol ? cfg.protocol === 'wss' : this.useSSL);
    const cleanHost = (cfg.host ?? this.brokerHost).trim();
    const cleanPort = Number(cfg.port ?? this.brokerPort);
    const rawPath = (cfg.path ?? this.brokerPath).trim() || '/mqtt';
    const cleanPath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
    const cleanClientId = (cfg.clientId ?? this.clientId).trim();
    const cleanUsername = (cfg.username ?? this.username).trim();
    const cleanKeepAlive = Math.round(Number(cfg.keepAliveSeconds ?? this.keepAliveSeconds));
    const cleanTimeout = Math.round(Number(cfg.connectionTimeoutSeconds ?? this.connectionTimeoutSeconds));
    const cleanQos = Number(cfg.defaultQos ?? this.defaultQos) as 0 | 1 | 2;
    const cleanAutoReconnect = cfg.autoReconnect ?? this.autoReconnect;
    const cleanTopic = (cfg.topic ?? this.topic).trim();

    this.brokerHost = cleanHost;
    this.brokerPort = cleanPort;
    this.brokerPath = cleanPath;
    this.useSSL = useSSL;
    this.clientId = cleanClientId;
    this.username = cleanUsername;
    if (cfg.clearPassword) {
      this.password = '';
    } else if (typeof cfg.password === 'string' && cfg.password.length > 0) {
      this.password = cfg.password;
    }
    this.keepAliveSeconds = cleanKeepAlive;
    this.connectionTimeoutSeconds = cleanTimeout;
    this.defaultQos = cleanQos;
    this.autoReconnect = cleanAutoReconnect;
    if (cleanTopic) {
      this.topic = cleanTopic;
      this.dynamicSubscriptions.set(cleanTopic, cleanQos);
    }

    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem('panorama_mqtt_host', cleanHost);
      localStorage.setItem('panorama_mqtt_port', String(cleanPort));
      localStorage.setItem('panorama_mqtt_path', cleanPath);
      localStorage.setItem('panorama_mqtt_ssl', String(useSSL));
      localStorage.setItem('panorama_mqtt_client_id', cleanClientId);
      localStorage.setItem('panorama_mqtt_username', cleanUsername);
      localStorage.setItem('panorama_mqtt_keepalive', String(cleanKeepAlive));
      localStorage.setItem('panorama_mqtt_timeout', String(cleanTimeout));
      localStorage.setItem('panorama_mqtt_qos', String(cleanQos));
      localStorage.setItem('panorama_mqtt_auto_reconnect', String(cleanAutoReconnect));
      if (cleanTopic) {
        localStorage.setItem('panorama_mqtt_topic', cleanTopic);
      }
      try {
        if (typeof window.sessionStorage !== 'undefined') {
          if (this.password) {
            window.sessionStorage.setItem('panorama_mqtt_session_secret', this.password);
          } else {
            window.sessionStorage.removeItem('panorama_mqtt_session_secret');
          }
        }
      } catch {
        // ignore restricted sessionStorage
      }
    }

    if (cfg.reconnect) {
      this.reconnect();
    }
    return { ok: true, errors: [] };
  }

  public reconnect(): void {
    clearTimeout(this.reconfigureTimer);
    this.reconfigureTimer = null;
    this.disconnect();
    this.reconfigureTimer = setTimeout(() => {
      this.reconfigureTimer = null;
      this.isDestroyed = false;
      this.intentionalDisconnect = false;
      this.reconnectAttempts = 0;
      this.connect();
    }, 200);
  }

  public testConnection(
    cfg?: Partial<MqttClientConfiguration> & { password?: string; clearPassword?: boolean }
  ): Promise<{ ok: boolean; latencyMs: number; error: string | null }> {
    const validation = this.validateConfiguration(cfg || {});
    if (!validation.valid) {
      return Promise.resolve({ ok: false, latencyMs: 0, error: validation.errors.join(' ') });
    }

    const host = (cfg?.host ?? this.brokerHost).trim();
    const port = Number(cfg?.port ?? this.brokerPort);
    const rawPath = (cfg?.path ?? this.brokerPath).trim() || '/mqtt';
    const path = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
    const useSSL = cfg?.useSSL ?? (cfg?.protocol ? cfg.protocol === 'wss' : this.useSSL);
    const username = (cfg?.username ?? this.username).trim();
    const password = cfg?.clearPassword
      ? ''
      : (typeof cfg?.password === 'string' && cfg.password.length > 0 ? cfg.password : this.password);
    const timeoutSec = Math.round(Number(cfg?.connectionTimeoutSeconds ?? this.connectionTimeoutSeconds));
    const keepAliveSec = Math.round(Number(cfg?.keepAliveSeconds ?? this.keepAliveSeconds));
    const baseClientId = (cfg?.clientId ?? this.clientId).trim() || 'panorama-probe';

    const matchesCurrent =
      host === this.brokerHost &&
      port === this.brokerPort &&
      path === this.brokerPath &&
      useSSL === this.useSSL &&
      username === this.username &&
      !(cfg?.password) &&
      !cfg?.clearPassword;

    if (matchesCurrent && this.client && this.client.isConnected && this.client.isConnected()) {
      return Promise.resolve({ ok: true, latencyMs: this.connectionLatencyMs || 1, error: null });
    }

    const ClientConstructor = (Paho && (Paho.Client || (Paho as any).default?.Client)) || (window as any).Paho?.MQTT?.Client;
    if (!ClientConstructor) {
      return Promise.resolve({ ok: false, latencyMs: 0, error: 'MQTT WebSocket client unavailable' });
    }

    const start = Date.now();
    return new Promise((resolve) => {
      let settled = false;
      const probeClient = new ClientConstructor(
        host,
        port,
        path,
        `${baseClientId}-probe-${Math.random().toString(16).substring(2, 6)}`
      );
      const cleanupProbe = () => {
        try {
          probeClient.onConnectionLost = () => {};
          probeClient.onMessageArrived = () => {};
          if (probeClient.isConnected && probeClient.isConnected()) {
            probeClient.disconnect();
          }
        } catch {
          // ignore
        }
      };
      const done = (result: { ok: boolean; latencyMs: number; error: string | null }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        cleanupProbe();
        resolve(result);
      };
      const timer = setTimeout(() => {
        done({ ok: false, latencyMs: Date.now() - start, error: `Connection test timed out after ${timeoutSec}s` });
      }, Math.min(timeoutSec, 15) * 1000);

      try {
        const sanitizeProbeErr = (msg: string) => (password ? msg.split(password).join('[REDACTED]') : msg);
        probeClient.onConnectionLost = (res: any) => {
          if (!settled && res?.errorCode) {
            done({ ok: false, latencyMs: Date.now() - start, error: sanitizeProbeErr(res?.errorMessage || 'Broker closed connection') });
          }
        };
        probeClient.connect({
          useSSL,
          timeout: Math.min(timeoutSec, 15),
          keepAliveInterval: keepAliveSec,
          cleanSession: true,
          ...(username
            ? {
                userName: username,
                ...(password ? { password } : {}),
              }
            : {}),
          onSuccess: () => done({ ok: true, latencyMs: Math.max(1, Date.now() - start), error: null }),
          onFailure: (err: any) => done({
            ok: false,
            latencyMs: Date.now() - start,
            error: sanitizeProbeErr(err?.errorMessage || 'Broker TLS/WebSocket handshake failed'),
          }),
        });
      } catch (err: any) {
        const msg = err?.message || 'Probe exception';
        done({ ok: false, latencyMs: Date.now() - start, error: password ? msg.split(password).join('[REDACTED]') : msg });
      }
    });
  }

  public reconfigureBroker(host: string, port: number, path: string = '/mqtt', useSSL: boolean = true): void {
    this.saveConfiguration({ host, port, path, useSSL, protocol: useSSL ? 'wss' : 'ws', reconnect: true });
  }

  disconnect(): void {
    this.intentionalDisconnect = true;
    this.isDestroyed = true;
    this.isConnecting = false;
    this.topicSubscribed = false;
    this.subscriptionAck = false;
    clearTimeout(this.connectTimeoutTimer);
    clearTimeout(this.reconnectTimer);
    clearTimeout(this.reconfigureTimer);
    clearTimeout(this.dispatchTimer);
    this.connectTimeoutTimer = null;
    this.reconnectTimer = null;
    this.reconfigureTimer = null;
    this.dispatchTimer = null;
    this.pendingDispatchTelemetry.clear();
    this.lastTelemetry = null;
    this.lastTelemetryByUid.clear();
    this.lastReceivedAtByUid.clear();
    this.staleEmittedUids.clear();
    this.offlineEmittedUids.clear();
    this.lastPayloadSignature = '';
    this.confirmedSubscriptions.clear();
    this.clearStaleTimer();
    this.cleanupClient();
    this.lastDisconnectedAt = Date.now();
    this.setStatus('DISCONNECTED');
  }
}

export const mqttService = MqttService.getInstance();

if (typeof window !== 'undefined') {
  (window as any).panoramaMqttService = mqttService;
}
