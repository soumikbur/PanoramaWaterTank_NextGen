/**
 * Train and Fleet Management Data Types.
 */

export interface CoachCompositionItem {
  position: number;
  coach_number: string;
  coach_category: string;
  coach_type?: string | null;
}

export interface RouteStopItem {
  station_code: string;
  station_name: string;
  arrival?: string | null;
  departure?: string | null;
  day?: number | null;
}

export interface ProviderAttempt {
  provider: string;
  outcome: string;
  latency_ms: number;
  detail?: string | null;
}

export type TrainLookupStatus = 'VERIFIED' | 'NOT_FOUND' | 'UNAVAILABLE' | 'INVALID_FORMAT' | 'UNSUPPORTED_TYPE';

export type TrainLookupErrorCode =
  | 'INVALID_FORMAT'
  | 'NOT_FOUND'
  | 'NON_EXPRESS_TRAIN'
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'AUTH_ERROR'
  | 'INVALID_RESPONSE'
  | 'SERVER_UNAVAILABLE';

export interface TrainLookupResult {
  status: TrainLookupStatus;
  error_code?: TrainLookupErrorCode | null;
  train_number: string;
  train_name?: string | null;
  source_station?: string | null;
  source_code?: string | null;
  destination_station?: string | null;
  destination_code?: string | null;
  region?: string | null;
  railway_zone?: string | null;
  train_type?: string | null;
  running_days?: string[] | null;
  route: RouteStopItem[];
  coach_composition: CoachCompositionItem[];
  total_coaches?: number | null;
  has_official_composition: boolean;
  provider?: string | null;
  cached: boolean;
  latency_ms: number;
  verified_at?: string | null;
  missing_fields: string[];
  already_exists: boolean;
  message: string;
  provider_attempts: ProviderAttempt[];
}

export interface TrainCreatePayload {
  train_number: string;
  name: string;
  region: string;
  coach_number?: string;
  tank_capacity?: number;
  source_station?: string | null;
  source_code?: string | null;
  destination_station?: string | null;
  destination_code?: string | null;
  railway_zone?: string | null;
  train_type?: string | null;
  running_days?: string[] | null;
  coaches?: Array<{
    coach_number: string;
    coach_category?: string | null;
    coach_type?: string | null;
  }>;
  route?: RouteStopItem[];
  total_coaches?: number | null;
  has_official_composition?: boolean;
  api_provider?: string | null;
  last_verified_at?: string | null;
}

export interface TrainOverviewItem {
  train_number: string;
  name: string;
  type: string;
  coaches_count: number;
  tanks_count: number;
  is_online: boolean;
  status: string;
  active_alarms: number;
  region?: string;
  devices_count?: number;
  has_active_alarms?: boolean;
  source_station?: string | null;
  source_code?: string | null;
  destination_station?: string | null;
  destination_code?: string | null;
  railway_zone?: string | null;
  running_days?: string[] | null;
  total_coaches?: number | null;
  has_official_composition?: boolean;
  api_provider?: string | null;
  last_verified_at?: string | null;
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
  coach_category?: string | null;
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
  source_station?: string | null;
  source_code?: string | null;
  destination_station?: string | null;
  destination_code?: string | null;
  railway_zone?: string | null;
  train_type?: string | null;
  running_days?: string[] | null;
  total_coaches?: number | null;
  has_official_composition?: boolean;
  api_provider?: string | null;
  last_verified_at?: string | null;
}

