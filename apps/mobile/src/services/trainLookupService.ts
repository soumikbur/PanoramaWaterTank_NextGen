/**
 * Frontend Train Verification Service.
 *
 * Executes explicit, manual train verification with:
 * - Backend FastAPI lookup (`/trains/lookup/{train_number}`) when an external/local API server is configured
 * - Direct CORS-enabled multi-provider fallback chain when deployed on static GitHub Pages:
 *   1. RailRadar Public v1 API (`https://railradar.in/api/v1/trains/{train_number}`)
 *   2. DataMeet Indian Railways OpenData (`trains.json` raw GitHub + jsDelivr CDN fallback)
 * - Express-family train enforcement, request timeout handling, bounded transient retry,
 *   in-flight deduplication, and structured failure classification.
 */
import { ApiClient } from '../api/client';
import { localFleetStore } from './localFleetStore';
import {
  CoachCompositionItem,
  ProviderAttempt,
  RouteStopItem,
  TrainLookupErrorCode,
  TrainLookupResult,
} from '../types/train';

const CLIENT_CACHE_TTL_MS = 10 * 60 * 1000;
const DATAMEET_STORAGE_KEY = 'panorama_datameet_index_v1';
const DATAMEET_STORAGE_TTL_MS = 24 * 60 * 60 * 1000;
const TRAIN_NUMBER_REGEX = /^\d{4,5}$/;
const BACKEND_TIMEOUT_MS = 10_000;
const RAILRADAR_PUBLIC_TIMEOUT_MS = 8_000;
const DATAMEET_TIMEOUT_MS = 15_000;

const RAILRADAR_PUBLIC_BASE = 'https://railradar.in/api/v1';

const DATAMEET_ENDPOINTS = [
  'https://raw.githubusercontent.com/datameet/railways/master/trains.json',
  'https://cdn.jsdelivr.net/gh/datameet/railways@master/trains.json',
];

const ZONE_TO_REGION: Record<string, string> = {
  NR: 'NORTH',
  NCR: 'NORTH',
  NER: 'NORTH',
  NWR: 'NORTH',
  NFR: 'EAST',
  ER: 'EAST',
  ECR: 'EAST',
  ECOR: 'EAST',
  SER: 'EAST',
  SECR: 'EAST',
  WR: 'WEST',
  WCR: 'WEST',
  CR: 'WEST',
  KR: 'WEST',
  SR: 'SOUTH',
  SCR: 'SOUTH',
  SWR: 'SOUTH',
  MR: 'EAST',
};

const TRAIN_TYPE_MAP: Record<string, string> = {
  SHTB: 'Shatabdi Express',
  SHATABDI: 'Shatabdi Express',
  RAJ: 'Rajdhani Express',
  RAJDHANI: 'Rajdhani Express',
  SF: 'Superfast Express',
  SUPERFAST: 'Superfast Express',
  EXP: 'Express',
  EXPRESS: 'Express',
  PASS: 'Passenger',
  PASSENGER: 'Passenger',
  DRNT: 'Duronto Express',
  DURONTO: 'Duronto Express',
  GR: 'Garib Rath Express',
  'GARIB RATH': 'Garib Rath Express',
  JSHT: 'Jan Shatabdi Express',
  JSHTB: 'Jan Shatabdi Express',
  'JAN SHATABDI': 'Jan Shatabdi Express',
  VB: 'Vande Bharat Express',
  'VANDE BHARAT': 'Vande Bharat Express',
  SK: 'Sampark Kranti Express',
  SKR: 'Sampark Kranti Express',
  HS: 'Humsafar Express',
  TEJ: 'Tejas Express',
  MEMU: 'MEMU',
  DEMU: 'DEMU',
  MAIL: 'Mail Express',
  MAIL_EXPRESS: 'Mail Express',
  ANT: 'Antyodaya Express',
};

interface CachedEntry {
  expiresAt: number;
  result: TrainLookupResult;
}

interface DataMeetCompactEntry {
  number: string;
  name: string;
  zone?: string | null;
  from_station_code?: string | null;
  from_station_name?: string | null;
  to_station_code?: string | null;
  to_station_name?: string | null;
  type?: string | null;
}

class ClassifiedLookupError extends Error {
  code: TrainLookupErrorCode;
  status?: number;
  retryable: boolean;

  constructor(code: TrainLookupErrorCode, message: string, options?: { status?: number; retryable?: boolean }) {
    super(message);
    this.name = 'ClassifiedLookupError';
    this.code = code;
    this.status = options?.status;
    this.retryable = Boolean(options?.retryable);
  }
}

function mapZoneToRegion(zone?: string | null): string {
  if (!zone) return 'NORTH';
  const cleaned = zone.trim().toUpperCase();
  if (cleaned === 'NORTH' || cleaned === 'SOUTH' || cleaned === 'EAST' || cleaned === 'WEST') {
    return cleaned;
  }
  if (ZONE_TO_REGION[cleaned]) return ZONE_TO_REGION[cleaned];
  if (cleaned.includes('NORTH')) return 'NORTH';
  if (cleaned.includes('SOUTH') && !cleaned.includes('EAST')) return 'SOUTH';
  if (cleaned.includes('EAST')) return 'EAST';
  if (cleaned.includes('WEST') || cleaned.includes('CENTRAL')) return 'WEST';
  return 'NORTH';
}

function normalizeTrainType(rawType?: string | null, trainName?: string | null): string {
  if (rawType) {
    const key = rawType.trim().toUpperCase();
    if (TRAIN_TYPE_MAP[key]) return TRAIN_TYPE_MAP[key];
    if (rawType.trim().length > 2) return rawType.trim();
  }
  if (trainName) {
    const upper = trainName.toUpperCase();
    const tokens: Array<[string, string]> = [
      ['VANDE BHARAT', 'Vande Bharat Express'],
      ['RAJDHANI', 'Rajdhani Express'],
      ['SHATABDI', 'Shatabdi Express'],
      ['DURONTO', 'Duronto Express'],
      ['GARIB RATH', 'Garib Rath Express'],
      ['HUMSAFAR', 'Humsafar Express'],
      ['TEJAS', 'Tejas Express'],
      ['SUPERFAST', 'Superfast Express'],
      ['MAIL', 'Mail Express'],
      ['PASSENGER', 'Passenger'],
      ['EXPRESS', 'Express'],
    ];
    for (const [token, label] of tokens) {
      if (upper.includes(token)) return label;
    }
  }
  return 'Express';
}

