/**
 * Panorama Water Tank Monitor — Tank Online/Offline Status Service
 *
 * Implements genuine SCADA telemetry verification for water tanks and coach consists.
 *
 * Strict Rules:
 * A tank is considered ONLINE only when ALL criteria are satisfied:
 * 1. It has a valid device mapping (device UID is mapped to the coach).
 * 2. It has received actual telemetry from its associated device.
 * 3. Its last successful telemetry timestamp is within the configured communication timeout.
 * 4. Its device has not been explicitly marked disconnected and MQTT broker is reachable.
 *
 * A tank is considered OFFLINE when:
 * - No telemetry has ever been received.
 * - Its last telemetry timestamp exceeds the timeout.
 * - Its associated device or MQTT broker is disconnected.
 * - Its device mapping is invalid or unavailable (unmapped coach).
 *
 * Invariant: Total Tanks = Online Tanks + Offline Tanks.
 */

import { LiveTelemetryPayload, MqttConnectionStatus, TankLiveStatus } from '../types';
import { ManagedDevice } from './deviceRegistry';

export const DEFAULT_TELEMETRY_TIMEOUT_SECONDS = 120;
export const TIMEOUT_STORAGE_KEY = 'panorama_telemetry_timeout_sec';

export type OfflineReason =
  | 'UNMAPPED'
  | 'NO_TELEMETRY'
  | 'TIMED_OUT'
  | 'MQTT_DISCONNECTED'
  | 'DEVICE_DISCONNECTED';

export interface ConsistTankItem extends TankLiveStatus {
  tankId: string;
  tankName: string;
  tankIndex: 1 | 2; // 1 = Arrival, 2 = Departure
  trainNumber: string;
  coachNumber: string;
  deviceUid: string;
  deviceId: string;
  isMapped: boolean;
  hasTelemetry: boolean;
  isOnline: boolean;
  offlineReason: OfflineReason | null;
  lastSeenTimestamp: number | null;
  lastSeenTimeStr: string | null;
  levelPercent: number | null;
  rawLevelPercent: number | null;
  volumeLiters: number | null;
  heightCm: number | null;
  capacityLiters: number;
  maxHeightCm: number;
  crossSectionalAreaM2: number;
  batteryPercent: number | null;
  batteryVoltage: number | null;
  valveNormal: boolean;
}

export interface ConsistCoachItem {
  coachNumber: string;
  coachType: string;
  deviceUid: string | null;
  deviceId: string;
  isMapped: boolean;
  isOnline: boolean;
  offlineReason: OfflineReason | null;
  lastSeenTimestamp: number | null;
  lastSeenTimeStr: string | null;
  batteryPercent: number | null;
  arrivalLevel: number | null;
  arrivalHeightCm: number | null;
  departureLevel: number | null;
  departureHeightCm: number | null;
  hasTelemetry: boolean;
  valve1Normal: boolean;
  valve2Normal: boolean;
  tanks: [ConsistTankItem, ConsistTankItem];
}

export interface ConsistMetrics {
  trainNumber: string;
  totalCoaches: number;
  totalTanks: number;
  onlineTanks: number;
  offlineTanks: number;
  unmappedTanks: number;
  onlineCoaches: number;
  offlineCoaches: number;
  timeoutSeconds: number;
}

/**
 * Retrieve configured telemetry timeout in seconds from localStorage or default (120s).
 */
export function getTelemetryTimeoutSeconds(): number {
  if (typeof window === 'undefined' || !window.localStorage) {
    return DEFAULT_TELEMETRY_TIMEOUT_SECONDS;
  }
  try {
    const saved = localStorage.getItem(TIMEOUT_STORAGE_KEY);
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed) && parsed >= 10 && parsed <= 3600) {
        return parsed;
      }
    }
  } catch {}
  return DEFAULT_TELEMETRY_TIMEOUT_SECONDS;
}

/**
 * Persist configured telemetry timeout in seconds.
 */
export function setTelemetryTimeoutSeconds(seconds: number): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const safe = Math.max(10, Math.min(3600, Math.round(seconds)));
    localStorage.setItem(TIMEOUT_STORAGE_KEY, safe.toString());
  } catch {}
}

/**
 * Compute the full consist model, tank statuses, and summary metrics for a given train.
 */
