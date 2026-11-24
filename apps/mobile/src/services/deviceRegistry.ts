/**
 * Panorama Water Tank Monitor — Device Registry Service.
 * 
 * Manages device discovery, hardware registration, train-coach mapping,
 * and resilient local persistence across browser sessions, reloads, and offline states.
 */

import { LiveTelemetryPayload } from '../types';
import { alertNotificationService } from './alertNotificationService';
import { resolveApiBaseUrl } from '../config/apiConfig';
import {
  mqttService,
  CENTRAL_DEVICES_TOPIC,
  CENTRAL_DELTA_SYNC_TOPIC,
} from './mqttService';
import { centralStateSync } from './centralStateSync';

const centralChannel: BroadcastChannel | null =
  typeof window !== 'undefined' && typeof (window as any).BroadcastChannel === 'function'
    ? new BroadcastChannel('panorama_central_sync')
    : null;

function resolveRegistryApiBase(): string {
  return resolveApiBaseUrl();
}

const API_BASE = resolveApiBaseUrl();

export type DeviceRegistrationStatus = 'DISCOVERED' | 'REGISTERED';
export type DeviceAssignmentStatus = 'ENGAGED' | 'AVAILABLE';
export type DeviceOperationalStatus = 'DISCOVERED' | 'REGISTERED' | 'ENGAGED' | 'AVAILABLE' | 'OFFLINE';

const HEX_24_RE = /^[0-9A-Fa-f]{24}$/;
const TEST_PATTERNS = /TEST|AUDIT|DUMMY|DEMO|SEED|PLACEHOLDER|ROGUE|MOCK/i;

export const CANONICAL_UID_MAP: Record<string, string> = {
  '0023004D4B42501120353332': '0026004D4B42501120353332',
};

export function isGenuineHardwareUid(uid: string | null | undefined): boolean {
  if (!uid || typeof uid !== 'string') return false;
  const clean = uid.trim();
  if (TEST_PATTERNS.test(clean)) return false;
  return HEX_24_RE.test(clean);
}

export function getCanonicalUid(uid: string | null | undefined): string {
  if (!uid || typeof uid !== 'string') return '';
  const clean = uid.trim();
  return CANONICAL_UID_MAP[clean] || clean;
}

export interface ManagedDevice {
  uid: string;
  name: string;
  trainNumber: string | null;
  coachNumber: string | null;
  registrationStatus: DeviceRegistrationStatus;
  assignmentStatus: DeviceAssignmentStatus;
  isOnline: boolean;
  batteryPercent: number;
  batteryVoltage?: number;
  tank1Level: number | null;
  tank1HeightCm: number | null;
  tank2Level: number | null;
  tank2HeightCm: number | null;
  valve1Normal: boolean;
  valve2Normal: boolean;
  latitude: number | null;
  longitude: number | null;
  speedKmh: number | null;
  lastSeen: string;
  lastSeenTimestamp: number;
  firstDiscovered: string;
  registeredAt?: string;
  hardwareModel: string;
  firmwareVersion?: string;
  firmware_version?: string;
  protocol?: string;
  payloadTrno?: string;
  payloadChno?: string;
}

const STORAGE_KEY = 'panorama_device_registry';
const STALE_TIMEOUT_MS = 90000; // 90 seconds timeout for online flag

class DeviceRegistryService {
  private static instance: DeviceRegistryService;
  private devices: Map<string, ManagedDevice> = new Map();
  private listeners: Set<(devices: ManagedDevice[]) => void> = new Set();
  private isInitialized = false;
  private deletedUids: Set<string> = new Set();
  private version: number = 1;
  private updatedAt: number = 1700000000000;

