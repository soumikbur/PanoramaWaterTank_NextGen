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
  range: '12h' | '24h' | '7d';
  stats: TelemetryStats;
  dataPoints: TelemetryPoint[];
}

export interface LiveTelemetryPayload {
  uid: string;
  lat: number | null;
  long: number | null;
  speed: number;
  time: string;
  cm1: number;
  cm2: number;
  wlp1: number;
  wlp2: number;
  wlv1: boolean;
  wlv2: boolean;
  bat: number;
  chno: string;
  trno: string;
  receivedAt: number;
  isStale?: boolean;
}

export type MqttConnectionStatus = 'CONNECTED' | 'CONNECTING' | 'STALE' | 'DISCONNECTED';


