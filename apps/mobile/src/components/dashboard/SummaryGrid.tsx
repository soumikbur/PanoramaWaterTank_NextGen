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
  const hasData = tank?.levelPercent != null && tank?.hasTelemetry !== false;
  const fillPercentage = tank?.levelPercent;
  const waterHeightCm = tank?.heightCm;
  const tankHeightCm = tank?.maxHeightCm ?? 50.0;
  const waterVolumeLiters = tank?.volumeLiters;
  const capacityLiters = tank?.capacityLiters ?? 20.0;
  const temperature = tank?.temperature;
  const lastUpdated = tank?.lastUpdate
    ? new Date(tank.lastUpdate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : 'Awaiting Telemetry';

  let alarmLevel = 'Awaiting Telemetry';
  let statusColor = colors.offline;
  let statusText = colors.textMuted;
  let statusSubtitle = '(No Telemetry)';

  if (hasData && fillPercentage != null) {
    if (tank?.isStale) {
      alarmLevel = 'Stale Data';
      statusColor = colors.warning;
      statusText = colors.warning;
      statusSubtitle = '(No Recent Updates)';
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
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: compact ? 'repeat(2, 1fr)' : 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: `${metrics.cardSpacing}px`,
        ...style,
      }}
    >
      {/* 1. Water Level */}
      <SummaryCard
        iconGlyph="drop"
        iconColor={colors.primary}
        valueColor={colors.primary}
        title="Water Level"
        value={hasData && fillPercentage != null ? `${fillPercentage.toFixed(2)}%` : 'N/A'}
        subtitle={hasData && waterHeightCm != null ? `(${waterHeightCm.toFixed(2)} cm / ${tankHeightCm.toFixed(2)} cm)` : `(-- cm / ${tankHeightCm.toFixed(2)} cm)`}
      />

      {/* 2. Tank Volume */}
      <SummaryCard
        iconGlyph="volume"
        iconColor={colors.primary}
        valueColor={colors.textPrimary}
        title="Tank Volume"
        value={hasData && waterVolumeLiters != null ? `${waterVolumeLiters.toFixed(2)} L` : 'N/A'}
        subtitle={`(of ${capacityLiters.toFixed(2)} L)`}
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
        value={temperature != null ? `${temperature.toFixed(2)} °C` : 'N/A'}
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
