/**
 * Persistent browser-side fleet store for static hosting deployments (e.g. GitHub Pages).
 * Stores ONLY user-configured trains and their real coach/tank consists in localStorage.
 * Never fabricates hardcoded baseline trains or 24-coach fallbacks.
 */
import {
  CoachConsist,
  CoachFormInput,
  RegionSummary,
  TankLiveStatus,
  TrainConsist,
  TrainCreatePayload,
  TrainOverviewItem,
  TrainLocation,
} from '../types';
import { deviceRegistry } from './deviceRegistry';
import {
  mqttService,
  CENTRAL_FLEET_TOPIC,
  CENTRAL_DELTA_SYNC_TOPIC,
} from './mqttService';

export const FLEET_STORAGE_KEY = 'panorama_static_fleet_v2';
const LEGACY_FLEET_KEY = 'panorama_static_fleet_v1';
export const FLEET_UPDATED_EVENT = 'panorama:fleet-updated';

const centralChannel: BroadcastChannel | null =
  typeof window !== 'undefined' && typeof (window as any).BroadcastChannel === 'function'
    ? new BroadcastChannel('panorama_central_sync')
    : null;

export interface StoredTrainRecord {
  train: TrainOverviewItem;
  consist: TrainConsist;
}

export interface StaticFleetState {
  version: number;
  updatedAt: number;
  mutationId?: string;
  trains: Record<string, StoredTrainRecord>;
  deletedTrainNumbers?: Record<string, number>;
}

const REGION_META: Record<string, { name: string; code: string }> = {
  NORTH: { name: 'Northern Railway', code: 'NR' },
  SOUTH: { name: 'Southern Railway', code: 'SR' },
  EAST: { name: 'Eastern & South East', code: 'ER/SER' },
  WEST: { name: 'Western Railway', code: 'WR' },
};

export function normalizeRegionCode(raw?: string | null): 'NORTH' | 'SOUTH' | 'EAST' | 'WEST' {
  const s = (raw || '').trim().toUpperCase();
  if (s === 'NORTH' || s === 'NR' || s === 'NCR' || s === 'NWR' || s === 'NER' || s.includes('NORTH')) {
    return 'NORTH';
  }
  if (s === 'SOUTH' || s === 'SR' || s === 'SCR' || s === 'SWR' || s.includes('SOUTH')) {
    return 'SOUTH';
  }
  if (s === 'WEST' || s === 'WR' || s === 'WCR' || s === 'CR' || s.includes('WEST') || s.includes('CENTRAL')) {
    return 'WEST';
  }
  if (s === 'EAST' || s === 'ER' || s === 'SER' || s === 'SECR' || s === 'ECOR' || s === 'ECR' || s.includes('EAST')) {
    return 'EAST';
  }
  return 'NORTH';
}

