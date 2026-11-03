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
  is_simulated?: boolean;
  current_latitude?: number | null;
  current_longitude?: number | null;
  current_altitude?: number | null;
  current_speed_kmh?: number | null;
  satellites?: number | null;
  last_update?: string | null;
  waypoints: GPSWaypoint[];
}

export interface CorridorStation {
  id: string;
  name: string;
  code: string;
  latitude: number;
  longitude: number;
  route_order: number;
  water_refill_available: boolean;
  water_capacity_liters: number;
  operational_status: string;
  last_verified: string;
  is_source?: boolean;
  is_destination?: boolean;
}

export const DEFAULT_CORRIDOR_STATIONS: CorridorStation[] = [
  {
    id: 'hwh',
    name: 'Howrah Junction',
    code: 'HWH',
    latitude: 22.5839,
    longitude: 88.3426,
    route_order: 0,
    water_refill_available: true,
    water_capacity_liters: 50000,
    operational_status: 'Operational',
    last_verified: '05 Sep 2026',
    is_source: true,
  },
  {
    id: 'kqu',
    name: 'Kamarkundu',
    code: 'KQU',
    latitude: 22.8272,
    longitude: 88.1969,
    route_order: 1,
    water_refill_available: false,
    water_capacity_liters: 0,
    operational_status: 'No Facility',
    last_verified: '05 Sep 2026',
  },
  {
    id: 'bwn',
    name: 'Bardhaman Junction',
    code: 'BWN',
    latitude: 23.2324,
    longitude: 87.8615,
    route_order: 2,
    water_refill_available: true,
    water_capacity_liters: 25000,
    operational_status: 'Operational',
    last_verified: '05 Sep 2026',
  },
  {
    id: 'pan',
    name: 'Panagarh',
    code: 'PAN',
    latitude: 23.4518,
    longitude: 87.4382,
    route_order: 3,
    water_refill_available: false,
    water_capacity_liters: 0,
    operational_status: 'No Facility',
    last_verified: '05 Sep 2026',
  },
  {
    id: 'dgr',
    name: 'Durgapur',
    code: 'DGR',
    latitude: 23.5014,
    longitude: 87.3119,
    route_order: 4,
    water_refill_available: true,
    water_capacity_liters: 20000,
    operational_status: 'Operational',
    last_verified: '05 Sep 2026',
  },
  {
    id: 'rng',
    name: 'Raniganj',
    code: 'RNG',
    latitude: 23.6186,
    longitude: 87.1358,
    route_order: 5,
    water_refill_available: false,
    water_capacity_liters: 0,
    operational_status: 'No Facility',
    last_verified: '05 Sep 2026',
  },
  {
    id: 'asn',
    name: 'Asansol Junction',
    code: 'ASN',
    latitude: 23.6871,
    longitude: 86.9746,
    route_order: 6,
    water_refill_available: true,
    water_capacity_liters: 30000,
    operational_status: 'Operational',
    last_verified: '05 Sep 2026',
    is_destination: true,
  },
];
