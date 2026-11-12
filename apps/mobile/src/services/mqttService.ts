/**
 * Panorama Water Tank Monitor — Unified MQTT Service.
 * Subscribes to live telemetry on topic 0023004D4B42501120353332.
 * Validates, normalizes, and handles reconnects + 30-second stale watchdog.
 */

// @ts-ignore
import Paho from 'paho-mqtt';
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

export const DEFAULT_MQTT_TOPIC = '0023004D4B42501120353332';
export const DEFAULT_DEVICE_UID = '0023004D4B42501120353332';
export const DEFAULT_STALE_TIMEOUT_MS = 180000; // 180 seconds (nominal 90s upload task + jitter headroom)
export const STALE_TIMEOUT_MS = 30000; // Fast watchdog timeout for local/test runner

export type TelemetryCallback = (payload: LiveTelemetryPayload) => void;
export type MqttStatusCallback = (status: MqttConnectionStatus) => void;

export class MqttService {
  private static instance: MqttService;
  private client: any = null;
  private status: MqttConnectionStatus = 'DISCONNECTED';
  private topicSubscribed = false;
  private telemetryListeners: Set<TelemetryCallback> = new Set();
  private statusListeners: Set<MqttStatusCallback> = new Set();
  private reconnectTimer: any = null;
  private staleTimer: any = null;
  private reconnectAttempts = 0;
  private lastTelemetry: LiveTelemetryPayload | null = null;
  private lastValidGps: MqttGpsFix | null = null;
  private gpsWaypoints: MqttGpsFix[] = [];
  private lastPayloadSignature = '';
  private lastMessageReceivedTime = 0;
  private historyBuffer: LiveTelemetryPayload[] = [];
  private isDestroyed = false;

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
      if (savedTopic) this.topic = savedTopic;
      if (savedSsl !== null) this.useSSL = savedSsl === 'true';
    }
  }

  connect(): void {
    if (this.client && this.client.isConnected && this.client.isConnected()) {
      return;
    }

    this.isDestroyed = false;
    this.setStatus('CONNECTING');

    const clientId = `panorama-web-${Math.random().toString(16).substring(2, 10)}`;

    try {
      const ClientConstructor = (Paho && (Paho.Client || (Paho as any).default?.Client)) || (window as any).Paho?.MQTT?.Client;
      if (!ClientConstructor) {
        console.warn('[MQTT] Paho.Client constructor not available in runtime.');
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
        this.topicSubscribed = false;
        this.clearStaleTimer();
        this.setStatus('DISCONNECTED');
        this.scheduleReconnect();
      };

      this.client.onMessageArrived = (message: any) => {
        try {
          const payloadStr = message.payloadString;
          this.handleIncomingPayload(payloadStr);
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
          this.reconnectAttempts = 0;
          this.setStatus('CONNECTED');
          console.info(`[MQTT] Connected to ${this.brokerHost}:${this.brokerPort}. Subscribing to topic: ${this.topic}`);
          try {
            this.client.subscribe(this.topic, { qos: 1 });
            this.topicSubscribed = true;
          } catch (subErr) {
            this.topicSubscribed = false;
            console.error('[MQTT] Failed to subscribe:', subErr);
          }
        },
        onFailure: (err: any) => {
          this.topicSubscribed = false;
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
  handleIncomingPayload(rawString: string): LiveTelemetryPayload | null {
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
    const uid = String(parsed.uid || parsed.deviceId || DEFAULT_DEVICE_UID).trim();
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
        console.warn(`[MQTT] No telemetry received for ${STALE_TIMEOUT_MS / 1000}s. Transitioning to STALE.`);
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

  disconnect(): void {
    this.isDestroyed = true;
    this.topicSubscribed = false;
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
