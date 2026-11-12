/**
 * Frontend Train Lookup Service with debounced cancellation and session cache.
 *
 * Ensures minimum latency on repeated lookups and prevents stale out-of-order
 * responses when administrators rapidly edit the train number input.
 */
import { ApiClient } from '../api/client';
import { TrainLookupResult } from '../types/train';

const CLIENT_CACHE_TTL_MS = 10 * 60 * 1000;
const TRAIN_NUMBER_REGEX = /^\d{4,5}$/;

interface CachedEntry {
  expiresAt: number;
  result: TrainLookupResult;
}

class TrainLookupService {
  private cache = new Map<string, CachedEntry>();
  private activeController: AbortController | null = null;
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
    return { ...entry.result, cached: true, latency_ms: 0 };
  }

  clearCache(trainNumber?: string): void {
    if (trainNumber) {
      this.cache.delete(trainNumber.trim());
    } else {
      this.cache.clear();
    }
  }

  abortActive(): void {
    if (this.activeController) {
      this.activeController.abort();
      this.activeController = null;
    }
  }

  async lookup(
    rawTrainNumber: string,
    options?: { refresh?: boolean }
  ): Promise<{ result: TrainLookupResult; stale: boolean }> {
    const trainNumber = rawTrainNumber.trim();
    const seq = ++this.requestSeq;

    if (!this.isValidTrainNumberFormat(trainNumber)) {
      this.abortActive();
      return {
        stale: false,
        result: {
          status: 'INVALID_FORMAT',
          train_number: trainNumber,
          route: [],
          coach_composition: [],
          has_official_composition: false,
          cached: false,
          latency_ms: 0,
          missing_fields: [],
          already_exists: false,
          message: 'Enter a valid 4- or 5-digit Indian Railways train number.',
          provider_attempts: [],
        },
      };
    }

    if (!options?.refresh) {
      const mem = this.getCached(trainNumber);
      if (mem) {
        return { stale: false, result: mem };
      }
    }

    this.abortActive();
    const controller = new AbortController();
    this.activeController = controller;

    try {
      const result = await ApiClient.lookupTrain(trainNumber, {
        refresh: options?.refresh,
        signal: controller.signal,
      });

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
          result: {
            status: 'UNAVAILABLE',
            train_number: trainNumber,
            route: [],
            coach_composition: [],
            has_official_composition: false,
            cached: false,
            latency_ms: 0,
            missing_fields: [],
            already_exists: false,
            message: 'Lookup superseded.',
            provider_attempts: [],
          },
        };
      }

      return {
        stale: false,
        result: {
          status: 'UNAVAILABLE',
          train_number: trainNumber,
          route: [],
          coach_composition: [],
          has_official_composition: false,
          cached: false,
          latency_ms: 0,
          missing_fields: [],
          already_exists: false,
          message: err?.message || 'Railway lookup service unreachable. Verify network or enter details manually.',
          provider_attempts: [],
        },
      };
    } finally {
      if (this.activeController === controller) {
        this.activeController = null;
      }
    }
  }
}

export const trainLookupService = new TrainLookupService();