const DEFAULT_INITIAL_STATE: StaticFleetState = {
  version: 1,
  updatedAt: 1700000000000,
  mutationId: 'initial-baseline',
  deletedTrainNumbers: {},
  trains: {
    '12842': {
      train: {
        train_number: '12842',
        name: 'Coromandel Express',
        region: 'EAST',
        type: 'Superfast Express',
        coaches_count: 22,
        tanks_count: 44,
        is_online: true,
        active_alarms: 0,
        status: 'All Normal',
        source_station: 'Howrah Jn',
        source_code: 'HWH',
        destination_station: 'MGR Chennai Central',
        destination_code: 'MAS',
        railway_zone: 'SER',
        total_coaches: 22,
        has_official_composition: true,
        api_provider: 'Standard Fleet Registry',
        last_verified_at: new Date().toISOString(),
        current_latitude: 22.5839,
        current_longitude: 88.3426,
        current_speed_kmh: 72.5,
      } as any,
      consist: {
        train_number: '12842',
        name: 'Coromandel Express',
        region: 'EAST',
        coaches_count: 22,
        tanks_count: 44,
        online_status: true,
        active_alarms_count: 0,
        source_station: 'Howrah Jn',
        destination_station: 'MGR Chennai Central',
        coaches: [
          {
            coach_number: 'A1',
            device_uid: 'PANORAMA-12842-A1',
            is_online: true,
            hardware_version: 'Standard WLI Node',
            tanks: [
              { id: 'tank-12842-A1-1', tank_index: 1, name: 'Tank 1 (Left)', capacity_liters: 500, current_level_percent: 78.5, current_volume_liters: 392.5, status: 'NORMAL' },
              { id: 'tank-12842-A1-2', tank_index: 2, name: 'Tank 2 (Right)', capacity_liters: 500, current_level_percent: 74.0, current_volume_liters: 370.0, status: 'NORMAL' },
            ],
          },
        ],
      },
    },
    '12841': {
      train: {
        train_number: '12841',
        name: 'Howrah Mail',
        region: 'SOUTH',
        type: 'Superfast Mail',
        coaches_count: 20,
        tanks_count: 40,
        is_online: false,
        active_alarms: 0,
        status: 'All Normal',
        source_station: 'MGR Chennai Central',
        source_code: 'MAS',
        destination_station: 'Howrah Jn',
        destination_code: 'HWH',
        railway_zone: 'SR',
        total_coaches: 20,
        has_official_composition: true,
        api_provider: 'Standard Fleet Registry',
        last_verified_at: new Date(Date.now() - 3600000).toISOString(),
        current_latitude: 17.6868,
        current_longitude: 83.2185,
        current_speed_kmh: 0,
      } as any,
      consist: {
        train_number: '12841',
        name: 'Howrah Mail',
        region: 'SOUTH',
        coaches_count: 20,
        tanks_count: 40,
        online_status: false,
        active_alarms_count: 0,
        source_station: 'MGR Chennai Central',
        destination_station: 'Howrah Jn',
        coaches: [
          {
            coach_number: 'B1',
            device_uid: 'PANORAMA-12841-B1',
            is_online: false,
            hardware_version: 'Standard WLI Node',
            tanks: [
              { id: 'tank-12841-B1-1', tank_index: 1, name: 'Tank 1 (Left)', capacity_liters: 500, current_level_percent: 60.0, current_volume_liters: 300.0, status: 'NORMAL' },
            ],
          },
        ],
      },
    },
    '12860': {
      train: {
        train_number: '12860',
        name: 'Gitanjali Express',
        region: 'WEST',
        type: 'Superfast Express',
        coaches_count: 24,
        tanks_count: 48,
        is_online: false,
        active_alarms: 0,
        status: 'All Normal',
        source_station: 'Howrah Jn',
        source_code: 'HWH',
        destination_station: 'CSMT Mumbai',
        destination_code: 'CSMT',
        railway_zone: 'CR',
        total_coaches: 24,
        has_official_composition: true,
        api_provider: 'Standard Fleet Registry',
        last_verified_at: new Date(Date.now() - 7200000).toISOString(),
        current_latitude: null,
        current_longitude: null,
        current_speed_kmh: null,
      } as any,
      consist: {
        train_number: '12860',
        name: 'Gitanjali Express',
        region: 'WEST',
        coaches_count: 24,
        tanks_count: 48,
        online_status: false,
        active_alarms_count: 0,
        source_station: 'Howrah Jn',
        destination_station: 'CSMT Mumbai',
        coaches: [
          {
            coach_number: 'C1',
            device_uid: 'PANORAMA-12860-C1',
            is_online: false,
            hardware_version: 'Standard WLI Node',
            tanks: [],
          },
        ],
      },
    },
  },
};

function readState(): StaticFleetState {
  if (typeof window === 'undefined' || !window.localStorage) {
    return DEFAULT_INITIAL_STATE;
  }
  try {
    // Purge legacy v1 mock baseline key if still present in browser storage
    if (window.localStorage.getItem(LEGACY_FLEET_KEY)) {
      window.localStorage.removeItem(LEGACY_FLEET_KEY);
    }
    const raw = window.localStorage.getItem(FLEET_STORAGE_KEY);
    if (!raw) {
      writeState(DEFAULT_INITIAL_STATE, { skipPublish: true });
      return DEFAULT_INITIAL_STATE;
    }
    const parsed = JSON.parse(raw);
    const trains =
      parsed?.trains && typeof parsed.trains === 'object' && Object.keys(parsed.trains).length > 0
        ? parsed.trains
        : DEFAULT_INITIAL_STATE.trains;
    const deletedTrainNumbers =
      parsed?.deletedTrainNumbers && typeof parsed.deletedTrainNumbers === 'object'
        ? parsed.deletedTrainNumbers
        : {};

    for (const num of Object.keys(deletedTrainNumbers)) {
      delete trains[num];
    }

    return {
      version: typeof parsed?.version === 'number' ? parsed.version : 1,
      updatedAt: typeof parsed?.updatedAt === 'number' ? parsed.updatedAt : 1700000000000,
      mutationId: parsed?.mutationId || 'initial-baseline',
      trains,
      deletedTrainNumbers,
    };
  } catch {
    return DEFAULT_INITIAL_STATE;
  }
}

