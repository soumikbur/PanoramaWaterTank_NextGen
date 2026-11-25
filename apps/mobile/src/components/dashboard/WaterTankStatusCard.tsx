import React from 'react';
import {
  Droplet,
  Train,
  CheckCircle2,
  AlertTriangle,
  Clock,
  AlertCircle,
  Gauge,
} from 'lucide-react';
import { ConsistTankItem, computeLevelPercentFromHeight } from '../../services/tankStatusService';

export interface WaterTankStatusCardProps {
  coachNumber: string;
  coachType?: string;
  deviceId?: string;
  deviceStatus?: 'Online' | 'Offline';
  batteryPercent?: number | null;
  hasTelemetry?: boolean;
  isOnline?: boolean;
  lastSeenTimeStr?: string | null;
  lastSeenTimestamp?: number | null;
  tank1Obj?: ConsistTankItem | null;
  tank2Obj?: ConsistTankItem | null;
  arrivalLevel?: number | null;
  arrivalHeightCm?: number | null;
  departureLevel?: number | null;
  departureHeightCm?: number | null;
}

export type TankTelemetryState = 'ACTIVE' | 'STALE' | 'AWAITING' | 'OFFLINE';

export const WaterTankStatusCard: React.FC<WaterTankStatusCardProps> = ({
  coachNumber,
  deviceId,
  deviceStatus = 'Offline',
  hasTelemetry = false,
  isOnline = false,
  lastSeenTimeStr,
  lastSeenTimestamp,
  tank1Obj,
  tank2Obj,
  arrivalLevel,
  arrivalHeightCm,
  departureLevel,
  departureHeightCm,
}) => {
  // 1. Resolve Tank 1 (Arrival Side) Parameters
  const t1MaxHeight = tank1Obj?.maxHeightCm && tank1Obj.maxHeightCm > 0 ? tank1Obj.maxHeightCm : 50;
  const t1Height = tank1Obj?.heightCm != null ? tank1Obj.heightCm : arrivalHeightCm;
  const t1Level =
    computeLevelPercentFromHeight(t1Height, t1MaxHeight) ??
    (tank1Obj?.levelPercent != null ? tank1Obj.levelPercent : arrivalLevel);

  // 2. Resolve Tank 2 (Departure Side) Parameters
  const t2MaxHeight = tank2Obj?.maxHeightCm && tank2Obj.maxHeightCm > 0 ? tank2Obj.maxHeightCm : 50;
  const t2Height = tank2Obj?.heightCm != null ? tank2Obj.heightCm : departureHeightCm;
  const t2Level =
    computeLevelPercentFromHeight(t2Height, t2MaxHeight) ??
    (tank2Obj?.levelPercent != null ? tank2Obj.levelPercent : departureLevel);

  // 3. Telemetry State Resolution (Active, Stale, Awaiting, Offline)
  const resolveTankTelemetryState = (
    tank: ConsistTankItem | null | undefined,
    level: number | null | undefined
  ): { state: TankTelemetryState; timestamp: string } => {
    const isDeviceOffline = deviceStatus === 'Offline' || (tank && !tank.isOnline && tank.offlineReason === 'DEVICE_DISCONNECTED');
    const isStale = Boolean(tank?.isStale || (tank && tank.isOnline === false && tank.offlineReason === 'TIMED_OUT'));
    const hasReading = level != null && hasTelemetry;
    const timeStr = tank?.lastSeenTimeStr || lastSeenTimeStr || (lastSeenTimestamp ? new Date(lastSeenTimestamp).toLocaleTimeString() : null);

    if (isDeviceOffline && !hasReading) {
      return { state: 'OFFLINE', timestamp: timeStr || 'Device Offline' };
    }
    if (isStale && hasReading) {
      return { state: 'STALE', timestamp: timeStr || 'Stale' };
    }
    if (hasReading && isOnline) {
      return { state: 'ACTIVE', timestamp: timeStr || 'Just now' };
    }
    if (hasReading) {
      return { state: 'STALE', timestamp: timeStr || 'Stored' };
    }
    if (isDeviceOffline) {
      return { state: 'OFFLINE', timestamp: 'Device Offline' };
    }
    return { state: 'AWAITING', timestamp: 'Awaiting data' };
  };

  const t1Telemetry = resolveTankTelemetryState(tank1Obj, t1Level);
  const t2Telemetry = resolveTankTelemetryState(tank2Obj, t2Level);

  // 4. Total Water Summary Calculations (Height-driven)
  const t1HasValidData = (t1Telemetry.state === 'ACTIVE' || t1Telemetry.state === 'STALE') && (t1Level != null || t1Height != null);
  const t2HasValidData = (t2Telemetry.state === 'ACTIVE' || t2Telemetry.state === 'STALE') && (t2Level != null || t2Height != null);

  let overallFill: number | null = null;
  let overallFillType: 'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE' = 'UNAVAILABLE';
  let partialLabel = '';

  const t1EffHeight = t1Height != null ? t1Height : (t1Level != null ? (t1Level / 100) * t1MaxHeight : null);
  const t2EffHeight = t2Height != null ? t2Height : (t2Level != null ? (t2Level / 100) * t2MaxHeight : null);

  if (t1HasValidData && t2HasValidData && t1EffHeight != null && t2EffHeight != null && t1MaxHeight + t2MaxHeight > 0) {
    overallFill = computeLevelPercentFromHeight(t1EffHeight + t2EffHeight, t1MaxHeight + t2MaxHeight);
    overallFillType = 'COMPLETE';
  } else if (t1HasValidData && t1Level != null) {
    overallFill = Number(Math.min(100, Math.max(0, t1Level)).toFixed(1));
    overallFillType = 'PARTIAL';
    partialLabel = 'Tank 1 only';
  } else if (t2HasValidData && t2Level != null) {
    overallFill = Number(Math.min(100, Math.max(0, t2Level)).toFixed(1));
    overallFillType = 'PARTIAL';
    partialLabel = 'Tank 2 only';
  } else {
    overallFill = null;
    overallFillType = 'UNAVAILABLE';
  }

  // 5. Render Individual Tank Visualization (SVG with Ruler, Body, Wave Meniscus, and Flanges)
  const renderTankSvg = (
    level: number | null | undefined,
    maxHeightCm: number,
    telemetryState: TankTelemetryState,
    uniqueId: string
  ) => {
    const isLive = (telemetryState === 'ACTIVE' || telemetryState === 'STALE') && level != null;
    const clampedLevel = isLive ? Math.max(0, Math.min(100, level!)) : 0;
    const totalBodyH = 120;
    const fillH = isLive ? (clampedLevel / 100) * totalBodyH : 0;
    const fillY = 16 + (totalBodyH - fillH);

    // Dynamic ruler ticks based on actual maxHeightCm
    const step = maxHeightCm / 3;
    const ticks = [
      { ratio: 1.0, y: 16, label: `${Math.round(maxHeightCm)}` },
      { ratio: 0.667, y: 16 + totalBodyH * 0.333, label: `${Math.round(step * 2)}` },
      { ratio: 0.333, y: 16 + totalBodyH * 0.667, label: `${Math.round(step)}` },
      { ratio: 0.0, y: 16 + totalBodyH, label: '0' },
    ];

    // Colors
    const isCritical = clampedLevel < 10;
    const isWarning = clampedLevel < 20;
    const gradientTop = isCritical ? '#EF4444' : isWarning ? '#F59E0B' : '#38BDF8';
    const gradientBottom = isCritical ? '#B91C1C' : isWarning ? '#D97706' : '#1D4ED8';
    const waveCrestColor = isCritical ? '#FCA5A5' : isWarning ? '#FDE68A' : '#93C5FD';

    return (
      <svg width="88" height="152" viewBox="0 0 88 152" style={{ display: 'block', flexShrink: 0 }}>
        <defs>
          <clipPath id={`tank-clip-${uniqueId}`}>
            <rect x="34" y="16" width="46" height={totalBodyH} rx="5" ry="5" />
          </clipPath>
          <linearGradient id={`tank-grad-${uniqueId}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={gradientTop} />
            <stop offset="100%" stopColor={gradientBottom} />
          </linearGradient>
        </defs>

        {/* Vertical Ruler Scale on Left */}
        <g className="scada-tank-ruler" fontSize="8.5" fill="#64748B" fontFamily="Inter, monospace" fontWeight="600" textAnchor="end">
          {ticks.map((t, idx) => (
            <g key={idx}>
              <line x1="26" y1={t.y} x2="34" y2={t.y} stroke="#94A3B8" strokeWidth="1" />
              <text className="scada-ruler-tick-num" x="23" y={t.y + 3}>{t.label}</text>
            </g>
          ))}
          {/* Intermediate Minor Ticks */}
          <line x1="29" y1={16 + totalBodyH * 0.166} x2="34" y2={16 + totalBodyH * 0.166} stroke="#CBD5E1" strokeWidth="1" />
          <line x1="29" y1={16 + totalBodyH * 0.5} x2="34" y2={16 + totalBodyH * 0.5} stroke="#CBD5E1" strokeWidth="1" />
          <line x1="29" y1={16 + totalBodyH * 0.833} x2="34" y2={16 + totalBodyH * 0.833} stroke="#CBD5E1" strokeWidth="1" />
        </g>

        {/* Top Flange / Inlet Line */}
        <line x1="57" y1="7" x2="57" y2="16" stroke="#475569" strokeWidth="2.5" />
        <rect x="50" y="4" width="14" height="4" fill="#334155" rx="1" />

        {/* Bottom Drain Flange */}
        <line x1="57" y1={16 + totalBodyH} x2="57" y2={16 + totalBodyH + 9} stroke="#475569" strokeWidth="2.5" />
        <rect x="50" y={16 + totalBodyH + 8} width="14" height="4" fill="#334155" rx="1" />

        {/* Main Tank Body Outline & Empty Interior */}
        <rect
          x="34"
          y="16"
          width="46"
          height={totalBodyH}
          rx="5"
          ry="5"
          fill="#F8FAFC"
          stroke="#475569"
          strokeWidth="2"
        />

        {/* Clipped Animated Water Column */}
        <g clipPath={`url(#tank-clip-${uniqueId})`}>
          {isLive && fillH > 0 && (
            <g>
              {/* Liquid Body */}
              <rect
                className="scada-tank-water-fill"
                x="34"
                y={fillY}
                width="46"
                height={fillH}
                fill={`url(#tank-grad-${uniqueId})`}
              />
              {/* Animated Wave Crest Meniscus */}
              <g className={telemetryState === 'ACTIVE' ? 'water-wave-meniscus' : undefined}>
                <path
                  className="scada-tank-wave-path"
                  d={`M 20 ${fillY} Q 35 ${fillY - 2.5}, 50 ${fillY} T 80 ${fillY} T 110 ${fillY} L 110 ${fillY + 6} L 20 ${fillY + 6} Z`}
                  fill={waveCrestColor}
                  opacity="0.75"
                />
                <line
                  x1="20"
                  y1={fillY}
                  x2="100"
                  y2={fillY}
                  stroke={waveCrestColor}
                  strokeWidth="1.5"
                />
              </g>
            </g>
          )}

          {/* Empty / Zero Level Indicator */}
          {isLive && fillH === 0 && (
            <line x1="36" y1={16 + totalBodyH - 2} x2="78" y2={16 + totalBodyH - 2} stroke="#DC2626" strokeWidth="2" />
          )}
        </g>
      </svg>
    );
  };

  // 6. Render Telemetry Status Pill
  const renderTelemetryStatusPanel = (
    telemetry: { state: TankTelemetryState; timestamp: string }
  ) => {
    switch (telemetry.state) {
      case 'ACTIVE':
        return (
          <div
            className="scada-telemetry-status-panel"
            style={{
              backgroundColor: '#F0FDF4',
              border: '1px solid #DCFCE7',
              color: '#15803D',
              borderRadius: '6px',
              padding: '6px 10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '11px',
              fontWeight: 600,
              marginTop: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <CheckCircle2 size={13} color="#16A34A" />
              <span>Telemetry: Active</span>
            </div>
            <span style={{ fontSize: '10px', color: '#166534', opacity: 0.9 }}>
              Last Update: {telemetry.timestamp}
            </span>
          </div>
        );
      case 'STALE':
        return (
          <div
            className="scada-telemetry-status-panel"
            style={{
              backgroundColor: '#FEF3C7',
              border: '1px solid #FDE68A',
              color: '#B45309',
              borderRadius: '6px',
              padding: '6px 10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '11px',
              fontWeight: 600,
              marginTop: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <AlertTriangle size={13} color="#D97706" />
              <span>Telemetry: Stale</span>
            </div>
            <span style={{ fontSize: '10px', color: '#92400E', opacity: 0.9 }}>
              Last received: {telemetry.timestamp}
            </span>
          </div>
        );
      case 'OFFLINE':
        return (
          <div
            className="scada-telemetry-status-panel"
            style={{
              backgroundColor: '#FEE2E2',
              border: '1px solid #FECDD3',
              color: '#B91C1C',
              borderRadius: '6px',
              padding: '6px 10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '11px',
              fontWeight: 600,
              marginTop: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <AlertCircle size={13} color="#DC2626" />
              <span>Telemetry: Offline</span>
            </div>
            <span style={{ fontSize: '10px', color: '#991B1B', opacity: 0.9 }}>
              {telemetry.timestamp}
            </span>
          </div>
        );
      case 'AWAITING':
      default:
        return (
          <div
            className="scada-telemetry-status-panel"
            style={{
              backgroundColor: '#F1F5F9',
              border: '1px solid #CBD5E1',
              color: '#475569',
              borderRadius: '6px',
              padding: '6px 10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '11px',
              fontWeight: 600,
              marginTop: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Clock size={13} color="#64748B" />
              <span>Telemetry: Awaiting Data</span>
            </div>
            <span style={{ fontSize: '10px', color: '#64748B' }}>
              Awaiting stream
            </span>
          </div>
        );
    }
  };

  return (
    <div
      className="interactive-card scada-col-tanks scada-tank-status-card"
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '12px',
        border: '1px solid #E2E8F0',
        padding: '18px 20px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        width: '100%',
      }}
    >
      <style>{`
        @keyframes subtleWaveMeniscus {
          0% { transform: translateX(0); }
          50% { transform: translateX(-16px); }
          100% { transform: translateX(0); }
        }
        .water-wave-meniscus {
          animation: subtleWaveMeniscus 3.5s ease-in-out infinite;
        }
        .tank-cards-container {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
          margin-top: 14px;
        }
        @media (max-width: 680px) {
          .tank-cards-container {
            grid-template-columns: 1fr;
          }
        }
        .summary-stats-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 6px;
          margin-top: 14px;
        }
      `}</style>

      {/* Main Section Heading: Water Tank Status (Coach SLRD) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            backgroundColor: '#EFF6FF',
            border: '1px solid #DBEAFE',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#2563EB',
            flexShrink: 0,
          }}
        >
          <Droplet size={18} fill="#3B82F6" color="#1D4ED8" />
        </div>
        <div>
          <h3
            className="scada-card-title"
            style={{
              margin: 0,
              fontSize: '16px',
              fontWeight: 800,
              color: '#0F172A',
              letterSpacing: '-0.2px',
            }}
          >
            Water Tank Status (Coach {coachNumber})
          </h3>
          <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 500 }}>
            Real-time calibrated height monitoring and ultrasonic level telemetry
          </span>
        </div>
      </div>

      {/* Tank Cards Grid: Arrival Side (Tank 1) & Departure Side (Tank 2) */}
      <div className="tank-cards-container">
        {/* ============================================================== */}
        {/* TANK 1: ARRIVAL SIDE */}
        {/* ============================================================== */}
        <div
          className="scada-tank-column"
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '10px',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)',
          }}
        >
          {/* Pill Badge Heading */}
          <div style={{ marginBottom: '12px' }}>
            <span
              className="scada-tank-subheading-pill"
              style={{
                backgroundColor: '#2563EB',
                color: '#FFFFFF',
                borderRadius: '16px',
                padding: '4px 12px',
                fontSize: '11px',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 1px 2px rgba(37, 99, 235, 0.2)',
              }}
            >
              <Train size={12} color="#FFFFFF" />
              <span>Arrival Side (Tank 1)</span>
            </span>
          </div>

          {/* Body: Tank Vessel + Reading Panel */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            {/* Left: SVG Tank Body with Ruler */}
            {renderTankSvg(t1Level, t1MaxHeight, t1Telemetry.state, 'tank1')}

            {/* Right: Reading Panel */}
            <div
              className="scada-tank-readout-card"
              style={{
                flex: 1,
                backgroundColor: '#F0F7FF',
                border: '1px solid #DBEAFE',
                borderRadius: '8px',
                padding: '10px 10px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                minWidth: 0,
              }}
            >
              {/* Fill Percentage & Badge */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '4px' }}>
                <span
                  style={{
                    fontSize: '20px',
                    fontWeight: 900,
                    color: t1Level != null ? (t1Level < 10 ? '#DC2626' : t1Level < 20 ? '#D97706' : '#0F172A') : '#64748B',
                    lineHeight: 1.1,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {t1Level != null ? `${t1Level.toFixed(0)}%` : '—'}
                </span>
                <span
                  style={{
                    backgroundColor:
                      t1Level == null
                        ? '#F1F5F9'
                        : t1Level < 10
                        ? '#FEE2E2'
                        : t1Level < 20
                        ? '#FEF3C7'
                        : '#DCFCE7',
                    color:
                      t1Level == null
                        ? '#64748B'
                        : t1Level < 10
                        ? '#DC2626'
                        : t1Level < 20
                        ? '#B45309'
                        : '#16A34A',
                    border: `1px solid ${
                      t1Level == null
                        ? '#CBD5E1'
                        : t1Level < 10
                        ? '#FECDD3'
                        : t1Level < 20
                        ? '#FDE68A'
                        : '#86EFAC'
                    }`,
                    borderRadius: '4px',
                    padding: '2px 7px',
                    fontSize: '10px',
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {t1Level == null
                    ? 'Awaiting'
                    : t1Level < 10
                    ? 'Critical'
                    : t1Level < 20
                    ? 'Warning'
                    : 'Valid'}
                </span>
              </div>

              {/* Measured Water Height */}
              <div>
                <span style={{ fontSize: '10px', fontWeight: 700, color: '#64748B', letterSpacing: '0.4px', textTransform: 'uppercase', display: 'block' }}>
                  Water Height
                </span>
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>
                  {t1Height != null ? `${t1Height.toFixed(1)} cm` : '— cm'}
                </span>
              </div>

              {/* Configured Tank Height */}
              <div>
                <span style={{ fontSize: '10px', fontWeight: 700, color: '#64748B', letterSpacing: '0.4px', textTransform: 'uppercase', display: 'block' }}>
                  Tank Height
                </span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>
                  {t1MaxHeight.toFixed(0)} cm max
                </span>
              </div>
            </div>
          </div>

          {/* Telemetry Status Panel */}
          {renderTelemetryStatusPanel(t1Telemetry)}
        </div>

        {/* ============================================================== */}
        {/* TANK 2: DEPARTURE SIDE */}
        {/* ============================================================== */}
        <div
          className="scada-tank-column"
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '10px',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)',
          }}
        >
          {/* Pill Badge Heading */}
          <div style={{ marginBottom: '12px' }}>
            <span
              className="scada-tank-subheading-pill"
              style={{
                backgroundColor: '#2563EB',
                color: '#FFFFFF',
                borderRadius: '16px',
                padding: '4px 12px',
                fontSize: '11px',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 1px 2px rgba(37, 99, 235, 0.2)',
              }}
            >
              <Train size={12} color="#FFFFFF" />
              <span>Departure Side (Tank 2)</span>
            </span>
          </div>

          {/* Body: Tank Vessel + Reading Panel */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            {/* Left: SVG Tank Body with Ruler */}
            {renderTankSvg(t2Level, t2MaxHeight, t2Telemetry.state, 'tank2')}

            {/* Right: Reading Panel */}
            <div
              className="scada-tank-readout-card"
              style={{
                flex: 1,
                backgroundColor: '#F0F7FF',
                border: '1px solid #DBEAFE',
                borderRadius: '8px',
                padding: '10px 10px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                minWidth: 0,
              }}
            >
              {/* Fill Percentage & Badge */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '4px' }}>
                <span
                  style={{
                    fontSize: '20px',
                    fontWeight: 900,
                    color: t2Level != null ? (t2Level < 10 ? '#DC2626' : t2Level < 20 ? '#D97706' : '#0F172A') : '#64748B',
                    lineHeight: 1.1,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {t2Level != null ? `${t2Level.toFixed(0)}%` : '—'}
                </span>
                <span
                  style={{
                    backgroundColor:
                      t2Level == null
                        ? '#F1F5F9'
                        : t2Level < 10
                        ? '#FEE2E2'
                        : t2Level < 20
                        ? '#FEF3C7'
                        : '#DCFCE7',
                    color:
                      t2Level == null
                        ? '#64748B'
                        : t2Level < 10
                        ? '#DC2626'
                        : t2Level < 20
                        ? '#B45309'
                        : '#16A34A',
                    border: `1px solid ${
                      t2Level == null
                        ? '#CBD5E1'
                        : t2Level < 10
                        ? '#FECDD3'
                        : t2Level < 20
                        ? '#FDE68A'
                        : '#86EFAC'
                    }`,
                    borderRadius: '4px',
                    padding: '2px 7px',
                    fontSize: '10px',
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {t2Level == null
                    ? 'Awaiting'
                    : t2Level < 10
                    ? 'Critical'
                    : t2Level < 20
                    ? 'Warning'
                    : 'Valid'}
                </span>
              </div>

              {/* Measured Water Height */}
              <div>
                <span style={{ fontSize: '10px', fontWeight: 700, color: '#64748B', letterSpacing: '0.4px', textTransform: 'uppercase', display: 'block' }}>
                  Water Height
                </span>
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>
                  {t2Height != null ? `${t2Height.toFixed(1)} cm` : '— cm'}
                </span>
              </div>

              {/* Configured Tank Height */}
              <div>
                <span style={{ fontSize: '10px', fontWeight: 700, color: '#64748B', letterSpacing: '0.4px', textTransform: 'uppercase', display: 'block' }}>
                  Tank Height
                </span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>
                  {t2MaxHeight.toFixed(0)} cm max
                </span>
              </div>
            </div>
          </div>

          {/* Telemetry Status Panel */}
          {renderTelemetryStatusPanel(t2Telemetry)}
        </div>
      </div>

      {/* ============================================================== */}
      {/* TOTAL WATER SUMMARY PANEL (3 Sections — Height Focused)        */}
      {/* ============================================================== */}
      <div
        className="summary-stats-grid scada-total-water-summary-panel"
        style={{
          backgroundColor: '#F8FAFC',
          border: '1px solid #E2E8F0',
          borderRadius: '10px',
          padding: '10px 14px',
        }}
      >
        {/* Section 1: Arrival Tank Height */}
        <div className="scada-total-summary-col" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              backgroundColor: '#EFF6FF',
              border: '1px solid #DBEAFE',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#2563EB',
              flexShrink: 0,
            }}
          >
            <Droplet size={14} />
          </div>
          <div style={{ minWidth: 0 }}>
            <span style={{ fontSize: '10px', fontWeight: 600, color: '#64748B', display: 'block', whiteSpace: 'nowrap' }}>
              Arrival Height
            </span>
            <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', whiteSpace: 'nowrap' }}>
              {t1Height != null ? `${t1Height.toFixed(1)}` : '—'} / {t1MaxHeight.toFixed(0)} cm
            </span>
          </div>
        </div>

        {/* Section 2: Departure Tank Height */}
        <div
          className="scada-total-summary-col"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            borderLeft: '1px solid #E2E8F0',
            paddingLeft: '8px',
          }}
        >
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              backgroundColor: '#EFF6FF',
              border: '1px solid #DBEAFE',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#2563EB',
              flexShrink: 0,
            }}
          >
            <CheckCircle2 size={14} />
          </div>
          <div style={{ minWidth: 0 }}>
            <span style={{ fontSize: '10px', fontWeight: 600, color: '#64748B', display: 'block', whiteSpace: 'nowrap' }}>
              Departure Height
            </span>
            <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', whiteSpace: 'nowrap' }}>
              {t2Height != null ? `${t2Height.toFixed(1)}` : '—'} / {t2MaxHeight.toFixed(0)} cm
            </span>
          </div>
        </div>

        {/* Section 3: Overall Fill */}
        <div
          className="scada-total-summary-col"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            borderLeft: '1px solid #E2E8F0',
            paddingLeft: '8px',
          }}
        >
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              backgroundColor: '#EFF6FF',
              border: '1px solid #DBEAFE',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#2563EB',
              flexShrink: 0,
            }}
          >
            <Gauge size={14} />
          </div>
          <div style={{ minWidth: 0 }}>
            <span style={{ fontSize: '10px', fontWeight: 600, color: '#64748B', display: 'block', whiteSpace: 'nowrap' }}>
              Overall Fill
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', whiteSpace: 'nowrap' }}>
                {overallFill != null ? `${overallFill.toFixed(0)}%` : '—'}
              </span>
              {overallFillType === 'COMPLETE' && (
                <span
                  style={{
                    backgroundColor: '#DCFCE7',
                    color: '#16A34A',
                    border: '1px solid #86EFAC',
                    borderRadius: '4px',
                    padding: '1px 5px',
                    fontSize: '9px',
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {overallFill! >= 20 ? 'Nominal' : 'Low'}
                </span>
              )}
              {overallFillType === 'PARTIAL' && (
                <span
                  style={{
                    backgroundColor: '#FEF3C7',
                    color: '#D97706',
                    border: '1px solid #FDE68A',
                    borderRadius: '4px',
                    padding: '1px 5px',
                    fontSize: '9px',
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                  }}
                >
                  Partial ({partialLabel})
                </span>
              )}
              {overallFillType === 'UNAVAILABLE' && (
                <span
                  style={{
                    backgroundColor: '#F1F5F9',
                    color: '#64748B',
                    border: '1px solid #CBD5E1',
                    borderRadius: '4px',
                    padding: '1px 5px',
                    fontSize: '9px',
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                  }}
                >
                  Unavailable
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
export default WaterTankStatusCard;