function messageForErrorCode(code: TrainLookupErrorCode): string {
  switch (code) {
    case 'INVALID_FORMAT':
      return 'Enter a valid 4- or 5-digit Indian Railways train number.';
    case 'NOT_FOUND':
      return 'Invalid Train Number. No matching train information was found.';
    case 'NON_EXPRESS_TRAIN':
      return 'Only Express family trains are supported. Passenger, MEMU, DEMU, and suburban trains are excluded.';
    case 'TIMEOUT':
      return 'Network timeout while contacting railway APIs. Please try verifying again.';
    case 'RATE_LIMITED':
      return 'Railway API rate limit exceeded. Wait a moment before clicking Verify again.';
    case 'AUTH_ERROR':
      return 'Invalid API credentials configured for railway verification.';
    case 'INVALID_RESPONSE':
      return 'Unexpected response received from railway API provider.';
    case 'SERVER_UNAVAILABLE':
    default:
      return 'Railway API server is currently unavailable. Please retry later.';
  }
}

const NON_EXPRESS_TOKENS = [
  'PASSENGER',
  'PASS',
  'MEMU',
  'DEMU',
  'EMU',
  'MMTS',
  'LOCAL',
  'SUBURBAN',
  'ORDINARY',
  'TOY',
  'FREIGHT',
  'GOODS',
  'PARCEL',
];

const EXPRESS_FAMILY_TOKENS = [
  'EXPRESS',
  'MAIL/EXPRESS',
  'MAIL EXPRESS',
  'MAIL',
  'EXP',
  'SUPERFAST',
  'SF',
  'PREMIUM',
  'RAJDHANI',
  'RAJ',
  'SHATABDI',
  'SHTB',
  'JAN SHATABDI',
  'JSHT',
  'DURONTO',
  'DRNT',
  'GARIB RATH',
  'GR',
  'VANDE BHARAT',
  'VB',
  'HUMSAFAR',
  'HS',
  'TEJAS',
  'TEJ',
  'SAMPARK KRANTI',
  'SK',
  'ANTYODAYA',
  'ANT',
  'GATIMAAN',
  'SUVIDHA',
  'AMRIT BHARAT',
  'NAMO BHARAT',
];

function hasWordToken(text: string, token: string): boolean {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(text);
}

export function isExpressFamilyTrain(
  rawType?: string | null,
  rawCategory?: string | null,
  trainName?: string | null
): { allowed: boolean; label: string } {
  const metaTokens = [(rawCategory || '').trim().toUpperCase(), (rawType || '').trim().toUpperCase()];
  for (const tok of metaTokens) {
    if (!tok) continue;
    if (NON_EXPRESS_TOKENS.some((bad) => hasWordToken(tok, bad)) && !tok.includes('EXPRESS')) {
      return { allowed: false, label: (rawType || rawCategory || 'Passenger').trim() };
    }
    if (['PASSENGER', 'MEMU', 'DEMU', 'EMU', 'MMTS', 'LOCAL', 'SUBURBAN', 'PASS'].includes(tok)) {
      return { allowed: false, label: tok };
    }
  }
  for (const tok of metaTokens) {
    if (!tok) continue;
    if (EXPRESS_FAMILY_TOKENS.some((good) => tok.includes(good))) {
      return { allowed: true, label: (rawType || rawCategory || 'Express').trim() };
    }
  }

  const upperName = (trainName || '').trim().toUpperCase();
  if (upperName) {
    const hasExpressKw = [
      'EXPRESS',
      'EXP',
      'MAIL',
      'RAJDHANI',
      'SHATABDI',
      'DURONTO',
      'GARIB RATH',
      'VANDE BHARAT',
      'HUMSAFAR',
      'TEJAS',
      'SUPERFAST',
      'SAMPARK KRANTI',
      'ANTYODAYA',
      'GATIMAAN',
    ].some((kw) => upperName.includes(kw));
    const hasNonExpressKw = NON_EXPRESS_TOKENS.some((bad) => hasWordToken(upperName, bad));
    if (hasNonExpressKw && !hasExpressKw) {
      return { allowed: false, label: (rawType || 'Passenger').trim() };
    }
  }

  return { allowed: true, label: (rawType || rawCategory || 'Express').trim() };
}

function inferRegionFromCoords(lat: any, lng: any): string | null {
  const latNum = typeof lat === 'number' ? lat : parseFloat(String(lat ?? ''));
  const lngNum = typeof lng === 'number' ? lng : parseFloat(String(lng ?? ''));
  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return null;
  if (lngNum >= 84.0) return 'EAST';
  if (latNum < 17.5 || (latNum < 20.0 && lngNum >= 76.5)) return 'SOUTH';
  if (lngNum < 76.5 && latNum < 24.5) return 'WEST';
  return 'NORTH';
}

