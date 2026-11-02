export type AlarmSeverity = 'CRITICAL' | 'WARNING' | 'INFO';
export type AlarmType = 'CRITICAL_LOW' | 'WARNING_LOW' | 'OVERFLOW' | 'SENSOR_FAULT' | 'VOLTAGE_FAULT';
export type AlarmLifecycleState = 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED';

export interface AlarmItem {
  id: string;
  deviceId?: string;
  device_id?: string;
  tankId?: string;
  tank_id?: string;
  coachNumber?: string;
  coach_number?: string;
  alarmType?: AlarmType;
  alarm_type?: AlarmType;
  severity: AlarmSeverity;
  triggerValue?: number;
  trigger_value?: number;
  thresholdValue?: number;
  threshold_value?: number;
  message: string;
  status: AlarmLifecycleState;
  triggeredAt?: string;
  triggered_at?: string;
  acknowledgedAt?: string;
  acknowledged_at?: string;
  resolvedAt?: string;
  resolved_at?: string;
}

export interface AlarmStats {
  totalActive: number;
  criticalCount: number;
  warningCount: number;
  resolvedToday: number;
}

