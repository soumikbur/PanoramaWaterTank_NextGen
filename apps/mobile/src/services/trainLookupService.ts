/**
 * Frontend Train Verification Service.
 *
 * Executes explicit, manual train verification with:
 * - Backend FastAPI lookup (`/trains/lookup/{train_number}`) when an external/local API server is configured
 * - Direct CORS-enabled DataMeet Indian Railways OpenData API (`trains.json` + CDN fallback, zero API keys)
 *   when deployed on static GitHub Pages without an external FastAPI server
 * - Request timeout handling, bounded transient retry, HTTP status & JSON schema validation,
 *   in-flight duplicate request deduplication, and structured failure classification.
 */
import { ApiClient } from '../api/client';
import { localFleetStore } from './localFleetStore';
import { TrainLookupErrorCode, TrainLookupResult } from '../types/train';

const CLIENT_CACHE_TTL_MS = 10 * 60 * 1000;
const DATAMEET_STORAGE_KEY = 'panorama_datameet_index_v1';
const DATAMEET_STORAGE_TTL_MS = 24 * 60 * 60 * 1000;
const TRAIN_NUMBER_REGEX = /^\d{4,5}$/;
const BACKEND_TIMEOUT_MS = 10_000;
const DATAMEET_TIMEOUT_MS = 15_000;

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
  'JAN SHATABDI': 'Jan Shatabdi Express',
  VB: 'Vande Bharat Express',
  'VANDE BHARAT': 'Vande Bharat Express',
  SK: 'Sampark Kranti Express',
  HS: 'Humsafar Express',
  TEJ: 'Tejas Express',
  MEMU: 'MEMU',
  DEMU: 'DEMU',
  MAIL: 'Mail Express',
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
    options.externalSignal?.addEventListener('abort', onExternalAbort, { once: true });

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

  private async lookupViaPublicDataMeet(
    trainNumber: string,
    options: { refresh?: boolean; signal: AbortSignal }
  ): Promise<TrainLookupResult> {
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
        const finalErr = lastErr || new ClassifiedLookupError('SERVER_UNAVAILABLE', messageForErrorCode('SERVER_UNAVAILABLE'));
        return buildEmptyErrorResult(
          trainNumber,
          'UNAVAILABLE',
          finalErr.code,
          finalErr.message,
          'DataMeet OpenData'
        );
      }
    }

    const entry = index[trainNumber];
    const latency = Math.round((performance.now() - started) * 100) / 100;
    const alreadyExists = localFleetStore.hasTrain(trainNumber);

    if (!entry) {
      return {
        ...buildEmptyErrorResult(trainNumber, 'NOT_FOUND', 'NOT_FOUND', messageForErrorCode('NOT_FOUND'), 'DataMeet OpenData'),
        already_exists: alreadyExists,
        cached,
        latency_ms: latency,
      };
    }

    if (String(entry.number).trim() !== trainNumber) {
      return buildEmptyErrorResult(
        trainNumber,
        'UNAVAILABLE',
        'INVALID_RESPONSE',
        messageForErrorCode('INVALID_RESPONSE'),
        'DataMeet OpenData'
      );
    }

    const zone = entry.zone || null;
    const region = mapZoneToRegion(zone);
    const missingFields: string[] = [];
    if (!entry.from_station_name) missingFields.push('sourceStation');
    if (!entry.to_station_name) missingFields.push('destinationStation');
    if (!zone) missingFields.push('railwayZone');
    missingFields.push('coachComposition');

    return {
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
      provider_attempts: [
        {
          provider: 'DataMeet OpenData',
          outcome: 'verified',
          latency_ms: latency,
          detail: cached ? 'Resolved from verified DataMeet OpenData cache' : 'Resolved from live DataMeet OpenData API',
        },
      ],
    };
  }

  private async lookupViaBackend(
    trainNumber: string,
    options: { refresh?: boolean; signal: AbortSignal }
  ): Promise<TrainLookupResult> {
    let attempt = 0;
    const maxRetries = 1;

    while (attempt <= maxRetries) {
      const timeoutController = new AbortController();
      let timedOut = false;
      const onExternalAbort = () => timeoutController.abort();
      options.signal.addEventListener('abort', onExternalAbort, { once: true });

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
        if (options.signal.aborted && !timedOut) {
          throw err;
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
    options?: { refresh?: boolean }
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
        const result = ApiClient.hasBackend()
          ? await this.lookupViaBackend(trainNumber, { refresh: options?.refresh, signal: controller.signal })
          : await this.lookupViaPublicDataMeet(trainNumber, { refresh: options?.refresh, signal: controller.signal });

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
