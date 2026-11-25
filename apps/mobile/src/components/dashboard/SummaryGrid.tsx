import React from 'react';
import { colors, metrics } from '../../theme';
import { TankLiveStatus } from '../../types';
import { SummaryCard } from './SummaryCard';

interface SummaryGridProps {
  tank: TankLiveStatus | null;
  compact?: boolean;
  style?: React.CSSProperties;
}

export const SummaryGrid: React.FC<SummaryGridProps> = ({ tank, compact = false, style }) => {
  const isTelemetryAvailable = Boolean(tank && tank.hasTelemetry !== false && tank.levelPercent != null);
  const isStale = Boolean(tank && (tank.isStale || tank.alarmStatus === 'STALE_DATA'));
  const isZero = isTelemetryAvailable && (tank!.levelPercent === 0 || (tank!.heightCm !== null && tank!.heightCm === 0));

  const tankHeightCm = tank?.maxHeightCm && tank.maxHeightCm > 0 ? tank.maxHeightCm : 50.0;

  // Level & Water Geometry
  let fillPercentage = 0.0;
  let waterHeightCm: number | null = null;

  if (isTelemetryAvailable) {
    if (isZero) {
      fillPercentage = 0.0;
      waterHeightCm = 0.0;
    } else {
      if (tank?.heightCm != null && tankHeightCm > 0) {
        waterHeightCm = tank.heightCm;
        fillPercentage = Math.max(0, Math.min(100, (waterHeightCm / tankHeightCm) * 100));
      } else {
        fillPercentage = Math.max(0, Math.min(100, tank!.levelPercent!));
        waterHeightCm = (fillPercentage / 100.0) * tankHeightCm;
      }
    }
  }

  const temperature = tank?.temperature;
  const lastUpdated = tank?.lastUpdate
    ? new Date(tank.lastUpdate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : 'Awaiting Telemetry';

  let alarmLevel = 'Awaiting Telemetry';
  let statusColor = colors.offline;
  let statusText = colors.textMuted;
  let statusSubtitle = '(No Telemetry)';

  if (!isTelemetryAvailable) {
    alarmLevel = 'Awaiting Telemetry';
    statusColor = colors.offline;
    statusText = colors.textMuted;
    statusSubtitle = '(No Telemetry)';
  } else if (isStale) {
    alarmLevel = 'Stale Data';
    statusColor = colors.warning;
    statusText = colors.warning;
    statusSubtitle = '(Offline / Standby)';
  } else if (isZero) {
    alarmLevel = 'Critical Low';
    statusColor = colors.critical;
    statusText = colors.critical;
    statusSubtitle = '(Empty Tank)';
  } else if (fillPercentage >= 100.0) {
    alarmLevel = 'Overflow';
    statusColor = colors.critical;
    statusText = colors.critical;
    statusSubtitle = '(Over 100%)';
  } else if (fillPercentage < 10.0) {
    alarmLevel = 'Critical';
    statusColor = colors.critical;
    statusText = colors.critical;
    statusSubtitle = '(Below 10%)';
  } else if (fillPercentage < 20.0) {
    alarmLevel = 'Warning';
    statusColor = colors.warning;
    statusText = colors.warning;
    statusSubtitle = '(Below 20%)';
  } else {
    alarmLevel = 'Normal';
    statusColor = colors.success;
    statusText = colors.successText;
    statusSubtitle = '(Normal Range)';
  }

  // Values
  const levelValue = !isTelemetryAvailable
    ? 'Awaiting Telemetry'
    : isStale
    ? `${fillPercentage.toFixed(2)}% (Stale)`
    : `${fillPercentage.toFixed(2)}%`;

  const levelSubtitle = !isTelemetryAvailable
    ? `(-- cm / ${tankHeightCm.toFixed(2)} cm)`
    : `(${waterHeightCm!.toFixed(2)} cm / ${tankHeightCm.toFixed(2)} cm)`;

  const heightValue = !isTelemetryAvailable
    ? 'Awaiting Data'
    : isStale
    ? `${waterHeightCm!.toFixed(2)} cm (Stale)`
    : `${waterHeightCm!.toFixed(2)} cm`;

  const heightSubtitle = `(of ${tankHeightCm.toFixed(2)} cm max)`;

  const tempValue = temperature != null ? `${temperature.toFixed(2)} °C` : 'Awaiting Data';

  return (
    <div
      className="dashboard-summary-grid"
      style={{
        gap: `${metrics.cardSpacing}px`,
        ...(compact ? { gridTemplateColumns: 'repeat(2, 1fr)' } : {}),
        ...style,
      }}
    >
      {/* 1. Water Level */}
      <SummaryCard
        iconGlyph="drop"
        iconColor={isZero || alarmLevel === 'Critical' || alarmLevel === 'Overflow' ? colors.critical : isStale ? colors.warning : colors.primary}
        valueColor={isZero || alarmLevel === 'Critical' || alarmLevel === 'Overflow' ? colors.critical : isStale ? colors.warning : colors.primary}
        title="Water Level"
        value={levelValue}
        subtitle={levelSubtitle}
      />

      {/* 2. Measured Water Height */}
      <SummaryCard
        iconGlyph="volume"
        iconColor={colors.primary}
        valueColor={colors.textPrimary}
        title="Water Height"
        value={heightValue}
        subtitle={heightSubtitle}
      />

      {/* 3. Status */}
      <SummaryCard
        iconGlyph="status"
        iconColor={statusColor}
        valueColor={statusText}
        title="Status"
        value={alarmLevel}
        subtitle={statusSubtitle}
      />

      {/* 4. Temperature */}
      <SummaryCard
        iconGlyph="thermometer"
        iconColor={colors.warning}
        valueColor={colors.textPrimary}
        title="Temperature"
        value={tempValue}
      />

      {/* 5. Last Updated */}
      <SummaryCard
        iconGlyph="clock"
        iconColor={colors.primary}
        valueColor={colors.textPrimary}
        title="Last Updated"
        value={lastUpdated}
      />
    </div>
  );
};
