const assert = require('assert');

// Test suite for Sensor Health Formatting & Sanitization
// Requirements:
// 1. Strip any hardware name, chip model, bus identifier, or internal driver detail.
// 2. Normalize output strictly to standard health states: Healthy, Warning, Fault, Offline, Awaiting Telemetry.

function formatSensorHealth(status) {
  if (!status || typeof status !== 'string') {
    return 'Awaiting Telemetry';
  }

  const trimmed = status.trim();
  if (!trimmed || trimmed === '--' || trimmed === 'N/A') {
    return 'Awaiting Telemetry';
  }

  // 1. Check leading base status before any parenthesis/bracket
  const base = trimmed.split(/[\(\[\{]/)[0].trim();
  const lowerBase = base.toLowerCase();

  if (lowerBase === 'healthy' || lowerBase === 'operational' || lowerBase === 'normal' || lowerBase === 'ok') {
    return 'Healthy';
  }
  if (lowerBase === 'warning' || lowerBase === 'warn' || lowerBase === 'stale') {
    return 'Warning';
  }
  if (lowerBase === 'fault' || lowerBase === 'sensor fault' || lowerBase === 'error' || lowerBase === 'critical') {
    return 'Fault';
  }
  if (lowerBase === 'offline' || lowerBase === 'disconnected' || lowerBase === 'unreachable') {
    return 'Offline';
  }
  if (
    lowerBase === 'awaiting telemetry' ||
    lowerBase === 'waiting for telemetry' ||
    lowerBase === 'awaiting data' ||
    lowerBase === 'waiting'
  ) {
    return 'Awaiting Telemetry';
  }

  // 2. Fallback classification by keyword scan
  const upper = trimmed.toUpperCase();

  if (
    upper.includes('AWAITING') ||
    upper.includes('WAITING') ||
    upper.includes('NO TELEMETRY') ||
    upper.includes('NO DATA')
  ) {
    return 'Awaiting Telemetry';
  }

  if (upper.includes('OFFLINE') || upper.includes('DISCONNECT')) {
    return 'Offline';
  }

  if (upper.includes('FAULT') || upper.includes('ERROR') || upper.includes('CRITICAL')) {
    return 'Fault';
  }

  if (upper.includes('WARN') || upper.includes('STALE')) {
    return 'Warning';
  }

  if (upper.includes('HEALTHY') || upper.includes('NORMAL') || upper.includes('OPERATIONAL')) {
    return 'Healthy';
  }

  return 'Healthy';
}

function getSensorHealthColor(health) {
  const normalized = formatSensorHealth(health);
  switch (normalized) {
    case 'Healthy':
      return '#059669';
    case 'Warning':
      return '#D97706';
    case 'Fault':
      return '#DC2626';
    case 'Offline':
    case 'Awaiting Telemetry':
    default:
      return '#64748B';
  }
}

const testCases = [
  // Required table from user specification:
  { input: 'Healthy (ADS1115 Active)', expected: 'Healthy' },
  { input: 'Healthy (ADC Active)', expected: 'Healthy' },
  { input: 'Healthy (Sensor Connected)', expected: 'Healthy' },
  { input: 'Warning (ADS1115)', expected: 'Warning' },
  { input: 'Fault (ADS1115)', expected: 'Fault' },
  { input: 'Fault (Sensor XYZ)', expected: 'Fault' },
  { input: 'Offline (Sensor XYZ)', expected: 'Offline' },
  { input: 'Awaiting Telemetry', expected: 'Awaiting Telemetry' },

  // Additional variations:
  { input: 'Healthy (0.00 cm)', expected: 'Healthy' },
  { input: 'Healthy (EEPROM Backup Ready)', expected: 'Healthy' },
  { input: 'Operational', expected: 'Healthy' },
  { input: 'Normal', expected: 'Healthy' },
  { input: 'OK', expected: 'Healthy' },
  { input: 'Sensor Fault: Invalid ADC reading', expected: 'Fault' },
  { input: 'CRITICAL SENSOR FAILURE', expected: 'Fault' },
  { input: 'Offline', expected: 'Offline' },
  { input: 'Waiting for Telemetry', expected: 'Awaiting Telemetry' },
  { input: 'Awaiting Data', expected: 'Awaiting Telemetry' },
  { input: null, expected: 'Awaiting Telemetry' },
  { input: undefined, expected: 'Awaiting Telemetry' },
  { input: '', expected: 'Awaiting Telemetry' },
  { input: '--', expected: 'Awaiting Telemetry' },
  { input: 'N/A', expected: 'Awaiting Telemetry' },
];

console.log('Running formatSensorHealth unit tests...');
let passed = 0;
for (const tc of testCases) {
  const actual = formatSensorHealth(tc.input);
  assert.strictEqual(
    actual,
    tc.expected,
    `Failed for input: "${tc.input}". Expected "${tc.expected}", got "${actual}"`
  );
  console.log(`[PASS] "${tc.input}" => "${actual}"`);
  passed++;
}

console.log(`\nAll ${passed} test cases passed successfully!`);
