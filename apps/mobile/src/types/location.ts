/**
 * GPS and Tracking Data Types.
 */

export interface GPSWaypoint {
  latitude: number;
  longitude: number;
  altitude?: number;
  speed_kmh?: number;
  satellites?: number;
  timestamp: string;
}

export interface TrainLocation {
  train_number: string;
  coach_number: string;
  is_online: boolean;
  has_gps?: boolean;
  current_latitude?: number | null;
  current_longitude?: number | null;
  current_altitude?: number | null;
  current_speed_kmh?: number | null;
  satellites?: number | null;
  last_update?: string | null;
  waypoints: GPSWaypoint[];
}

