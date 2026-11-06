export interface Device {
  id: string;
  uid: string;
  trainNumber: string;
  coachNumber: string;
  name: string;
  hardwareVersion: string;
  firmwareVersion: string;
  isOnline: boolean;
  is_online?: boolean;
  train_number?: string;
  coach_number?: string;
  hardware_version?: string;
  firmware_version?: string;
  lastSeenAt: string | null;
  last_seen_at?: string | null;
  lastHeartbeat?: string | null;
  batteryPercent?: number;
  batteryVoltage?: number;
  temperature?: number;
  primaryLevel?: number;
  secondaryLevel?: number;
  hasActiveAlarm: boolean;
}

export interface DeviceDiagnostics {
  deviceId: string;
  uid: string;
  batteryV1: number;
  auxiliaryV2: number;
  latitude: number | null;
  longitude: number | null;
  altitudeMeters: number | null;
  speedKmh: number;
  satellites: number;
  sensor1Valid: boolean;
  sensor2Valid: boolean;
  lastPayloadAt: string;
}

