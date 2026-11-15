export type StandardSensorHealth = 'Healthy' | 'Warning' | 'Fault' | 'Offline' | 'Awaiting Telemetry';

/**
 * Normalizes any internal, hardware-specific, or legacy sensor status string
 * into a clean, human-readable, generic health status.
 *
 * Strips hardware model names (ADS1115, ADC, BME280, etc.) and guarantees
 * one of: 'Healthy' | 'Warning' | 'Fault' | 'Offline' | 'Awaiting Telemetry'.
 *
 * Examples:
 * - 'Healthy (ADS1115 Active)'   => 'Healthy'
 * - 'Healthy (ADC Active)'       => 'Healthy'
 * - 'Healthy (Sensor Connected)' => 'Healthy'
 * - 'Warning (ADS1115)'          => 'Warning'
 * - 'Fault (ADS1115)'            => 'Fault'
 * - 'Fault (Sensor XYZ)'         => 'Fault'
 * - 'Offline (Sensor XYZ)'       => 'Offline'
 * - 'Awaiting Telemetry'         => 'Awaiting Telemetry'
 */
export function formatSensorHealth(status?: string | null): StandardSensorHealth {
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

/**
 * Returns standard semantic color code for sensor health status.
 */
export function getSensorHealthColor(health: StandardSensorHealth | string): string {
  const normalized = formatSensorHealth(health);
  switch (normalized) {
    case 'Healthy':
      return '#059669'; // Emerald-600
    case 'Warning':
      return '#D97706'; // Amber-600
    case 'Fault':
      return '#DC2626'; // Red-600
    case 'Offline':
    case 'Awaiting Telemetry':
    default:
      return '#64748B'; // Slate-500
  }
}