function inferCoachCategory(coachCode: string): [string, string] {
  const c = coachCode.trim().toUpperCase();
  if (c.startsWith('EC') || c.includes('EA') || c.includes('EV')) return ['Executive AC', 'EC'];
  if (c.startsWith('H')) return ['First AC', '1A'];
  if (c.startsWith('A')) return ['AC 2-Tier', '2A'];
  if (c.startsWith('M')) return ['AC 3-Economy', '3E'];
  if (c.startsWith('B')) return ['AC 3-Tier', '3A'];
  if (c.startsWith('C') || c.startsWith('J')) return ['AC Chair Car', 'CC'];
  if (c.startsWith('S') && !c.startsWith('SLR')) return ['Sleeper', 'SL'];
  if (c.startsWith('D')) return ['Second Sitting', '2S'];
  if (c === 'GS' || c === 'GEN' || c === 'UR' || c.startsWith('GS') || c.startsWith('GEN')) {
    return ['General Second Class', 'GS'];
  }
  if (c.startsWith('PC')) return ['Pantry Car', 'PC'];
  if (c.startsWith('SLR')) return ['SLR / Guard', 'SLR'];
  if (c.startsWith('EOG') || c.startsWith('LWLRRM') || c.startsWith('LPR')) return ['EOG / Power Car', 'EOG'];
  return ['Coach', 'COACH'];
}

function parseCoachPositionString(coachPosition?: string | null): CoachCompositionItem[] {
  if (!coachPosition || typeof coachPosition !== 'string') return [];
  const coaches: CoachCompositionItem[] = [];
  let pos = 1;
  for (const raw of coachPosition.split('-')) {
    const label = raw.trim().toUpperCase();
    if (!label || label === 'LOCO' || label === 'L' || label === 'ENG') continue;
    const [coach_category, coach_type] = inferCoachCategory(label);
    coaches.push({
      position: pos++,
      coach_number: label,
      coach_category,
      coach_type,
    });
  }
  return coaches;
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
function normalizeRunDays(rawDays: any): string[] | null {
  if (!Array.isArray(rawDays) || rawDays.length === 0) return null;
  const days = rawDays
    .map((d) => String(d || '').trim().slice(0, 3))
    .filter(Boolean)
    .map((d) => DAY_NAMES.find((n) => n.toLowerCase() === d.toLowerCase()) || d);
  return days.length > 0 ? days : null;
}

function buildEmptyErrorResult(
  trainNumber: string,
  status: TrainLookupResult['status'],
  errorCode: TrainLookupErrorCode,
  message?: string,
  provider?: string
): TrainLookupResult {
  return {
    status,
    error_code: errorCode,
    train_number: trainNumber,
    route: [],
    coach_composition: [],
    has_official_composition: false,
    provider: provider || null,
    cached: false,
    latency_ms: 0,
    missing_fields: [],
    already_exists: false,
    message: message || messageForErrorCode(errorCode),
    provider_attempts: [],
  };
}

function classifyHttpFailure(status: number, rawMessage?: string): ClassifiedLookupError {
  if (status === 404) {
    return new ClassifiedLookupError('NOT_FOUND', rawMessage || messageForErrorCode('NOT_FOUND'), {
      status,
      retryable: false,
    });
  }
  if (status === 429) {
    return new ClassifiedLookupError('RATE_LIMITED', rawMessage || messageForErrorCode('RATE_LIMITED'), {
      status,
      retryable: false,
    });
  }
  if (status === 401 || status === 403) {
    return new ClassifiedLookupError('AUTH_ERROR', rawMessage || messageForErrorCode('AUTH_ERROR'), {
      status,
      retryable: false,
    });
  }
  if (status >= 500 || status === 405) {
    return new ClassifiedLookupError(
      'SERVER_UNAVAILABLE',
      rawMessage || messageForErrorCode('SERVER_UNAVAILABLE'),
      { status, retryable: status >= 500 }
    );
  }
  return new ClassifiedLookupError('INVALID_RESPONSE', rawMessage || messageForErrorCode('INVALID_RESPONSE'), {
    status,
    retryable: false,
  });
}

function classifyCaughtError(err: any): ClassifiedLookupError {
  if (err instanceof ClassifiedLookupError) return err;
  if (err?.name === 'AbortError' || /timeout|timed out/i.test(String(err?.message || ''))) {
    return new ClassifiedLookupError('TIMEOUT', messageForErrorCode('TIMEOUT'), { retryable: true });
  }
  const status = typeof err?.status === 'number' ? err.status : undefined;
  if (status !== undefined) {
    return classifyHttpFailure(status, err?.message);
  }
  if (/non-JSON|Unexpected token|JSON/i.test(String(err?.message || ''))) {
    return new ClassifiedLookupError('INVALID_RESPONSE', messageForErrorCode('INVALID_RESPONSE'), {
      retryable: false,
    });
  }
  return new ClassifiedLookupError('SERVER_UNAVAILABLE', err?.message || messageForErrorCode('SERVER_UNAVAILABLE'), {
    retryable: true,
  });
}

async function fetchJsonWithTimeoutAndRetry(
  url: string,
  options: { timeoutMs: number; retries?: number; externalSignal?: AbortSignal }
): Promise<any> {
  const retries = options.retries ?? 1;
  let lastErr: ClassifiedLookupError | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (options.externalSignal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    const timeoutController = new AbortController();
    let timedOut = false;
    const onExternalAbort = () => timeoutController.abort();
    if (options.externalSignal && typeof options.externalSignal.addEventListener === 'function') {
      options.externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }

    const timer = setTimeout(() => {
      timedOut = true;
      timeoutController.abort();
    }, options.timeoutMs);

    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: timeoutController.signal,
      });

      const rawText = await res.text();
      if (!res.ok) {
        const httpErr = classifyHttpFailure(res.status);
        if (!httpErr.retryable || attempt >= retries) {
          throw httpErr;
        }
        lastErr = httpErr;
      } else {
        try {
          return JSON.parse(rawText);
        } catch {
          throw new ClassifiedLookupError('INVALID_RESPONSE', messageForErrorCode('INVALID_RESPONSE'), {
            retryable: false,
          });
        }
      }
    } catch (err: any) {
      if (options.externalSignal?.aborted && !timedOut) {
        throw err;
      }
      const classified = timedOut
        ? new ClassifiedLookupError('TIMEOUT', messageForErrorCode('TIMEOUT'), { retryable: true })
        : classifyCaughtError(err);

      if (!classified.retryable || attempt >= retries) {
        throw classified;
      }
      lastErr = classified;
    } finally {
      clearTimeout(timer);
      options.externalSignal?.removeEventListener('abort', onExternalAbort);
    }

    await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
  }

  throw lastErr || new ClassifiedLookupError('SERVER_UNAVAILABLE', messageForErrorCode('SERVER_UNAVAILABLE'));
}

