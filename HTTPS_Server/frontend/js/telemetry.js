/**
 * Panorama WLI HTTPS Laboratory — Telemetry Visualization Layer
 * 
 * Dynamically parses and renders IoT telemetry from Quectel EC200U-CN + STM32,
 * enumerates all variables, generates interactive tables, renders GPS fixes,
 * manages communication history, and displays formatted raw JSON.
 * All untrusted data is rendered via textContent/DOM methods (XSS-safe).
 */

(function (window) {
  'use strict';

  // Primary known fields with specific metric display mappings
  const KNOWN_METRIC_KEYS = [
    'device_id',
    'timestamp',
    'received_at',
    'water_level_cm',
    'water_level_percentage',
    'raw_voltage',
    'battery_voltage',
    'sensor_status',
    'alarm_status',
    'latitude',
    'longitude',
    'gps_valid',
  ];

  let _latestTelemetryRecord = null;
  let _historicalRecords = [];
  let _filterSearchText = '';
  let _sortColumn = 'name';
  let _sortAsc = true;
  let _historyLimit = 25;
  let _selectedDeviceId = '';

  // DOM Elements Cache
  const el = {};

  function initElements() {
    // Primary Metric Cards
    el.valWaterCm = document.getElementById('metric-water-cm');
    el.valWaterPct = document.getElementById('metric-water-pct');
    el.valWaterBar = document.getElementById('metric-water-bar');
    el.valRawVoltage = document.getElementById('metric-raw-voltage');
    el.valBatteryVoltage = document.getElementById('metric-battery-voltage');
    el.valSensorStatus = document.getElementById('metric-sensor-status');
    el.valAlarmStatus = document.getElementById('metric-alarm-status');

    // Dynamic Variables Container
    el.dynamicVarsContainer = document.getElementById('dynamic-variables-container');
    el.noDynamicVarsMsg = document.getElementById('no-dynamic-variables-msg');

    // Variable Table
    el.varTableBody = document.getElementById('variable-table-body');
    el.varSearchInput = document.getElementById('variable-search-input');
    el.varTableCount = document.getElementById('variable-table-count');

    // GPS Elements
    el.gpsStatus = document.getElementById('gps-status-badge');
    el.gpsCoords = document.getElementById('gps-coordinates');
    el.gpsOpenBtn = document.getElementById('gps-open-btn');
    el.gpsUnavailableMsg = document.getElementById('gps-unavailable-msg');
    el.gpsContainer = document.getElementById('gps-active-container');

    // History Table
    el.historyTableBody = document.getElementById('history-table-body');
    el.historyLimitSelect = document.getElementById('history-limit-select');
    el.historyRefreshBtn = document.getElementById('history-refresh-btn');
    el.historyDeviceFilter = document.getElementById('history-device-filter');
    el.historyEmptyMsg = document.getElementById('history-empty-msg');

    // Raw JSON Viewer
    el.rawJsonPre = document.getElementById('raw-json-content');
    el.rawJsonCopyBtn = document.getElementById('raw-json-copy-btn');
    el.rawJsonDownloadBtn = document.getElementById('raw-json-download-btn');
    el.rawJsonToggleBtn = document.getElementById('raw-json-toggle-btn');
    el.rawJsonWrapper = document.getElementById('raw-json-wrapper');

    // Telemetry Empty / Auth notice
    el.telemetryEmptyNotice = document.getElementById('telemetry-empty-notice');
    el.telemetryContentSection = document.getElementById('telemetry-content-section');
    el.authRequiredBanner = document.getElementById('auth-required-banner');

    // Modal
    el.modalOverlay = document.getElementById('record-modal-overlay');
    el.modalCloseBtn = document.getElementById('record-modal-close-btn');
    el.modalJsonContent = document.getElementById('record-modal-json');
    el.modalTitle = document.getElementById('record-modal-title');
  }

  function detectDataType(value) {
    if (value === null) return 'Null';
    if (Array.isArray(value)) return 'Array';
    const type = typeof value;
    if (type === 'number') {
      return Number.isInteger(value) ? 'Integer' : 'Float';
    }
    if (type === 'boolean') return 'Boolean';
    if (type === 'object') return 'Object';
    return 'String';
  }

  function formatDisplayValue(value) {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  /**
   * Refreshes the latest telemetry from the backend.
   */
  async function refreshLatest() {
    try {
      const res = await window.LabApi.getLatestTelemetry(_selectedDeviceId || null);
      if (el.authRequiredBanner) el.authRequiredBanner.style.display = 'none';

      let record = null;
      if (res && res.data) {
        if (Array.isArray(res.data.data)) {
          // If all devices returned, take the first/latest one if available
          record = res.data.data.length > 0 ? res.data.data[0] : null;
        } else if (res.data.data && typeof res.data.data === 'object') {
          record = res.data.data;
        }
      }

      _latestTelemetryRecord = record;
      renderLatestTelemetry(record);
      return record;
    } catch (err) {
      if (err.status === 401) {
        if (el.authRequiredBanner) el.authRequiredBanner.style.display = 'block';
        if (el.telemetryEmptyNotice) {
          el.telemetryEmptyNotice.style.display = 'block';
          el.telemetryEmptyNotice.textContent = 'API Token required to view telemetry. Enter token above.';
        }
        if (el.telemetryContentSection) el.telemetryContentSection.style.display = 'none';
      } else if (err.status === 404) {
        // No telemetry recorded yet
        renderLatestTelemetry(null);
      }
      throw err;
    }
  }

  /**
   * Refreshes communication history from the backend.
   */
  async function refreshHistory() {
    try {
      const res = await window.LabApi.getTelemetryHistory(_selectedDeviceId || null, _historyLimit);
      _historicalRecords = res && res.data && Array.isArray(res.data.data) ? res.data.data : [];
      renderHistoryTable(_historicalRecords);
      return _historicalRecords;
    } catch (err) {
      if (err.status === 401) {
        if (el.historyTableBody) el.historyTableBody.innerHTML = '';
        if (el.historyEmptyMsg) {
          el.historyEmptyMsg.style.display = 'block';
          el.historyEmptyMsg.textContent = 'Authentication required to retrieve history.';
        }
      }
      throw err;
    }
  }

  /**
   * Render latest telemetry record across primary cards, dynamic grid, table, and GPS.
   */
  function renderLatestTelemetry(record) {
    if (!record) {
      if (el.telemetryEmptyNotice) {
        el.telemetryEmptyNotice.style.display = 'block';
        el.telemetryEmptyNotice.textContent = 'WAITING FOR DEVICE DATA: No telemetry readings received yet.';
      }
      if (el.telemetryContentSection) el.telemetryContentSection.style.display = 'none';
      if (el.rawJsonPre) el.rawJsonPre.textContent = '{\n  "message": "No telemetry data recorded."\n}';
      renderGpsSection(null);
      renderDynamicVariables([]);
      renderVariableTable([]);
      return;
    }

    if (el.telemetryEmptyNotice) el.telemetryEmptyNotice.style.display = 'none';
    if (el.telemetryContentSection) el.telemetryContentSection.style.display = 'block';

    // 1. Primary Metrics
    if (el.valWaterCm) {
      el.valWaterCm.textContent = record.water_level_cm !== undefined && record.water_level_cm !== null
        ? `${Number(record.water_level_cm).toFixed(1)} cm`
        : '—';
    }
    if (el.valWaterPct) {
      const pct = record.water_level_percentage !== undefined && record.water_level_percentage !== null
        ? Number(record.water_level_percentage)
        : null;
      el.valWaterPct.textContent = pct !== null ? `${pct.toFixed(1)}%` : '—';
      if (el.valWaterBar) {
        el.valWaterBar.style.width = pct !== null ? `${Math.min(100, Math.max(0, pct))}%` : '0%';
      }
    }
    if (el.valRawVoltage) {
      el.valRawVoltage.textContent = record.raw_voltage !== undefined && record.raw_voltage !== null
        ? `${Number(record.raw_voltage).toFixed(2)} V`
        : '—';
    }
    if (el.valBatteryVoltage) {
      el.valBatteryVoltage.textContent = record.battery_voltage !== undefined && record.battery_voltage !== null
        ? `${Number(record.battery_voltage).toFixed(2)} V`
        : '—';
    }
    if (el.valSensorStatus) {
      const status = record.sensor_status !== undefined && record.sensor_status !== null
        ? String(record.sensor_status)
        : '—';
      el.valSensorStatus.textContent = status;
      el.valSensorStatus.className = status.toUpperCase() === 'NORMAL' || status === '1'
        ? 'metric-status status-success'
        : 'metric-status status-warning';
    }
    if (el.valAlarmStatus) {
      const alarm = record.alarm_status;
      const isAlarm = alarm === true || (typeof alarm === 'string' && alarm !== 'NONE' && alarm !== '0' && alarm !== 'NORMAL');
      el.valAlarmStatus.textContent = isAlarm ? (typeof alarm === 'string' ? alarm : 'ALARM ACTIVE') : 'NORMAL';
      el.valAlarmStatus.className = isAlarm ? 'metric-status status-danger' : 'metric-status status-success';
    }

    // 2. Separate Dynamic Variables (all keys not in KNOWN_METRIC_KEYS)
    const dynamicVars = [];
    const allVars = [];
    const timestampStr = record.received_at || (record.timestamp ? new Date(record.timestamp * 1000).toISOString() : new Date().toISOString());

    Object.keys(record).forEach((key) => {
      const val = record[key];
      const type = detectDataType(val);
      const varEntry = {
        name: key,
        value: val,
        type,
        updated: timestampStr,
      };
      allVars.push(varEntry);

      if (!KNOWN_METRIC_KEYS.includes(key)) {
        dynamicVars.push(varEntry);
      }
    });

    renderDynamicVariables(dynamicVars);
    renderVariableTable(allVars);
    renderGpsSection(record);
    renderRawJson(record);
  }

  /**
   * Render dynamic arbitrary extra variables as compact visual cards.
   */
  function renderDynamicVariables(vars) {
    if (!el.dynamicVarsContainer) return;
    el.dynamicVarsContainer.innerHTML = '';

    if (vars.length === 0) {
      if (el.noDynamicVarsMsg) el.noDynamicVarsMsg.style.display = 'block';
      return;
    }

    if (el.noDynamicVarsMsg) el.noDynamicVarsMsg.style.display = 'none';

    vars.forEach((v) => {
      const card = document.createElement('div');
      card.className = 'dynamic-var-card';

      const title = document.createElement('div');
      title.className = 'dynamic-var-title';
      title.textContent = v.name;

      const val = document.createElement('div');
      val.className = 'dynamic-var-value';
      val.textContent = formatDisplayValue(v.value);

      const typeBadge = document.createElement('span');
      typeBadge.className = `type-badge type-${v.type.toLowerCase()}`;
      typeBadge.textContent = v.type;

      card.appendChild(title);
      card.appendChild(val);
      card.appendChild(typeBadge);
      el.dynamicVarsContainer.appendChild(card);
    });
  }

  /**
   * Render variable table with filtering, sorting, and safe DOM insertion.
   */
  function renderVariableTable(vars) {
    if (!el.varTableBody) return;
    el.varTableBody.innerHTML = '';

    // Filter by search text
    const filtered = vars.filter((v) => {
      if (!_filterSearchText) return true;
      const term = _filterSearchText.toLowerCase();
      return v.name.toLowerCase().includes(term) || formatDisplayValue(v.value).toLowerCase().includes(term) || v.type.toLowerCase().includes(term);
    });

    // Sort
    filtered.sort((a, b) => {
      let valA = a[_sortColumn] || '';
      let valB = b[_sortColumn] || '';
      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();
      if (valA < valB) return _sortAsc ? -1 : 1;
      if (valA > valB) return _sortAsc ? 1 : -1;
      return 0;
    });

    if (el.varTableCount) {
      el.varTableCount.textContent = `${filtered.length} of ${vars.length} variables`;
    }

    if (filtered.length === 0) {
      const emptyRow = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 4;
      td.className = 'table-empty-cell';
      td.textContent = 'No matching variables found.';
      emptyRow.appendChild(td);
      el.varTableBody.appendChild(emptyRow);
      return;
    }

    filtered.forEach((v) => {
      const tr = document.createElement('tr');

      // Name
      const tdName = document.createElement('td');
      const codeName = document.createElement('code');
      codeName.textContent = v.name;
      tdName.appendChild(codeName);

      // Value
      const tdValue = document.createElement('td');
      tdValue.className = 'table-value-cell';
      const formatted = formatDisplayValue(v.value);

      if (v.type === 'Object' || v.type === 'Array') {
        const details = document.createElement('details');
        const summary = document.createElement('summary');
        summary.textContent = `${v.type} (${Array.isArray(v.value) ? v.value.length : Object.keys(v.value).length} items)`;
        const pre = document.createElement('pre');
        pre.className = 'inline-json-pre';
        pre.textContent = JSON.stringify(v.value, null, 2);
        details.appendChild(summary);
        details.appendChild(pre);
        tdValue.appendChild(details);
      } else {
        const spanVal = document.createElement('span');
        spanVal.className = 'var-val-text';
        spanVal.textContent = formatted;
        tdValue.appendChild(spanVal);
      }

      // Copy Button
      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'btn-icon-tiny';
      copyBtn.title = 'Copy value';
      copyBtn.textContent = 'Copy';
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(formatted).then(() => {
          copyBtn.textContent = 'Copied!';
          setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
        });
      });
      tdValue.appendChild(copyBtn);

      // Type
      const tdType = document.createElement('td');
      const typeSpan = document.createElement('span');
      typeSpan.className = `type-badge type-${v.type.toLowerCase()}`;
      typeSpan.textContent = v.type;
      tdType.appendChild(typeSpan);

      // Last Updated
      const tdUpdated = document.createElement('td');
      tdUpdated.className = 'text-muted-cell';
      tdUpdated.textContent = v.updated ? new Date(v.updated).toLocaleTimeString() : '—';

      tr.appendChild(tdName);
      tr.appendChild(tdValue);
      tr.appendChild(tdType);
      tr.appendChild(tdUpdated);
      el.varTableBody.appendChild(tr);
    });
  }

  /**
   * Render GPS section if coordinates exist.
   */
  function renderGpsSection(record) {
    if (!el.gpsContainer || !el.gpsUnavailableMsg) return;

    if (!record || record.latitude === null || record.latitude === undefined || record.longitude === null || record.longitude === undefined) {
      el.gpsContainer.style.display = 'none';
      el.gpsUnavailableMsg.style.display = 'block';
      el.gpsUnavailableMsg.textContent = 'GPS DATA UNAVAILABLE';
      return;
    }

    const lat = Number(record.latitude);
    const lon = Number(record.longitude);

    if (isNaN(lat) || isNaN(lon)) {
      el.gpsContainer.style.display = 'none';
      el.gpsUnavailableMsg.style.display = 'block';
      el.gpsUnavailableMsg.textContent = 'GPS DATA UNAVAILABLE (Invalid Coordinates)';
      return;
    }

    el.gpsUnavailableMsg.style.display = 'none';
    el.gpsContainer.style.display = 'flex';

    if (el.gpsCoords) {
      el.gpsCoords.textContent = `${lat.toFixed(6)}°, ${lon.toFixed(6)}°`;
    }

    const isValid = record.gps_valid === true;
    if (el.gpsStatus) {
      el.gpsStatus.textContent = isValid ? 'VALID FIX' : 'NO FIX / ESTIMATED';
      el.gpsStatus.className = isValid ? 'badge badge-success' : 'badge badge-warning';
    }

    if (el.gpsOpenBtn) {
      el.gpsOpenBtn.onclick = () => {
        const url = `https://www.google.com/maps?q=${lat},${lon}`;
        window.open(url, '_blank', 'noopener,noreferrer');
      };
    }
  }

  /**
   * Render history table rows.
   */
  function renderHistoryTable(records) {
    if (!el.historyTableBody) return;
    el.historyTableBody.innerHTML = '';

    if (!records || records.length === 0) {
      if (el.historyEmptyMsg) {
        el.historyEmptyMsg.style.display = 'block';
        el.historyEmptyMsg.textContent = 'No historical telemetry records found.';
      }
      return;
    }

    if (el.historyEmptyMsg) el.historyEmptyMsg.style.display = 'none';

    records.forEach((rec, idx) => {
      const tr = document.createElement('tr');

      // 1. Timestamp
      const tdTime = document.createElement('td');
      tdTime.textContent = rec.received_at ? new Date(rec.received_at).toLocaleTimeString() : '—';

      // 2. Device ID
      const tdDev = document.createElement('td');
      const codeDev = document.createElement('code');
      codeDev.textContent = rec.device_id || 'UNKNOWN';
      tdDev.appendChild(codeDev);

      // 3. Water Level
      const tdLevel = document.createElement('td');
      tdLevel.textContent = rec.water_level_cm !== undefined && rec.water_level_cm !== null
        ? `${Number(rec.water_level_cm).toFixed(1)} cm (${Number(rec.water_level_percentage || 0).toFixed(0)}%)`
        : '—';

      // 4. Variables Count
      const tdCount = document.createElement('td');
      tdCount.textContent = Object.keys(rec).length;

      // 5. Actions
      const tdAction = document.createElement('td');
      const inspectBtn = document.createElement('button');
      inspectBtn.type = 'button';
      inspectBtn.className = 'btn btn-tiny btn-outline';
      inspectBtn.textContent = 'Inspect';
      inspectBtn.addEventListener('click', () => openRecordModal(rec, idx));
      tdAction.appendChild(inspectBtn);

      tr.appendChild(tdTime);
      tr.appendChild(tdDev);
      tr.appendChild(tdLevel);
      tr.appendChild(tdCount);
      tr.appendChild(tdAction);
      el.historyTableBody.appendChild(tr);
    });
  }

  /**
   * Open JSON Inspector modal for a selected historical record.
   */
  function openRecordModal(record, index) {
    if (!el.modalOverlay || !el.modalJsonContent) return;
    if (el.modalTitle) {
      el.modalTitle.textContent = `Record #${index + 1} — ${record.device_id || 'Telemetry'}`;
    }
    el.modalJsonContent.textContent = JSON.stringify(record, null, 2);
    el.modalOverlay.style.display = 'flex';
  }

  function closeRecordModal() {
    if (el.modalOverlay) {
      el.modalOverlay.style.display = 'none';
    }
  }

  /**
   * Render formatted raw JSON.
   */
  function renderRawJson(record) {
    if (!el.rawJsonPre) return;
    el.rawJsonPre.textContent = JSON.stringify(record, null, 2);
  }

  function copyRawJson() {
    if (!_latestTelemetryRecord) return;
    const jsonStr = JSON.stringify(_latestTelemetryRecord, null, 2);
    navigator.clipboard.writeText(jsonStr).then(() => {
      if (el.rawJsonCopyBtn) {
        el.rawJsonCopyBtn.textContent = 'Copied!';
        setTimeout(() => { el.rawJsonCopyBtn.textContent = 'Copy JSON'; }, 1500);
      }
    });
  }

  function downloadRawJson() {
    if (!_latestTelemetryRecord) return;
    const jsonStr = JSON.stringify(_latestTelemetryRecord, null, 2);
    const devId = _latestTelemetryRecord.device_id || 'device';
    const timestamp = Date.now();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `telemetry_${devId}_${timestamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function setupEventListeners() {
    // Search input
    if (el.varSearchInput) {
      el.varSearchInput.addEventListener('input', (e) => {
        _filterSearchText = e.target.value;
        if (_latestTelemetryRecord) {
          const allVars = Object.keys(_latestTelemetryRecord).map((k) => ({
            name: k,
            value: _latestTelemetryRecord[k],
            type: detectDataType(_latestTelemetryRecord[k]),
            updated: _latestTelemetryRecord.received_at,
          }));
          renderVariableTable(allVars);
        }
      });
    }

    // History controls
    if (el.historyLimitSelect) {
      el.historyLimitSelect.addEventListener('change', (e) => {
        _historyLimit = parseInt(e.target.value, 10) || 25;
        refreshHistory();
      });
    }

    if (el.historyDeviceFilter) {
      el.historyDeviceFilter.addEventListener('change', (e) => {
        _selectedDeviceId = e.target.value.trim();
        refreshLatest();
        refreshHistory();
      });
    }

    if (el.historyRefreshBtn) {
      el.historyRefreshBtn.addEventListener('click', refreshHistory);
    }

    // Raw JSON controls
    if (el.rawJsonCopyBtn) el.rawJsonCopyBtn.addEventListener('click', copyRawJson);
    if (el.rawJsonDownloadBtn) el.rawJsonDownloadBtn.addEventListener('click', downloadRawJson);
    if (el.rawJsonToggleBtn && el.rawJsonWrapper) {
      el.rawJsonToggleBtn.addEventListener('click', () => {
        const isCollapsed = el.rawJsonWrapper.classList.toggle('collapsed');
        el.rawJsonToggleBtn.textContent = isCollapsed ? 'Expand' : 'Collapse';
      });
    }

    // Modal
    if (el.modalCloseBtn) el.modalCloseBtn.addEventListener('click', closeRecordModal);
    if (el.modalOverlay) {
      el.modalOverlay.addEventListener('click', (e) => {
        if (e.target === el.modalOverlay) closeRecordModal();
      });
    }
  }

  function init() {
    initElements();
    setupEventListeners();
  }

  // Export Telemetry Viewer
  window.LabTelemetry = {
    init,
    refreshLatest,
    refreshHistory,
    renderLatestTelemetry,
    getLatestRecord: () => _latestTelemetryRecord,
  };
})(window);
