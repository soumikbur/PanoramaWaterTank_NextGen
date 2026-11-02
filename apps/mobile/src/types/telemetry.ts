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

