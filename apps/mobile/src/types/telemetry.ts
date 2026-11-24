export interface TelemetryPoint {
  timestamp: string;
  levelPercent: number;
  volumeLiters: number;
  heightCm: number;
}

export interface TelemetryStats {
  averagePercent: number;
  minPercent: number;
  maxPercent: number;
  deltaPercent: number;
}

export interface TelemetryHistory {
  tankId: string;
  tank_id?: string;
  range: '12h' | '24h' | '7d';
  stats: TelemetryStats;
  dataPoints: TelemetryPoint[];
  data_points?: any[];
  statistics?: any;
}

export interface LiveTelemetryPayload {
  uid: string;
  lat: number | null;
  long: number | null;
  alt?: number | null;
  sats?: number | null;
  accuracy?: number | null;
  gpsFix?: boolean;
  speed: number | null;
  time: string;
  cm1: number | null;
  cm2: number | null;
  wlp1: number | null;
  wlp2: number | null;
  wlv1: boolean | null;
  wlv2: boolean | null;
  bat: number | null;
  temp?: number | null;
  press?: number | null;
  chno: string;
  trno: string;
  receivedAt: number;
  isStale?: boolean;
  topic?: string;
  topicUid?: string;
  uidMismatch?: boolean;
}

export interface MqttGpsFix {
  lat: number;
  long: number;
  alt: number | null;
  speed: number;
  sats: number | null;
  accuracy: number | null;
  time: string;
  receivedAt: number;
  uid: string;
  trno: string;
  chno: string;
}

export interface TelemetryTableRow {
  id: number;
  deviceId: string;
  recordedAt: string;
  ai1Ma: number | null;
  level1Percent: string | null;
  ai1Valid: 'Valid' | 'Invalid' | '--' | string;
  batteryV: number | null;
  batteryPercent: string | null;
  latitude: number | null;
  longitude: number | null;
  altitudeM: number | null;
  gpsValid: 'Valid' | 'Invalid' | '--' | string;
  altitudeValid: 'Valid' | 'Invalid' | '--' | string;
  receivedUtc: string;
}

export interface TelemetryTableFilterParams {
  search?: string;
  deviceId?: string;
  startDate?: string;
  endDate?: string;
  ai1Valid?: string;
  gpsValid?: string;
  altitudeValid?: string;
  latestOnly?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface TelemetryTableResponse {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  totalDevices?: number;
  items: TelemetryTableRow[];
}


export type MqttConnectionStatus =
  | 'CONNECTED'
  | 'CONNECTING'
  | 'RECONNECTING'
  | 'SUBSCRIPTION_ERROR'
  | 'STALE'
  | 'DISCONNECTED';

export interface MqttLatestTopicRecord {
  id?: string;
  topic: string;
  payload: any;
  payload_type: 'JSON' | 'TEXT';
  qos: number;
  retained: boolean;
  received_at: string;
  updated_at: string;
  message_sequence: number;
}