function parseDataMeetDataset(raw: any): Record<string, DataMeetCompactEntry> {
  const index: Record<string, DataMeetCompactEntry> = {};
  if (!raw || typeof raw !== 'object') {
    throw new ClassifiedLookupError('INVALID_RESPONSE', messageForErrorCode('INVALID_RESPONSE'));
  }

  const pushEntry = (props: any) => {
    if (!props || typeof props !== 'object') return;
    const num = String(props.number || props.train_number || '').trim();
    const name = String(props.name || props.train_name || '').trim();
    if (!num || !name) return;
    index[num] = {
      number: num,
      name,
      zone: props.zone ? String(props.zone).trim().toUpperCase() : null,
      from_station_code: props.from_station_code ? String(props.from_station_code).trim().toUpperCase() : null,
      from_station_name: props.from_station_name ? String(props.from_station_name).trim() : null,
      to_station_code: props.to_station_code ? String(props.to_station_code).trim().toUpperCase() : null,
      to_station_name: props.to_station_name ? String(props.to_station_name).trim() : null,
      type: props.type ? String(props.type).trim() : null,
    };
  };

  if (Array.isArray(raw.features)) {
    for (const feat of raw.features) {
      if (feat && typeof feat === 'object' && feat.properties) {
        pushEntry(feat.properties);
      }
    }
  } else if (Array.isArray(raw)) {
    for (const item of raw) {
      pushEntry(item);
    }
  } else {
    for (const [key, val] of Object.entries(raw)) {
      if (val && typeof val === 'object') {
        pushEntry({ number: key, ...(val as any) });
      }
    }
  }

  if (Object.keys(index).length === 0) {
    throw new ClassifiedLookupError('INVALID_RESPONSE', messageForErrorCode('INVALID_RESPONSE'));
  }
  return index;
}

class TrainLookupService {
  private cache = new Map<string, CachedEntry>();
  private dataMeetIndex: Record<string, DataMeetCompactEntry> | null = null;
  private activeController: AbortController | null = null;
  private inFlightKey: string | null = null;
  private inFlightPromise: Promise<{ result: TrainLookupResult; stale: boolean }> | null = null;
  private requestSeq = 0;

  isValidTrainNumberFormat(value: string): boolean {
    return TRAIN_NUMBER_REGEX.test(value.trim());
  }

