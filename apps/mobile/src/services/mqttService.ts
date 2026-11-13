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

export const CENTRAL_FLEET_TOPIC = 'panorama/central/fleet/v2';
export const CENTRAL_DEVICES_TOPIC = 'panorama/central/devices/v2';
export const CENTRAL_SETTINGS_TOPIC = 'panorama/central/settings/v2';
export const CENTRAL_USERS_TOPIC = 'panorama/central/users/v2';
export const CENTRAL_DELTA_SYNC_TOPIC = 'panorama/central/sync/v2';

export type TelemetryCallback = (payload: LiveTelemetryPayload) => void;
export type MqttStatusCallback = (status: MqttConnectionStatus) => void;

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
          const destination = message.destinationName || message.topic || '';
          const payloadStr = message.payloadString;
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
            return;
          }
          if (destination === 'panorama/fleet/sync') {
            this.handleFleetSync(payloadStr);
            return;
          }
          if (destination === 'panorama/devices/sync') {
            this.handleDeviceSync(payloadStr);
            return;
          }
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
          console.info(`[MQTT] Connected to ${this.brokerHost}:${this.brokerPort}. Subscribing to topics...`);
          try {
            this.client.subscribe(this.topic, { qos: 1 });
            this.client.subscribe(CENTRAL_FLEET_TOPIC, { qos: 1 });
            this.client.subscribe(CENTRAL_DEVICES_TOPIC, { qos: 1 });
            this.client.subscribe(CENTRAL_SETTINGS_TOPIC, { qos: 1 });
            this.client.subscribe(CENTRAL_USERS_TOPIC, { qos: 1 });
            this.client.subscribe(CENTRAL_DELTA_SYNC_TOPIC, { qos: 1 });
            this.client.subscribe('panorama/fleet/sync', { qos: 1 });
            this.client.subscribe('panorama/devices/sync', { qos: 1 });
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

  publish(topic: string, payload: any, retained: boolean = false): boolean {
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
      msg.qos = 0;
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
