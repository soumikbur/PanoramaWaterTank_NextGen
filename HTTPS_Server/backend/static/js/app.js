/**
 * Panorama WLI HTTPS Laboratory — Application Coordinator & Testing Controller
 * 
 * Manages manual JSON testing, multipart file upload testing, in-memory auth controls,
 * API endpoint controls, API communication monitoring, clock display, and page event wiring.
 */

(function (window) {
  'use strict';

  const SAMPLE_TELEMETRY = {
    device_id: 'WLI_LAB_NODE_01',
    sequence_id: 1001,
    timestamp: Math.floor(Date.now() / 1000),
    water_level_cm: 112.5,
    water_level_percentage: 75.0,
    raw_voltage: 3.50,
    pressure_bar: 0.110,
    sensor_status: 'NORMAL',
    latitude: 22.5726,
    longitude: 88.3639,
    gps_valid: true,
    battery_voltage: 12.6,
    alarm_status: 'NONE',
    signal_csq: 28,
    coach_id: 'pano123',
    train_number: '12841',
  };

  const MAX_LOG_ENTRIES = 50;
  const _commLogs = [];

  // Application-level Display Zoom Configuration (70% - 150%, step 10%)
  const ZOOM_STORAGE_KEY = 'wli_https_lab_zoom';
  const ZOOM_MIN = 70;
  const ZOOM_MAX = 150;
  const ZOOM_STEP = 10;
  const ZOOM_DEFAULT = 100;
  let _currentZoom = ZOOM_DEFAULT;

  // DOM Elements Cache
  const el = {};

  function initElements() {
    // Clock
    el.liveClock = document.getElementById('header-live-clock');

    // Display Zoom Controls
    el.zoomOutBtn = document.getElementById('zoom-out-btn');
    el.zoomInBtn = document.getElementById('zoom-in-btn');
    el.zoomResetBtn = document.getElementById('zoom-reset-btn');
    el.zoomDisplay = document.getElementById('zoom-level-display');

    // API Endpoint Controls
    el.endpointInput = document.getElementById('api-endpoint-input');
    el.endpointApplyBtn = document.getElementById('api-endpoint-apply-btn');
    el.endpointResetBtn = document.getElementById('api-endpoint-reset-btn');
    el.endpointStatus = document.getElementById('api-endpoint-status');

    // Auth Bar
    el.tokenInput = document.getElementById('auth-token-input');
    el.tokenToggleBtn = document.getElementById('auth-token-toggle-btn');
    el.tokenApplyBtn = document.getElementById('auth-token-apply-btn');
    el.tokenClearBtn = document.getElementById('auth-token-clear-btn');
    el.tokenStatusBadge = document.getElementById('auth-token-status');
    el.authRequiredBanner = document.getElementById('auth-required-banner');

    // Manual JSON POST Testing
    el.postJsonEditor = document.getElementById('manual-post-json-editor');
    el.postFormatBtn = document.getElementById('manual-post-format-btn') || document.getElementById('manual-post-validate-btn');
    el.postSampleBtn = document.getElementById('manual-post-sample-btn');
    el.postResetBtn = document.getElementById('manual-post-reset-btn');
    el.postSendBtn = document.getElementById('manual-post-send-btn');
    el.postResultStatus = document.getElementById('manual-post-result-status');
    el.postResultTime = document.getElementById('manual-post-result-time');
    el.postResultBody = document.getElementById('manual-post-result-body');
    el.postResultContainer = document.getElementById('manual-post-result-container');

    // File Upload Testing
    el.fileInput = document.getElementById('file-upload-input');
    el.fileNameDisplay = document.getElementById('file-upload-name');
    el.fileSizeDisplay = document.getElementById('file-upload-size');
    el.filePreview = document.getElementById('file-upload-preview');
    el.fileSubmitBtn = document.getElementById('file-upload-submit-btn');
    el.fileResultContainer = document.getElementById('file-upload-result-container');
    el.fileResultStatus = document.getElementById('file-upload-result-status');
    el.fileResultBody = document.getElementById('file-upload-result-body');

    // Communication Monitor
    el.commLogTable = document.getElementById('comm-monitor-table-body');
    el.commLogClearBtn = document.getElementById('comm-monitor-clear-btn');
    el.commLogCount = document.getElementById('comm-monitor-count');
  }

  // Live Clock
  function startClock() {
    function updateClock() {
      if (el.liveClock) {
        const now = new Date();
        el.liveClock.textContent = `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;
      }
    }
    updateClock();
    setInterval(updateClock, 1000);
  }

  // API Endpoint Controls
  function setupEndpointControls() {
    if (el.endpointInput && window.LabApi) {
      el.endpointInput.value = window.LabApi.getBaseUrl();
    }

    if (el.endpointApplyBtn && el.endpointInput) {
      el.endpointApplyBtn.addEventListener('click', () => {
        const newUrl = el.endpointInput.value.trim();
        if (newUrl) {
          window.LabApi.setBaseUrl(newUrl);
          updateEndpointBadge();
          if (window.LabDashboard) {
            window.LabDashboard.pollHealth();
            window.LabDashboard.pollTelemetry();
            window.LabDashboard.pollHistory();
          }
        }
      });
    }

    if (el.endpointResetBtn && el.endpointInput) {
      el.endpointResetBtn.addEventListener('click', () => {
        window.LabApi.resetBaseUrl();
        el.endpointInput.value = window.LabApi.getBaseUrl();
        updateEndpointBadge();
        if (window.LabDashboard) {
          window.LabDashboard.pollHealth();
          window.LabDashboard.pollTelemetry();
          window.LabDashboard.pollHistory();
        }
      });
    }

    updateEndpointBadge();
  }

  function updateEndpointBadge() {
    if (!el.endpointStatus || !window.LabApi) return;
    const current = window.LabApi.getBaseUrl();
    if (current.startsWith('https://')) {
      el.endpointStatus.textContent = 'HTTPS Endpoint Active';
      el.endpointStatus.className = 'status-tag status-success';
    } else if (current) {
      el.endpointStatus.textContent = 'HTTP (Local)';
      el.endpointStatus.className = 'status-tag status-neutral';
    } else {
      el.endpointStatus.textContent = 'Origin Relative';
      el.endpointStatus.className = 'status-tag status-neutral';
    }
  }

  // Authentication Controls (In-Memory Only)
  function setupAuthControls() {
    if (el.tokenToggleBtn && el.tokenInput) {
      el.tokenToggleBtn.addEventListener('click', () => {
        const isPassword = el.tokenInput.type === 'password';
        el.tokenInput.type = isPassword ? 'text' : 'password';
        el.tokenToggleBtn.textContent = isPassword ? 'Hide' : 'Show';
      });
    }

    if (el.tokenApplyBtn && el.tokenInput) {
      el.tokenApplyBtn.addEventListener('click', () => {
        const token = el.tokenInput.value.trim();
        window.LabApi.setToken(token);
        updateAuthBadge();

        // Immediately poll with new token
        if (window.LabDashboard) {
          window.LabDashboard.pollTelemetry();
          window.LabDashboard.pollHistory();
        }
      });
    }

    if (el.tokenClearBtn && el.tokenInput) {
      el.tokenClearBtn.addEventListener('click', () => {
        el.tokenInput.value = '';
        window.LabApi.clearToken();
        updateAuthBadge();
        if (window.LabDashboard) {
          window.LabDashboard.pollTelemetry();
        }
      });
    }

    updateAuthBadge();
  }

  function updateAuthBadge() {
    if (!el.tokenStatusBadge) return;
    if (window.LabApi.hasToken()) {
      el.tokenStatusBadge.textContent = 'Token Active (In-Memory)';
      el.tokenStatusBadge.className = 'status-tag status-success';
      if (el.authRequiredBanner) el.authRequiredBanner.style.display = 'none';
    } else {
      el.tokenStatusBadge.textContent = 'No Token Set';
      el.tokenStatusBadge.className = 'status-tag status-warning';
    }
  }

  // Manual JSON POST Testing
  function setupManualPost() {
    if (el.postJsonEditor) {
      el.postJsonEditor.value = JSON.stringify(SAMPLE_TELEMETRY, null, 2);
    }

    if (el.postFormatBtn && el.postJsonEditor) {
      el.postFormatBtn.addEventListener('click', () => {
        try {
          const parsed = JSON.parse(el.postJsonEditor.value);
          el.postJsonEditor.value = JSON.stringify(parsed, null, 2);
        } catch (err) {
          alert(`Invalid JSON: ${err.message}`);
        }
      });
    }

    if (el.postSampleBtn && el.postJsonEditor) {
      el.postSampleBtn.addEventListener('click', () => {
        const sample = Object.assign({}, SAMPLE_TELEMETRY, {
          timestamp: Math.floor(Date.now() / 1000),
          sequence_id: Math.floor(Math.random() * 10000) + 1,
          water_level_cm: parseFloat((Math.random() * 140 + 5).toFixed(1)),
          water_level_percentage: parseFloat((Math.random() * 95 + 5).toFixed(1)),
        });
        el.postJsonEditor.value = JSON.stringify(sample, null, 2);
      });
    }

    if (el.postResetBtn && el.postJsonEditor) {
      el.postResetBtn.addEventListener('click', () => {
        el.postJsonEditor.value = JSON.stringify(SAMPLE_TELEMETRY, null, 2);
        if (el.postResultContainer) el.postResultContainer.style.display = 'none';
      });
    }

    if (el.postSendBtn && el.postJsonEditor) {
      el.postSendBtn.addEventListener('click', async () => {
        let payload;
        try {
          payload = JSON.parse(el.postJsonEditor.value);
        } catch (err) {
          alert(`Cannot send invalid JSON: ${err.message}`);
          return;
        }

        el.postSendBtn.disabled = true;
        el.postSendBtn.textContent = 'Sending...';

        try {
          const result = await window.LabApi.sendTelemetryJson(payload);
          renderPostResult(true, result.status, result.data, result.durationMs);

          // Refresh live telemetry views
          if (window.LabDashboard) {
            window.LabDashboard.pollTelemetry();
            window.LabDashboard.pollHistory();
          }
        } catch (err) {
          renderPostResult(false, err.status || 0, err.data || { error: err.message }, err.durationMs || 0);
        } finally {
          el.postSendBtn.disabled = false;
          el.postSendBtn.textContent = 'Send JSON Telemetry';
        }
      });
    }
  }

  function renderPostResult(success, status, data, durationMs) {
    if (!el.postResultContainer) return;
    el.postResultContainer.style.display = 'block';

    if (el.postResultStatus) {
      el.postResultStatus.textContent = success ? `HTTP ${status} OK` : `HTTP ${status || 'ERR'} FAILED`;
      el.postResultStatus.className = success ? 'status-tag status-success' : 'status-tag status-danger';
    }

    if (el.postResultTime) {
      el.postResultTime.textContent = `${durationMs}ms • ${new Date().toLocaleTimeString()}`;
    }

    if (el.postResultBody) {
      el.postResultBody.textContent = JSON.stringify(data, null, 2);
    }
  }

  // File Upload Testing
  function setupFileUpload() {
    let selectedFile = null;

    if (el.fileInput) {
      el.fileInput.addEventListener('change', (e) => {
        selectedFile = e.target.files && e.target.files[0] ? e.target.files[0] : null;
        if (selectedFile) {
          if (el.fileNameDisplay) el.fileNameDisplay.textContent = selectedFile.name;
          if (el.fileSizeDisplay) el.fileSizeDisplay.textContent = `${(selectedFile.size / 1024).toFixed(2)} KB`;
          if (el.fileSubmitBtn) el.fileSubmitBtn.disabled = false;

          // Read preview if JSON
          if (selectedFile.name.endsWith('.json') && el.filePreview) {
            const reader = new FileReader();
            reader.onload = (ev) => {
              try {
                const parsed = JSON.parse(ev.target.result);
                el.filePreview.textContent = JSON.stringify(parsed, null, 2);
              } catch (err) {
                el.filePreview.textContent = ev.target.result;
              }
            };
            reader.readAsText(selectedFile);
          }
        } else {
          resetFileState();
        }
      });
    }

    if (el.fileSubmitBtn) {
      el.fileSubmitBtn.addEventListener('click', async () => {
        if (!selectedFile) return;

        el.fileSubmitBtn.disabled = true;
        el.fileSubmitBtn.textContent = 'Uploading...';

        try {
          const result = await window.LabApi.sendTelemetryFile(selectedFile);
          renderFileResult(true, result.status, result.data, result.durationMs);

          // Refresh live telemetry views
          if (window.LabDashboard) {
            window.LabDashboard.pollTelemetry();
            window.LabDashboard.pollHistory();
          }
        } catch (err) {
          renderFileResult(false, err.status || 0, err.data || { error: err.message }, err.durationMs || 0);
        } finally {
          el.fileSubmitBtn.disabled = false;
          el.fileSubmitBtn.textContent = 'Upload File';
        }
      });
    }

    function resetFileState() {
      selectedFile = null;
      if (el.fileNameDisplay) el.fileNameDisplay.textContent = 'No file selected';
      if (el.fileSizeDisplay) el.fileSizeDisplay.textContent = '0 KB';
      if (el.filePreview) el.filePreview.textContent = '// Selected JSON file contents will appear here...';
      if (el.fileSubmitBtn) el.fileSubmitBtn.disabled = true;
      if (el.fileResultContainer) el.fileResultContainer.style.display = 'none';
    }
  }

  function renderFileResult(success, status, data, durationMs) {
    if (!el.fileResultContainer) return;
    el.fileResultContainer.style.display = 'block';

    if (el.fileResultStatus) {
      el.fileResultStatus.textContent = success ? `HTTP ${status} OK` : `HTTP ${status || 'ERR'} FAILED`;
      el.fileResultStatus.className = success ? 'status-tag status-success' : 'status-tag status-danger';
    }

    if (el.fileResultBody) {
      el.fileResultBody.textContent = JSON.stringify(data, null, 2);
    }
  }

  // Communication Monitor
  function setupCommMonitor() {
    window.LabApi.onLog((entry) => {
      _commLogs.unshift(entry);
      if (_commLogs.length > MAX_LOG_ENTRIES) {
        _commLogs.pop();
      }
      renderCommLogs();
    });

    if (el.commLogClearBtn) {
      el.commLogClearBtn.addEventListener('click', () => {
        _commLogs.length = 0;
        renderCommLogs();
      });
    }
  }

  function renderCommLogs() {
    if (!el.commLogTable) return;
    if (el.commLogCount) el.commLogCount.textContent = _commLogs.length;

    if (_commLogs.length === 0) {
      el.commLogTable.innerHTML = '<tr><td colspan="6" class="empty-cell">No API events recorded yet.</td></tr>';
      return;
    }

    let html = '';
    for (let i = 0; i < _commLogs.length; i++) {
      const log = _commLogs[i];
      const timeStr = log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : '—';
      const statusClass = log.success ? 'badge-success' : 'badge-danger';
      const statusText = log.status ? `HTTP ${log.status}` : 'ERR';

      html += `<tr>
        <td class="code">${timeStr}</td>
        <td><span class="badge">${escapeHtml(log.method)}</span></td>
        <td class="code cell-truncate" title="${escapeHtml(log.endpoint)}">${escapeHtml(log.endpoint)}</td>
        <td><span class="badge ${statusClass}">${escapeHtml(statusText)}</span></td>
        <td class="code">${log.durationMs}ms</td>
        <td class="cell-error">${log.error ? escapeHtml(log.error) : '<span class="text-dim">—</span>'}</td>
      </tr>`;
    }

    el.commLogTable.innerHTML = html;
  }

  function escapeHtml(str) {
    if (typeof str !== 'string') return String(str);
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Application-level Display Zoom Controller (70% - 150%, CSS root scale)
  function applyZoom(zoomPercent, persist = true) {
    const clamped = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(zoomPercent / ZOOM_STEP) * ZOOM_STEP));
    _currentZoom = clamped;
    document.documentElement.style.setProperty('--ui-scale', (clamped / 100).toFixed(2));

    if (el.zoomDisplay) el.zoomDisplay.textContent = `${clamped}%`;
    if (el.zoomOutBtn) el.zoomOutBtn.disabled = clamped <= ZOOM_MIN;
    if (el.zoomInBtn) el.zoomInBtn.disabled = clamped >= ZOOM_MAX;
    if (el.zoomResetBtn) el.zoomResetBtn.disabled = clamped === ZOOM_DEFAULT;

    if (persist) {
      try {
        localStorage.setItem(ZOOM_STORAGE_KEY, String(clamped));
      } catch (e) {
        // Ignore storage restrictions
      }
    }
  }

  function setupZoomControls() {
    let saved = ZOOM_DEFAULT;
    try {
      const raw = parseInt(localStorage.getItem(ZOOM_STORAGE_KEY), 10);
      if (!isNaN(raw) && raw >= ZOOM_MIN && raw <= ZOOM_MAX) {
        saved = raw;
      }
    } catch (e) {}

    applyZoom(saved, false);

    if (el.zoomOutBtn) {
      el.zoomOutBtn.addEventListener('click', () => applyZoom(_currentZoom - ZOOM_STEP));
    }
    if (el.zoomInBtn) {
      el.zoomInBtn.addEventListener('click', () => applyZoom(_currentZoom + ZOOM_STEP));
    }
    if (el.zoomResetBtn) {
      el.zoomResetBtn.addEventListener('click', () => applyZoom(ZOOM_DEFAULT));
    }

    // Keyboard shortcuts: Ctrl + Plus / Minus / 0 (only when not editing text inputs)
    document.addEventListener('keydown', (e) => {
      if (!e.ctrlKey || e.altKey || e.metaKey) return;
      const tag = (e.target && e.target.tagName) ? e.target.tagName.toUpperCase() : '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        applyZoom(_currentZoom + ZOOM_STEP);
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        applyZoom(_currentZoom - ZOOM_STEP);
      } else if (e.key === '0') {
        e.preventDefault();
        applyZoom(ZOOM_DEFAULT);
      }
    });
  }

  function init() {
    initElements();
    setupZoomControls();
    startClock();
    setupEndpointControls();
    setupAuthControls();
    setupManualPost();
    setupFileUpload();
    setupCommMonitor();
  }

  document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Telemetry Subsystem
    if (window.LabTelemetry && typeof window.LabTelemetry.init === 'function') {
      window.LabTelemetry.init();
    }
    // 2. Initialize Dashboard Controller
    if (window.LabDashboard && typeof window.LabDashboard.init === 'function') {
      window.LabDashboard.init();
    }
    // 3. Initialize Coordinator
    init();
  });
})(window);
