/**
 * Panorama Water Tank Monitor — Unified MQTT Service.
 * Subscribes to live telemetry on topic 0023004D4B42501120353332.
 * Validates, normalizes, and handles reconnects + 30-second stale watchdog.
 */

// @ts-ignore
import Paho from 'paho-mqtt';
import { Logger } from './logger';
import { LiveTelemetryPayload, MqttConnectionStatus, MqttGpsFix } from '../types';

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

export interface RawMqttFrame {
  id: string;
  topic: string;
  payloadString: string;
  payloadSize: number;
  qos: number;
  retained: boolean;
  receivedAt: number;
  receivedAtFormatted: string;
  deviceTimestamp: string | null;
  uid: string | null;
  isJson: boolean;
  parsedJson: Record<string, any> | null;
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

export interface MqttBrokerDiagnostics {
  brokerName: string;
  host: string;
  port: number;
  path: string;
  useSSL: boolean;
  protocol: string;
  mqttVersion: string;
  transportSecurity: string;
  authMode: string;
  certValidation: string;
  status: MqttConnectionStatus;
  websocketConnected: boolean;
  mqttSessionConnected: boolean;
  brokerReachable: 'REACHABLE' | 'UNREACHABLE' | 'UNKNOWN';
  confirmedTopics: string[];
  connectedAt: number | null;
  disconnectedAt: number | null;
  lastError: string | null;
  connectionLatencyMs: number | null;
  reconnectAttempts: number;
  autoReconnect: boolean;
  totalBrokerMessages: number;
  lastBrokerMessageAt: number | null;
  keepAliveSeconds: number;
  cleanSession: boolean;
  clientId: string | null;
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

  // Live broker connection & session diagnostics (populated solely by actual Paho events)
  private mqttSessionConnected = false;
  private brokerReachable: 'REACHABLE' | 'UNREACHABLE' | 'UNKNOWN' = 'UNKNOWN';
  private confirmedSubscriptions: Set<string> = new Set();
  private connectAttemptStartedAt: number | null = null;
  private connectedAt: number | null = null;
  private disconnectedAt: number | null = null;
  private lastError: string | null = null;
  private connectionLatencyMs: number | null = null;
  private totalBrokerMessages = 0;
  private lastBrokerMessageAt: number | null = null;
  private activeClientId: string | null = null;

  private brokerHost: string = 'broker.hivemq.com';
  private brokerPort: number = 8884;
  private brokerPath: string = '/mqtt';
  private useSSL: boolean = true;
  private topic: string = DEFAULT_MQTT_TOPIC;
  private watchdogTimeoutMs: number = STALE_TIMEOUT_MS;

