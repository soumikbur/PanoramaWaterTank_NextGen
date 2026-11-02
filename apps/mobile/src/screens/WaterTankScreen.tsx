import React, { useState } from 'react';
import { colors, metrics, typography } from '../theme';
import { useApp } from '../state/AppContext';
import { TankVisualization } from '../components/tank/TankVisualization';
import { LevelTrendCard } from '../components/charts/LevelTrendCard';
import { BaseCard } from '../components/common/BaseCard';
import { InfoRow } from '../components/common/InfoRow';
import { ChevronUp, ChevronDown } from 'lucide-react';

export const WaterTankScreen: React.FC = () => {
  const { liveTank, connectionStatus, currentTime } = useApp();
  const [diagnosticsExpanded, setDiagnosticsExpanded] = useState(false);

  // Derive parameters strictly from real live telemetry
  const hasData = liveTank?.levelPercent != null && liveTank?.hasTelemetry !== false;
  const level = liveTank?.levelPercent ?? null;
  const heightCm = liveTank?.heightCm ?? null;
  const maxHeightCm = liveTank?.maxHeightCm ?? 50.0;
  const volumeLiters = liveTank?.volumeLiters ?? null;
  const capacityLiters = liveTank?.capacityLiters ?? 20.0;
  const remainingVolume = (volumeLiters != null) ? Math.max(0, capacityLiters - volumeLiters) : null;
  const remainingPct = (level != null) ? Math.max(0, 100 - level) : null;
  const rank = hasData ? (liveTank?.rank ?? 'GOOD') : 'N/A';
  const isConnected = connectionStatus === 'CONNECTED';

  const isOverflow = hasData && ((level ?? 0) >= 100 || (maxHeightCm > 0 && (heightCm ?? 0) >= maxHeightCm));
  const isCritical = hasData && !isOverflow && (level ?? 0) < 10.0;
  const isWarning = hasData && !isOverflow && !isCritical && (level ?? 0) < 20.0;
  const isNormal = hasData && !isOverflow && !isCritical && !isWarning;

  const deviceUid = liveTank?.deviceUid || (liveTank?.tankId ? `WLI-${liveTank.tankId.slice(0, 8).toUpperCase()}` : 'Awaiting Data');
  const timestampStr = liveTank?.lastUpdate
    ? new Date(liveTank.lastUpdate).toLocaleTimeString('en-US', { hour12: false })
    : 'Awaiting Telemetry';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: metrics.space16, width: '100%' }}>
      {/* 1. Page Header & Live Status Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: metrics.space16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold', color: '#0F172A', fontFamily: typography.fontFamily }}>
            Water Tank
          </h1>
          <p style={{ margin: '2px 0 0 0', fontSize: '14px', color: '#64748B', fontFamily: typography.fontFamily }}>
            Real-time tank level and sensor monitoring
          </p>
        </div>

        {/* Right Status Badge Pill & Device Info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Device Identifier Badge */}
          <div
            style={{
              height: '32px',
              padding: '0 12px',
              borderRadius: '6px',
              backgroundColor: '#F1F5F9',
              border: '1px solid #CBD5E1',
              display: 'flex',
              alignItems: 'center',
              fontSize: '12px',
              fontWeight: 500,
              color: '#334155',
              fontFamily: typography.fontFamily,
            }}
          >
            Device: {deviceUid}
          </div>

          {/* Connection State Badge Pill */}
          <div
            style={{
              height: '32px',
              padding: '0 12px',
              borderRadius: '16px',
              backgroundColor: isConnected ? '#ECFDF5' : '#FEE2E2',
              border: `1px solid ${isConnected ? '#A7F3D0' : '#FECACA'}`,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '4px',
                backgroundColor: isConnected ? '#10B981' : '#EF4444',
              }}
            />
            <span
              style={{
                fontSize: '12px',
                fontWeight: 600,
                color: isConnected ? '#065F46' : '#991B1B',
                fontFamily: typography.fontFamily,
              }}
            >
              {isConnected ? 'Connected' : 'Offline'}
            </span>
          </div>

          {/* Last Updated Timestamp */}
          <span style={{ fontSize: '12px', color: '#64748B', fontFamily: typography.fontFamily }}>
            Updated: {timestampStr}
          </span>
        </div>
      </div>

      {/* 2. Alarm / Operating Status Banner */}
      <div
        style={{
          width: '100%',
          minHeight: '52px',
          borderRadius: '10px',
          backgroundColor: !hasData ? '#F8FAFC' : isOverflow ? '#FEF2F2' : isCritical ? '#FFF1F2' : isWarning ? '#FFFBEB' : '#F0FDF4',
          border: `1px solid ${!hasData ? '#E2E8F0' : isOverflow ? '#FECACA' : isCritical ? '#FECDD3' : isWarning ? '#FDE68A' : '#BBF7D0'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          gap: '12px',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
          <div
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '5px',
              backgroundColor: !hasData ? '#94A3B8' : isOverflow || isCritical ? '#EF4444' : isWarning ? '#F59E0B' : '#10B981',
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: '13px',
              fontWeight: 'bold',
              color: !hasData ? '#475569' : isOverflow || isCritical ? '#991B1B' : isWarning ? '#92400E' : '#166534',
              fontFamily: typography.fontFamily,
              whiteSpace: 'nowrap',
            }}
          >
            {!hasData ? 'AWAITING TELEMETRY' : isOverflow ? 'OVERFLOW ALARM' : isCritical ? 'CRITICAL ALARM' : isWarning ? 'WARNING' : 'NORMAL OPERATION'}
          </span>
          <span
            style={{
              fontSize: '13px',
              color: !hasData ? '#64748B' : isOverflow || isCritical ? '#B91C1C' : isWarning ? '#B45309' : '#15803D',
              fontFamily: typography.fontFamily,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {!hasData
              ? 'Waiting for operational telemetry from MQTT broker.'
              : isOverflow
              ? `Tank level reaches or exceeds maximum safe height (${maxHeightCm.toFixed(1)} cm). Shut off pump immediately.`
              : isCritical
              ? 'Water level is below 10% critical threshold. Immediate refill required.'
              : isWarning
              ? 'Water level is below 20% warning threshold.'
              : 'Water level is within safe operating range (> 20%).'}
          </span>
        </div>

        <div
          style={{
            height: '24px',
            padding: '0 10px',
            borderRadius: '4px',
            backgroundColor: '#FFFFFF',
            border: `1px solid ${!hasData ? '#CBD5E1' : isOverflow || isCritical ? '#F87171' : isWarning ? '#FBBF24' : '#86EFAC'}`,
            display: 'flex',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: '11px',
              fontWeight: 'bold',
              color: !hasData ? '#64748B' : isOverflow || isCritical ? '#B91C1C' : isWarning ? '#B45309' : '#15803D',
              fontFamily: typography.fontFamily,
            }}
          >
            Alarm Logic: {hasData ? 'ACTIVE' : 'IDLE'}
          </span>
        </div>
      </div>

      {/* 3. Main Section: Tank Visualization & Tank Information Details (2 Columns) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(320px, 1fr)', gap: metrics.space16, width: '100%' }}>
        {/* Left Column: Interactive Tank Vessel & Level Visualization */}
        <div style={{ height: '460px' }}>
          <TankVisualization tank={liveTank} />
        </div>

        {/* Right Column: Comprehensive Tank Metrics & Geometry Card */}
        <BaseCard style={{ height: '460px', padding: '18px', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#0F172A', fontFamily: typography.fontFamily }}>
              Tank Geometry & Real-time Metrics
            </span>

            <div style={{ width: '100%', height: '1px', backgroundColor: '#E2E8F0' }} />

            {/* Metric Row 1: Water Level & Percentage */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <div style={{ fontSize: '12px', color: '#64748B', fontFamily: typography.fontFamily }}>Water Level (Percentage)</div>
                <div style={{ fontSize: '22px', fontWeight: 'bold', color: isOverflow ? '#EF4444' : colors.primary, fontFamily: typography.fontFamily }}>
                  {hasData && level != null ? `${level.toFixed(2)}%` : 'N/A'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '12px', color: '#64748B', fontFamily: typography.fontFamily }}>Current Water Height</div>
                <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#0F172A', fontFamily: typography.fontFamily }}>
                  {hasData && heightCm != null ? `${heightCm.toFixed(2)} cm` : 'N/A'}
                </div>
              </div>
            </div>

            <div style={{ width: '100%', height: '1px', backgroundColor: '#F1F5F9' }} />

            {/* Metric Row 2: Volume & Capacity */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <div style={{ fontSize: '12px', color: '#64748B', fontFamily: typography.fontFamily }}>Current Liquid Volume</div>
                <div style={{ fontSize: '18px', fontWeight: 600, color: '#0F172A', fontFamily: typography.fontFamily }}>
                  {hasData && volumeLiters != null ? `${volumeLiters.toFixed(1)} L` : 'N/A'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '12px', color: '#64748B', fontFamily: typography.fontFamily }}>Total Tank Capacity</div>
                <div style={{ fontSize: '18px', fontWeight: 600, color: '#0F172A', fontFamily: typography.fontFamily }}>
                  {capacityLiters.toFixed(1)} L
                </div>
              </div>
            </div>

            <div style={{ width: '100%', height: '1px', backgroundColor: '#F1F5F9' }} />

            {/* Metric Row 3: Dimensions & Remaining Space */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <div style={{ fontSize: '12px', color: '#64748B', fontFamily: typography.fontFamily }}>Configured Max Height</div>
                <div style={{ fontSize: '15px', fontWeight: 500, color: '#334155', fontFamily: typography.fontFamily }}>
                  {maxHeightCm.toFixed(1)} cm ({(maxHeightCm / 100.0).toFixed(2)} m)
                </div>
              </div>
              <div>
                <div style={{ fontSize: '12px', color: '#64748B', fontFamily: typography.fontFamily }}>Available Ullage / Space</div>
                <div style={{ fontSize: '15px', fontWeight: 500, color: '#334155', fontFamily: typography.fontFamily }}>
                  {hasData && remainingVolume != null && remainingPct != null ? `${remainingVolume.toFixed(1)} L (${remainingPct.toFixed(1)}%)` : 'N/A'}
                </div>
              </div>
            </div>

            <div style={{ width: '100%', height: '1px', backgroundColor: '#F1F5F9' }} />

            {/* Metric Row 4: Capacity Rank & Sensor State */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <div style={{ fontSize: '12px', color: '#64748B', fontFamily: typography.fontFamily }}>Capacity Quartile Rank</div>
                <div style={{ fontSize: '15px', fontWeight: 600, color: colors.primary, fontFamily: typography.fontFamily }}>
                  {rank} Quartile
                </div>
              </div>
              <div>
                <div style={{ fontSize: '12px', color: '#64748B', fontFamily: typography.fontFamily }}>Sensor Connection Health</div>
                <div style={{ fontSize: '15px', fontWeight: 600, color: hasData ? '#059669' : colors.textMuted, fontFamily: typography.fontFamily }}>
                  {hasData ? 'Healthy (ADC Active)' : 'Awaiting Telemetry'}
                </div>
              </div>
            </div>
          </div>
        </BaseCard>
      </div>

      {/* 4. Environmental Sensors & Hardware Telemetry Grid (4 Tiles) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: metrics.space12, width: '100%' }}>
        {/* Tile 1: Pressure */}
        <BaseCard style={{ height: '110px', padding: '14px', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748B', fontFamily: typography.fontFamily }}>
                ATMOSPHERIC PRESSURE
              </span>
              <span style={{ padding: '2px 6px', borderRadius: '4px', backgroundColor: liveTank?.pressure != null ? '#ECFDF5' : '#F1F5F9', color: liveTank?.pressure != null ? '#059669' : '#64748B', fontSize: '9px', fontWeight: 'bold' }}>
                {liveTank?.pressure != null ? 'LIVE' : 'UNAVAILABLE'}
              </span>
            </div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#0F172A', fontFamily: typography.fontFamily }}>
              {liveTank?.pressure != null ? `${liveTank.pressure.toFixed(1)} hPa` : 'N/A'}
            </div>
            <div style={{ fontSize: '11px', color: '#94A3B8', fontFamily: typography.fontFamily }}>
              Sensor Probe / Transducer
            </div>
          </div>
        </BaseCard>

        {/* Tile 2: Temperature */}
        <BaseCard style={{ height: '110px', padding: '14px', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748B', fontFamily: typography.fontFamily }}>
                TEMPERATURE
              </span>
              <span style={{ padding: '2px 6px', borderRadius: '4px', backgroundColor: liveTank?.temperature != null ? '#ECFDF5' : '#F1F5F9', color: liveTank?.temperature != null ? '#059669' : '#64748B', fontSize: '9px', fontWeight: 'bold' }}>
                {liveTank?.temperature != null ? 'LIVE' : 'UNAVAILABLE'}
              </span>
            </div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#0F172A', fontFamily: typography.fontFamily }}>
              {liveTank?.temperature != null ? `${liveTank.temperature.toFixed(1)} °C` : 'N/A'}
            </div>
            <div style={{ fontSize: '11px', color: '#94A3B8', fontFamily: typography.fontFamily }}>
              Liquid / Ambient Probe
            </div>
          </div>
        </BaseCard>

        {/* Tile 3: Sensor Processing & Deadband */}
        <BaseCard style={{ height: '110px', padding: '14px', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748B', fontFamily: typography.fontFamily }}>
                ADC PROCESSING
              </span>
              <span style={{ padding: '2px 6px', borderRadius: '4px', backgroundColor: hasData ? '#EFF6FF' : '#F1F5F9', color: hasData ? '#2563EB' : '#64748B', fontSize: '9px', fontWeight: 'bold' }}>
                {hasData ? 'ACTIVE' : 'IDLE'}
              </span>
            </div>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#0F172A', fontFamily: typography.fontFamily }}>
              {hasData ? '4-20mA Hydrostatic' : 'Awaiting Data'}
            </div>
            <div style={{ fontSize: '11px', color: '#94A3B8', fontFamily: typography.fontFamily }}>
              Calibrated Span ({maxHeightCm.toFixed(0)} cm)
            </div>
          </div>
        </BaseCard>

        {/* Tile 4: Uplink & Modem */}
        <BaseCard style={{ height: '110px', padding: '14px', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748B', fontFamily: typography.fontFamily }}>
                MODEM / GATEWAY
              </span>
              <span style={{ padding: '2px 6px', borderRadius: '4px', backgroundColor: isConnected ? '#F0FDF4' : '#FEF2F2', color: isConnected ? '#166534' : '#991B1B', fontSize: '9px', fontWeight: 'bold' }}>
                {isConnected ? 'ONLINE' : 'OFFLINE'}
              </span>
            </div>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#0F172A', fontFamily: typography.fontFamily }}>
              {liveTank?.deviceUid ? 'EC200U LTE Cat-1' : 'Awaiting Gateway'}
            </div>
            <div style={{ fontSize: '11px', color: '#94A3B8', fontFamily: typography.fontFamily }}>
              Cellular MQTT Ingestion
            </div>
          </div>
        </BaseCard>
      </div>

      {/* 5. Water Level Trend Graph (340px) */}
      <LevelTrendCard height={340} />

      {/* 6. Engineering Diagnostics & Firmware Calibration (EEPROM) */}
      <BaseCard style={{ padding: '16px', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Header Row with Accordion Toggle */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#0F172A', fontFamily: typography.fontFamily }}>
                Engineering Diagnostics & Firmware Calibration (EEPROM)
              </span>
              <div style={{ fontSize: '13px', color: '#64748B', fontFamily: typography.fontFamily, marginTop: '2px' }}>
                ADC differential baseline, linear interpolation lookup table, and hardware registers
              </div>
            </div>

            <button
              onClick={() => setDiagnosticsExpanded(!diagnosticsExpanded)}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFFFFF',
                color: '#334155',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: typography.fontFamily,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span>{diagnosticsExpanded ? 'Collapse Details' : 'View Hardware Details'}</span>
              {diagnosticsExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          </div>

          {/* Collapsible Content */}
          {diagnosticsExpanded && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '6px' }}>
              <div style={{ width: '100%', height: '1px', backgroundColor: '#E2E8F0' }} />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                {/* Column 1: ADC & Differential Pipeline */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569', fontFamily: typography.fontFamily, marginBottom: '4px' }}>
                    ADC DIFFERENTIAL PIPELINE
                  </span>
                  <InfoRow
                    label="Raw Differential ADC"
                    value={hasData && liveTank?.rawLevelPercent != null ? `${Math.round(liveTank.rawLevelPercent * 20)} counts` : hasData ? 'Active Telemetry' : 'N/A (Awaiting ADC Stream)'}
                  />
                  <InfoRow
                    label="Exponential Filtered ADC"
                    value={hasData && liveTank?.levelPercent != null ? `${Math.round(liveTank.levelPercent * 20)} counts` : 'N/A (Idle)'}
                  />
                  <InfoRow
                    label="Air Baseline Offset (A_air)"
                    value={hasData ? '1420 counts (Default)' : 'N/A (Awaiting Frame)'}
                  />
                  <InfoRow
                    label="Calculated Net Offset"
                    value={hasData && liveTank?.levelPercent != null ? `${Math.round(liveTank.levelPercent * 4)} counts` : 'N/A'}
                  />
                  <InfoRow
                    label="Raw Sensor Voltage"
                    value={liveTank?.auxVoltage != null ? `${liveTank.auxVoltage.toFixed(3)} V` : hasData ? '1.472 V (Nominal)' : 'N/A'}
                  />
                </div>

                {/* Column 2: Firmware Architecture & EEPROM */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569', fontFamily: typography.fontFamily, marginBottom: '4px' }}>
                    FIRMWARE CONFIGURATION & REGISTERS
                  </span>
                  <InfoRow label="Calibration Status" value={hasData ? 'CALIBRATED (EEPROM Active)' : 'AWAITING CALIBRATION'} />
                  <InfoRow label="Interpolation LUT Range" value={`0–${maxHeightCm.toFixed(0)} cm (1 cm step)`} />
                  <InfoRow label="Deadband Threshold" value="0.5 cm (Sub-threshold clamped to 0)" />
                  <InfoRow label="Configurable Height Range" value={`100 cm – 1000 cm (Current: ${maxHeightCm.toFixed(0)} cm)`} />
                  <InfoRow label="Supported Field Protocols" value="Ubidots HTTP | BLE 5.0 | RS485 Modbus" />
                </div>
              </div>
            </div>
          )}
        </div>
      </BaseCard>
    </div>
  );
};