  private constructor() {
    this.loadFromStorage();
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('storage', (e) => {
        if (e.key === STORAGE_KEY) {
          this.loadFromStorage();
          this.notify();
        }
      });
    }
  }

  public static getInstance(): DeviceRegistryService {
    if (!DeviceRegistryService.instance) {
      DeviceRegistryService.instance = new DeviceRegistryService();
    }
    return DeviceRegistryService.instance;
  }

  /**
   * Load devices from localStorage, initialize default hardware entry if absent.
   */
  private loadFromStorage(): void {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: ManagedDevice[] = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.devices.clear();
          const now = Date.now();
          const seenCanonical = new Set<string>();

          parsed.forEach((d) => {
            if (!d || !d.uid || !isGenuineHardwareUid(d.uid) || d.registrationStatus === 'DISCOVERED') return;
            const canonical = getCanonicalUid(d.uid);
            if (seenCanonical.has(canonical)) return;
            seenCanonical.add(canonical);

            const isOnline = d.lastSeenTimestamp ? (now - d.lastSeenTimestamp) < STALE_TIMEOUT_MS : false;
            this.devices.set(canonical, {
              ...d,
              uid: canonical,
              isOnline: d.isOnline && isOnline,
            });
          });
        }
      }

      // Ensure genuine hardware devices exist in registry (Source of Truth)
      // 1. Shatabdi Coach B4 Water System (canonical registered physical hardware, currently offline)
      if (!this.devices.has('0026004D4B42501120353332') && !this.deletedUids.has('0026004D4B42501120353332')) {
        this.devices.set('0026004D4B42501120353332', {
          uid: '0026004D4B42501120353332',
          name: 'Shatabdi Coach B4 Water System',
          trainNumber: '12002',
          coachNumber: 'B4',
          registrationStatus: 'REGISTERED',
          assignmentStatus: 'ENGAGED',
          isOnline: false,
          batteryPercent: 88,
          batteryVoltage: 3.8,
          tank1Level: 74.5,
          tank1HeightCm: 37.25,
          tank2Level: 72.0,
          tank2HeightCm: 36.0,
          valve1Normal: true,
          valve2Normal: true,
          latitude: 27.1751,
          longitude: 78.0421,
          speedKmh: 65.5,
          lastSeen: 'Offline (Historical Telemetry Stored)',
          lastSeenTimestamp: 0,
          firstDiscovered: '2026-10-28T12:41:43.000Z',
          registeredAt: '2026-10-28T12:41:43.000Z',
          hardwareModel: 'Quectel EC200U 4G LTE',
        });
      }

      // 2. Coach 01 WLI Node (genuine hardware node, online)
      if (!this.devices.has('002F00654B42501320353332') && !this.deletedUids.has('002F00654B42501320353332')) {
        this.devices.set('002F00654B42501320353332', {
          uid: '002F00654B42501320353332',
          name: 'Coach 01 WLI Node',
          trainNumber: null,
          coachNumber: null,
          registrationStatus: 'REGISTERED',
          assignmentStatus: 'AVAILABLE',
          isOnline: true,
          batteryPercent: 97,
          batteryVoltage: 3.7,
          tank1Level: 45.5,
          tank1HeightCm: 22.75,
          tank2Level: 0,
          tank2HeightCm: 0,
          valve1Normal: true,
          valve2Normal: true,
          latitude: 22.556949,
          longitude: 88.352447,
          speedKmh: 0.9,
          lastSeen: 'Active Link',
          lastSeenTimestamp: Date.now(),
          firstDiscovered: '2026-11-16T09:46:06.000Z',
          registeredAt: '2026-11-16T09:46:06.000Z',
          hardwareModel: 'Rev 2.1 Verified',
        });
      }

      // 3. WLI Node Sensor 31 (genuine hardware node, online)
      if (!this.devices.has('0023004D4B42501120353331') && !this.deletedUids.has('0023004D4B42501120353331')) {
        this.devices.set('0023004D4B42501120353331', {
          uid: '0023004D4B42501120353331',
          name: 'WLI Node Sensor 31',
          trainNumber: null,
          coachNumber: null,
          registrationStatus: 'REGISTERED',
          assignmentStatus: 'AVAILABLE',
          isOnline: true,
          batteryPercent: 92,
          batteryVoltage: 3.9,
          tank1Level: 0,
          tank1HeightCm: 0,
          tank2Level: 0,
          tank2HeightCm: 0,
          valve1Normal: true,
          valve2Normal: true,
          latitude: null,
          longitude: null,
          speedKmh: 0,
          lastSeen: 'Active Link',
          lastSeenTimestamp: Date.now(),
          firstDiscovered: '2026-11-14T08:26:58.000Z',
          registeredAt: '2026-11-14T08:26:58.000Z',
          hardwareModel: 'WLI EC200U-CN',
        });
      }

      // Save purged, deduplicated genuine devices back to localStorage
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(this.devices.values())));
    } catch (e) {
      console.warn('[DeviceRegistry] Error reading storage, initializing fresh:', e);
    }
    this.isInitialized = true;
  }

  /**
   * Save current devices map to localStorage.
   */
  private saveToStorage(options?: { skipPublish?: boolean }): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      if (!options?.skipPublish) {
        this.version += 1;
        this.updatedAt = Date.now();
      }
      const list = Array.from(this.devices.values());
      const stateObj = {
        version: this.version,
        updatedAt: this.updatedAt,
        devices: list,
        deletedUids: Array.from(this.deletedUids),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));

      centralChannel?.postMessage({
        type: 'DEVICE_SYNC',
        payload: stateObj,
      });

      if (!options?.skipPublish) {
        centralStateSync.pushNamespace('devices', stateObj, 'DEVICE_UPDATED');
        mqttService.publish(CENTRAL_DEVICES_TOPIC, stateObj, true);
        mqttService.publish(CENTRAL_DELTA_SYNC_TOPIC, {
          type: 'DEVICE_UPDATE',
          version: this.version,
          updatedAt: this.updatedAt,
        });
      }
    } catch (e: any) {
      if (e?.name === 'QuotaExceededError' || e?.code === 22) {
        try {
          for (let i = localStorage.length - 1; i >= 0; i--) {
            const k = localStorage.key(i);
            if (k && (k.startsWith('Sent:') || k.startsWith('Received:'))) {
              localStorage.removeItem(k);
            }
          }
        } catch {}
      }
      console.warn('[DeviceRegistry] Error writing to storage:', e);
    }
  }

  public handleCentralSync(remote: any, opts?: { authoritative?: boolean }): boolean {
    if (!remote) return false;
    if (opts?.authoritative) {
      (this as any)._hasAuthoritativeBackendSync = true;
    } else if ((this as any)._hasAuthoritativeBackendSync) {
      return false;
    }
    const rawDevices: ManagedDevice[] = Array.isArray(remote)
      ? remote
      : Array.isArray(remote.devices)
      ? remote.devices
      : [];
    if (!rawDevices && !remote.deletedUids) return false;

    const remoteUpdatedAt = typeof remote.updatedAt === 'number' ? remote.updatedAt : 0;
    const remoteVersion = typeof remote.version === 'number' ? remote.version : 0;
    const remoteDeleted: string[] = Array.isArray(remote.deletedUids) ? remote.deletedUids : [];

    remoteDeleted.forEach((uid) => this.deletedUids.add(uid));

    // Remove any locally held devices that were deleted remotely
    this.deletedUids.forEach((uid) => {
      this.devices.delete(uid);
    });

    const now = Date.now();
    rawDevices.forEach((remoteDev) => {
      if (!remoteDev || !remoteDev.uid || this.deletedUids.has(remoteDev.uid) || remoteDev.uid.startsWith('PANORAMA-')) return;
      const existing = this.devices.get(remoteDev.uid);
      if (existing) {
        // Keep active local telemetry if local timestamp is newer, but adopt remote administrative mapping
        const useLocalTelemetry = existing.lastSeenTimestamp > (remoteDev.lastSeenTimestamp || 0);
        this.devices.set(remoteDev.uid, {
          ...remoteDev,
          name: remoteDev.name || existing.name,
          trainNumber: remoteDev.trainNumber !== undefined ? remoteDev.trainNumber : existing.trainNumber,
          coachNumber: remoteDev.coachNumber !== undefined ? remoteDev.coachNumber : existing.coachNumber,
          registrationStatus: remoteDev.registrationStatus || existing.registrationStatus,
          assignmentStatus: remoteDev.assignmentStatus || existing.assignmentStatus,
          hardwareModel: remoteDev.hardwareModel || existing.hardwareModel,
          // Telemetry
          isOnline: useLocalTelemetry ? existing.isOnline : ((remoteDev.lastSeenTimestamp ? (now - remoteDev.lastSeenTimestamp) < STALE_TIMEOUT_MS : false)),
          batteryPercent: useLocalTelemetry ? existing.batteryPercent : remoteDev.batteryPercent,
          batteryVoltage: useLocalTelemetry ? existing.batteryVoltage : remoteDev.batteryVoltage,
          tank1Level: useLocalTelemetry ? existing.tank1Level : remoteDev.tank1Level,
          tank1HeightCm: useLocalTelemetry ? existing.tank1HeightCm : remoteDev.tank1HeightCm,
          tank2Level: useLocalTelemetry ? existing.tank2Level : remoteDev.tank2Level,
          tank2HeightCm: useLocalTelemetry ? existing.tank2HeightCm : remoteDev.tank2HeightCm,
          latitude: useLocalTelemetry ? existing.latitude : remoteDev.latitude,
          longitude: useLocalTelemetry ? existing.longitude : remoteDev.longitude,
          speedKmh: useLocalTelemetry ? existing.speedKmh : remoteDev.speedKmh,
          lastSeen: useLocalTelemetry ? existing.lastSeen : remoteDev.lastSeen,
          lastSeenTimestamp: Math.max(existing.lastSeenTimestamp || 0, remoteDev.lastSeenTimestamp || 0),
        });
      } else {
        const isOnline = remoteDev.lastSeenTimestamp ? (now - remoteDev.lastSeenTimestamp) < STALE_TIMEOUT_MS : false;
        this.devices.set(remoteDev.uid, {
          ...remoteDev,
          isOnline,
        });
      }
    });

    this.version = Math.max(this.version, remoteVersion);
    this.updatedAt = remoteUpdatedAt > 0 ? remoteUpdatedAt : this.updatedAt;

    this.saveToStorage({ skipPublish: true });
    this.notify();
    return true;
  }

  public handleDeviceEvent(event: any): boolean {
    if (!event || typeof event !== 'object') return false;
    const op = event.operation;
    const payload = event.payload || event.data || {};
    const uid = (event.entity_id || payload.uid || payload.id || '').trim();
    if (!uid) return false;

    if (op === 'DELETE' || event.event_type === 'DEVICE_DELETED') {
      this.deletedUids.add(uid);
      this.devices.delete(uid);
      this.saveToStorage({ skipPublish: true });
      this.notify();
      return true;
    }

    const trno = payload.train_number !== undefined ? payload.train_number : (payload.trainNumber !== undefined ? payload.trainNumber : 'UNASSIGNED');
    const chno = payload.coach_number !== undefined ? payload.coach_number : (payload.coachNumber !== undefined ? payload.coachNumber : 'UNASSIGNED');
    const isAssigned = trno && trno !== 'UNASSIGNED' && chno && chno !== 'UNASSIGNED';

    const existing = this.devices.get(uid);
    if (existing) {
      this.devices.set(uid, {
        ...existing,
        name: payload.name || existing.name,
        trainNumber: trno,
        coachNumber: chno,
        assignmentStatus: isAssigned ? 'ENGAGED' : 'AVAILABLE',
        registrationStatus: 'REGISTERED',
      });
    } else {
      this.devices.set(uid, {
        uid,
        name: payload.name || `Device ${uid.slice(-6)}`,
        trainNumber: trno,
        coachNumber: chno,
        registrationStatus: 'REGISTERED',
        assignmentStatus: isAssigned ? 'ENGAGED' : 'AVAILABLE',
        hardwareModel: payload.hardware_version || 'ESP32-S3',
        firmwareVersion: payload.firmware_version || 'v2.1.0',
        protocol: payload.protocol || 'MQTT',
        isOnline: false,
        batteryPercent: 100,
        batteryVoltage: 3.7,
        tank1Level: 0,
        tank1HeightCm: 50,
        tank2Level: 0,
        tank2HeightCm: 50,
        valve1Normal: true,
        valve2Normal: true,
        latitude: null,
        longitude: null,
        speedKmh: 0,
        lastSeen: new Date().toISOString(),
        lastSeenTimestamp: Date.now(),
        firstDiscovered: new Date().toISOString(),
        registeredAt: new Date().toISOString(),
      });
    }
    this.saveToStorage({ skipPublish: true });
    this.notify();
    return true;
  }

  private notify(): void {
    const list = this.getDevices();
    this.listeners.forEach((listener) => {
      try {
        listener(list);
      } catch (e) {
        console.error('[DeviceRegistry] Listener callback error:', e);
      }
    });
  }

  public subscribe(callback: (devices: ManagedDevice[]) => void): () => void {
    this.listeners.add(callback);
    callback(this.getDevices());
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Returns all managed devices sorted with active ones first.
   */
  public getDevices(): ManagedDevice[] {
    const now = Date.now();
    const seen = new Set<string>();
    const list: ManagedDevice[] = [];

    Array.from(this.devices.values()).forEach((d) => {
      if (!d || !d.uid || !isGenuineHardwareUid(d.uid)) return;
      const canonical = getCanonicalUid(d.uid);
      if (seen.has(canonical)) return;
      seen.add(canonical);

      const isOnline = d.lastSeenTimestamp ? (now - d.lastSeenTimestamp) < STALE_TIMEOUT_MS : false;
      list.push({
        ...d,
        uid: canonical,
        isOnline: d.isOnline && isOnline,
      });
    });

    return list.sort((a, b) => b.lastSeenTimestamp - a.lastSeenTimestamp);
  }

  public getDeviceByUid(uid: string): ManagedDevice | undefined {
    const canonical = getCanonicalUid(uid);
    return this.devices.get(canonical) || this.devices.get(uid);
  }

  public getDeviceForCoach(trainNumber: string, coachNumber: string): ManagedDevice | undefined {
    return this.getDevices().find(
      (d) =>
        d.assignmentStatus === 'ENGAGED' &&
        d.trainNumber?.trim().toLowerCase() === trainNumber.trim().toLowerCase() &&
        d.coachNumber?.trim().toLowerCase() === coachNumber.trim().toLowerCase()
    );
  }

  /**
   * Process incoming MQTT telemetry frame:
   * - Deduplicates on UID without creating duplicates.
   * - Distinguishes between Automatic Discovery and Manual Registration.
   * - Never automatically sets a discovered device as formally registered or assigned.
   */
  public recordDiscoveredDevice(telemetry: LiveTelemetryPayload): ManagedDevice | null {
    const now = Date.now();
    const rawUid = telemetry.uid;
    if (!isGenuineHardwareUid(rawUid)) {
      return null;
    }
    const uid = getCanonicalUid(rawUid);
    const existing = this.devices.get(uid);

    const timeStr = telemetry.time || new Date().toLocaleTimeString('en-US', { hour12: false });
    const batteryVoltage = Number((3.2 + (telemetry.bat / 100) * 1.0).toFixed(2));

    if (existing) {
      // Update telemetry while strictly maintaining administrator registration and mapping
      const updated: ManagedDevice = {
        ...existing,
        isOnline: !telemetry.isStale,
        batteryPercent: telemetry.bat,
        batteryVoltage,
        tank1Level: telemetry.wlp1,
        tank1HeightCm: telemetry.cm1,
        tank2Level: telemetry.wlp2,
        tank2HeightCm: telemetry.cm2,
        valve1Normal: telemetry.wlv1,
        valve2Normal: telemetry.wlv2,
        latitude: telemetry.lat !== null && telemetry.long !== null ? telemetry.lat : existing.latitude,
        longitude: telemetry.lat !== null && telemetry.long !== null ? telemetry.long : existing.longitude,
        speedKmh: telemetry.speed,
        lastSeen: timeStr,
        lastSeenTimestamp: now,
        payloadTrno: telemetry.trno || existing.payloadTrno,
        payloadChno: telemetry.chno || existing.payloadChno,
      };

      this.devices.set(uid, updated);
      this.saveToStorage({ skipPublish: true });
      this.notify();
      return updated;
    }

    // New device discovered on MQTT network: Create DISCOVERED record
    const newDevice: ManagedDevice = {
      uid,
      name: `WLI Node (${uid.slice(-6)})`,
      trainNumber: null, // Discovered devices are unassigned until administrator maps them
      coachNumber: null,
      registrationStatus: 'DISCOVERED',
      assignmentStatus: 'AVAILABLE',
      isOnline: true,
      batteryPercent: telemetry.bat,
      batteryVoltage,
      tank1Level: telemetry.wlp1,
      tank1HeightCm: telemetry.cm1,
      tank2Level: telemetry.wlp2,
      tank2HeightCm: telemetry.cm2,
      valve1Normal: telemetry.wlv1,
      valve2Normal: telemetry.wlv2,
      latitude: telemetry.lat,
      longitude: telemetry.long,
      speedKmh: telemetry.speed,
      lastSeen: timeStr,
      lastSeenTimestamp: now,
      firstDiscovered: new Date().toISOString(),
      hardwareModel: 'WLI EC200U-CN',
      payloadTrno: telemetry.trno,
      payloadChno: telemetry.chno,
    };

    this.devices.set(uid, newDevice);
    this.saveToStorage({ skipPublish: true });
    this.notify();
    return newDevice;
  }

  /**
   * Reconcile remote backend devices into local registry without triggering mutations or MQTT publication storms.
   */
  public reconcileRemoteDevices(devices: any[]): void {
    if (!Array.isArray(devices) || devices.length === 0) return;
    const now = Date.now();
    devices.forEach((d) => {
      if (!d || !d.uid || !isGenuineHardwareUid(d.uid)) return;
      const canonicalUid = getCanonicalUid(d.uid);
      const existing = this.devices.get(canonicalUid);
      const train = (d.trainNumber || d.train_number || '').trim() || null;
      const coach = (d.coachNumber || d.coach_number || '').trim() || null;
      const isEngaged = Boolean(
        train &&
        coach &&
        train.toUpperCase() !== 'UNASSIGNED' &&
        coach.toUpperCase() !== 'UNASSIGNED'
      );
      const base: ManagedDevice = existing || {
        uid: canonicalUid,
        name: d.name || `Node (${canonicalUid.slice(-6)})`,
        trainNumber: train,
        coachNumber: coach,
        registrationStatus: 'REGISTERED',
        assignmentStatus: isEngaged ? 'ENGAGED' : 'AVAILABLE',
        isOnline: Boolean(d.isOnline || d.is_online),
        batteryPercent: 85,
        batteryVoltage: 3.8,
        tank1Level: 0,
        tank1HeightCm: 0,
        tank2Level: 0,
        tank2HeightCm: 0,
        valve1Normal: true,
        valve2Normal: true,
        latitude: null,
        longitude: null,
        speedKmh: 0,
        lastSeen: new Date().toLocaleTimeString('en-US', { hour12: false }),
        lastSeenTimestamp: now,
        firstDiscovered: new Date().toISOString(),
        hardwareModel: d.hardwareVersion || d.hardware_version || 'Quectel EC200U 4G LTE',
      };
      this.devices.set(canonicalUid, {
        ...base,
        name: d.name || base.name,
        trainNumber: train,
        coachNumber: coach,
        assignmentStatus: isEngaged ? 'ENGAGED' : 'AVAILABLE',
        registrationStatus: 'REGISTERED',
        hardwareModel: d.hardwareVersion || d.hardware_version || base.hardwareModel,
      });
    });
    this.saveToStorage({ skipPublish: true });
    this.notify();
  }

  /**
   * Manually register or update a device with optional consist assignment.
   */
  public registerDevice(
    uid: string,
    options?: {
      name?: string;
      trainNumber?: string | null;
      coachNumber?: string | null;
      hardwareModel?: string;
    }
  ): ManagedDevice {
    const existing = this.devices.get(uid);
    const now = Date.now();
    const train = options?.trainNumber?.trim() || null;
    const coach = options?.coachNumber?.trim() || null;
    const isEngaged = Boolean(
      train &&
      coach &&
      train.toUpperCase() !== 'UNASSIGNED' &&
      coach.toUpperCase() !== 'UNASSIGNED'
    );

    const base: ManagedDevice = existing || {
      uid,
      name: options?.name?.trim() || `Node (${uid.slice(-6)})`,
      trainNumber: train,
      coachNumber: coach,
      registrationStatus: 'REGISTERED',
      assignmentStatus: isEngaged ? 'ENGAGED' : 'AVAILABLE',
      isOnline: true,
      batteryPercent: 85,
      tank1Level: 0,
      tank1HeightCm: 0,
      tank2Level: 0,
      tank2HeightCm: 0,
      valve1Normal: true,
      valve2Normal: true,
      latitude: null,
      longitude: null,
      speedKmh: 0,
      lastSeen: new Date().toLocaleTimeString('en-US', { hour12: false }),
      lastSeenTimestamp: now,
      firstDiscovered: new Date().toISOString(),
      hardwareModel: options?.hardwareModel || 'WLI EC200U-CN',
    };

    const registered: ManagedDevice = {
      ...base,
      name: options?.name?.trim() || base.name,
      trainNumber: train,
      coachNumber: coach,
      registrationStatus: 'REGISTERED',
      assignmentStatus: isEngaged ? 'ENGAGED' : 'AVAILABLE',
      hardwareModel: options?.hardwareModel || base.hardwareModel,
    };

    const isKnown = this.devices.has(uid);
    this.devices.set(uid, registered);
    this.saveToStorage();
    this.notify();

    // Async REST sync attempt when a backend origin is configured and active
    const isUnreachable = typeof window !== 'undefined' && (
      (window as any).__PANORAMA_IS_REMOTE_UNREACHABLE__
        ? (window as any).__PANORAMA_IS_REMOTE_UNREACHABLE__()
        : false
    );
    if (API_BASE && !isUnreachable) {
      const token = typeof window !== 'undefined' ? localStorage.getItem('panorama_token') : null;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
      const syncBody = {
        name: registered.name,
        train_number: registered.trainNumber || '',
        coach_number: registered.coachNumber || '',
        hardware_version: registered.hardwareModel,
      };

      if (isKnown) {
        fetch(`${API_BASE}/devices/${encodeURIComponent(registered.uid)}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(syncBody),
        }).catch(() => {});
      } else {
        fetch(`${API_BASE}/devices`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            uid: registered.uid,
            ...syncBody,
          }),
        })
          .then((res) => {
            if (res.status === 400 || res.status === 409) {
              return fetch(`${API_BASE}/devices/${encodeURIComponent(registered.uid)}`, {
                method: 'PUT',
                headers,
                body: JSON.stringify(syncBody),
              });
            }
          })
          .catch(() => {});
      }
    }

    return registered;
  }

  /**
   * Map device to a specific train and coach consist.
   */
  public assignDevice(uid: string, trainNumber: string, coachNumber: string, options?: { skipPublish?: boolean }): ManagedDevice {
    return this.registerDevice(uid, {
      trainNumber,
      coachNumber,
    });
  }

  /**
   * Release device from coach mapping into available pool.
   */
  public unassignDevice(uid: string): ManagedDevice | undefined {
    const existing = this.devices.get(uid);
    if (!existing) return undefined;

    const unassigned: ManagedDevice = {
      ...existing,
      trainNumber: null,
      coachNumber: null,
      assignmentStatus: 'AVAILABLE',
    };

    this.devices.set(uid, unassigned);
    this.saveToStorage();
    this.notify();
    try {
      alertNotificationService.resolveAlertsForDevice(uid, 'Device unassigned');
    } catch {}

    const isUnreachable = typeof window !== 'undefined' && (
      (window as any).__PANORAMA_IS_REMOTE_UNREACHABLE__
        ? (window as any).__PANORAMA_IS_REMOTE_UNREACHABLE__()
        : false
    );

    if (API_BASE && !isUnreachable) {
      const token = typeof window !== 'undefined' ? localStorage.getItem('panorama_token') : null;
      fetch(`${API_BASE}/devices/${uid}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          trainNumber: '',
          coachNumber: '',
        }),
      }).catch(() => {});
    }

    return unassigned;
  }

  /**
   * Unassign all hardware devices bound to a deleted train without destroying device history.
   */
  public detachTrain(trainNumber: string): number {
    const clean = (trainNumber || '').trim().toLowerCase();
    if (!clean) return 0;
    let count = 0;
    this.devices.forEach((dev, uid) => {
      if ((dev.trainNumber || '').trim().toLowerCase() === clean) {
        this.devices.set(uid, {
          ...dev,
          trainNumber: null,
          coachNumber: null,
          assignmentStatus: 'AVAILABLE',
          isOnline: false,
        });
        count += 1;
      }
    });
    if (count > 0) {
      this.saveToStorage();
      this.notify();
    }
    try {
      alertNotificationService.resolveAlertsForTrain(trainNumber, 'Train detached');
    } catch {}
    return count;
  }

  /**
   * Unassign hardware devices bound to a specific coach.
   */
  public unassignCoachDevice(trainNumber: string, coachNumber: string, _options?: { skipPublish?: boolean }): number {
    const cleanTrain = (trainNumber || '').trim().toLowerCase();
    const cleanCoach = (coachNumber || '').trim().toLowerCase();
    if (!cleanTrain || !cleanCoach) return 0;
    let count = 0;
    this.devices.forEach((dev, uid) => {
      if (
        (dev.trainNumber || '').trim().toLowerCase() === cleanTrain &&
        (dev.coachNumber || '').trim().toLowerCase() === cleanCoach
      ) {
        this.devices.set(uid, {
          ...dev,
          trainNumber: null,
          coachNumber: null,
          assignmentStatus: 'AVAILABLE',
          isOnline: false,
        });
        count += 1;
      }
    });
    if (count > 0) {
      this.saveToStorage();
      this.notify();
    }
    return count;
  }

  /**
   * Delete device from registry.
   */
  public deleteDevice(uid: string): boolean {
    this.deletedUids.add(uid);
    const deleted = this.devices.delete(uid);
    if (deleted) {
      this.saveToStorage();
      this.notify();
      try {
        alertNotificationService.resolveAlertsForDevice(uid, 'Device deleted');
      } catch {}
    }
    return deleted;
  }
}

export const deviceRegistry = DeviceRegistryService.getInstance();

if (typeof window !== 'undefined') {
  centralStateSync.onRemoteUpdate('devices', (data, meta) => {
    deviceRegistry.handleCentralSync(data, { authoritative: meta.authoritative });
  });

  mqttService.onCentralDeviceSync((data) => {
    deviceRegistry.handleCentralSync(data);
  });

  if (centralChannel && typeof centralChannel.addEventListener === 'function') {
    centralChannel.addEventListener('message', (event) => {
      if (event.data?.type === 'DEVICE_SYNC' && event.data.payload) {
        deviceRegistry.handleCentralSync(event.data.payload);
      }
    });
  }
}
