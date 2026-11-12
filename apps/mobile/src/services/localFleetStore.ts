/**
 * Static-hosting fleet store used ONLY when the frontend is served on static
 * hosting (GitHub Pages) without a configured external FastAPI `VITE_API_URL`.
 */
import { RegionSummary, TrainConsist, TrainCreatePayload, TrainOverviewItem } from '../types';

const STORAGE_KEY = 'panorama_static_fleet_v1';

interface StoredTrainRecord {
  train: TrainOverviewItem;
  consist: TrainConsist;
}

interface StaticFleetState {
  added: Record<string, StoredTrainRecord>;
  edited: Record<string, Partial<TrainOverviewItem>>;
  deleted: string[];
}

const REGION_META: Record<string, { name: string; code: string }> = {
  EAST: { name: 'Eastern Railway', code: 'ER' },
  NORTH: { name: 'Northern Railway', code: 'NR' },
  WEST: { name: 'Western Railway', code: 'WR' },
  SOUTH: { name: 'Southern Railway', code: 'SR' },
};

const BASELINE_TRAINS: TrainOverviewItem[] = [
  {
    train_number: '12301',
    name: 'Rajdhani Express',
    type: 'Superfast / Rajdhani',
    coaches_count: 24,
    tanks_count: 48,
    is_online: false,
    status: 'Standby',
    active_alarms: 0,
    region: 'EAST',
  },
  {
    train_number: '225256',
    name: 'Express Fleet (Telemetry)',
    type: 'Special Express',
    coaches_count: 24,
    tanks_count: 48,
    is_online: false,
    status: 'Standby',
    active_alarms: 0,
    region: 'EAST',
  },
  {
    train_number: '12423',
    name: 'Rajdhani Express',
    type: 'Rajdhani Express',
    coaches_count: 24,
    tanks_count: 48,
    is_online: true,
    status: 'Operational',
    active_alarms: 0,
    region: 'NORTH',
  },
  {
    train_number: '12951',
    name: 'Mumbai Rajdhani',
    type: 'Rajdhani Express',
    coaches_count: 24,
    tanks_count: 48,
    is_online: true,
    status: 'Operational',
    active_alarms: 0,
    region: 'WEST',
  },
  {
    train_number: '12621',
    name: 'Tamil Nadu Express',
    type: 'Superfast Express',
    coaches_count: 24,
    tanks_count: 48,
    is_online: true,
    status: 'Operational',
    active_alarms: 0,
    region: 'SOUTH',
  },
];

export function normalizeRegionCode(region?: string): string {
  const r = (region || 'NORTH').trim().toUpperCase();
  if (r.includes('NORTH') || r === 'NR') return 'NORTH';
  if (r.includes('SOUTH EAST') || r.includes('EAST') || r === 'ER' || r === 'SER') return 'EAST';
  if (r.includes('SOUTH') || r === 'SR') return 'SOUTH';
  if (r.includes('WEST') || r.includes('CENTRAL') || r === 'WR' || r === 'CR') return 'WEST';
  return 'NORTH';
}

function readState(): StaticFleetState {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { added: {}, edited: {}, deleted: [] };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { added: {}, edited: {}, deleted: [] };
    const parsed = JSON.parse(raw);
    return {
      added: parsed?.added && typeof parsed.added === 'object' ? parsed.added : {},
      edited: parsed?.edited && typeof parsed.edited === 'object' ? parsed.edited : {},
      deleted: Array.isArray(parsed?.deleted) ? parsed.deleted : [],
    };
  } catch {
    return { added: {}, edited: {}, deleted: [] };
  }
}

function writeState(state: StaticFleetState): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors gracefully
  }
}

function buildMergedTrains(): TrainOverviewItem[] {
  const state = readState();
  const deletedSet = new Set(state.deleted);
  const byNumber = new Map<string, TrainOverviewItem>();

  for (const t of BASELINE_TRAINS) {
    if (!deletedSet.has(t.train_number)) {
      byNumber.set(t.train_number, { ...t });
    }
  }
  for (const [num, rec] of Object.entries(state.added)) {
    if (!deletedSet.has(num) && rec?.train) {
      byNumber.set(num, { ...rec.train });
    }
  }
  for (const [num, patch] of Object.entries(state.edited)) {
    const cur = byNumber.get(num);
    if (cur && patch) {
      byNumber.set(num, { ...cur, ...patch });
    }
  }
  return Array.from(byNumber.values());
}

