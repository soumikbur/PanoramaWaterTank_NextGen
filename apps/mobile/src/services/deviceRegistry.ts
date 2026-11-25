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
export type DeviceConnectivityState = 'ONLINE' | 'STALE' | 'OFFLINE';

export function resolveDeviceConnectivityState(
  lastSeenTimestamp: number | undefined | null,
  timeoutMs: number,
  isBrokerDisconnected: boolean = false,
  now: number = Date.now()
): DeviceConnectivityState {
  if (isBrokerDisconnected || !lastSeenTimestamp || lastSeenTimestamp <= 0) {
    return 'OFFLINE';
  }
  const safeTimeout = Math.max(1000, timeoutMs);
  const elapsed = Math.max(0, now - lastSeenTimestamp);
  if (elapsed <= safeTimeout) return 'ONLINE';
  if (elapsed <= safeTimeout * 2) return 'STALE';
  return 'OFFLINE';
}

const HEX_24_RE = /^[0-9A-Fa-f]{24}$/;
const TEST_PATTERNS = /TEST|AUDIT|DUMMY|DEMO|SEED|PLACEHOLDER|ROGUE|MOCK/i;

export const CANONICAL_UID_MAP: Record<string, string> = {};

export function isGenuineHardwareUid(uid: string | null | undefined): boolean {
  if (!uid || typeof uid !== 'string') return false;
  const clean = uid.trim();
  if (TEST_PATTERNS.test(clean)) return false;
  return HEX_24_RE.test(clean);
}

export function getCanonicalUid(uid: string | null | undefined): string {
  if (!uid || typeof uid !== 'string') return '';
  const clean = uid.trim();
  const mapped = CANONICAL_UID_MAP[clean] || CANONICAL_UID_MAP[clean.toUpperCase()] || clean;
  return HEX_24_RE.test(mapped) ? mapped.toUpperCase() : mapped;
}

export interface ManagedDevice {
  uid: string;
  name: string;
  trainNumber: string | null;
  coachNumber: string | null;
  registrationStatus: DeviceRegistrationStatus;
  assignmentStatus: DeviceAssignmentStatus;
  isOnline: boolean;
  isStale?: boolean;
  connectivityState?: DeviceConnectivityState;
  batteryPercent: number | null;
  batteryVoltage?: number | null;
  tank1Level: number | null;
  tank1HeightCm: number | null;
  tank2Level: number | null;
  tank2HeightCm: number | null;
  valve1Normal: boolean | null;
  valve2Normal: boolean | null;
  temperature?: number | null;
  pressure?: number | null;
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
const DEFAULT_REGISTRY_TIMEOUT_MS = 180000; // Matches 180s telemetry interval ("wak": 180) + watchdog timeout

function getRegistryTimeoutMs(): number {
  if (typeof window === 'undefined' || !window.localStorage) return DEFAULT_REGISTRY_TIMEOUT_MS;
  try {
    const saved = window.localStorage.getItem('panorama_telemetry_timeout_sec');
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (Number.isFinite(parsed) && parsed >= 10 && parsed <= 3600) {
        return parsed * 1000;
      }
    }
  } catch {}
  return DEFAULT_REGISTRY_TIMEOUT_MS;
}

class DeviceRegistryService {
  private static instance: DeviceRegistryService;
  private devices: Map<string, ManagedDevice> = new Map();
  private listeners: Set<(devices: ManagedDevice[]) => void> = new Set();
  private isInitialized = false;
  private deletedUids: Set<string> = new Set();
  private version: number = 1;
  private updatedAt: number = 1700000000000;
  private suppressRemoteOnlineUntilTelemetry: boolean = false;
  private isBrokerDisconnected: boolean = false;
  private livenessTimer: any = null;

