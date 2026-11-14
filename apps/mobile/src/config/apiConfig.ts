/**
 * Centralized API & WebSocket Configuration for Panorama SCADA.
 *
 * Provides authoritative URL resolution, validation, runtime override storage,
 * and environment detection across Web, Mobile (Capacitor), and Local Dev environments.
 */

export const DEFAULT_PRODUCTION_API_URL = 'https://panorama-water-tank-backend.onrender.com/api/v1';
export const DEFAULT_LOCAL_API_URL = 'http://127.0.0.1:8000/api/v1';
export const DEFAULT_PRODUCTION_WS_URL = 'wss://panorama-water-tank-backend.onrender.com/api/v1/ws/live';

export const STORAGE_KEY_API_URL = 'panorama_backend_url';
export const STORAGE_KEY_WS_URL = 'panorama_ws_url';
export const STORAGE_KEY_BACKEND_VERIFIED = 'panorama_backend_verified';

export const BACKEND_URL_CHANGED_EVENT = 'panorama:backend-url-changed';

/**
 * Validates whether a given string is a valid HTTP/HTTPS URL.
 */
export function isValidHttpUrl(urlCandidate: string): boolean {
  if (!urlCandidate || typeof urlCandidate !== 'string') return false;
  const trimmed = urlCandidate.trim();
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return false;
  try {
    const parsed = new URL(trimmed);
    return Boolean(parsed.hostname && parsed.hostname.length > 0);
  } catch {
    return false;
  }
}

/**
 * Resolves the active REST API Base URL with strict precedence:
 * 1. User manual runtime override in localStorage (`panorama_backend_url`).
 * 2. Local loopback / development host detection (localhost, 127.0.0.1, 10.0.2.2).
 * 3. Vite / process environment variable injection (`VITE_API_BASE_URL`).
 * 4. Production backend URL default.
 */
export function resolveApiBaseUrl(): string {
  // 1. Manual user override stored in localStorage
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const custom = window.localStorage.getItem(STORAGE_KEY_API_URL);
      if (custom && custom.trim() && isValidHttpUrl(custom.trim())) {
        return custom.trim().replace(/\/+$/, '');
      }
    } catch {}
  }

  // 2. Local development loopback (prioritized for local testing and emulator)
  if (typeof window !== 'undefined' && window.location && window.location.protocol && window.location.protocol.startsWith('http')) {
    const host = window.location.hostname || '127.0.0.1';
    const port = window.location.port || '';
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '10.0.2.2') {
      if (port === '8000') {
        return `http://${host}:${port}/api/v1`;
      }
      return `http://${host}:8000/api/v1`;
    }
  }

  // 3. Build-time environment variable injection
  const envUrl =
    (typeof process !== 'undefined' && (
      process.env?.VITE_API_BASE_URL ||
      process.env?.VITE_BACKEND_URL ||
      process.env?.VITE_API_URL ||
      process.env?.API_BASE_URL ||
      process.env?.API_URL ||
      process.env?.REACT_APP_API_URL
    )) ||
    (typeof import.meta !== 'undefined' && (
      (import.meta as any).env?.VITE_API_BASE_URL ||
      (import.meta as any).env?.VITE_BACKEND_URL ||
      (import.meta as any).env?.VITE_API_URL
    ));

  if (envUrl && String(envUrl).trim()) {
    const clean = String(envUrl).trim().replace(/\/+$/, '');
    if (isValidHttpUrl(clean)) {
      return clean;
    }
  }

  // 4. Default production backend URL
  return DEFAULT_PRODUCTION_API_URL;
}

/**
 * Resolves the WebSocket stream URL matching the active API base.
 */
export function resolveWsUrl(): string {
  // 1. Explicit WS override in localStorage
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const customWs = window.localStorage.getItem(STORAGE_KEY_WS_URL);
      if (customWs && customWs.trim()) {
        return customWs.trim();
      }
    } catch {}
  }

  const apiBase = resolveApiBaseUrl();

  // 2. Derive WS URL from API Base URL
  const wsProto = apiBase.startsWith('https://') ? 'wss://' : 'ws://';
  const hostPath = apiBase.replace(/^https?:\/\//, '');

  if (hostPath.endsWith('/api/v1')) {
    return `${wsProto}${hostPath}/ws/live`;
  }
  return `${wsProto}${hostPath.replace(/\/+$/, '')}/api/v1/ws/live`;
}

/**
 * Derives HTTP health probe endpoint for a given API base or WS URL.
 */
export function resolveHealthUrl(apiBase?: string): string {
  const base = (apiBase || resolveApiBaseUrl()).replace(/\/+$/, '');
  if (base.endsWith('/api/v1')) {
    return `${base}/health`;
  }
  return `${base}/api/v1/health`;
}

/**
 * Persists a user-defined custom API URL and broadcasts a notification event.
 */
export function setCustomApiUrl(url: string | null): boolean {
  if (typeof window === 'undefined' || !window.localStorage) return false;

  if (!url || !url.trim()) {
    window.localStorage.removeItem(STORAGE_KEY_API_URL);
    window.localStorage.removeItem(STORAGE_KEY_BACKEND_VERIFIED);
    window.dispatchEvent(new CustomEvent(BACKEND_URL_CHANGED_EVENT, { detail: { url: resolveApiBaseUrl() } }));
    return true;
  }

  const trimmed = url.trim().replace(/\/+$/, '');
  if (!isValidHttpUrl(trimmed)) {
    return false;
  }

  window.localStorage.setItem(STORAGE_KEY_API_URL, trimmed);
  window.localStorage.removeItem(STORAGE_KEY_BACKEND_VERIFIED);
  window.dispatchEvent(new CustomEvent(BACKEND_URL_CHANGED_EVENT, { detail: { url: trimmed } }));
  return true;
}