export const localFleetStore = {
  hasTrain(trainNumber: string): boolean {
    const clean = (trainNumber || '').trim();
    return buildMergedTrains().some((t) => t.train_number === clean);
  },

  listTrains(region?: string, search?: string): TrainOverviewItem[] {
    let list = buildMergedTrains();
    if (region && region.trim().toUpperCase() !== 'ALL') {
      const targetReg = normalizeRegionCode(region);
      list = list.filter((t) => normalizeRegionCode(t.region) === targetReg);
    }
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (t) =>
          t.train_number.toLowerCase().includes(q) ||
          (t.name || '').toLowerCase().includes(q)
      );
    }
    return list;
  },

  getRegionsSummary(): RegionSummary[] {
    const trains = buildMergedTrains();
    return Object.entries(REGION_META).map(([regKey, meta]) => {
      const regTrains = trains.filter((t) => normalizeRegionCode(t.region) === regKey);
      return {
        region: regKey,
        name: meta.name,
        code: meta.code,
        configuredTrains: regTrains.length,
        coaches: regTrains.reduce((acc, t) => acc + (t.coaches_count || 0), 0),
        tanks: regTrains.reduce((acc, t) => acc + (t.tanks_count || 0), 0),
        onlineTrains: regTrains.filter((t) => t.is_online).length,
        status: 'All Normal',
        trains: regTrains,
      };
    });
  },

  createTrain(payload: TrainCreatePayload): { success: boolean; train_number: string; coaches_created: number } {
    const num = (payload.train_number || '').trim();
    if (!num || !payload.name?.trim()) {
      const err: any = new Error('Train number and train name are required.');
      err.status = 422;
      throw err;
    }
    if (this.hasTrain(num)) {
      const err: any = new Error(`Train ${num} is already registered in the fleet.`);
      err.status = 409;
      throw err;
    }

    const reg = normalizeRegionCode(payload.region);
    const capacity = payload.tank_capacity && payload.tank_capacity > 0 ? payload.tank_capacity : 20.0;
    const rawCoaches =
      payload.coaches && payload.coaches.length > 0
        ? payload.coaches
        : [{ coach_number: (payload.coach_number || 'B1').trim().toUpperCase() || 'B1', coach_category: 'AC 3-Tier', coach_type: '3A' }];

    const coaches = rawCoaches.map((c) => {
      const cNum = (c.coach_number || 'B1').trim().toUpperCase();
      return {
        coach_number: cNum,
        device_uid: `STATIC-${num}-${cNum}`,
        is_online: false,
        hardware_version: 'v2.2.0',
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

    const state = readState();
    state.deleted = state.deleted.filter((d) => d !== num);
    delete state.edited[num];
    state.added[num] = { train: trainItem, consist };
    writeState(state);

    return { success: true, train_number: num, coaches_created: coaches.length };
  },

  updateTrain(trainNumber: string, data: { name?: string; region?: string; type?: string }): { success: boolean } {
    const clean = (trainNumber || '').trim();
    const state = readState();
    const patch: Partial<TrainOverviewItem> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.region !== undefined) patch.region = normalizeRegionCode(data.region);
    if (data.type !== undefined) patch.type = data.type;

    if (state.added[clean]) {
      state.added[clean].train = { ...state.added[clean].train, ...patch };
      if (data.name !== undefined) state.added[clean].consist.name = data.name;
      if (data.region !== undefined) state.added[clean].consist.region = normalizeRegionCode(data.region);
      if (data.type !== undefined) state.added[clean].consist.train_type = data.type;
    } else {
      state.edited[clean] = { ...(state.edited[clean] || {}), ...patch };
    }
    writeState(state);
    return { success: true };
  },

  deleteTrain(trainNumber: string): { success: boolean; message: string; trainId: string } {
    const clean = (trainNumber || '').trim();
    const state = readState();
    delete state.added[clean];
    delete state.edited[clean];
    if (!state.deleted.includes(clean)) {
      state.deleted.push(clean);
    }
    writeState(state);
    return { success: true, message: `Train ${clean} deleted successfully.`, trainId: clean };
  },

  getTrainConsist(trainNumber: string): TrainConsist | null {
    const clean = (trainNumber || '').trim();
    const state = readState();
    if (state.deleted.includes(clean)) return null;
    if (state.added[clean]?.consist) {
      return state.added[clean].consist;
    }
    return null;
  },
};

