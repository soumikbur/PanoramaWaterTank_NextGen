export interface Device {
  id: string;
  uid: string;
  trainNumber: string;
  coachNumber: string;
  name: string;
  hardwareVersion: string;
  firmwareVersion: string;
  isOnline: boolean;
  lastSeenAt: string | null;
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

