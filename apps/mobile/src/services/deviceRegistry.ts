/**
 * Panorama Water Tank Monitor — Device Registry Service.
 * 
 * Manages device discovery, hardware registration, train-coach mapping,
 * and resilient local persistence across browser sessions, reloads, and offline states.
 */

import { LiveTelemetryPayload } from '../types';

const API_BASE =
  (typeof process !== 'undefined' && (process.env?.API_URL || process.env?.REACT_APP_API_URL || process.env?.VITE_API_URL)) ||
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) ||
  (typeof window !== 'undefined' && window.location?.origin ? `${window.location.origin}/api/v1` : 'http://127.0.0.1:8000/api/v1');

export type DeviceRegistrationStatus = 'DISCOVERED' | 'REGISTERED';
export type DeviceAssignmentStatus = 'ENGAGED' | 'AVAILABLE';
export type DeviceOperationalStatus = 'DISCOVERED' | 'REGISTERED' | 'ENGAGED' | 'AVAILABLE' | 'OFFLINE';

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
  hardwareModel: string;
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

  private constructor() {
    this.loadFromStorage();
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
          parsed.forEach((d) => {
            // Recalculate isOnline based on elapsed time
            const isOnline = d.lastSeenTimestamp ? (now - d.lastSeenTimestamp) < STALE_TIMEOUT_MS : false;
            this.devices.set(d.uid, {
              ...d,
              isOnline: d.isOnline && isOnline,
            });
          });
        }
      }
    } catch (e) {
      console.warn('[DeviceRegistry] Error reading storage, initializing fresh:', e);
    }
    this.isInitialized = true;
  }

  /**
   * Save current devices map to localStorage.
   */
  private saveToStorage(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const list = Array.from(this.devices.values());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      console.warn('[DeviceRegistry] Error writing to storage:', e);
    }
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
    return Array.from(this.devices.values()).map((d) => {
      const isOnline = d.lastSeenTimestamp ? (now - d.lastSeenTimestamp) < STALE_TIMEOUT_MS : false;
      return {
        ...d,
        isOnline,
      };
    }).sort((a, b) => b.lastSeenTimestamp - a.lastSeenTimestamp);
  }

  public getDeviceByUid(uid: string): ManagedDevice | undefined {
    return this.devices.get(uid);
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
  public recordDiscoveredDevice(telemetry: LiveTelemetryPayload): ManagedDevice {
    const now = Date.now();
    const uid = telemetry.uid;
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
        latitude: telemetry.lat,
        longitude: telemetry.long,
        speedKmh: telemetry.speed,
        lastSeen: timeStr,
        lastSeenTimestamp: now,
        payloadTrno: telemetry.trno || existing.payloadTrno,
        payloadChno: telemetry.chno || existing.payloadChno,
      };

      this.devices.set(uid, updated);
      this.saveToStorage();
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
    this.saveToStorage();
    this.notify();
    return newDevice;
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
    const isEngaged = Boolean(train && coach);

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
      latitude: 22.557279,
      longitude: 88.352432,
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

    this.devices.set(uid, registered);
    this.saveToStorage();
    this.notify();

    // Async REST sync attempt (fail-safe for static hosting)
    const token = typeof window !== 'undefined' ? localStorage.getItem('panorama_token') : null;
    fetch(`${API_BASE}/devices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        uid: registered.uid,
        name: registered.name,
        train_number: registered.trainNumber || '',
        coach_number: registered.coachNumber || '',
        hardware_version: registered.hardwareModel,
      }),
    }).catch((err) => {
      // Expected on static GitHub Pages
      console.info('[DeviceRegistry] Offline/Static mode: backend sync skipped:', err?.message || err);
    });

    return registered;
  }

  /**
   * Map device to a specific train and coach consist.
   */
  public assignDevice(uid: string, trainNumber: string, coachNumber: string): ManagedDevice {
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

    return unassigned;
  }

  /**
   * Delete device from registry.
   */
  public deleteDevice(uid: string): boolean {
    const deleted = this.devices.delete(uid);
    if (deleted) {
      this.saveToStorage();
      this.notify();
    }
    return deleted;
  }
}

export const deviceRegistry = DeviceRegistryService.getInstance();