  private constructor() {
    this.initConfiguration();
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
    if (this.client && this.client.isConnected && this.client.isConnected()) {
      return;
    }

    this.isDestroyed = false;
    this.setStatus('CONNECTING');
    this.connectAttemptStartedAt = Date.now();

    const clientId = `panorama-web-${Math.random().toString(16).substring(2, 10)}`;
    this.activeClientId = clientId;

    try {
      const ClientConstructor = (Paho && (Paho.Client || (Paho as any).default?.Client)) || (window as any).Paho?.MQTT?.Client;
      if (!ClientConstructor) {
        console.warn('[MQTT] Paho.Client constructor not available in runtime.');
        this.lastError = 'Paho MQTT client runtime unavailable';
        this.brokerReachable = 'UNREACHABLE';
        this.mqttSessionConnected = false;
        this.setStatus('DISCONNECTED');
        this.scheduleReconnect();
        return;
      }

      this.client = new ClientConstructor(
        this.brokerHost,
        this.brokerPort,
        this.brokerPath,
        clientId
      );

      this.client.onConnectionLost = (responseObject: any) => {
        const errorMsg = responseObject?.errorMessage || 'Connection lost';
        console.warn('[MQTT] Connection lost:', errorMsg);
        this.mqttSessionConnected = false;
        this.topicSubscribed = false;
        this.confirmedSubscriptions.clear();
        this.disconnectedAt = Date.now();
        this.lastError = errorMsg;
        this.brokerReachable = 'UNREACHABLE';
        this.clearStaleTimer();
        this.setStatus('DISCONNECTED');
        this.scheduleReconnect();
      };

      this.client.onMessageArrived = (message: any) => {
        try {
          this.totalBrokerMessages += 1;
          this.lastBrokerMessageAt = Date.now();
          const destination = message.destinationName || message.topic || '';
          const payloadStr = typeof message.payloadString === 'string' ? message.payloadString : String(message.payloadBytes || '');
          const qos = typeof message.qos === 'number' ? message.qos : 0;
          const retained = Boolean(message.retained);
          const receivedDate = new Date();
          const receivedAt = receivedDate.getTime();
          const receivedAtFormatted = formatMqttTimestamp(receivedDate);
          const payloadSize = typeof Blob !== 'undefined' ? new Blob([payloadStr]).size : payloadStr.length;

          let isJson = false;
          let parsedJson: Record<string, any> | null = null;
          let deviceTimestamp: string | null = null;
          let uid: string | null = null;
          let parseError: string | undefined = undefined;

          try {
            parsedJson = JSON.parse(payloadStr);
            if (parsedJson && typeof parsedJson === 'object') {
              isJson = true;
              if (parsedJson.time && typeof parsedJson.time === 'string') {
                deviceTimestamp = parsedJson.time;
              }
              if (parsedJson.uid) {
                uid = String(parsedJson.uid);
              } else if (parsedJson.deviceId) {
                uid = String(parsedJson.deviceId);
              }
            }
          } catch (e: any) {
            isJson = false;
            parseError = e?.message || 'Malformed JSON';
          }

          if (!uid && destination) {
            const parts = destination.split('/');
            uid = parts[0] || parts[parts.length - 1] || null;
          }

          const frame: RawMqttFrame = {
            id: `mqtt-${receivedAt}-${Math.random().toString(36).substring(2, 7)}`,
            topic: destination,
            payloadString: payloadStr,
            payloadSize,
            qos,
            retained,
            receivedAt,
            receivedAtFormatted,
            deviceTimestamp,
            uid,
            isJson,
            parsedJson,
            error: parseError,
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
          this.handleIncomingPayload(payloadStr, destination);
        } catch (e) {
          console.error('[MQTT] Error processing message frame:', e);
        }
      };

      const connectOptions: any = {
        useSSL: this.useSSL,
        timeout: 10,
        keepAliveInterval: 45,
        cleanSession: true,
        onSuccess: () => {
          const nowTs = Date.now();
          this.reconnectAttempts = 0;
          this.mqttSessionConnected = true;
          this.brokerReachable = 'REACHABLE';
          this.connectedAt = nowTs;
          this.lastError = null;
          if (this.connectAttemptStartedAt) {
            this.connectionLatencyMs = Math.max(1, nowTs - this.connectAttemptStartedAt);
          }
          this.setStatus('CONNECTED');
          console.info(`[MQTT] Connected to ${this.brokerHost}:${this.brokerPort}. Subscribing to topics...`);
          try {
            const subWithAck = (t: string, qos: number) => {
              this.client.subscribe(t, {
                qos,
                onSuccess: () => {
                  this.confirmedSubscriptions.add(t);
                },
                onFailure: (subErr: any) => {
                  this.confirmedSubscriptions.delete(t);
                  this.lastError = `Subscribe failed (${t}): ${subErr?.errorMessage || subErr}`;
                },
              });
            };
            // Subscribe to primary synchronization bus (events and wildcard)
            subWithAck(SYNC_EVENTS_TOPIC, 1);
            subWithAck(SYNC_WILDCARD_TOPIC, 1);

            // Subscribe to primary configuration topic and telemetry stream (/s)
            subWithAck(this.topic, 1);
            subWithAck(`${this.topic}/s`, 1);
            subWithAck(`${this.topic}/#`, 1);
            if (this.topic !== DEFAULT_MQTT_TOPIC) {
              subWithAck(DEFAULT_MQTT_TOPIC, 1);
              subWithAck(`${DEFAULT_MQTT_TOPIC}/s`, 1);
              subWithAck(`${DEFAULT_MQTT_TOPIC}/#`, 1);
            }
            // Target hardware device telemetry topics (Physical UID verified from MQTT.fx)
            subWithAck('002F00654B42501320353332', 0);
            subWithAck('002F00654B42501320353332/s', 0);
            subWithAck('002F00654B42501320353332/#', 0);
            subWithAck('panorama/telemetry/002F00654B42501320353332', 0);
            // Legacy / alternate variants for backward compatibility
            subWithAck('002F00654B42501203203533332', 1);
            subWithAck('002F00654B42501203203533332/s', 1);
            subWithAck('002F00654B42501203203533332/#', 1);
            subWithAck('002F00654B425012032053332', 1);
            subWithAck('002F00654B425012032053332/s', 1);
            subWithAck('002F00654B425012032053332/#', 1);
            subWithAck('0023004D4B42501120353332', 1);
            subWithAck('panorama/telemetry/#', 1);

            subWithAck(CENTRAL_FLEET_TOPIC, 1);
            subWithAck(CENTRAL_DEVICES_TOPIC, 1);
            subWithAck(CENTRAL_SETTINGS_TOPIC, 1);
            subWithAck(CENTRAL_USERS_TOPIC, 1);
            subWithAck(CENTRAL_DELTA_SYNC_TOPIC, 1);
            subWithAck('panorama/fleet/sync', 1);
            subWithAck('panorama/devices/sync', 1);

            // Re-subscribe to all dynamic topic subscriptions
            this.dynamicSubscriptions.forEach((qos, top) => {
              try {
                subWithAck(top, qos);
                console.info(`[MQTT] Re-subscribed to dynamic topic: ${top} (QoS ${qos})`);
              } catch (dynErr) {
                console.warn(`[MQTT] Failed to resubscribe to dynamic topic ${top}:`, dynErr);
              }
            });

            this.topicSubscribed = true;
          } catch (subErr: any) {
            this.topicSubscribed = false;
            this.lastError = subErr?.message || String(subErr);
            console.error('[MQTT] Failed to subscribe:', subErr);
          }
        },
        onFailure: (err: any) => {
          this.mqttSessionConnected = false;
          this.topicSubscribed = false;
          this.confirmedSubscriptions.clear();
          this.disconnectedAt = Date.now();
          this.brokerReachable = 'UNREACHABLE';
          this.lastError = err?.errorMessage || (typeof err === 'string' ? err : 'Broker connection failed');
          console.warn('[MQTT] Connection failed:', err?.errorMessage || err);
          this.setStatus('DISCONNECTED');
          this.scheduleReconnect();
        },
      };

      this.client.connect(connectOptions);
    } catch (err) {
      console.error('[MQTT] Exception starting MQTT connection:', err);
      this.setStatus('DISCONNECTED');
      this.scheduleReconnect();
    }
  }

  /**
   * Parse, validate, and dispatch incoming telemetry payload.
   */
  handleIncomingPayload(rawString: string, topicName?: string): LiveTelemetryPayload | null {
    if (!rawString || typeof rawString !== 'string') {
      console.warn('[MQTT] Discarding invalid non-string payload');
      return null;
    }

    let parsed: any;
    try {
      parsed = JSON.parse(rawString);
    } catch (jsonErr) {
      console.warn('[MQTT] Discarding malformed JSON payload:', jsonErr);
      return null;
    }

    if (!parsed || typeof parsed !== 'object') {
      console.warn('[MQTT] Discarding non-object telemetry frame');
      return null;
    }

    // Validate and sanitize required fields according to contract:
    // {"uid":"0023004D4B42501120353332","lat":22.557279,"long":88.352432,"speed":3.4,"time":"12:15:39",
    //  "cm1":120.8,"cm2":0.0,"wlp1":12.1,"wlp2":0.0,"wlv1":true,"wlv2":false,"bat":83.6,"chno":"CR123456","trno":"225256"}
    const topicUid = topicName ? topicName.split('/')[0].trim() : '';
    const uid = String(parsed.uid || parsed.deviceId || topicUid || DEFAULT_DEVICE_UID).trim();
    const trno = String(parsed.trno || parsed.trainNumber || '').trim();
    const chno = String(parsed.chno || parsed.coachNumber || '').trim();

    const gps = parseValidGps(parsed);
    const speed = typeof parsed.speed === 'number' && Number.isFinite(parsed.speed) && parsed.speed >= 0 ? parsed.speed : 0;
    const time = typeof parsed.time === 'string' ? parsed.time : new Date().toLocaleTimeString('en-US', { hour12: false });

    const cm1 = typeof parsed.cm1 === 'number' && parsed.cm1 >= 0 ? parsed.cm1 : (typeof parsed.primaryHeight === 'number' ? parsed.primaryHeight : 0);
    const cm2 = typeof parsed.cm2 === 'number' && parsed.cm2 >= 0 ? parsed.cm2 : (typeof parsed.secondaryHeight === 'number' ? parsed.secondaryHeight : 0);

    const wlp1 = typeof parsed.wlp1 === 'number' ? Math.max(0, Math.min(100, parsed.wlp1)) : (typeof parsed.primaryLevel === 'number' ? parsed.primaryLevel : 0);
    const wlp2 = typeof parsed.wlp2 === 'number' ? Math.max(0, Math.min(100, parsed.wlp2)) : (typeof parsed.secondaryLevel === 'number' ? parsed.secondaryLevel : 0);

    const wlv1 = typeof parsed.wlv1 === 'boolean' ? parsed.wlv1 : (typeof parsed.wlvl === 'boolean' ? parsed.wlvl : true);
    const wlv2 = typeof parsed.wlv2 === 'boolean' ? parsed.wlv2 : true;

    const bat = typeof parsed.bat === 'number' ? Math.max(0, Math.min(100, parsed.bat)) : (typeof parsed.batteryPercent === 'number' ? parsed.batteryPercent : 85);

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

    this.lastTelemetry = telemetry;
    this.historyBuffer.unshift(telemetry);
    if (this.historyBuffer.length > 500) {
      this.historyBuffer.pop();
    }

    this.setStatus('CONNECTED');
    this.resetStaleTimer();

    // Dispatch to all subscribers
    this.telemetryListeners.forEach((listener) => {
      try {
        listener(telemetry);
      } catch (listenerErr) {
        console.error('[MQTT] Error in telemetry listener:', listenerErr);
      }
    });

    return telemetry;
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
    if (this.isDestroyed) return;
    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts) + Math.random() * 500, 10000);

    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
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
        this.client.subscribe(cleanTopic, {
          qos,
          onSuccess: () => {
            this.confirmedSubscriptions.add(cleanTopic);
          },
          onFailure: (err: any) => {
            this.confirmedSubscriptions.delete(cleanTopic);
            this.lastError = `Subscribe failed (${cleanTopic}): ${err?.errorMessage || err}`;
          },
        });
        console.info(`[MQTT] Subscribed to topic: ${cleanTopic} (QoS ${qos})`);
        return true;
      } catch (err: any) {
        this.lastError = err?.message || String(err);
        console.error(`[MQTT] Failed to subscribe to ${cleanTopic}:`, err);
        return false;
      }
    }
    return false;
  }

  public unsubscribeTopic(topic: string): boolean {
    const cleanTopic = topic.trim();
    if (!cleanTopic) return false;
    this.dynamicSubscriptions.delete(cleanTopic);
    this.confirmedSubscriptions.delete(cleanTopic);
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

  public isTopicConfirmedSubscribed(topic: string): boolean {
    const clean = topic.trim();
    if (!clean || !this.mqttSessionConnected) return false;
    return this.confirmedSubscriptions.has(clean);
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

  public injectMessage(topic: string, payload: string | object, qos: number = 0, retained: boolean = false): RawMqttFrame {
    const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
    const receivedDate = new Date();
    const receivedAt = receivedDate.getTime();
    const receivedAtFormatted = formatMqttTimestamp(receivedDate);
    const payloadSize = typeof Blob !== 'undefined' ? new Blob([payloadStr]).size : payloadStr.length;

    let isJson = false;
    let parsedJson: Record<string, any> | null = null;
    let deviceTimestamp: string | null = null;
    let uid: string | null = null;
    let parseError: string | undefined = undefined;

    try {
      parsedJson = typeof payload === 'object' && payload !== null ? (payload as any) : JSON.parse(payloadStr);
      if (parsedJson && typeof parsedJson === 'object') {
        isJson = true;
        if (parsedJson.time && typeof parsedJson.time === 'string') {
          deviceTimestamp = parsedJson.time;
        }
        if (parsedJson.uid) {
          uid = String(parsedJson.uid);
        } else if (parsedJson.deviceId) {
          uid = String(parsedJson.deviceId);
        }
      }
    } catch (e: any) {
      isJson = false;
      parseError = e?.message || 'Malformed JSON';
    }

    if (!uid && topic) {
      const parts = topic.split('/');
      uid = parts[0] || parts[parts.length - 1] || null;
    }

    const frame: RawMqttFrame = {
      id: `mqtt-${receivedAt}-${Math.random().toString(36).substring(2, 7)}`,
      topic,
      payloadString: payloadStr,
      payloadSize,
      qos,
      retained,
      receivedAt,
      receivedAtFormatted,
      deviceTimestamp,
      uid,
      isJson,
      parsedJson,
      error: parseError,
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

    return frame;
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

  public getDiagnostics(): MqttBrokerDiagnostics {
    const wsConnected = Boolean(this.client && typeof this.client.isConnected === 'function' && this.client.isConnected());
    const hostLower = (this.brokerHost || '').toLowerCase();
    const brokerName = hostLower.includes('hivemq.com') ? 'HiveMQ' : 'Custom MQTT Broker';
    return {
      brokerName,
      host: this.brokerHost,
      port: this.brokerPort,
      path: this.brokerPath,
      useSSL: this.useSSL,
      protocol: this.useSSL ? 'MQTT over WebSocket Secure (WSS)' : 'MQTT over WebSocket (WS)',
      mqttVersion: '3.1.1 (Paho JS Default)',
      transportSecurity: this.useSSL ? 'TLS / WSS' : 'Unencrypted WS',
      authMode: 'Anonymous (No Credentials Configured)',
      certValidation: this.useSSL ? 'Browser-Managed TLS Verification' : 'Not Applicable (Plain WS)',
      status: this.status,
      websocketConnected: wsConnected,
      mqttSessionConnected: this.mqttSessionConnected && wsConnected,
      brokerReachable: wsConnected ? 'REACHABLE' : this.brokerReachable,
      confirmedTopics: Array.from(this.confirmedSubscriptions),
      connectedAt: this.connectedAt,
      disconnectedAt: this.disconnectedAt,
      lastError: this.lastError,
      connectionLatencyMs: this.connectionLatencyMs,
      reconnectAttempts: this.reconnectAttempts,
      autoReconnect: !this.isDestroyed,
      totalBrokerMessages: this.totalBrokerMessages,
      lastBrokerMessageAt: this.lastBrokerMessageAt,
      keepAliveSeconds: 45,
      cleanSession: true,
      clientId: this.activeClientId,
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
    this.isDestroyed = true;
    this.mqttSessionConnected = false;
    this.topicSubscribed = false;
    this.confirmedSubscriptions.clear();
    this.disconnectedAt = Date.now();
    clearTimeout(this.reconnectTimer);
    this.clearStaleTimer();
    if (this.client && this.client.isConnected && this.client.isConnected()) {
      try {
        this.client.disconnect();
      } catch (e) {
        console.warn('[MQTT] Disconnect error:', e);
      }
    }
    this.setStatus('DISCONNECTED');
  }
}

export const mqttService = MqttService.getInstance();

if (typeof window !== 'undefined') {
  (window as any).panoramaMqttService = mqttService;
}
