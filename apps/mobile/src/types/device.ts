export interface Device {
  id: string;
  uid: string;
  trainNumber: string;
  coachNumber: string;
  name: string;
  hardwareVersion?: string;
  firmwareVersion?: string;
  deviceType?: string;
  protocol?: string;
  mqttClientId?: string;
  mqttTopic?: string;
  tankAssignment?: 'BOTH' | 'Tank 1' | 'Tank 2' | string;
  description?: string;
  status?: 'AVAILABLE' | 'IN_USE' | 'MAINTENANCE' | 'DECOMMISSIONED' | string;
  isOnline: boolean;
  is_online?: boolean;
  train_number?: string;
  coach_number?: string;
  hardware_version?: string;
  firmware_version?: string;
  device_type?: string;
  mqtt_client_id?: string;
  mqtt_topic?: string;
  tank_assignment?: string;
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

export interface DeviceCreatePayload {
  uid: string;
  name: string;
  train_number?: string;
  trainNumber?: string;
  coach_number?: string;
  coachNumber?: string;
  hardware_version?: string;
  hardwareVersion?: string;
  firmware_version?: string;
  firmwareVersion?: string;
  device_type?: string;
  deviceType?: string;
  protocol?: string;
  mqtt_client_id?: string;
  mqttClientId?: string;
  mqtt_topic?: string;
  mqttTopic?: string;
  tank_assignment?: string;
  tankAssignment?: string;
  description?: string;
  status?: string;
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

