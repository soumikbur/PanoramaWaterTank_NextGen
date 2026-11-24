export type AlarmSeverity = 'CRITICAL' | 'WARNING' | 'INFO';
export type AlarmType = 'CRITICAL_LOW' | 'WARNING_LOW' | 'OVERFLOW' | 'SENSOR_FAULT' | 'VOLTAGE_FAULT' | 'DEVICE_OFFLINE' | 'LOW_BATTERY';
export type AlarmLifecycleState = 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED';

export interface AlarmItem {
  id: string;
  deviceId?: string;
  device_id?: string;
  deviceUid?: string;
  device_uid?: string;
  tankId?: string;
  tank_id?: string;
  coachNumber?: string;
  coach_number?: string;
  trainNumber?: string;
  train_number?: string;
  alarmType?: AlarmType;
  alarm_type?: AlarmType;
  severity: AlarmSeverity;
  triggerValue?: number;
  trigger_value?: number;
  thresholdValue?: number;
  threshold_value?: number;
  message: string;
  status: AlarmLifecycleState;
  isAcknowledged?: boolean;
  triggeredAt?: string;
  triggered_at?: string;
  acknowledgedAt?: string;
  acknowledged_at?: string;
  resolvedAt?: string;
  resolved_at?: string;
}

export interface AlarmStats {
  totalActive: number;
  total_active?: number;
  criticalCount: number;
  warningCount: number;
  resolvedToday: number;
  critical?: number;
  warning?: number;
  info?: number;
  acknowledged?: number;
}

