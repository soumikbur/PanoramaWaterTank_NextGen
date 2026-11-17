/**
 * Panorama WLI HTTPS Laboratory — Dashboard Controller
 * 
 * Manages server health status, polling intervals, device communication status,
 * in-flight request guards, visibility tracking, and stale data identification.
 * Fully decoupled for independent GitHub Pages hosting.
 */

(function (window) {
  'use strict';

  const STALE_THRESHOLD_SECONDS = 60;

  // Polling intervals in milliseconds
  const INTERVAL_HEALTH_MS = 15000;
  const INTERVAL_TELEMETRY_MS = 3000;
  const INTERVAL_HISTORY_MS = 10000;

  let _timerHealth = null;
  let _timerTelemetry = null;
  let _timerHistory = null;

  // In-flight request guards to prevent overlapping requests
  let _inFlightHealth = false;
  let _inFlightTelemetry = false;
  let _inFlightHistory = false;

  // State
  let _serverOnline = false;
  let _lastSuccessfulCheck = null;
  let _lastTelemetryTime = null;
  let _currentDeviceId = null;

  // DOM Elements Cache
  const el = {};

  function initElements() {
    el.statusDot = document.getElementById('status-dot');
    el.appStatus = document.getElementById('app-status');
    el.backendAvail = document.getElementById('backend-availability');
    el.serverUrl = document.getElementById('server-url');
    el.lastCheck = document.getElementById('last-check');
    el.protocolBadge = document.getElementById('protocol-badge');
    el.appVersion = document.getElementById('app-version');
    el.envBadge = document.getElementById('env-badge');
    el.uptimeDisplay = document.getElementById('uptime-display');
    el.trackedDevicesCount = document.getElementById('tracked-devices-count');
    el.totalRecordsCount = document.getElementById('total-records-count');
    el.refreshBtn = document.getElementById('refresh-btn');

    // Device section
    el.deviceCardStatus = document.getElementById('device-comm-status');
    el.deviceIdDisplay = document.getElementById('device-id-display');
    el.deviceLastSeen = document.getElementById('device-last-seen');
    el.deviceVarCount = document.getElementById('device-var-count');
    el.deviceGpsStatus = document.getElementById('device-gps-status');
    el.staleAlert = document.getElementById('stale-telemetry-alert');

    // TLS section
    el.tlsProtocol = document.getElementById('tls-protocol');
    el.tlsOrigin = document.getElementById('tls-origin');
    el.tlsHost = document.getElementById('tls-host');
    el.tlsEnvDisplay = document.getElementById('tls-env-display');
  }

  function updateServerDisplay(isOnline, info = null, errorMsg = null) {
    _serverOnline = isOnline;

    const currentBaseUrl = window.LabApi.getBaseUrl() || window.location.origin;
    const isHttps = currentBaseUrl.startsWith('https:') || window.location.protocol === 'https:';

    if (el.serverUrl) {
      el.serverUrl.textContent = currentBaseUrl;
    }

    if (el.protocolBadge) {
      if (isHttps) {
        el.protocolBadge.textContent = 'HTTPS (Encrypted)';
        el.protocolBadge.className = 'badge badge-success';
      } else {
        el.protocolBadge.textContent = 'HTTP (Plaintext)';
        el.protocolBadge.className = 'badge';
      }
    }

    // TLS Info
    if (el.tlsProtocol) el.tlsProtocol.textContent = isHttps ? 'HTTPS' : 'HTTP';
    if (el.tlsOrigin) el.tlsOrigin.textContent = window.location.origin;
    try {
      const u = new URL(currentBaseUrl);
      if (el.tlsHost) el.tlsHost.textContent = u.host;
    } catch (e) {
      if (el.tlsHost) el.tlsHost.textContent = window.location.host;
    }

    if (el.tlsEnvDisplay) {
      if (info && info.environment) {
        el.tlsEnvDisplay.textContent = info.environment.charAt(0).toUpperCase() + info.environment.slice(1);
      } else {
        el.tlsEnvDisplay.textContent = window.location.hostname.endsWith('github.io') ? 'GitHub Pages (Frontend)' : 'Development';
      }
    }

    if (isOnline) {
      _lastSuccessfulCheck = new Date();
      if (el.statusDot) el.statusDot.className = 'status-dot dot-online';
      if (el.appStatus) el.appStatus.textContent = 'ONLINE';
      if (el.backendAvail) {
        el.backendAvail.textContent = 'Connected (HTTP 200 OK)';
        el.backendAvail.className = 'value status-tag status-success';
      }

      if (info) {
        if (el.appVersion && info.version) el.appVersion.textContent = info.version;
        if (el.envBadge && info.environment) el.envBadge.textContent = info.environment.toUpperCase();
        if (el.uptimeDisplay && info.uptime_seconds !== undefined) {
          el.uptimeDisplay.textContent = formatDuration(info.uptime_seconds);
        }
        if (info.storage) {
          if (el.trackedDevicesCount) el.trackedDevicesCount.textContent = info.storage.tracked_devices_count;
          if (el.totalRecordsCount) el.totalRecordsCount.textContent = info.storage.total_records_ingested;
        }
      }
    } else {
      if (el.statusDot) el.statusDot.className = 'status-dot dot-offline';
      if (el.appStatus) el.appStatus.textContent = 'BACKEND OFFLINE';
      if (el.backendAvail) {
        el.backendAvail.textContent = errorMsg ? `Disconnected (${errorMsg})` : 'Backend Unreachable';
        el.backendAvail.className = 'value status-tag status-danger';
      }
      if (el.deviceCardStatus && !_currentDeviceId) {
        el.deviceCardStatus.textContent = 'WAITING FOR BACKEND';
        el.deviceCardStatus.className = 'badge badge-warning';
      }
    }

    if (el.lastCheck) {
      el.lastCheck.textContent = _lastSuccessfulCheck
        ? _lastSuccessfulCheck.toLocaleTimeString()
        : 'Never';
    }
  }

  function updateDeviceStatus(telemetryRecord = null) {
    if (!telemetryRecord) {
      if (el.deviceCardStatus) {
        el.deviceCardStatus.textContent = _serverOnline ? 'WAITING FOR DEVICE DATA' : 'BACKEND DISCONNECTED';
        el.deviceCardStatus.className = _serverOnline ? 'badge badge-neutral' : 'badge badge-warning';
      }
      if (el.deviceIdDisplay) el.deviceIdDisplay.textContent = '—';
      if (el.deviceLastSeen) el.deviceLastSeen.textContent = '—';
      if (el.deviceVarCount) el.deviceVarCount.textContent = '0';
      if (el.deviceGpsStatus) el.deviceGpsStatus.textContent = '—';
      if (el.staleAlert) el.staleAlert.style.display = 'none';
      return;
    }

    _currentDeviceId = telemetryRecord.device_id || 'UNKNOWN';
    _lastTelemetryTime = telemetryRecord.received_at ? new Date(telemetryRecord.received_at) : new Date();

    const now = new Date();
    const elapsedSeconds = Math.round((now - _lastTelemetryTime) / 1000);
    const isStale = elapsedSeconds > STALE_THRESHOLD_SECONDS;

    if (el.deviceIdDisplay) el.deviceIdDisplay.textContent = _currentDeviceId;
    if (el.deviceLastSeen) el.deviceLastSeen.textContent = `${_lastTelemetryTime.toLocaleTimeString()} (${elapsedSeconds}s ago)`;

    // Calculate variables count
    const varCount = Object.keys(telemetryRecord).length;
    if (el.deviceVarCount) el.deviceVarCount.textContent = varCount;

    // GPS Status
    const gpsValid = telemetryRecord.gps_valid;
    if (el.deviceGpsStatus) {
      if (gpsValid === true) {
        el.deviceGpsStatus.textContent = 'VALID FIX';
        el.deviceGpsStatus.className = 'status-tag status-success';
      } else if (gpsValid === false) {
        el.deviceGpsStatus.textContent = 'NO FIX';
        el.deviceGpsStatus.className = 'status-tag status-warning';
      } else {
        el.deviceGpsStatus.textContent = 'NOT REPORTED';
        el.deviceGpsStatus.className = 'status-tag status-neutral';
      }
    }

    if (isStale) {
      if (el.deviceCardStatus) {
        el.deviceCardStatus.textContent = 'STALE DATA';
        el.deviceCardStatus.className = 'badge badge-warning';
      }
      if (el.staleAlert) {
        el.staleAlert.style.display = 'block';
        el.staleAlert.textContent = `Warning: Telemetry is stale. Last reading received ${elapsedSeconds}s ago.`;
      }
    } else {
      if (el.deviceCardStatus) {
        el.deviceCardStatus.textContent = 'ACTIVE / RECENT';
        el.deviceCardStatus.className = 'badge badge-success';
      }
      if (el.staleAlert) el.staleAlert.style.display = 'none';
    }
  }

  function formatDuration(seconds) {
    const s = Math.floor(seconds);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const remS = s % 60;
    if (m < 60) return `${m}m ${remS}s`;
    const h = Math.floor(m / 60);
    const remM = m % 60;
    return `${h}h ${remM}m`;
  }

  // Polling Handlers
  async function pollHealth() {
    if (_inFlightHealth) return;
    _inFlightHealth = true;
    try {
      const [healthRes, sysRes] = await Promise.all([
        window.LabApi.getHealth(),
        window.LabApi.getSystemInfo().catch(() => null),
      ]);
      const isOnline = healthRes.data && healthRes.data.status === 'online';
      updateServerDisplay(isOnline, sysRes ? sysRes.data : null);
    } catch (err) {
      updateServerDisplay(false, null, err.message);
    } finally {
      _inFlightHealth = false;
    }
  }

  async function pollTelemetry() {
    if (_inFlightTelemetry) return;
    _inFlightTelemetry = true;
    try {
      if (typeof window.LabTelemetry === 'object' && typeof window.LabTelemetry.refreshLatest === 'function') {
        const latestRecord = await window.LabTelemetry.refreshLatest();
        updateDeviceStatus(latestRecord);
      }
    } catch (err) {
      // Telemetry fetch failed (e.g. 401 Unauthorized or server offline)
    } finally {
      _inFlightTelemetry = false;
    }
  }

  async function pollHistory() {
    if (_inFlightHistory) return;
    _inFlightHistory = true;
    try {
      if (typeof window.LabTelemetry === 'object' && typeof window.LabTelemetry.refreshHistory === 'function') {
        await window.LabTelemetry.refreshHistory();
      }
    } catch (err) {
      // History fetch failed
    } finally {
      _inFlightHistory = false;
    }
  }

  function startPolling() {
    stopPolling();
    // Immediate initial poll
    pollHealth();
    pollTelemetry();
    pollHistory();

    // Start intervals
    _timerHealth = setInterval(pollHealth, INTERVAL_HEALTH_MS);
    _timerTelemetry = setInterval(pollTelemetry, INTERVAL_TELEMETRY_MS);
    _timerHistory = setInterval(pollHistory, INTERVAL_HISTORY_MS);
  }

  function stopPolling() {
    if (_timerHealth) clearInterval(_timerHealth);
    if (_timerTelemetry) clearInterval(_timerTelemetry);
    if (_timerHistory) clearInterval(_timerHistory);
    _timerHealth = null;
    _timerTelemetry = null;
    _timerHistory = null;
  }

  function setupVisibilityHandler() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        stopPolling();
      } else {
        startPolling();
      }
    });
  }

  function init() {
    initElements();
    setupVisibilityHandler();

    if (el.refreshBtn) {
      el.refreshBtn.addEventListener('click', () => {
        pollHealth();
        pollTelemetry();
        pollHistory();
      });
    }

    startPolling();
  }

  // Export Dashboard Controller
  window.LabDashboard = {
    init,
    pollHealth,
    pollTelemetry,
    pollHistory,
    updateDeviceStatus,
    isOnline: () => _serverOnline,
  };
})(window);
