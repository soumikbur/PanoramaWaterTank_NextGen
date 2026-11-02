/**
 * Train and Fleet Management Data Types.
 */

export interface TrainOverviewItem {
  train_number: string;
  name: string;
  type: string;
  coaches_count: number;
  tanks_count: number;
  is_online: boolean;
  status: string;
  active_alarms: number;
}

export interface RegionSummary {
  region: 'NORTH' | 'SOUTH' | 'EAST' | 'WEST' | string;
  name: string;
  code: string;
  configuredTrains: number;
  coaches: number;
  tanks: number;
  onlineTrains: number;
  status: string;
  trains: TrainOverviewItem[];
}

export interface TankConsist {
  id: string;
  tank_index: number;
  name: string;
  capacity_liters: number;
  current_level_percent: number;
  current_volume_liters: number;
  status: 'NORMAL' | 'WARNING' | 'CRITICAL';
}

export interface CoachConsist {
  coach_number: string;
  device_uid: string;
  is_online: boolean;
  hardware_version: string;
  tanks: TankConsist[];
}

export interface TrainConsist {
  train_number: string;
  name: string;
  region: string;
  coaches_count: number;
  tanks_count: number;
  online_status: boolean;
  active_alarms_count: number;
  coaches: CoachConsist[];
}

