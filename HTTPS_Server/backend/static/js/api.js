/**
 * Panorama WLI HTTPS Laboratory — API Communication Layer
 * 
 * Handles all backend HTTP requests, timeout enforcement, response parsing,
 * in-memory credentials management, and event logging.
 * Zero token persistence (memory only).
 * Configurable backend endpoint with GitHub Pages support.
 */

(function (window) {
  'use strict';

  // Base API URL resolution
  const STORAGE_KEY_BASE_URL = 'wli_api_base_url';
  
  function resolveDefaultBaseUrl() {
    const saved = localStorage.getItem(STORAGE_KEY_BASE_URL);
    if (saved && saved.trim()) {
      return saved.trim().replace(/\/+$/, '');
    }
    
    if (window.WLI_CONFIG && window.WLI_CONFIG.defaultApiBaseUrl) {
      // If hosted on GitHub Pages or file:///, default to configured cloud URL
      if (window.location.hostname.endsWith('github.io') || window.location.protocol === 'file:') {
        return window.WLI_CONFIG.defaultApiBaseUrl.replace(/\/+$/, '');
      }
    }
    
    // Otherwise fallback to current origin (for local FastAPI server)
    return window.location.origin;
  }

  let _baseUrl = resolveDefaultBaseUrl();

  // Private in-memory API token (never saved to localStorage/sessionStorage)
  let _apiToken = '';

  // Event subscribers for the API Communication Monitor
  const _logSubscribers = [];

  function setApiToken(token) {
    _apiToken = typeof token === 'string' ? token.trim() : '';
  }

  function getApiToken() {
    return _apiToken;
  }

  function hasApiToken() {
    return _apiToken.length > 0;
  }

  function clearApiToken() {
    _apiToken = '';
  }

  function getBaseUrl() {
    return _baseUrl;
  }

  function setBaseUrl(url) {
    if (typeof url === 'string' && url.trim()) {
      _baseUrl = url.trim().replace(/\/+$/, '');
      try {
        localStorage.setItem(STORAGE_KEY_BASE_URL, _baseUrl);
      } catch (e) {
        // LocalStorage might be disabled in private mode
      }
    } else {
      resetBaseUrl();
    }
  }

  function resetBaseUrl() {
    try {
      localStorage.removeItem(STORAGE_KEY_BASE_URL);
    } catch (e) {}
    _baseUrl = resolveDefaultBaseUrl();
  }

  function onApiLog(callback) {
    if (typeof callback === 'function') {
      _logSubscribers.push(callback);
    }
  }

  function _dispatchLog(entry) {
    _logSubscribers.forEach((cb) => {
      try {
        cb(entry);
      } catch (err) {
        // Silently prevent logging callback errors from breaking caller
      }
    });
  }

  /**
   * Resolve an endpoint to a full URL using _baseUrl.
   */
  function resolveUrl(endpoint) {
    if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
      return endpoint;
    }
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return _baseUrl ? `${_baseUrl}${cleanEndpoint}` : cleanEndpoint;
  }

  /**
   * Core HTTP request wrapper with timeout, timing, and error handling.
   */
  async function request(endpoint, options = {}, timeoutMs = 8000) {
    const method = (options.method || 'GET').toUpperCase();
    const headers = Object.assign({}, options.headers || {});
    const fullUrl = resolveUrl(endpoint);

    // Ensure Accept header
    if (!headers['Accept']) {
      headers['Accept'] = 'application/json';
    }

    // Attach in-memory Bearer token if configured and not already set
    if (_apiToken && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${_apiToken}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const startTime = performance.now();

    const fetchConfig = Object.assign({}, options, {
      method,
      headers,
      signal: controller.signal,
      cache: 'no-store',
    });

    try {
      const response = await fetch(fullUrl, fetchConfig);
      clearTimeout(timeoutId);
      const durationMs = Math.round(performance.now() - startTime);

      let data = null;
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        data = { text };
      }

      // Dispatch to communication monitor (tokens omitted)
      _dispatchLog({
        timestamp: new Date().toISOString(),
        method,
        endpoint: fullUrl,
        status: response.status,
        durationMs,
        success: response.ok,
        error: !response.ok ? (data && (data.detail || data.message)) || response.statusText : null,
      });

      if (!response.ok) {
        const errorMsg = (data && (data.detail || data.message)) || `HTTP ${response.status}: ${response.statusText}`;
        const err = new Error(errorMsg);
        err.status = response.status;
        err.data = data;
        throw err;
      }

      return {
        status: response.status,
        data,
        durationMs,
      };
    } catch (err) {
      clearTimeout(timeoutId);
      const durationMs = Math.round(performance.now() - startTime);

      const isAbort = err.name === 'AbortError';
      const isFailedToFetch = err.message && err.message.includes('Failed to fetch');
      let errorMsg = err.message;

      if (isAbort) {
        errorMsg = `Request timed out after ${timeoutMs}ms`;
      } else if (isFailedToFetch) {
        errorMsg = `Connection refused or CORS blocked by endpoint (${fullUrl})`;
      }

      // Dispatch failure to communication monitor if not already logged
      if (!err.status) {
        _dispatchLog({
          timestamp: new Date().toISOString(),
          method,
          endpoint: fullUrl,
          status: isAbort ? 408 : 0,
          durationMs,
          success: false,
          error: errorMsg,
        });
      }

      throw err;
    }
  }

  // API Methods
  const api = {
    // Base URL Management
    getBaseUrl,
    setBaseUrl,
    resetBaseUrl,
    resolveUrl,

    // Auth Management (In-Memory Only)
    setToken: setApiToken,
    getToken: getApiToken,
    hasToken: hasApiToken,
    clearToken: clearApiToken,
    onLog: onApiLog,

    // Public Diagnostics
    async getHealth() {
      return request('/api/health');
    },

    async getSystemInfo() {
      return request('/api/system/info');
    },

    // Protected Telemetry Queries
    async getLatestTelemetry(deviceId = null) {
      let endpoint = '/api/telemetry/latest';
      if (deviceId) {
        endpoint += `?device_id=${encodeURIComponent(deviceId.trim())}`;
      }
      return request(endpoint);
    },

    async getTelemetryHistory(deviceId = null, limit = 50) {
      let endpoint = `/api/telemetry/history?limit=${Math.max(1, Math.min(limit, 1000))}`;
      if (deviceId) {
        endpoint += `&device_id=${encodeURIComponent(deviceId.trim())}`;
      }
      return request(endpoint);
    },

    // Ingestion Testing
    async sendTelemetryJson(payload) {
      return request('/api/telemetry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
    },

    async sendTelemetryFile(file) {
      const formData = new FormData();
      formData.append('file', file);

      // Do NOT set Content-Type header so browser calculates multipart boundary
      return request('/api/telemetry/upload', {
        method: 'POST',
        body: formData,
      });
    },
  };

  // Expose to global window
  window.LabApi = api;
})(window);
