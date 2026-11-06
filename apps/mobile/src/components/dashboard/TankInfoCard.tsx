import React from 'react';
import { colors, metrics, typography } from '../../theme';
import { BaseCard } from '../common/BaseCard';
import { InfoRow } from '../common/InfoRow';
import { TankLiveStatus } from '../../types';

interface TankInfoCardProps {
  tank: TankLiveStatus | null;
  mqttStatus?: string;
  connectionState?: string;
  style?: React.CSSProperties;
}

export const TankInfoCard: React.FC<TankInfoCardProps> = ({
  tank,
  mqttStatus,
  connectionState,
  style,
}) => {
  const isTelemetryAvailable = Boolean(tank && tank.hasTelemetry !== false && tank.levelPercent != null);
  const isStale = Boolean(tank && (tank.isStale || tank.alarmStatus === 'STALE_DATA'));
  const isZero = isTelemetryAvailable && (tank!.levelPercent === 0 || (tank!.heightCm !== null && tank!.heightCm === 0));

  const tankName = tank?.tankName || 'Primary Storage Tank';
  const device = tank?.deviceUid || tank?.deviceId || 'DEV-WLI-01';
  const trainCoach = tank?.trainNumber
    ? `${tank.trainNumber}${tank.coachNumber ? ` / ${tank.coachNumber}` : ''}`
    : '12002 / C1';

  const voltage = isTelemetryAvailable && tank?.batteryVoltage != null
    ? `${tank.batteryVoltage.toFixed(2)} V`
    : 'Awaiting Telemetry';

  const gpsLocation = isTelemetryAvailable && tank?.latitude != null && tank?.longitude != null
    ? `${tank.latitude.toFixed(4)}°, ${tank.longitude.toFixed(4)}°`
    : 'Awaiting Fix';

  const temperature = isTelemetryAvailable && tank?.temperature != null
    ? `${tank.temperature.toFixed(2)} °C`
    : 'Awaiting Data';

  const lastUpdated = tank?.lastUpdate
    ? new Date(tank.lastUpdate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : 'Awaiting Telemetry';

  const sensorStatus = !isTelemetryAvailable
    ? 'Awaiting Data'
    : isStale
    ? 'Stale Data'
    : isZero
    ? 'Healthy (0.00 cm)'
    : tank?.alarmStatus === 'SENSOR_FAULT'
    ? 'Sensor Fault'
    : 'Healthy';

  const tankHeight = `${(tank?.maxHeightCm ?? 50.0).toFixed(2)} cm`;
  const capacity = `${(tank?.capacityLiters ?? 20.0).toFixed(2)} L`;

  const realMqttStatus = mqttStatus || (!isTelemetryAvailable
    ? 'Awaiting Telemetry'
    : isStale
    ? 'Stale Stream'
    : 'Active Stream');

  const realConnState = connectionState || (!isTelemetryAvailable
    ? 'Awaiting Telemetry'
    : isStale
    ? 'Offline'
    : tank?.isOnline
    ? 'Online'
    : 'Offline');

  const Divider = () => (
    <div style={{ height: '1px', backgroundColor: colors.divider, width: '100%', margin: '0' }} />
  );

  return (
    <BaseCard padding={metrics.cardPadding} style={{ minHeight: `${metrics.tankCardMinHeight}px`, ...style }}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: `${metrics.infoRowSpacing}px` }}>
        <span
          style={{
            fontFamily: typography.fontFamily,
            fontSize: typography.dashCardTitle.fontSize,
            fontWeight: typography.dashCardTitle.fontWeight,
            color: colors.textPrimary,
            marginBottom: '10px',
          }}
        >
          Tank Information
        </span>

        <InfoRow label="Tank Name" value={tankName} />
        <Divider />

        <InfoRow label="Device" value={device} />
        <Divider />

        <InfoRow label="Train / Coach" value={trainCoach} />
        <Divider />

        <InfoRow label="Battery / Voltage" value={voltage} />
        <Divider />

        <InfoRow label="GPS Location" value={gpsLocation} />
        <Divider />

        <InfoRow
          label="MQTT Status"
          value={realMqttStatus}
          valueColor={realMqttStatus.includes('Active') || realMqttStatus.includes('Receiving') ? colors.success : '#D97706'}
        />
        <Divider />

        <InfoRow label="Temperature" value={temperature} />
        <Divider />

        <InfoRow
          label="Connection"
          value={realConnState}
          valueColor={realConnState === 'Online' ? colors.success : realConnState.includes('Awaiting') ? '#D97706' : colors.offline}
        />
        <Divider />

        <InfoRow label="Last Updated" value={lastUpdated} />
        <Divider />

        <InfoRow
          label="Sensor Status"
          value={sensorStatus}
          valueColor={sensorStatus.includes('Healthy') ? colors.success : sensorStatus === 'Awaiting Data' ? '#D97706' : colors.critical}
        />
        <Divider />

        <InfoRow label="Tank Height" value={tankHeight} />
        <Divider />

        <InfoRow label="Tank Capacity" value={capacity} />
      </div>
    </BaseCard>
  );
};