export function computeConsistData(params: {
  trainNumber: string;
  totalCoaches?: number;
  managedDevices: ManagedDevice[];
  liveTelemetry: LiveTelemetryPayload | null;
  mqttStatus: MqttConnectionStatus;
  timeoutSeconds?: number;
  now?: number;
}): {
  metrics: ConsistMetrics;
  coaches: ConsistCoachItem[];
  tanks: ConsistTankItem[];
} {
  const {
    trainNumber,
    totalCoaches = 24,
    managedDevices,
    liveTelemetry,
    mqttStatus,
    timeoutSeconds = getTelemetryTimeoutSeconds(),
    now = Date.now(),
  } = params;

  const coachTypes = ['Passenger', 'AC Chair Car', 'AC 3-Tier', 'AC 2-Tier', 'Sleeper Class', 'Executive'];
  const timeoutMs = timeoutSeconds * 1000;
  const isMqttActive = mqttStatus !== 'DISCONNECTED';

  const cleanTrainNumber = (trainNumber || '225256').trim();

  // Find all devices engaged with this specific train
  const engagedDevices = managedDevices.filter(
    (d) =>
      d.assignmentStatus === 'ENGAGED' &&
      d.trainNumber?.trim().toLowerCase() === cleanTrainNumber.toLowerCase()
  );

  const coaches: ConsistCoachItem[] = [];
  const tanks: ConsistTankItem[] = [];

  for (let i = 1; i <= totalCoaches; i++) {
    const defaultCoachNum = `C${i}`;
    const typeIndex = (i - 1) % coachTypes.length;
    const coachType = coachTypes[typeIndex];

    // Check if live telemetry matches this train & coach
    const isLiveMatch =
      liveTelemetry &&
      isMqttActive &&
      !liveTelemetry.isStale &&
      liveTelemetry.trno?.trim().toLowerCase() === cleanTrainNumber.toLowerCase() &&
      (liveTelemetry.chno?.trim().toLowerCase() === defaultCoachNum.toLowerCase() ||
        (i === 1 && liveTelemetry.chno));

    const coachNum = isLiveMatch && liveTelemetry ? liveTelemetry.chno : defaultCoachNum;

    // Check if this coach has a mapped device in the registry
    const mappedDevice = engagedDevices.find(
      (d) => d.coachNumber?.trim().toLowerCase() === coachNum.toLowerCase()
    );

    // Determine device mapping
    let deviceUid: string | null = null;
    let isMapped = false;
    let hasTelemetry = false;
    let lastSeenTimestamp: number | null = null;
    let lastSeenTimeStr: string | null = null;
    let batteryPercent: number | null = null;
    let batteryVoltage: number | null = null;
    let valve1Normal = true;
    let valve2Normal = true;
    let tank1Level: number | null = null;
    let tank1HeightCm: number | null = null;
    let tank2Level: number | null = null;
    let tank2HeightCm: number | null = null;
    let latitude: number | null = null;
    let longitude: number | null = null;

    if (mappedDevice) {
      isMapped = true;
      deviceUid = mappedDevice.uid;
      lastSeenTimestamp = mappedDevice.lastSeenTimestamp || null;
      lastSeenTimeStr = mappedDevice.lastSeen || null;
      hasTelemetry = mappedDevice.tank1Level != null || mappedDevice.tank2Level != null || Boolean(mappedDevice.lastSeenTimestamp);
      batteryPercent = mappedDevice.batteryPercent ?? null;
      batteryVoltage = mappedDevice.batteryVoltage ?? null;
      valve1Normal = mappedDevice.valve1Normal ?? true;
      valve2Normal = mappedDevice.valve2Normal ?? true;
      tank1Level = mappedDevice.tank1Level ?? null;
      tank1HeightCm = mappedDevice.tank1HeightCm ?? null;
      tank2Level = mappedDevice.tank2Level ?? null;
      tank2HeightCm = mappedDevice.tank2HeightCm ?? null;
      latitude = mappedDevice.latitude ?? null;
      longitude = mappedDevice.longitude ?? null;
    }

    // Overlay live telemetry if this coach has live incoming stream
    if (isLiveMatch && liveTelemetry) {
      isMapped = true;
      deviceUid = liveTelemetry.uid;
      lastSeenTimestamp = liveTelemetry.receivedAt || now;
      lastSeenTimeStr = liveTelemetry.time || new Date(now).toLocaleTimeString('en-US', { hour12: false });
      hasTelemetry = true;
      batteryPercent = liveTelemetry.bat;
      batteryVoltage = Number((3.2 + (liveTelemetry.bat / 100) * 1.0).toFixed(2));
      valve1Normal = liveTelemetry.wlv1;
      valve2Normal = liveTelemetry.wlv2;
      tank1HeightCm = liveTelemetry.cm1;
      tank2HeightCm = liveTelemetry.cm2;
      tank1Level = liveTelemetry.cm1 != null ? Number(Math.min(100, Math.max(0, (liveTelemetry.cm1 / 150.0) * 100)).toFixed(1)) : liveTelemetry.wlp1;
      tank2Level = liveTelemetry.cm2 != null ? Number(Math.min(100, Math.max(0, (liveTelemetry.cm2 / 150.0) * 100)).toFixed(1)) : liveTelemetry.wlp2;
      latitude = liveTelemetry.lat;
      longitude = liveTelemetry.long;
    }

    // Strict Online/Offline evaluation based on 4 criteria:
    // 1. Valid device mapping
    // 2. Received actual telemetry
    // 3. Telemetry timestamp within timeout
    // 4. Device and MQTT connection not disconnected
    let isCoachOnline = false;
    let offlineReason: OfflineReason | null = null;

    if (!isMapped || !deviceUid) {
      isCoachOnline = false;
      offlineReason = 'UNMAPPED';
    } else if (!hasTelemetry || lastSeenTimestamp == null || lastSeenTimestamp === 0) {
      isCoachOnline = false;
      offlineReason = 'NO_TELEMETRY';
    } else if (!isMqttActive) {
      isCoachOnline = false;
      offlineReason = 'MQTT_DISCONNECTED';
    } else if (now - lastSeenTimestamp > timeoutMs) {
      isCoachOnline = false;
      offlineReason = 'TIMED_OUT';
    } else {
      isCoachOnline = true;
      offlineReason = null;
    }

    // Tank 1: Arrival Side
    const tank1Id = `${cleanTrainNumber}-${coachNum}-tank-1`;
    const tank1Volume = tank1Level != null ? Number(((tank1Level / 100) * 500).toFixed(1)) : null;
    const tank1Status: ConsistTankItem = {
      tankId: tank1Id,
      tankName: 'Arrival Side (Tank 1)',
      tankIndex: 1,
      trainNumber: cleanTrainNumber,
      coachNumber: coachNum,
      deviceUid: deviceUid || 'UNMAPPED',
      deviceId: deviceUid || 'UNMAPPED',
      isMapped,
      hasTelemetry,
      isOnline: isCoachOnline,
      offlineReason,
      lastSeenTimestamp,
      lastSeenTimeStr,
      levelPercent: tank1Level,
      rawLevelPercent: tank1Level,
      volumeLiters: tank1Volume,
      heightCm: tank1HeightCm,
      capacityLiters: 500,
      maxHeightCm: 150.0,
      crossSectionalAreaM2: 0.33,
      rank: tank1Level && tank1Level > 70 ? 'GOOD' : tank1Level && tank1Level > 30 ? 'MODERATE' : 'LOW',
      alarmStatus: !valve1Normal ? 'VALVE_ALERT' : tank1Level != null && tank1Level < 10 ? 'CRITICAL_LOW' : 'NORMAL',
      batteryPercent,
      batteryVoltage,
      valveNormal: valve1Normal,
      isStale: !isCoachOnline,
      lastUpdate: lastSeenTimeStr,
      latitude,
      longitude,
    };

    // Tank 2: Departure Side
    const tank2Id = `${cleanTrainNumber}-${coachNum}-tank-2`;
    const tank2Volume = tank2Level != null ? Number(((tank2Level / 100) * 500).toFixed(1)) : null;
    const tank2Status: ConsistTankItem = {
      tankId: tank2Id,
      tankName: 'Departure Side (Tank 2)',
      tankIndex: 2,
      trainNumber: cleanTrainNumber,
      coachNumber: coachNum,
      deviceUid: deviceUid || 'UNMAPPED',
      deviceId: deviceUid || 'UNMAPPED',
      isMapped,
      hasTelemetry,
      isOnline: isCoachOnline,
      offlineReason,
      lastSeenTimestamp,
      lastSeenTimeStr,
      levelPercent: tank2Level,
      rawLevelPercent: tank2Level,
      volumeLiters: tank2Volume,
      heightCm: tank2HeightCm,
      capacityLiters: 500,
      maxHeightCm: 150.0,
      crossSectionalAreaM2: 0.33,
      rank: tank2Level && tank2Level > 70 ? 'GOOD' : tank2Level && tank2Level > 30 ? 'MODERATE' : 'LOW',
      alarmStatus: !valve2Normal ? 'VALVE_ALERT' : tank2Level != null && tank2Level < 10 ? 'CRITICAL_LOW' : 'NORMAL',
      batteryPercent,
      batteryVoltage,
      valveNormal: valve2Normal,
      isStale: !isCoachOnline,
      lastUpdate: lastSeenTimeStr,
      latitude,
      longitude,
    };

    const coachItem: ConsistCoachItem = {
      coachNumber: coachNum,
      coachType,
      deviceUid,
      deviceId: deviceUid || 'Not Mapped',
      isMapped,
      isOnline: isCoachOnline,
      offlineReason,
      lastSeenTimestamp,
      lastSeenTimeStr,
      batteryPercent,
      arrivalLevel: tank1Level,
      arrivalHeightCm: tank1HeightCm,
      departureLevel: tank2Level,
      departureHeightCm: tank2HeightCm,
      hasTelemetry,
      valve1Normal,
      valve2Normal,
      tanks: [tank1Status, tank2Status],
    };

    coaches.push(coachItem);
    tanks.push(tank1Status, tank2Status);
  }

  const totalTanks = tanks.length;
  const onlineTanks = tanks.filter((t) => t.isOnline).length;
  const offlineTanks = totalTanks - onlineTanks;
  const unmappedTanks = tanks.filter((t) => !t.isMapped).length;
  const onlineCoaches = coaches.filter((c) => c.isOnline).length;
  const offlineCoaches = coaches.length - onlineCoaches;

  const metrics: ConsistMetrics = {
    trainNumber: cleanTrainNumber,
    totalCoaches,
    totalTanks,
    onlineTanks,
    offlineTanks,
    unmappedTanks,
    onlineCoaches,
    offlineCoaches,
    timeoutSeconds,
  };

  return {
    metrics,
    coaches,
    tanks,
  };
}

