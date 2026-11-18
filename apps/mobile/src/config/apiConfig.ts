/**
 * Centralized API & WebSocket Configuration for Panorama SCADA.
 *
 * Provides authoritative URL resolution, validation, runtime override storage,
 * and environment detection across Web, Mobile (Capacitor), and Local Dev environments.
 */

import { isAndroidCapacitorApp } from '../services/nativeBridge';

export const DEFAULT_PRODUCTION_API_URL = 'https://panorama-water-tank-backend.onrender.com/api/v1';
export const DEFAULT_LOCAL_API_URL = 'http://127.0.0.1:8000/api/v1';
export const DEFAULT_PRODUCTION_WS_URL = 'wss://panorama-water-tank-backend.onrender.com/api/v1/ws/live';
export const DEFAULT_HTTPS_RECEIVER_HEALTH_URL = 'https://panorama-water-tank-backend.onrender.com/api/health';

// Compile-time bundled environment variables (replaced directly by esbuild define)
declare const process: any;
const BUNDLED_API_URL: string =
  (typeof process !== 'undefined' && process.env && process.env.VITE_API_BASE_URL) ?
    String(process.env.VITE_API_BASE_URL) :
    DEFAULT_PRODUCTION_API_URL;

const BUNDLED_WS_URL: string =
  (typeof process !== 'undefined' && process.env && process.env.VITE_WS_URL) ?
    String(process.env.VITE_WS_URL) :
    DEFAULT_PRODUCTION_WS_URL;

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
 * 2. Bundled environment configuration injected at compile-time (`VITE_API_BASE_URL`).
 * 3. Default production backend URL (`DEFAULT_PRODUCTION_API_URL`).
 * Note: Never defaults to localhost for Android Capacitor or deployed production clients.
 */
export function resolveApiBaseUrl(): string {
  // 1. Manual user override stored in localStorage
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const custom = window.localStorage.getItem(STORAGE_KEY_API_URL);
      if (custom && custom.trim() && isValidHttpUrl(custom.trim())) {
        const clean = custom.trim().replace(/\/+$/, '');
        const isLoopback = clean.includes('localhost') || clean.includes('127.0.0.1') || clean.includes('10.0.2.2');
        const isHttpsHost = typeof window !== 'undefined' && window.location && window.location.protocol === 'https:';
        if (isLoopback && (isHttpsHost || isAndroidCapacitorApp())) {
          window.localStorage.removeItem(STORAGE_KEY_API_URL);
        } else {
          return clean;
        }
      }
    } catch {}
  }

  // 2. Android Capacitor native environment check: always use production backend by default
  if (typeof window !== 'undefined' && isAndroidCapacitorApp()) {
    return DEFAULT_PRODUCTION_API_URL;
  }

  // 3. Local desktop FastAPI server detection (only when the web client itself is served from port 8000)
  if (typeof window !== 'undefined' && window.location && window.location.protocol && window.location.protocol.startsWith('http')) {
    const host = window.location.hostname || '127.0.0.1';
    const port = window.location.port || '';
    if ((host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') && port === '8000') {
      return `http://${host}:${port}/api/v1`;
    }
  }

  // 4. Build-time environment variable injection
  if (BUNDLED_API_URL && isValidHttpUrl(BUNDLED_API_URL)) {
    return BUNDLED_API_URL.replace(/\/+$/, '');
  }

  // 5. Default production backend URL
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
        const cleanWs = customWs.trim();
        const isWsLoopback = cleanWs.includes('localhost') || cleanWs.includes('127.0.0.1') || cleanWs.includes('10.0.2.2');
        const isHttpsHost = typeof window !== 'undefined' && window.location && window.location.protocol === 'https:';
        if (isWsLoopback && (isHttpsHost || isAndroidCapacitorApp())) {
          window.localStorage.removeItem(STORAGE_KEY_WS_URL);
        } else {
          return cleanWs;
        }
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
 * Safely strips WebSocket schemes (ws://, wss://) and suffixes (/ws/live) to ensure
 * standard HTTP/HTTPS endpoints are queried by fetch().
 */
export function resolveHealthUrl(candidateUrl?: string): string {
  const target = (candidateUrl || resolveApiBaseUrl()).trim().replace(/\/+$/, '');
  const isHttps = target.startsWith('wss://') || target.startsWith('https://');
  const httpProto = isHttps ? 'https://' : 'http://';
  const clean = target.replace(/^wss?:\/\//, '').replace(/^https?:\/\//, '');
  const withoutWs = clean.split('/ws/live')[0].replace(/\/+$/, '');
  if (withoutWs.endsWith('/api/v1')) {
    return `${httpProto}${withoutWs}/health`;
  }
  return `${httpProto}${withoutWs}/api/v1/health`;
}

/**
 * Resolves the independent HTTPS Laboratory Receiver health endpoint (`GET /api/health`),
 * kept separate from the main SCADA `/api/v1` API configuration.
 */
export function resolveHttpsReceiverHealthUrl(candidateUrl?: string): string {
  const raw = (candidateUrl || DEFAULT_HTTPS_RECEIVER_HEALTH_URL).trim().replace(/\/+$/, '');
  if (!raw) return DEFAULT_HTTPS_RECEIVER_HEALTH_URL;
  const isHttps = raw.startsWith('wss://') || raw.startsWith('https://');
  const httpProto = isHttps ? 'https://' : 'http://';
  const hostOnly = raw.replace(/^wss?:\/\//, '').replace(/^https?:\/\//, '').split('/')[0];
  return hostOnly ? `${httpProto}${hostOnly}/api/health` : DEFAULT_HTTPS_RECEIVER_HEALTH_URL;
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
