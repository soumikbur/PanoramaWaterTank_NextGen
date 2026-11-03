export type RankType = 'LOW' | 'MODERATE' | 'GOOD' | 'HIGH' | 'N/A';
export type AlarmStatus = 'NORMAL' | 'WARNING_LOW' | 'CRITICAL_LOW' | 'OVERFLOW' | 'SENSOR_FAULT' | 'AWAITING_TELEMETRY' | 'STALE_DATA' | string;

export interface TankLiveStatus {
  tankId: string;
  deviceId: string;
  deviceUid: string;
  trainNumber: string;
  coachNumber: string;
  tankName: string;
  tankIndex?: number;
  levelPercent: number | null;
  rawLevelPercent: number | null;
  volumeLiters: number | null;
  heightCm: number | null;
  capacityLiters: number;
  maxHeightCm: number;
  crossSectionalAreaM2: number;
  rank: RankType;
  alarmStatus: AlarmStatus;
  batteryVoltage: number | null;
  isOnline: boolean;
  hasTelemetry?: boolean;
  isStale?: boolean;
  lastUpdate: string | null;
  // Optional environmental values if reported
  temperature?: number | null;
  pressure?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  auxVoltage?: number | null;
  timestamp?: string | null;
}

export interface TankGeometry {
  name: string;
  capacityLiters: number;
  heightCm: number;
  areaM2: number;
  warningThresholdPercent: number;
  criticalThresholdPercent: number;
  overflowThresholdPercent: number;
}