  private constructor() {
    this.loadFromStorage();
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('storage', (e) => {
        if (e.key === STORAGE_KEY) {
          this.loadFromStorage();
          this.notify();
        }
      });
      this.livenessTimer = setInterval(() => {
        this.evaluateLivenessStates();
      }, 2000);
      if (this.livenessTimer && typeof this.livenessTimer.unref === 'function') {
        this.livenessTimer.unref();
      }
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
            if (/TEST|AUDIT|DUMMY|DEMO|SEED|PLACEHOLDER|ROGUE|MOCK/i.test(d.name || '') ||
                /TEST|AUDIT|DUMMY|DEMO|SEED|PLACEHOLDER|ROGUE|MOCK/i.test(d.hardwareModel || '')) return;
            const canonical = getCanonicalUid(d.uid);
            if (seenCanonical.has(canonical)) return;
            seenCanonical.add(canonical);

            const nextState = resolveDeviceConnectivityState(d.lastSeenTimestamp, getRegistryTimeoutMs(), this.isBrokerDisconnected, now);
            this.devices.set(canonical, {
              ...d,
              uid: canonical,
              isOnline: nextState === 'ONLINE',
              isStale: nextState === 'STALE',
              connectivityState: nextState,
            });
          });
        }
      }

      // Save hydrated genuine devices back to localStorage (no hardcoded client seeds)
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
    const authoritativeUids = new Set<string>();
    rawDevices.forEach((remoteDev) => {
      if (!remoteDev || !remoteDev.uid || !isGenuineHardwareUid(remoteDev.uid)) return;
      const canonicalUid = getCanonicalUid(remoteDev.uid);
      if (this.deletedUids.has(canonicalUid)) return;
      authoritativeUids.add(canonicalUid);
      const existing = this.devices.get(canonicalUid);
      if (existing) {
        // Keep active local telemetry if local timestamp is newer, but adopt remote administrative mapping
        const useLocalTelemetry = existing.lastSeenTimestamp > (remoteDev.lastSeenTimestamp || 0);
        this.devices.set(canonicalUid, {
          ...remoteDev,
          uid: canonicalUid,
          name: remoteDev.name || existing.name,
          trainNumber: remoteDev.trainNumber !== undefined ? remoteDev.trainNumber : existing.trainNumber,
          coachNumber: remoteDev.coachNumber !== undefined ? remoteDev.coachNumber : existing.coachNumber,
          registrationStatus: remoteDev.registrationStatus || existing.registrationStatus,
          assignmentStatus: remoteDev.assignmentStatus || existing.assignmentStatus,
          hardwareModel: remoteDev.hardwareModel || existing.hardwareModel,
          // Telemetry
          isOnline: useLocalTelemetry
            ? existing.isOnline
            : (resolveDeviceConnectivityState(remoteDev.lastSeenTimestamp, getRegistryTimeoutMs(), this.isBrokerDisconnected, now) === 'ONLINE'),
          isStale: useLocalTelemetry
            ? existing.isStale
            : (resolveDeviceConnectivityState(remoteDev.lastSeenTimestamp, getRegistryTimeoutMs(), this.isBrokerDisconnected, now) === 'STALE'),
          connectivityState: useLocalTelemetry
            ? (existing.connectivityState || (existing.isStale ? 'STALE' : (existing.isOnline ? 'ONLINE' : 'OFFLINE')))
            : resolveDeviceConnectivityState(remoteDev.lastSeenTimestamp, getRegistryTimeoutMs(), this.isBrokerDisconnected, now),
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
        const nextState = resolveDeviceConnectivityState(remoteDev.lastSeenTimestamp, getRegistryTimeoutMs(), this.isBrokerDisconnected, now);
        this.devices.set(canonicalUid, {
          ...remoteDev,
          uid: canonicalUid,
          isOnline: nextState === 'ONLINE',
          isStale: nextState === 'STALE',
          connectivityState: nextState,
        });
      }
    });

    if (opts?.authoritative && authoritativeUids.size > 0) {
      Array.from(this.devices.keys()).forEach((localUid) => {
        if (!authoritativeUids.has(localUid)) {
          this.devices.delete(localUid);
        }
      });
    }

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
        hardwareModel: payload.hardware_version || 'Cellular WLI Unit',
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

      const nextState = resolveDeviceConnectivityState(d.lastSeenTimestamp, getRegistryTimeoutMs(), this.isBrokerDisconnected, now);
      list.push({
        ...d,
        uid: canonical,
        isOnline: nextState === 'ONLINE',
        isStale: nextState === 'STALE',
        connectivityState: nextState,
      });
    });

    return list.sort((a, b) => b.lastSeenTimestamp - a.lastSeenTimestamp);
  }

  public getRegisteredDevices(): ManagedDevice[] {
    return this.getDevices().filter((d) => d.registrationStatus === 'REGISTERED');
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
    if (!telemetry.isStale) {
      this.suppressRemoteOnlineUntilTelemetry = false;
      this.isBrokerDisconnected = false;
    }
    const uid = getCanonicalUid(rawUid);
    const existing = this.devices.get(uid);
    const isOfflineTimeout = Boolean((telemetry as any).isOfflineTimeout);
    const nextState: DeviceConnectivityState = !telemetry.isStale
      ? 'ONLINE'
      : (isOfflineTimeout ? 'OFFLINE' : 'STALE');

    const timeStr = telemetry.time || new Date().toLocaleTimeString('en-US', { hour12: false });
    const batteryPercent = telemetry.bat != null ? telemetry.bat : (existing?.batteryPercent ?? null);
    const batteryVoltage = telemetry.bat != null
      ? Number((3.2 + (telemetry.bat / 100) * 1.0).toFixed(2))
      : (existing?.batteryVoltage ?? null);

    if (existing) {
      // Update telemetry while strictly maintaining administrator registration and mapping;
      // never refresh lastSeenTimestamp when a watchdog STALE/OFFLINE event arrives.
      const updated: ManagedDevice = {
        ...existing,
        isOnline: nextState === 'ONLINE',
        isStale: nextState === 'STALE',
        connectivityState: nextState,
        batteryPercent,
        batteryVoltage,
        tank1Level: telemetry.wlp1 ?? existing.tank1Level,
        tank1HeightCm: telemetry.cm1 ?? existing.tank1HeightCm,
        tank2Level: telemetry.wlp2 ?? existing.tank2Level,
        tank2HeightCm: telemetry.cm2 ?? existing.tank2HeightCm,
        valve1Normal: telemetry.wlv1 ?? existing.valve1Normal,
        valve2Normal: telemetry.wlv2 ?? existing.valve2Normal,
        temperature: telemetry.temp ?? existing.temperature ?? null,
        pressure: telemetry.press ?? existing.pressure ?? null,
        latitude: telemetry.lat !== null && telemetry.long !== null ? telemetry.lat : existing.latitude,
        longitude: telemetry.lat !== null && telemetry.long !== null ? telemetry.long : existing.longitude,
        speedKmh: telemetry.speed ?? existing.speedKmh,
        lastSeen: telemetry.isStale ? existing.lastSeen : timeStr,
        lastSeenTimestamp: telemetry.isStale ? existing.lastSeenTimestamp : now,
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
      isOnline: nextState === 'ONLINE',
      isStale: nextState === 'STALE',
      connectivityState: nextState,
      batteryPercent: telemetry.bat,
      batteryVoltage,
      tank1Level: telemetry.wlp1,
      tank1HeightCm: telemetry.cm1,
      tank2Level: telemetry.wlp2,
      tank2HeightCm: telemetry.cm2,
      valve1Normal: telemetry.wlv1,
      valve2Normal: telemetry.wlv2,
      temperature: telemetry.temp ?? null,
      pressure: telemetry.press ?? null,
      latitude: telemetry.lat,
      longitude: telemetry.long,
      speedKmh: telemetry.speed,
      lastSeen: timeStr,
      lastSeenTimestamp: now,
      firstDiscovered: new Date().toISOString(),
      hardwareModel: 'Cellular WLI Unit',
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
    if (!Array.isArray(devices)) return;
    const now = Date.now();
    const seenAuthoritative = new Set<string>();
    const claimedSlots = new Map<string, string>();
    devices.forEach((d) => {
      if (!d || !d.uid || !isGenuineHardwareUid(d.uid)) return;
      const canonicalUid = getCanonicalUid(d.uid);
      seenAuthoritative.add(canonicalUid);
      const existing = this.devices.get(canonicalUid);
      const rawTrain = (d.trainNumber || d.train_number || '').trim();
      const rawCoach = (d.coachNumber || d.coach_number || '').trim().toUpperCase();
      const isEngaged = Boolean(
        rawTrain &&
        rawCoach &&
        rawTrain.toUpperCase() !== 'UNASSIGNED' &&
        rawCoach !== 'UNASSIGNED'
      );
      let train: string | null = isEngaged ? rawTrain : null;
      let coach: string | null = isEngaged ? rawCoach : null;
      if (isEngaged && train && coach) {
        const slotKey = `${train.toLowerCase()}::${coach.toLowerCase()}`;
        const prevOwner = claimedSlots.get(slotKey);
        if (prevOwner && prevOwner !== canonicalUid) {
          train = null;
          coach = null;
        } else {
          claimedSlots.set(slotKey, canonicalUid);
        }
      }
      const rawLastSeen = typeof d.last_seen_at === 'string' ? d.last_seen_at.trim() : '';
      const utcLastSeen = rawLastSeen && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(rawLastSeen) ? `${rawLastSeen}Z` : rawLastSeen;
      const parsedBackendMs = utcLastSeen ? Date.parse(utcLastSeen) : 0;
      const backendLastSeenMs = Number.isFinite(parsedBackendMs) ? parsedBackendMs : 0;
      const existingLastSeenMs = existing?.lastSeenTimestamp || 0;
      const effectiveLastSeenMs = Math.max(existingLastSeenMs, backendLastSeenMs);
      const suppressedByDisconnect = this.suppressRemoteOnlineUntilTelemetry || this.isBrokerDisconnected;
      const computedState = resolveDeviceConnectivityState(effectiveLastSeenMs, getRegistryTimeoutMs(), suppressedByDisconnect, now);
      const remoteIsOnline = !suppressedByDisconnect && Boolean(d.isOnline || d.is_online) && backendLastSeenMs >= existingLastSeenMs;
      const finalState: DeviceConnectivityState = remoteIsOnline && computedState === 'OFFLINE' ? 'ONLINE' : computedState;
      const effectiveLastSeenStr = existingLastSeenMs >= backendLastSeenMs && existing?.lastSeen
        ? existing.lastSeen
        : (effectiveLastSeenMs > 0 ? new Date(effectiveLastSeenMs).toLocaleTimeString('en-US', { hour12: false }) : 'Awaiting Telemetry Signal');
      const base: ManagedDevice = existing || {
        uid: canonicalUid,
        name: d.name || `Node (${canonicalUid.slice(-6)})`,
        trainNumber: train,
        coachNumber: coach,
        registrationStatus: 'REGISTERED',
        assignmentStatus: (train && coach) ? 'ENGAGED' : 'AVAILABLE',
        isOnline: finalState === 'ONLINE',
        isStale: finalState === 'STALE',
        connectivityState: finalState,
        batteryPercent: null,
        batteryVoltage: null,
        tank1Level: null,
        tank1HeightCm: null,
        tank2Level: null,
        tank2HeightCm: null,
        valve1Normal: null,
        valve2Normal: null,
        latitude: null,
        longitude: null,
        speedKmh: null,
        lastSeen: effectiveLastSeenStr,
        lastSeenTimestamp: effectiveLastSeenMs,
        firstDiscovered: d.created_at || new Date().toISOString(),
        hardwareModel: d.hardwareVersion || d.hardware_version || 'Cellular WLI Unit',
      };
      this.devices.set(canonicalUid, {
        ...base,
        uid: canonicalUid,
        name: d.name || base.name,
        trainNumber: train,
        coachNumber: coach,
        assignmentStatus: (train && coach) ? 'ENGAGED' : 'AVAILABLE',
        registrationStatus: 'REGISTERED',
        isOnline: finalState === 'ONLINE',
        isStale: finalState === 'STALE',
        connectivityState: finalState,
        lastSeen: effectiveLastSeenStr,
        lastSeenTimestamp: effectiveLastSeenMs,
        hardwareModel: d.hardwareVersion || d.hardware_version || base.hardwareModel,
      });
    });
    if (seenAuthoritative.size > 0) {
      Array.from(this.devices.keys()).forEach((k) => {
        if (!seenAuthoritative.has(k)) {
          this.devices.delete(k);
        }
      });
    }
    this.saveToStorage({ skipPublish: true });
    this.notify();
  }

  public evaluateLivenessStates(): boolean {
    const now = Date.now();
    const timeoutMs = getRegistryTimeoutMs();
    let changed = false;
    this.devices.forEach((dev, uid) => {
      const nextState = resolveDeviceConnectivityState(dev.lastSeenTimestamp, timeoutMs, this.isBrokerDisconnected, now);
      const nextOnline = nextState === 'ONLINE';
      const nextStale = nextState === 'STALE';
      if (dev.isOnline !== nextOnline || Boolean(dev.isStale) !== nextStale || dev.connectivityState !== nextState) {
        this.devices.set(uid, {
          ...dev,
          isOnline: nextOnline,
          isStale: nextStale,
          connectivityState: nextState,
        });
        changed = true;
      }
    });
    if (changed) {
      this.notify();
    }
    return changed;
  }

  public markBrokerConnected(): void {
    this.isBrokerDisconnected = false;
    this.suppressRemoteOnlineUntilTelemetry = false;
    this.evaluateLivenessStates();
  }

  public markAllOffline(): void {
    this.suppressRemoteOnlineUntilTelemetry = true;
    this.isBrokerDisconnected = true;
    let changed = false;
    this.devices.forEach((dev, uid) => {
      if (dev.isOnline || dev.isStale || dev.connectivityState !== 'OFFLINE') {
        // Preserve historical lastSeen and lastSeenTimestamp when reporting broker offline.
        this.devices.set(uid, { ...dev, isOnline: false, isStale: false, connectivityState: 'OFFLINE' });
        changed = true;
      }
    });
    if (changed) {
      this.saveToStorage({ skipPublish: true });
      this.notify();
    }
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
    const cleanUid = getCanonicalUid(uid);
    const existing = this.devices.get(cleanUid);
    const now = Date.now();
    const train = options?.trainNumber?.trim() || null;
    const coach = options?.coachNumber?.trim()?.toUpperCase() || null;
    const isEngaged = Boolean(
      train &&
      coach &&
      train.toUpperCase() !== 'UNASSIGNED' &&
      coach !== 'UNASSIGNED'
    );

    if (isEngaged && train && coach) {
      this.devices.forEach((other, otherUid) => {
        if (
          otherUid !== cleanUid &&
          (other.trainNumber || '').trim().toLowerCase() === train.toLowerCase() &&
          (other.coachNumber || '').trim().toUpperCase() === coach
        ) {
          this.devices.set(otherUid, {
            ...other,
            trainNumber: null,
            coachNumber: null,
            assignmentStatus: 'AVAILABLE',
          });
        }
      });
    }

    const base: ManagedDevice = existing || {
      uid: cleanUid,
      name: options?.name?.trim() || `Node (${cleanUid.slice(-6)})`,
      trainNumber: train,
      coachNumber: coach,
      registrationStatus: 'REGISTERED',
      assignmentStatus: isEngaged ? 'ENGAGED' : 'AVAILABLE',
      isOnline: false,
      batteryPercent: null,
      tank1Level: null,
      tank1HeightCm: null,
      tank2Level: null,
      tank2HeightCm: null,
      valve1Normal: true,
      valve2Normal: true,
      latitude: null,
      longitude: null,
      speedKmh: null,
      lastSeen: 'Awaiting Telemetry Signal',
      lastSeenTimestamp: 0,
      firstDiscovered: new Date(now).toISOString(),
      hardwareModel: options?.hardwareModel || 'Cellular WLI Unit',
    };

    const registered: ManagedDevice = {
      ...base,
      uid: cleanUid,
      name: options?.name?.trim() || base.name,
      trainNumber: train,
      coachNumber: coach,
      registrationStatus: 'REGISTERED',
      assignmentStatus: isEngaged ? 'ENGAGED' : 'AVAILABLE',
      hardwareModel: options?.hardwareModel || base.hardwareModel,
    };

    const isKnown = this.devices.has(cleanUid);
    this.devices.set(cleanUid, registered);
    this.saveToStorage();
    this.notify();

    // Async REST sync attempt when a backend origin is configured and active
    const apiBase = resolveRegistryApiBase();
    const isUnreachable = typeof window !== 'undefined' && (
      (window as any).__PANORAMA_IS_REMOTE_UNREACHABLE__
        ? (window as any).__PANORAMA_IS_REMOTE_UNREACHABLE__()
        : false
    );
    if (apiBase && !isUnreachable) {
      const token = typeof window !== 'undefined' ? localStorage.getItem('panorama_token') : null;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
      const syncBody = {
        name: registered.name,
        train_number: registered.trainNumber || 'UNASSIGNED',
        coach_number: registered.coachNumber || 'UNASSIGNED',
        hardware_version: registered.hardwareModel,
      };

      if (isKnown) {
        fetch(`${apiBase}/devices/${encodeURIComponent(registered.uid)}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(syncBody),
        }).catch(() => {});
      } else {
        fetch(`${apiBase}/devices`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            uid: registered.uid,
            ...syncBody,
          }),
        })
          .then((res) => {
            if (res.status === 400 || res.status === 409) {
              return fetch(`${apiBase}/devices/${encodeURIComponent(registered.uid)}`, {
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
    const cleanUid = getCanonicalUid(uid);
    const existing = this.devices.get(cleanUid);
    if (!existing) return undefined;

    const unassigned: ManagedDevice = {
      ...existing,
      trainNumber: null,
      coachNumber: null,
      assignmentStatus: 'AVAILABLE',
    };

    this.devices.set(cleanUid, unassigned);
    this.saveToStorage();
    this.notify();
    try {
      alertNotificationService.resolveAlertsForDevice(cleanUid, 'Device unassigned');
    } catch {}

    const isUnreachable = typeof window !== 'undefined' && (
      (window as any).__PANORAMA_IS_REMOTE_UNREACHABLE__
        ? (window as any).__PANORAMA_IS_REMOTE_UNREACHABLE__()
        : false
    );

    const apiBase = resolveRegistryApiBase();
    if (apiBase && !isUnreachable) {
      const token = typeof window !== 'undefined' ? localStorage.getItem('panorama_token') : null;
      fetch(`${apiBase}/devices/${encodeURIComponent(uid)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          trainNumber: 'UNASSIGNED',
          coachNumber: 'UNASSIGNED',
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
    const cleanUid = getCanonicalUid(uid);
    if (!cleanUid) return false;
    this.deletedUids.add(cleanUid);
    const deleted = this.devices.delete(cleanUid);
    if (deleted) {
      this.saveToStorage();
      this.notify();
      try {
        alertNotificationService.resolveAlertsForDevice(cleanUid, 'Device deleted');
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
