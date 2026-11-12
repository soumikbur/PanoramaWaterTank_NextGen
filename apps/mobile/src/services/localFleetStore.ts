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
} from '../types';
import { deviceRegistry } from './deviceRegistry';

export const FLEET_STORAGE_KEY = 'panorama_static_fleet_v2';
const LEGACY_FLEET_KEY = 'panorama_static_fleet_v1';
export const FLEET_UPDATED_EVENT = 'panorama:fleet-updated';

interface StoredTrainRecord {
  train: TrainOverviewItem;
  consist: TrainConsist;
}

interface StaticFleetState {
  trains: Record<string, StoredTrainRecord>;
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

function readState(): StaticFleetState {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { trains: {} };
  }
  try {
    // Purge legacy v1 mock baseline key if still present in browser storage
    if (window.localStorage.getItem(LEGACY_FLEET_KEY)) {
      window.localStorage.removeItem(LEGACY_FLEET_KEY);
    }
    const raw = window.localStorage.getItem(FLEET_STORAGE_KEY);
    if (!raw) return { trains: {} };
    const parsed = JSON.parse(raw);
    return {
      trains: parsed?.trains && typeof parsed.trains === 'object' ? parsed.trains : {},
    };
  } catch {
    return { trains: {} };
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

function writeState(state: StaticFleetState): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(FLEET_STORAGE_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent(FLEET_UPDATED_EVENT));
  } catch {
    // Ignore storage quota errors cleanly
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
    delete state.trains[clean];
    writeState(state);
    return { success: true, message: `Train ${clean} deleted successfully.`, trainId: clean };
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
          current_level_percent: 0.0,
          current_volume_liters: 0.0,
          status: 'NORMAL',
        },
        {
          id: `tank-${num}-${cNum}-2`,
          tank_index: 2,
          name: t2Name,
          capacity_liters: t2Cap,
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
      } else if (t.tank_index === 2) {
        if (t2Name) t.name = t2Name;
        if (t2Cap) t.capacity_liters = t2Cap;
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
};