  getCached(trainNumber: string): TrainLookupResult | null {
    const clean = trainNumber.trim();
    const entry = this.cache.get(clean);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(clean);
      return null;
    }
    const alreadyExists = ApiClient.hasBackend()
      ? entry.result.already_exists
      : localFleetStore.hasTrain(clean);
    return { ...entry.result, cached: true, latency_ms: 0, already_exists: alreadyExists };
  }

  clearCache(trainNumber?: string): void {
    if (trainNumber) {
      this.cache.delete(trainNumber.trim());
    } else {
      this.cache.clear();
      this.dataMeetIndex = null;
    }
  }

  abortActive(): void {
    if (this.activeController) {
      this.activeController.abort();
      this.activeController = null;
    }
    this.inFlightKey = null;
    this.inFlightPromise = null;
  }

  private readStoredDataMeetIndex(): Record<string, DataMeetCompactEntry> | null {
    if (this.dataMeetIndex) return this.dataMeetIndex;
    if (typeof window === 'undefined' || !window.localStorage) return null;
    try {
      const raw = window.localStorage.getItem(DATAMEET_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed?.expiresAt && Date.now() < parsed.expiresAt && parsed?.index && typeof parsed.index === 'object') {
        this.dataMeetIndex = parsed.index;
        return this.dataMeetIndex;
      }
      window.localStorage.removeItem(DATAMEET_STORAGE_KEY);
    } catch {
      return null;
    }
    return null;
  }

  private writeStoredDataMeetIndex(index: Record<string, DataMeetCompactEntry>): void {
    this.dataMeetIndex = index;
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.setItem(
        DATAMEET_STORAGE_KEY,
        JSON.stringify({ expiresAt: Date.now() + DATAMEET_STORAGE_TTL_MS, index })
      );
    } catch {
      // DataMeet compact index (~1.7 MB) fits most browsers; ignore if quota exceeded
    }
  }

  private async lookupViaRailRadarPublic(
    trainNumber: string,
    signal: AbortSignal
  ): Promise<{ outcome: 'verified' | 'not_found' | 'unsupported' | 'unavailable'; result?: TrainLookupResult; attempt: ProviderAttempt; errorCode?: TrainLookupErrorCode }> {
    const started = performance.now();
    const url = `${RAILRADAR_PUBLIC_BASE}/trains/${encodeURIComponent(trainNumber)}`;
    try {
      const payload = await fetchJsonWithTimeoutAndRetry(url, {
        timeoutMs: RAILRADAR_PUBLIC_TIMEOUT_MS,
        retries: 1,
        externalSignal: signal,
      });
      const latency = Math.round((performance.now() - started) * 100) / 100;
      const train = payload?.data?.train;
      if (!payload || payload.success !== true || !train || typeof train !== 'object') {
        const errCodeFromPayload = String(payload?.error?.code || '').toUpperCase();
        if (errCodeFromPayload.includes('NOT_FOUND')) {
          return {
            outcome: 'not_found',
            attempt: { provider: 'RailRadar Public API', outcome: 'not_found', latency_ms: latency, detail: payload?.error?.message || 'Train not found' },
          };
        }
        return {
          outcome: 'unavailable',
          errorCode: 'INVALID_RESPONSE',
          attempt: { provider: 'RailRadar Public API', outcome: 'invalid_response', latency_ms: latency, detail: 'Unexpected payload structure' },
        };
      }

      const returnedNum = String(train.number || train.trainNumber || '').trim();
      if (returnedNum && returnedNum !== trainNumber) {
        return {
          outcome: 'unavailable',
          errorCode: 'INVALID_RESPONSE',
          attempt: { provider: 'RailRadar Public API', outcome: 'mismatched', latency_ms: latency, detail: `Requested ${trainNumber}, received ${returnedNum}` },
        };
      }

      const name = String(train.name || train.trainName || '').trim();
      if (!name) {
        return {
          outcome: 'not_found',
          attempt: { provider: 'RailRadar Public API', outcome: 'not_found', latency_ms: latency, detail: 'Missing train name' },
        };
      }

      const expressCheck = isExpressFamilyTrain(train.type, train.category, name);
      const alreadyExists = localFleetStore.hasTrain(trainNumber);
      if (!expressCheck.allowed) {
        const attempt: ProviderAttempt = {
          provider: 'RailRadar Public API',
          outcome: 'rejected_non_express',
          latency_ms: latency,
          detail: `Non-Express category: ${expressCheck.label}`,
        };
        return {
          outcome: 'unsupported',
          attempt,
          result: {
            ...buildEmptyErrorResult(
              trainNumber,
              'UNSUPPORTED_TYPE',
              'NON_EXPRESS_TRAIN',
              `Only Express family trains are supported (Train ${trainNumber} is ${expressCheck.label}). Passenger, MEMU, DEMU, and suburban trains are excluded.`,
              'RailRadar Public API'
            ),
            train_name: name,
            train_type: normalizeTrainType(train.type, name),
            already_exists: alreadyExists,
            latency_ms: latency,
            provider_attempts: [attempt],
          },
        };
      }

      const src = typeof train.source === 'object' && train.source ? train.source : {};
      const dst = typeof train.destination === 'object' && train.destination ? train.destination : {};
      const rawRoute = Array.isArray(payload?.data?.route) ? payload.data.route : [];
      const route: RouteStopItem[] = [];
      for (const stop of rawRoute) {
        if (!stop || typeof stop !== 'object' || stop.isHalt === false) continue;
        const stCode = stop.station?.code || stop.stationCode;
        if (!stCode) continue;
        route.push({
          station_code: String(stCode).trim().toUpperCase(),
          station_name: String(stop.station?.name || stop.stationName || stCode).trim(),
          arrival: stop.arrival || null,
          departure: stop.departure || null,
          day: stop.arrivalDay ?? stop.departureDay ?? stop.day ?? null,
        });
      }

      const coachComposition = parseCoachPositionString(train.coachPosition);
      const runningDays = normalizeRunDays(train.runDays);
      const zone = train.zone ? String(train.zone).trim().toUpperCase() : null;
      const region = zone ? mapZoneToRegion(zone) : (inferRegionFromCoords(src.lat, src.lng) || 'NORTH');

      const missingFields: string[] = [];
      if (!src.name && !src.code) missingFields.push('sourceStation');
      if (!dst.name && !dst.code) missingFields.push('destinationStation');
      if (!zone) missingFields.push('railwayZone');
      if (!runningDays) missingFields.push('runningDays');
      if (route.length === 0) missingFields.push('route');
      if (coachComposition.length === 0) missingFields.push('coachComposition');

      const attempt: ProviderAttempt = {
        provider: 'RailRadar Public API',
        outcome: 'verified',
        latency_ms: latency,
        detail: 'Resolved from RailRadar Public v1 API',
      };

      return {
        outcome: 'verified',
        attempt,
        result: {
          status: 'VERIFIED',
          error_code: null,
          train_number: trainNumber,
          train_name: name,
          source_station: src.name ? String(src.name).trim() : null,
          source_code: src.code ? String(src.code).trim().toUpperCase() : null,
          destination_station: dst.name ? String(dst.name).trim() : null,
          destination_code: dst.code ? String(dst.code).trim().toUpperCase() : null,
          region,
          railway_zone: zone,
          train_type: normalizeTrainType(train.type, name),
          running_days: runningDays,
          route,
          coach_composition: coachComposition,
          total_coaches: coachComposition.length || null,
          has_official_composition: coachComposition.length > 0,
          provider: 'RailRadar Public API',
          cached: false,
          latency_ms: latency,
          verified_at: new Date().toISOString(),
          missing_fields: missingFields,
          already_exists: alreadyExists,
          message: 'Train successfully verified.',
          provider_attempts: [attempt],
        },
      };
    } catch (err: any) {
      if (err?.name === 'AbortError' && signal.aborted) {
        throw err;
      }
      const latency = Math.round((performance.now() - started) * 100) / 100;
      const classified = classifyCaughtError(err);
      if (classified.code === 'NOT_FOUND') {
        return {
          outcome: 'not_found',
          attempt: { provider: 'RailRadar Public API', outcome: 'not_found', latency_ms: latency, detail: 'HTTP 404' },
        };
      }
      return {
        outcome: 'unavailable',
        errorCode: classified.code,
        attempt: { provider: 'RailRadar Public API', outcome: classified.code.toLowerCase(), latency_ms: latency, detail: classified.message },
      };
    }
  }

  private async lookupViaPublicDataMeet(
    trainNumber: string,
    options: { refresh?: boolean; signal: AbortSignal }
  ): Promise<{ outcome: 'verified' | 'not_found' | 'unsupported' | 'unavailable'; result?: TrainLookupResult; attempt: ProviderAttempt; errorCode?: TrainLookupErrorCode }> {
    const started = performance.now();
    let index = options.refresh ? null : this.readStoredDataMeetIndex();
    let cached = Boolean(index);

    if (!index) {
      cached = false;
      let lastErr: ClassifiedLookupError | null = null;
      for (const endpoint of DATAMEET_ENDPOINTS) {
        try {
          const json = await fetchJsonWithTimeoutAndRetry(endpoint, {
            timeoutMs: DATAMEET_TIMEOUT_MS,
            retries: 1,
            externalSignal: options.signal,
          });
          index = parseDataMeetDataset(json);
          this.writeStoredDataMeetIndex(index);
          break;
        } catch (err: any) {
          if (err?.name === 'AbortError' && options.signal.aborted) {
            throw err;
          }
          lastErr = classifyCaughtError(err);
        }
      }

      if (!index) {
        const latency = Math.round((performance.now() - started) * 100) / 100;
        const finalErr = lastErr || new ClassifiedLookupError('SERVER_UNAVAILABLE', messageForErrorCode('SERVER_UNAVAILABLE'));
        return {
          outcome: 'unavailable',
          errorCode: finalErr.code,
          attempt: { provider: 'DataMeet OpenData', outcome: finalErr.code.toLowerCase(), latency_ms: latency, detail: finalErr.message },
        };
      }
    }

    const entry = index[trainNumber];
    const latency = Math.round((performance.now() - started) * 100) / 100;
    const alreadyExists = localFleetStore.hasTrain(trainNumber);

    if (!entry) {
      return {
        outcome: 'not_found',
        attempt: { provider: 'DataMeet OpenData', outcome: 'not_found', latency_ms: latency, detail: 'Train absent from DataMeet index' },
      };
    }

    if (String(entry.number).trim() !== trainNumber) {
      return {
        outcome: 'unavailable',
        errorCode: 'INVALID_RESPONSE',
        attempt: { provider: 'DataMeet OpenData', outcome: 'mismatched', latency_ms: latency, detail: `Requested ${trainNumber}, received ${entry.number}` },
      };
    }

    const expressCheck = isExpressFamilyTrain(entry.type, null, entry.name);
    if (!expressCheck.allowed) {
      const attempt: ProviderAttempt = {
        provider: 'DataMeet OpenData',
        outcome: 'rejected_non_express',
        latency_ms: latency,
        detail: `Non-Express category: ${expressCheck.label}`,
      };
      return {
        outcome: 'unsupported',
        attempt,
        result: {
          ...buildEmptyErrorResult(
            trainNumber,
            'UNSUPPORTED_TYPE',
            'NON_EXPRESS_TRAIN',
            `Only Express family trains are supported (Train ${trainNumber} is ${expressCheck.label}). Passenger, MEMU, DEMU, and suburban trains are excluded.`,
            'DataMeet OpenData'
          ),
          train_name: entry.name,
          train_type: normalizeTrainType(entry.type, entry.name),
          already_exists: alreadyExists,
          latency_ms: latency,
          provider_attempts: [attempt],
        },
      };
    }

    const zone = entry.zone || null;
    const region = mapZoneToRegion(zone);
    const missingFields: string[] = [];
    if (!entry.from_station_name) missingFields.push('sourceStation');
    if (!entry.to_station_name) missingFields.push('destinationStation');
    if (!zone) missingFields.push('railwayZone');
    missingFields.push('coachComposition');

    const attempt: ProviderAttempt = {
      provider: 'DataMeet OpenData',
      outcome: 'verified',
      latency_ms: latency,
      detail: cached ? 'Resolved from verified DataMeet OpenData cache' : 'Resolved from live DataMeet OpenData API',
    };

    return {
      outcome: 'verified',
      attempt,
      result: {
        status: 'VERIFIED',
        error_code: null,
        train_number: trainNumber,
        train_name: entry.name,
        source_station: entry.from_station_name || null,
        source_code: entry.from_station_code || null,
        destination_station: entry.to_station_name || null,
        destination_code: entry.to_station_code || null,
        region,
        railway_zone: zone,
        train_type: normalizeTrainType(entry.type, entry.name),
        running_days: null,
        route: [],
        coach_composition: [],
        total_coaches: null,
        has_official_composition: false,
        provider: 'DataMeet OpenData',
        cached,
        latency_ms: latency,
        verified_at: new Date().toISOString(),
        missing_fields: missingFields,
        already_exists: alreadyExists,
        message: 'Train successfully verified.',
        provider_attempts: [attempt],
      },
    };
  }

  private async lookupViaPublicProviders(
    trainNumber: string,
    options: { refresh?: boolean; signal: AbortSignal; onProgress?: (providerLabel: string) => void }
  ): Promise<TrainLookupResult> {
    const started = performance.now();
    const attempts: ProviderAttempt[] = [];
    const alreadyExists = localFleetStore.hasTrain(trainNumber);

    options.onProgress?.('Querying RailRadar Public API...');
    const primary = await this.lookupViaRailRadarPublic(trainNumber, options.signal);
    attempts.push(primary.attempt);
    if ((primary.outcome === 'verified' || primary.outcome === 'unsupported') && primary.result) {
      return { ...primary.result, provider_attempts: attempts };
    }

    options.onProgress?.('Fallback: Querying DataMeet OpenData...');
    const fallback = await this.lookupViaPublicDataMeet(trainNumber, {
      refresh: options.refresh,
      signal: options.signal,
    });
    attempts.push(fallback.attempt);
    if ((fallback.outcome === 'verified' || fallback.outcome === 'unsupported') && fallback.result) {
      return { ...fallback.result, provider_attempts: attempts };
    }

    options.onProgress?.('Fallback: Querying eRail OpenData...');
    const erailFallback = await this.lookupViaPublicErail(trainNumber, options.signal);
    attempts.push(erailFallback.attempt);
    if ((erailFallback.outcome === 'verified' || erailFallback.outcome === 'unsupported') && erailFallback.result) {
      return { ...erailFallback.result, provider_attempts: attempts };
    }

    const totalMs = Math.round((performance.now() - started) * 100) / 100;
    if (
      (primary.outcome === 'not_found' || erailFallback.outcome === 'not_found') &&
      fallback.outcome !== 'unavailable' &&
      erailFallback.outcome !== 'unavailable'
    ) {
      return {
        ...buildEmptyErrorResult(trainNumber, 'NOT_FOUND', 'NOT_FOUND', messageForErrorCode('NOT_FOUND'), 'RailRadar Public API'),
        already_exists: alreadyExists,
        latency_ms: totalMs,
        provider_attempts: attempts,
      };
    }

    const errorCode = primary.errorCode || fallback.errorCode || erailFallback.errorCode || 'SERVER_UNAVAILABLE';
    return {
      ...buildEmptyErrorResult(trainNumber, 'UNAVAILABLE', errorCode, messageForErrorCode(errorCode)),
      already_exists: alreadyExists,
      latency_ms: totalMs,
      provider_attempts: attempts,
    };
  }

  private async lookupViaPublicErail(
    trainNumber: string,
    signal: AbortSignal
  ): Promise<{ outcome: 'verified' | 'not_found' | 'unsupported' | 'unavailable'; result?: TrainLookupResult; attempt: ProviderAttempt; errorCode?: TrainLookupErrorCode }> {
    const started = performance.now();
    const url = `https://erail.in/rail/getTrains.aspx?TrainNo=${encodeURIComponent(trainNumber)}`;
    const controller = new AbortController();
    let timedOut = false;
    const onAbort = () => controller.abort();
    if (signal && typeof signal.addEventListener === 'function') {
      signal.addEventListener('abort', onAbort, { once: true });
    }
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, RAILRADAR_PUBLIC_TIMEOUT_MS);

    try {
      const res = await fetch(url, { method: 'GET', signal: controller.signal });
      const latency = Math.round((performance.now() - started) * 100) / 100;
      if (!res.ok) {
        const err = classifyHttpFailure(res.status);
        return {
          outcome: res.status === 404 ? 'not_found' : 'unavailable',
          errorCode: err.code,
          attempt: { provider: 'eRail OpenData', outcome: res.status === 404 ? 'not_found' : err.code.toLowerCase(), latency_ms: latency, detail: err.message },
        };
      }
      const body = (await res.text()).trim();
      if (body.includes('Train not found') || !body.includes('^')) {
        return {
          outcome: 'not_found',
          attempt: { provider: 'eRail OpenData', outcome: 'not_found', latency_ms: latency, detail: 'Train not found' },
        };
      }
      const record = body.split('^')[1].split('~');
      const returnedNum = (record[0] || '').trim();
      if (returnedNum && returnedNum !== trainNumber) {
        return {
          outcome: 'unavailable',
          errorCode: 'INVALID_RESPONSE',
          attempt: { provider: 'eRail OpenData', outcome: 'mismatched', latency_ms: latency, detail: `Requested ${trainNumber}, got ${returnedNum}` },
        };
      }
      const name = (record[1] || '').trim();
      if (!name) {
        return {
          outcome: 'not_found',
          attempt: { provider: 'eRail OpenData', outcome: 'not_found', latency_ms: latency, detail: 'Empty train name' },
        };
      }
      const lastIdx = record.indexOf('Last');
      const rawType = lastIdx !== -1 && lastIdx + 1 < record.length ? record[lastIdx + 1].trim() : null;
      const alreadyExists = localFleetStore.hasTrain(trainNumber);
      const expressCheck = isExpressFamilyTrain(rawType, null, name);
      if (!expressCheck.allowed) {
        const attempt: ProviderAttempt = {
          provider: 'eRail OpenData',
          outcome: 'rejected_non_express',
          latency_ms: latency,
          detail: `Non-Express category: ${expressCheck.label}`,
        };
        return {
          outcome: 'unsupported',
          attempt,
          result: {
            ...buildEmptyErrorResult(
              trainNumber,
              'UNSUPPORTED_TYPE',
              'NON_EXPRESS_TRAIN',
              `Only Express family trains are supported (Train ${trainNumber} is ${expressCheck.label}). Passenger, MEMU, DEMU, and suburban trains are excluded.`,
              'eRail OpenData'
            ),
            train_name: name,
            train_type: normalizeTrainType(rawType, name),
            already_exists: alreadyExists,
            latency_ms: latency,
            provider_attempts: [attempt],
          },
        };
      }

      const srcName = (record[2] || '').trim() || null;
      const srcCode = (record[3] || '').trim().toUpperCase() || null;
      const dstName = (record[4] || '').trim() || null;
      const dstCode = (record[5] || '').trim().toUpperCase() || null;
      const runDays = parseRunningDays((record[13] || '').trim() || null);
      const attempt: ProviderAttempt = { provider: 'eRail OpenData', outcome: 'verified', latency_ms: latency };
      const missingFields: string[] = [];
      if (!srcName && !srcCode) missingFields.push('sourceStation');
      if (!dstName && !dstCode) missingFields.push('destinationStation');
      missingFields.push('railwayZone');
      if (!runDays) missingFields.push('runningDays');
      missingFields.push('route', 'coachComposition');

      return {
        outcome: 'verified',
        attempt,
        result: {
          status: 'VERIFIED',
          train_number: trainNumber,
          train_name: name,
          source_station: srcName,
          source_code: srcCode,
          destination_station: dstName,
          destination_code: dstCode,
          region: 'NORTH',
          railway_zone: null,
          train_type: normalizeTrainType(rawType, name),
          running_days: runDays,
          route: [],
          coach_composition: [],
          total_coaches: null,
          has_official_composition: false,
          provider: 'eRail OpenData',
          cached: false,
          latency_ms: latency,
          verified_at: new Date().toISOString(),
          missing_fields: missingFields,
          already_exists: alreadyExists,
          message: 'Train successfully verified.',
          provider_attempts: [attempt],
        },
      };
    } catch (err: any) {
      if (err?.name === 'AbortError' && signal.aborted && !timedOut) {
        throw err;
      }
      const latency = Math.round((performance.now() - started) * 100) / 100;
      const classified = timedOut
        ? new ClassifiedLookupError('TIMEOUT', messageForErrorCode('TIMEOUT'))
        : classifyCaughtError(err);
      return {
        outcome: 'unavailable',
        errorCode: classified.code,
        attempt: { provider: 'eRail OpenData', outcome: classified.code.toLowerCase(), latency_ms: latency, detail: classified.message },
      };
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
    }
  }

  private async lookupViaBackend(
    trainNumber: string,
    options: { refresh?: boolean; signal: AbortSignal }
  ): Promise<TrainLookupResult> {
    if (ApiClient.isRemoteUnreachable()) {
      return buildEmptyErrorResult(trainNumber, 'UNAVAILABLE', 'SERVER_UNAVAILABLE', 'Backend offline');
    }
    let attempt = 0;
    const maxRetries = 1;

    while (attempt <= maxRetries) {
      if (ApiClient.isRemoteUnreachable()) {
        return buildEmptyErrorResult(trainNumber, 'UNAVAILABLE', 'SERVER_UNAVAILABLE', 'Backend offline');
      }
      const timeoutController = new AbortController();
      let timedOut = false;
      const onExternalAbort = () => timeoutController.abort();
      if (options.signal && typeof options.signal.addEventListener === 'function') {
        options.signal.addEventListener('abort', onExternalAbort, { once: true });
      }

      const timer = setTimeout(() => {
        timedOut = true;
        timeoutController.abort();
      }, BACKEND_TIMEOUT_MS);

      try {
        const result = await ApiClient.lookupTrain(trainNumber, {
          refresh: options.refresh,
          signal: timeoutController.signal,
        });

        if (!result || typeof result !== 'object' || !result.status || !result.train_number) {
          throw new ClassifiedLookupError('INVALID_RESPONSE', messageForErrorCode('INVALID_RESPONSE'));
        }
        return result;
      } catch (err: any) {
        if (options.signal?.aborted && !timedOut) {
          return buildEmptyErrorResult(trainNumber, 'UNAVAILABLE', 'SERVER_UNAVAILABLE', 'Lookup superseded.');
        }
        const classified = timedOut
          ? new ClassifiedLookupError('TIMEOUT', messageForErrorCode('TIMEOUT'), { retryable: true })
          : classifyCaughtError(err);

        if (!classified.retryable || attempt >= maxRetries) {
          return buildEmptyErrorResult(
            trainNumber,
            'UNAVAILABLE',
            classified.code,
            classified.message
          );
        }
      } finally {
        clearTimeout(timer);
        options.signal.removeEventListener('abort', onExternalAbort);
      }

      attempt++;
      await new Promise((r) => setTimeout(r, 200 * attempt));
    }

    return buildEmptyErrorResult(trainNumber, 'UNAVAILABLE', 'SERVER_UNAVAILABLE');
  }

  async lookup(
    rawTrainNumber: string,
    options?: { refresh?: boolean; onProgress?: (providerLabel: string) => void }
  ): Promise<{ result: TrainLookupResult; stale: boolean }> {
    const trainNumber = rawTrainNumber.trim();

    if (!this.isValidTrainNumberFormat(trainNumber)) {
      this.abortActive();
      return {
        stale: false,
        result: buildEmptyErrorResult(trainNumber, 'INVALID_FORMAT', 'INVALID_FORMAT'),
      };
    }

    const requestKey = `${trainNumber}:${Boolean(options?.refresh)}`;
    if (this.inFlightKey === requestKey && this.inFlightPromise) {
      return this.inFlightPromise;
    }

    if (!options?.refresh) {
      const mem = this.getCached(trainNumber);
      if (mem) {
        return { stale: false, result: mem };
      }
    }

    this.abortActive();
    const seq = ++this.requestSeq;
    const controller = new AbortController();
    this.activeController = controller;
    this.inFlightKey = requestKey;

    const promise = (async (): Promise<{ result: TrainLookupResult; stale: boolean }> => {
      try {
        let result: TrainLookupResult;
        if (ApiClient.hasBackend() && !ApiClient.isRemoteUnreachable()) {
          options?.onProgress?.('Querying Backend Multi-Provider API...');
          result = await this.lookupViaBackend(trainNumber, { refresh: options?.refresh, signal: controller.signal });
          if (result.status === 'UNAVAILABLE' || (result as any).error_code === 'AUTH_ERROR') {
            options?.onProgress?.('Backend uncontacted. Cascading to Public Railway APIs...');
            const fallback = await this.lookupViaPublicProviders(trainNumber, {
              refresh: options?.refresh,
              signal: controller.signal,
              onProgress: options?.onProgress,
            });
            if (fallback.status === 'VERIFIED' || fallback.status === 'UNSUPPORTED_TYPE') {
              result = fallback;
            }
          }
        } else {
          result = await this.lookupViaPublicProviders(trainNumber, {
            refresh: options?.refresh,
            signal: controller.signal,
            onProgress: options?.onProgress,
          });
        }

        if (seq !== this.requestSeq) {
          return { stale: true, result };
        }

        if (result.status === 'VERIFIED') {
          this.cache.set(trainNumber, {
            expiresAt: Date.now() + CLIENT_CACHE_TTL_MS,
            result,
          });
        }

        return { stale: false, result };
      } catch (err: any) {
        if (err?.name === 'AbortError' || seq !== this.requestSeq) {
          return {
            stale: true,
            result: buildEmptyErrorResult(trainNumber, 'UNAVAILABLE', 'SERVER_UNAVAILABLE', 'Lookup superseded.'),
          };
        }
        const classified = classifyCaughtError(err);
        return {
          stale: false,
          result: buildEmptyErrorResult(trainNumber, 'UNAVAILABLE', classified.code, classified.message),
        };
      } finally {
        if (this.activeController === controller) {
          this.activeController = null;
          this.inFlightKey = null;
          this.inFlightPromise = null;
        }
      }
    })();

    this.inFlightPromise = promise;
    return promise;
  }
}

export const trainLookupService = new TrainLookupService();