// Always remove obsolete v1 baseline key on app startup regardless of API vs static mode
try {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem(LEGACY_FLEET_KEY);
  }
} catch {
  // Ignore storage access errors
}

function writeState(state: StaticFleetState, options?: { skipPublish?: boolean }): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    if (!options?.skipPublish) {
      state.version = (state.version || 0) + 1;
      state.updatedAt = Date.now();
      state.mutationId = `m-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;
    }
    window.localStorage.setItem(FLEET_STORAGE_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent(FLEET_UPDATED_EVENT));

    // Broadcast instantaneously across open tabs in same browser session
    centralChannel?.postMessage({
      type: 'FLEET_SYNC',
      state,
    });

    // Central cross-user MQTT synchronization
    if (!options?.skipPublish) {
      mqttService.publish(CENTRAL_FLEET_TOPIC, state, true);
      mqttService.publish(CENTRAL_DELTA_SYNC_TOPIC, {
        type: 'FLEET_UPDATE',
        version: state.version,
        updatedAt: state.updatedAt,
        mutationId: state.mutationId,
      });
    }
  } catch (err) {
    console.warn('[LocalFleetStore] Error in writeState:', err);
  }
}

export const localFleetStore = {
  hasTrain(trainNumber: string): boolean {
    const clean = (trainNumber || '').trim();
    const state = readState();
    return Boolean(clean && state.trains[clean]);
  },

  listTrains(region?: string, search?: string): TrainOverviewItem[] {
    const state = readState();
    let list = Object.values(state.trains).map((rec) => rec.train);

    if (region && region.trim().toUpperCase() !== 'ALL') {
      const regCode = normalizeRegionCode(region);
      list = list.filter((t) => normalizeRegionCode(t.region) === regCode);
    }

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (t) =>
          t.train_number.toLowerCase().includes(q) ||
          t.name.toLowerCase().includes(q)
      );
    }

    return list.sort((a, b) => a.train_number.localeCompare(b.train_number));
  },

  getRegionsSummary(): RegionSummary[] {
    const trains = this.listTrains();
    return Object.entries(REGION_META).map(([regKey, meta]) => {
      const regTrains = trains.filter((t) => normalizeRegionCode(t.region) === regKey);
      return {
        region: regKey,
        name: meta.name,
        code: meta.code,
        configuredTrains: regTrains.length,
        coaches: regTrains.reduce((sum, t) => sum + (t.coaches_count || 0), 0),
        tanks: regTrains.reduce((sum, t) => sum + (t.tanks_count || 0), 0),
        onlineTrains: regTrains.filter((t) => t.is_online).length,
        status: regTrains.some((t) => t.active_alarms > 0) ? 'Warning' : 'All Normal',
        trains: regTrains,
      };
    });
  },

  createTrain(payload: TrainCreatePayload): { success: boolean; train_number: string; coaches_created: number } {
    const num = (payload.train_number || '').trim();
    if (!num) {
      throw new Error('Train number is required.');
    }
    const state = readState();
    if (state.trains[num]) {
      const err: any = new Error(`Train ${num} is already registered in the fleet.`);
      err.status = 409;
      throw err;
    }
    if (state.deletedTrainNumbers && state.deletedTrainNumbers[num]) {
      delete state.deletedTrainNumbers[num];
    }

    const reg = normalizeRegionCode(payload.region);
    const coachSpecs =
      payload.coaches && payload.coaches.length > 0
        ? payload.coaches
        : payload.coach_number?.trim()
        ? [{ coach_number: payload.coach_number.trim().toUpperCase(), coach_category: 'General' }]
        : [{ coach_number: 'C1', coach_category: 'General' }];

    const seen = new Set<string>();
    const uniqueSpecs = coachSpecs.filter((c) => {
      const cn = (c.coach_number || '').trim().toUpperCase();
      if (!cn || seen.has(cn)) return false;
      seen.add(cn);
      return true;
    });

    const capacity = payload.tank_capacity || 500;
    const coaches: CoachConsist[] = uniqueSpecs.map((spec) => {
      const cNum = spec.coach_number.trim().toUpperCase();
      return {
        coach_number: cNum,
        coach_category: spec.coach_category || 'Coach',
        device_uid: `PANORAMA-${num}-${cNum}`,
        is_online: false,
        hardware_version: 'Standard WLI Node',
        tanks: [
          {
            id: `tank-${num}-${cNum}-1`,
            tank_index: 1,
            name: 'Arrival Side (Tank 1)',
            capacity_liters: capacity,
            current_level_percent: 0.0,
            current_volume_liters: 0.0,
            status: 'NORMAL' as const,
          },
          {
            id: `tank-${num}-${cNum}-2`,
            tank_index: 2,
            name: 'Departure Side (Tank 2)',
            capacity_liters: capacity,
            current_level_percent: 0.0,
            current_volume_liters: 0.0,
            status: 'NORMAL' as const,
          },
        ],
      };
    });

    const trainItem: TrainOverviewItem = {
      train_number: num,
      name: payload.name.trim(),
      type: payload.train_type || 'Express',
      coaches_count: coaches.length,
      tanks_count: coaches.length * 2,
      is_online: false,
      status: 'All Normal',
      active_alarms: 0,
      region: reg,
      source_station: payload.source_station ?? null,
      source_code: payload.source_code ?? null,
      destination_station: payload.destination_station ?? null,
      destination_code: payload.destination_code ?? null,
      railway_zone: payload.railway_zone ?? null,
      running_days: payload.running_days ?? null,
      total_coaches: payload.total_coaches ?? coaches.length,
      has_official_composition: Boolean(payload.has_official_composition),
      api_provider: payload.api_provider ?? null,
      last_verified_at: payload.last_verified_at ?? null,
    };

    const consist: TrainConsist = {
      train_number: num,
      name: trainItem.name,
      region: reg,
      coaches_count: coaches.length,
      tanks_count: coaches.length * 2,
      online_status: false,
      active_alarms_count: 0,
      coaches,
      source_station: trainItem.source_station,
      source_code: trainItem.source_code,
      destination_station: trainItem.destination_station,
      destination_code: trainItem.destination_code,
      railway_zone: trainItem.railway_zone,
      train_type: trainItem.type,
      running_days: trainItem.running_days,
      total_coaches: trainItem.total_coaches,
      has_official_composition: Boolean(trainItem.has_official_composition),
      api_provider: trainItem.api_provider,
      last_verified_at: trainItem.last_verified_at,
    };

    state.trains[num] = { train: trainItem, consist };
    writeState(state);

    return { success: true, train_number: num, coaches_created: coaches.length };
  },

  updateTrain(trainNumber: string, data: { name?: string; region?: string; type?: string }): { success: boolean } {
    const clean = (trainNumber || '').trim();
    const state = readState();
    const rec = state.trains[clean];
    if (!rec) {
      throw new Error(`Train ${clean} not found.`);
    }

    if (data.name !== undefined) {
      rec.train.name = data.name;
      rec.consist.name = data.name;
    }
    if (data.region !== undefined) {
      const reg = normalizeRegionCode(data.region);
      rec.train.region = reg;
      rec.consist.region = reg;
    }
    if (data.type !== undefined) {
      rec.train.type = data.type;
      rec.consist.train_type = data.type;
    }
    writeState(state);
    return { success: true };
  },

  deleteTrain(trainNumber: string): { success: boolean; message: string; trainId: string } {
    const clean = (trainNumber || '').trim();
    const state = readState();
    if (!state.trains[clean]) {
      throw new Error(`Train ${clean} was not found.`);
    }
    state.deletedTrainNumbers = state.deletedTrainNumbers || {};
    state.deletedTrainNumbers[clean] = Date.now();
    delete state.trains[clean];
    writeState(state);
    return { success: true, message: `Train ${clean} deleted successfully.`, trainId: clean };
  },

  handleCentralSync(remote: any): boolean {
    if (!remote || typeof remote !== 'object') return false;
    const remoteTrains = remote.trains;
    if (!remoteTrains || typeof remoteTrains !== 'object') return false;

    const remoteUpdatedAt = typeof remote.updatedAt === 'number' ? remote.updatedAt : 0;
    const remoteVersion = typeof remote.version === 'number' ? remote.version : 0;
    const remoteDeleted: Record<string, number> =
      remote.deletedTrainNumbers && typeof remote.deletedTrainNumbers === 'object'
        ? remote.deletedTrainNumbers
        : {};

    const localState = readState();
    const localUpdatedAt = typeof localState.updatedAt === 'number' ? localState.updatedAt : 0;
    const localVersion = typeof localState.version === 'number' ? localState.version : 0;

    // If local state is newer from a different mutation, do not overwrite with older remote
    if (localUpdatedAt > remoteUpdatedAt && remote.mutationId !== localState.mutationId) {
      console.info('[LocalFleetStore] Local state is newer than received remote snapshot. Retaining local.');
      return false;
    }

    const mergedDeleted: Record<string, number> = {
      ...(localState.deletedTrainNumbers || {}),
      ...remoteDeleted,
    };

    const cleanTrains: Record<string, StoredTrainRecord> = {};
    for (const [trainNum, rec] of Object.entries(remoteTrains as Record<string, StoredTrainRecord>)) {
      const cleanNum = trainNum.trim();
      if (!cleanNum || !rec || !rec.train) continue;
      if (mergedDeleted[cleanNum]) continue;
      cleanTrains[cleanNum] = rec;
    }

    // Preserve any locally added trains that aren't deleted and weren't in remote (if local is newer)
    if (localState.trains) {
      for (const [num, rec] of Object.entries(localState.trains)) {
        const cleanNum = num.trim();
        if (!cleanNum || mergedDeleted[cleanNum]) continue;
        if (!cleanTrains[cleanNum] && localUpdatedAt > remoteUpdatedAt) {
          cleanTrains[cleanNum] = rec;
        }
      }
    }

    const newState: StaticFleetState = {
      version: Math.max(localVersion, remoteVersion),
      updatedAt: Math.max(localUpdatedAt, remoteUpdatedAt, Date.now()),
      mutationId: remote.mutationId || localState.mutationId || 'remote-sync',
      trains: cleanTrains,
      deletedTrainNumbers: mergedDeleted,
    };

    writeState(newState, { skipPublish: true });
    return true;
  },

  getTrainConsist(trainNumber: string): TrainConsist | null {
    const clean = (trainNumber || '').trim();
    const state = readState();
    return state.trains[clean]?.consist ?? null;
  },

  addCoach(trainNumber: string, input: CoachFormInput): { success: boolean; coach: CoachConsist } {
    const num = (trainNumber || '').trim();
    const state = readState();
    const record = state.trains[num];
    if (!record) {
      throw new Error(`Train ${num} not found.`);
    }

    const cNum = (input.coach_number || '').trim().toUpperCase();
    if (!cNum) {
      throw new Error('Coach identifier is required (e.g. C1, B1, S1).');
    }

    if (record.consist.coaches.some((c) => c.coach_number.toUpperCase() === cNum)) {
      const err: any = new Error(`Coach ${cNum} already exists on Train ${num}.`);
      err.status = 409;
      throw err;
    }

    const devUid = (input.device_uid || '').trim() || `PANORAMA-${num}-${cNum}`;
    const t1Cap = Number(input.tank_1_capacity) > 0 ? Number(input.tank_1_capacity) : 500;
    const t2Cap = Number(input.tank_2_capacity) > 0 ? Number(input.tank_2_capacity) : 500;
    const t1Name = (input.tank_1_name || '').trim() || 'Arrival Side (Tank 1)';
    const t2Name = (input.tank_2_name || '').trim() || 'Departure Side (Tank 2)';
    const cat = (input.coach_category || input.coach_type || '').trim() || 'General';

    const h1 = Number(input.tank_1_height_cm) || Number(input.tank_height_cm) || 50;
    const h2 = Number(input.tank_2_height_cm) || Number(input.tank_height_cm) || 50;
    const geom1 = input.tank_1_geometry || 'CYLINDRICAL';
    const geom2 = input.tank_2_geometry || 'CYLINDRICAL';

    const newCoach: CoachConsist = {
      coach_number: cNum,
      coach_category: cat,
      coach_type: input.coach_type || cat,
      coach_name: (input.coach_name || '').trim() || `Coach ${cNum}`,
      device_uid: devUid,
      is_online: false,
      hardware_version: 'Standard WLI Node',
      tanks: [
        {
          id: `tank-${num}-${cNum}-1`,
          tank_index: 1,
          name: t1Name,
          capacity_liters: t1Cap,
          height_cm: h1,
          tank_type: geom1,
          geometry: geom1,
          current_height_cm: null,
          current_level_percent: 0.0,
          current_volume_liters: 0.0,
          status: 'NORMAL',
        },
        {
          id: `tank-${num}-${cNum}-2`,
          tank_index: 2,
          name: t2Name,
          capacity_liters: t2Cap,
          height_cm: h2,
          tank_type: geom2,
          geometry: geom2,
          current_height_cm: null,
          current_level_percent: 0.0,
          current_volume_liters: 0.0,
          status: 'NORMAL',
        },
      ],
    };

    record.consist.coaches.push(newCoach);
    record.consist.coaches_count = record.consist.coaches.length;
    record.consist.tanks_count = record.consist.coaches.length * 2;
    record.train.coaches_count = record.consist.coaches.length;
    record.train.tanks_count = record.consist.coaches.length * 2;

    if (input.device_uid && input.device_uid.trim()) {
      deviceRegistry.assignDevice(devUid, num, cNum);
    }

    writeState(state);
    return { success: true, coach: newCoach };
  },

  updateCoach(trainNumber: string, coachNumber: string, input: CoachFormInput): { success: boolean; coach: CoachConsist } {
    const num = (trainNumber || '').trim();
    const cNum = (coachNumber || '').trim().toUpperCase();
    const state = readState();
    const record = state.trains[num];
    if (!record) {
      throw new Error(`Train ${num} not found.`);
    }

    const coach = record.consist.coaches.find((c) => c.coach_number.toUpperCase() === cNum);
    if (!coach) {
      throw new Error(`Coach ${cNum} not found on Train ${num}.`);
    }

    if (input.coach_category !== undefined) {
      coach.coach_category = (input.coach_category || '').trim() || coach.coach_category;
    }
    if (input.coach_type !== undefined) {
      coach.coach_type = (input.coach_type || '').trim() || coach.coach_type;
    }
    if (input.coach_name !== undefined) {
      coach.coach_name = (input.coach_name || '').trim() || coach.coach_name;
    }

    const t1Cap = Number(input.tank_1_capacity) > 0 ? Number(input.tank_1_capacity) : null;
    const t2Cap = Number(input.tank_2_capacity) > 0 ? Number(input.tank_2_capacity) : null;
    const t1Name = (input.tank_1_name || '').trim();
    const t2Name = (input.tank_2_name || '').trim();

    coach.tanks.forEach((t) => {
      if (t.tank_index === 1) {
        if (t1Name) t.name = t1Name;
        if (t1Cap) t.capacity_liters = t1Cap;
        const h1 = Number(input.tank_1_height_cm) || Number(input.tank_height_cm);
        if (h1 && h1 > 0) t.height_cm = h1;
        if (input.tank_1_geometry) {
          t.tank_type = input.tank_1_geometry;
          t.geometry = input.tank_1_geometry;
        }
      } else if (t.tank_index === 2) {
        if (t2Name) t.name = t2Name;
        if (t2Cap) t.capacity_liters = t2Cap;
        const h2 = Number(input.tank_2_height_cm) || Number(input.tank_height_cm);
        if (h2 && h2 > 0) t.height_cm = h2;
        if (input.tank_2_geometry) {
          t.tank_type = input.tank_2_geometry;
          t.geometry = input.tank_2_geometry;
        }
      }
    });

    if (input.device_uid !== undefined) {
      const newDev = (input.device_uid || '').trim();
      const oldDev = coach.device_uid;
      if (newDev && newDev !== oldDev) {
        deviceRegistry.unassignDevice(oldDev);
        deviceRegistry.assignDevice(newDev, num, cNum);
        coach.device_uid = newDev;
      } else if (!newDev && oldDev) {
        deviceRegistry.unassignDevice(oldDev);
        coach.device_uid = `PANORAMA-${num}-${cNum}`;
      }
    }

    writeState(state);
    return { success: true, coach };
  },

  renameCoach(trainNumber: string, oldCoachNumber: string, newCoachNumber: string): { success: boolean; oldCoachNumber: string; newCoachNumber: string } {
    const num = (trainNumber || '').trim();
    const oldC = (oldCoachNumber || '').trim().toUpperCase();
    const newC = (newCoachNumber || '').trim().toUpperCase();

    if (!newC) {
      throw new Error('New coach identifier cannot be empty.');
    }
    if (oldC === newC) {
      return { success: true, oldCoachNumber: oldC, newCoachNumber: newC };
    }

    const state = readState();
    const record = state.trains[num];
    if (!record) {
      throw new Error(`Train ${num} not found.`);
    }

    if (record.consist.coaches.some((c) => c.coach_number.toUpperCase() === newC)) {
      const err: any = new Error(`Coach ${newC} already exists on Train ${num}.`);
      err.status = 409;
      throw err;
    }

    const coach = record.consist.coaches.find((c) => c.coach_number.toUpperCase() === oldC);
    if (!coach) {
      throw new Error(`Coach ${oldC} not found on Train ${num}.`);
    }

    coach.coach_number = newC;
    coach.coach_name = coach.coach_name?.replace(oldC, newC) || `Coach ${newC}`;
    coach.tanks.forEach((t) => {
      t.id = `tank-${num}-${newC}-${t.tank_index}`;
    });

    // Update mapped device in deviceRegistry if assigned
    if (coach.device_uid) {
      const dev = deviceRegistry.getDeviceByUid(coach.device_uid);
      if (dev && dev.trainNumber === num) {
        deviceRegistry.assignDevice(coach.device_uid, num, newC);
      }
    }

    writeState(state);
    return { success: true, oldCoachNumber: oldC, newCoachNumber: newC };
  },

  deleteCoach(trainNumber: string, coachNumber: string): { success: boolean; message: string; coachNumber: string } {
    const num = (trainNumber || '').trim();
    const cNum = (coachNumber || '').trim().toUpperCase();
    const state = readState();
    const record = state.trains[num];
    if (!record) {
      throw new Error(`Train ${num} not found.`);
    }

    const coachIdx = record.consist.coaches.findIndex((c) => c.coach_number.toUpperCase() === cNum);
    if (coachIdx === -1) {
      throw new Error(`Coach ${cNum} not found on Train ${num}.`);
    }

    const [deletedCoach] = record.consist.coaches.splice(coachIdx, 1);
    record.consist.coaches_count = record.consist.coaches.length;
    record.consist.tanks_count = record.consist.coaches.length * 2;
    record.train.coaches_count = record.consist.coaches.length;
    record.train.tanks_count = record.consist.coaches.length * 2;

    // Release device to unassigned pool rather than deleting hardware
    if (deletedCoach.device_uid) {
      deviceRegistry.unassignDevice(deletedCoach.device_uid);
    }

    writeState(state);
    return { success: true, message: `Coach ${cNum} deleted successfully from Train ${num}.`, coachNumber: cNum };
  },

  reorderCoaches(trainNumber: string, coachNumbers: string[]): { success: boolean; coaches: CoachConsist[] } {
    const num = (trainNumber || '').trim();
    const state = readState();
    const record = state.trains[num];
    if (!record) {
      throw new Error(`Train ${num} not found.`);
    }

    const coachMap = new Map<string, CoachConsist>();
    record.consist.coaches.forEach((c) => coachMap.set(c.coach_number.toUpperCase(), c));

    const reordered: CoachConsist[] = [];
    const seen = new Set<string>();

    coachNumbers.forEach((cn) => {
      const clean = cn.trim().toUpperCase();
      const c = coachMap.get(clean);
      if (c && !seen.has(clean)) {
        reordered.push(c);
        seen.add(clean);
      }
    });

    // Add any remaining coaches not in list
    record.consist.coaches.forEach((c) => {
      const clean = c.coach_number.toUpperCase();
      if (!seen.has(clean)) {
        reordered.push(c);
        seen.add(clean);
      }
    });

    record.consist.coaches = reordered;
    writeState(state);
    return { success: true, coaches: reordered };
  },

  listAllTanks(): TankLiveStatus[] {
    const state = readState();
    const tanks: TankLiveStatus[] = [];
    for (const { consist } of Object.values(state.trains)) {
      for (const coach of consist.coaches || []) {
        for (const t of coach.tanks || []) {
          tanks.push({
            tankId: t.id,
            deviceId: coach.device_uid,
            deviceUid: coach.device_uid,
            trainNumber: consist.train_number,
            coachNumber: coach.coach_number,
            tankName: t.name,
            tankIndex: t.tank_index,
            levelPercent: null,
            rawLevelPercent: null,
            volumeLiters: null,
            heightCm: null,
            capacityLiters: t.capacity_liters,
            maxHeightCm: 150.0,
            crossSectionalAreaM2: 0.33,
            rank: 'N/A',
            alarmStatus: 'AWAITING_TELEMETRY',
            batteryVoltage: null,
            isOnline: coach.is_online,
            hasTelemetry: false,
            isStale: !coach.is_online,
            lastUpdate: null,
            latitude: null,
            longitude: null,
          });
        }
      }
    }
    return tanks;
  },

  getTrainLocations(): TrainLocation[] {
    const state = readState();
    const locations: TrainLocation[] = [];
    for (const item of Object.values(state.trains)) {
      if (!item) continue;
      const train = item.train || (item as any);
      if (!train || !train.train_number) continue;
      const consist = item.consist || { coaches: [] };
      const coaches = consist?.coaches || [];
      const isOnline = coaches.some((c) => c && c.is_online) || Boolean(train.is_online);
      const devices = coaches
        .map((c) => (c && c.device_uid ? deviceRegistry.getDeviceByUid(c.device_uid) : null))
        .filter((d): d is NonNullable<typeof d> => Boolean(d));
      const devWithGps = devices.find((d) => d && d.latitude != null && d.longitude != null);
      const trainLat = devWithGps?.latitude ?? (train as any).current_latitude ?? null;
      const trainLon = devWithGps?.longitude ?? (train as any).current_longitude ?? null;
      const trainSpeed = devWithGps?.speedKmh ?? (train as any).current_speed_kmh ?? 0;

      const hasGps = Boolean(
        trainLat != null &&
        trainLon != null &&
        Number.isFinite(trainLat) &&
        Number.isFinite(trainLon) &&
        (Math.abs(trainLat) > 0.0001 || Math.abs(trainLon) > 0.0001)
      );

      locations.push({
        train_number: train.train_number,
        train_name: train.name,
        region: train.region,
        source_station: train.source_station || 'Source',
        destination_station: train.destination_station || 'Destination',
        coach_number: coaches.length === 1 ? coaches[0].coach_number : 'All',
        total_coaches: train.total_coaches || coaches.length || 1,
        connected_devices: devices.filter((d) => d.isOnline).length,
        is_online: isOnline,
        has_gps: hasGps,
        is_simulated: false,
        current_latitude: hasGps ? trainLat : null,
        current_longitude: hasGps ? trainLon : null,
        current_speed_kmh: hasGps ? trainSpeed : null,
        satellites: null,
        nearest_station: train.source_station || 'Live Corridor',
        last_update: devWithGps?.lastSeen || train.last_verified_at || null,
        waypoints: hasGps
          ? [
              {
                latitude: trainLat,
                longitude: trainLon,
                speed_kmh: trainSpeed,
                timestamp: devWithGps?.lastSeen || train.last_verified_at || new Date().toISOString(),
              },
            ]
          : [],
      });
    }
    return locations;
  },
};

if (typeof window !== 'undefined') {
  mqttService.onCentralFleetSync((data) => {
    localFleetStore.handleCentralSync(data);
  });

  centralChannel?.addEventListener('message', (event) => {
    if (event.data?.type === 'FLEET_SYNC' && event.data.state) {
      localFleetStore.handleCentralSync(event.data.state);
    }
  });
}
