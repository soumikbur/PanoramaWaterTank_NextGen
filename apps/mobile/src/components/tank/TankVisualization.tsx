import React, { useEffect, useRef, useState } from 'react';
import { colors, metrics, typography } from '../../theme';
import { TankLiveStatus } from '../../types';
import { BaseCard } from '../common/BaseCard';
import { StatusBadge } from '../common/StatusBadge';

interface TankVisualizationProps {
  tank: TankLiveStatus | null;
  style?: React.CSSProperties;
}

export type TankVisualizationState = 'NO_TELEMETRY' | 'VALID_ZERO' | 'STALE' | 'VALID_READING';

export const TankVisualization: React.FC<TankVisualizationProps> = ({ tank, style }) => {
  // 1. Rigorous 4-State Detection
  const isTelemetryAvailable = Boolean(tank && tank.hasTelemetry !== false && tank.levelPercent != null);
  const isStale = Boolean(tank && (tank.isStale || tank.alarmStatus === 'STALE_DATA'));
  const isZero = isTelemetryAvailable && (tank!.levelPercent === 0 || (tank!.heightCm !== null && tank!.heightCm === 0));

  const state: TankVisualizationState = !isTelemetryAvailable
    ? 'NO_TELEMETRY'
    : isStale
    ? 'STALE'
    : isZero
    ? 'VALID_ZERO'
    : 'VALID_READING';

  // 2. Calibrated Physical Tank Geometry
  const tankHeightCm = tank?.maxHeightCm && tank.maxHeightCm > 0 ? tank.maxHeightCm : 50.0;
  const capacityLiters = tank?.capacityLiters && tank.capacityLiters > 0 ? tank.capacityLiters : 20.0;

  // 3. Mathematical Height, Fill Percentage & Volume Calculations
  let fillPercentage = 0.0;
  let waterHeightCm: number | null = null;
  let waterVolumeLiters: number | null = null;
  let isOverflow = false;

  if (state === 'VALID_READING' || state === 'STALE') {
    if (tank?.heightCm != null) {
      waterHeightCm = tank.heightCm;
      fillPercentage = Math.max(0, Math.min(100, (waterHeightCm / tankHeightCm) * 100));
    } else {
      fillPercentage = Math.max(0, Math.min(100, tank!.levelPercent!));
      waterHeightCm = (fillPercentage / 100.0) * tankHeightCm;
    }
    waterVolumeLiters = tank?.volumeLiters != null ? tank.volumeLiters : (fillPercentage / 100.0) * capacityLiters;
    isOverflow = fillPercentage >= 100.0 || (tankHeightCm > 0 && waterHeightCm >= tankHeightCm);
  } else if (state === 'VALID_ZERO') {
    fillPercentage = 0.0;
    waterHeightCm = 0.0;
    waterVolumeLiters = 0.0;
    isOverflow = false;
  } else {
    // NO_TELEMETRY (State A)
    fillPercentage = 0.0;
    waterHeightCm = null;
    waterVolumeLiters = null;
    isOverflow = false;
  }

  // 4. Formatted Display Values
  const levelDisplay =
    state === 'NO_TELEMETRY'
      ? 'Awaiting Telemetry'
      : state === 'STALE'
      ? `${fillPercentage.toFixed(2)}% (Stale)`
      : `${fillPercentage.toFixed(2)}%`;

  const heightDisplay =
    state === 'NO_TELEMETRY'
      ? 'Awaiting Data'
      : state === 'STALE'
      ? `${waterHeightCm!.toFixed(2)} cm (Stale)`
      : `${waterHeightCm!.toFixed(2)} cm`;

  const volumeDisplay =
    state === 'NO_TELEMETRY'
      ? 'Awaiting Data'
      : state === 'STALE'
      ? `${waterVolumeLiters!.toFixed(2)} L (Stale)`
      : `${waterVolumeLiters!.toFixed(2)} L`;

  const severity: 'Critical' | 'Warning' | 'Normal' | 'Neutral' =
    state === 'NO_TELEMETRY'
      ? 'Neutral'
      : state === 'STALE'
      ? 'Warning'
      : state === 'VALID_ZERO'
      ? 'Critical'
      : isOverflow
      ? 'Critical'
      : fillPercentage < 10.0
      ? 'Critical'
      : fillPercentage < 20.0
      ? 'Warning'
      : 'Normal';

  const badgeLabel =
    state === 'NO_TELEMETRY'
      ? 'Awaiting Telemetry'
      : state === 'STALE'
      ? 'Stale Data (Offline)'
      : state === 'VALID_ZERO'
      ? 'Critical Low (Empty)'
      : isOverflow
      ? 'OVERFLOW ALERT'
      : fillPercentage < 10.0
      ? 'Low Critical Alert'
      : fillPercentage < 20.0
      ? 'Low Warning Alert'
      : 'Receiving Data';

  const lastUpdated = tank?.lastUpdate
    ? new Date(tank.lastUpdate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : 'Awaiting Telemetry';

  // 5. Animation Control (Only animate wave if valid live telemetry reading exists)
  const shouldAnimateWave = state === 'VALID_READING' && fillPercentage > 0;
  const [wavePhase, setWavePhase] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const targetFillRef = useRef(fillPercentage);
  const animatedFillRef = useRef(fillPercentage);

  useEffect(() => {
    targetFillRef.current = fillPercentage;
  }, [fillPercentage]);

  useEffect(() => {
    let animId: number;
    let start: number | null = null;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const animate = (timestamp: number) => {
      if (shouldAnimateWave && !prefersReducedMotion) {
        if (!start) start = timestamp;
        const progress = (timestamp - start) % 4000;
        setWavePhase((progress / 4000) * Math.PI * 2);
      }

      // Smooth fluid level transition
      const target = targetFillRef.current;
      const current = animatedFillRef.current;
      if (Math.abs(target - current) < 0.05) {
        animatedFillRef.current = target;
      } else {
        animatedFillRef.current = current + (target - current) * 0.08;
      }

      animId = requestAnimationFrame(animate);
    };

    animId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animId);
  }, [shouldAnimateWave]);

  // 6. Canvas Rendering Logic
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const tr = metrics.topRadius;
    const br = metrics.bottomRadius;

    ctx.clearRect(0, 0, w, h);

    // 1. Vessel Body Outline Path (for clipping interior)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(tr, 0);
    ctx.lineTo(w - tr, 0);
    ctx.quadraticCurveTo(w, 0, w, tr);
    ctx.lineTo(w, h - br);
    ctx.quadraticCurveTo(w, h, w - br, h);
    ctx.lineTo(br, h);
    ctx.quadraticCurveTo(0, h, 0, h - br);
    ctx.lineTo(0, tr);
    ctx.quadraticCurveTo(0, 0, tr, 0);
    ctx.closePath();

    ctx.fillStyle = '#FFFFFF';
    ctx.fill();

    // 2. CLIP water fill to inner tank body
    ctx.clip();

    if (state === 'VALID_READING') {
      const waterH = h * (animatedFillRef.current / 100.0);
      if (waterH > 0) {
        const waterTopY = h - waterH;

        // Linear Gradient Fill
        const grad = ctx.createLinearGradient(0, waterTopY, 0, h);
        const colorTop = isOverflow
          ? '#EF4444'
          : fillPercentage < 10
          ? '#EF4444'
          : fillPercentage < 20
          ? '#F59E0B'
          : colors.waterTop;
        const colorBottom = isOverflow
          ? '#B91C1C'
          : fillPercentage < 10
          ? '#DC2626'
          : fillPercentage < 20
          ? '#D97706'
          : colors.waterBottom;
        grad.addColorStop(0, colorTop);
        grad.addColorStop(1, colorBottom);
        ctx.fillStyle = grad;

        // Dual smooth sine waves
        const phase1 = wavePhase;
        const phase2 = wavePhase * 1.6 + 1.2;
        const amp1 = 2.8;
        const amp2 = 1.6;

        ctx.beginPath();
        ctx.moveTo(0, h);
        ctx.lineTo(0, waterTopY);

        for (let x = 0; x <= w; x += 3) {
          const waveY =
            waterTopY +
            Math.sin((x / w) * Math.PI * 2.0 + phase1) * amp1 +
            Math.sin((x / w) * Math.PI * 4.0 + phase2) * amp2;
          ctx.lineTo(x, waveY);
        }

        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fill();

        // Wave crest highlight
        ctx.beginPath();
        for (let x2 = 0; x2 <= w; x2 += 3) {
          const waveY2 =
            waterTopY +
            Math.sin((x2 / w) * Math.PI * 2.0 + phase1) * amp1 +
            Math.sin((x2 / w) * Math.PI * 4.0 + phase2) * amp2;
          if (x2 === 0) ctx.moveTo(x2, waveY2);
          else ctx.lineTo(x2, waveY2);
        }
        ctx.lineWidth = 2.0;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.stroke();
      }
    } else if (state === 'STALE') {
      const waterH = h * (animatedFillRef.current / 100.0);
      if (waterH > 0) {
        const waterTopY = h - waterH;

        // Frozen / desaturated flat water fill
        const grad = ctx.createLinearGradient(0, waterTopY, 0, h);
        grad.addColorStop(0, 'rgba(148, 163, 184, 0.7)');
        grad.addColorStop(1, 'rgba(100, 116, 139, 0.85)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, waterTopY, w, waterH);

        // Diagonal hatch pattern indicating inactive telemetry
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.lineWidth = 1.5;
        for (let x = -h; x < w + h; x += 14) {
          ctx.beginPath();
          ctx.moveTo(x, h);
          ctx.lineTo(x + waterH, waterTopY);
          ctx.stroke();
        }

        // Stale watermark line
        ctx.strokeStyle = '#D97706';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, waterTopY);
        ctx.lineTo(w, waterTopY);
        ctx.stroke();
      }
    } else if (state === 'VALID_ZERO') {
      // Empty tank with subtle red 0% baseline marker
      ctx.strokeStyle = '#EF4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(6, h - 2);
      ctx.lineTo(w - 6, h - 2);
      ctx.stroke();

      ctx.fillStyle = '#EF4444';
      ctx.font = '600 11px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Tank Empty (0.00%)', w / 2, h - 14);
    } else {
      // STATE A: NO TELEMETRY
      // Completely empty vessel. NO blue water, NO scan beam, NO floating bands.
      // Subtle centered industrial status text
      ctx.fillStyle = '#94A3B8';
      ctx.font = '600 12px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Awaiting Telemetry', w / 2, h / 2 - 2);

      ctx.fillStyle = '#CBD5E1';
      ctx.font = '500 10px Inter, sans-serif';
      ctx.fillText('No Sensor Stream', w / 2, h / 2 + 14);
    }

    ctx.restore(); // End clipping

    // 3. Draw Outer Tank Outline Overlay
    ctx.beginPath();
    ctx.moveTo(tr, 1);
    ctx.lineTo(w - tr, 1);
    ctx.quadraticCurveTo(w - 1, 1, w - 1, tr);
    ctx.lineTo(w - 1, h - br);
    ctx.quadraticCurveTo(w - 1, h - 1, w - br, h - 1);
    ctx.lineTo(br, h - 1);
    ctx.quadraticCurveTo(1, h - 1, 1, h - br);
    ctx.lineTo(1, tr);
    ctx.quadraticCurveTo(1, 1, tr, 1);
    ctx.closePath();

    ctx.lineWidth = 2.0;
    ctx.strokeStyle = colors.tankOutline;
    ctx.stroke();
  }, [state, fillPercentage, wavePhase, isOverflow]);

  return (
    <BaseCard padding={metrics.cardPadding} style={{ minHeight: `${metrics.tankCardMinHeight}px`, ...style }}>
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', gap: '10px' }}>
        {/* Card Title */}
        <span
          style={{
            fontFamily: typography.fontFamily,
            fontSize: typography.dashCardTitle.fontSize,
            fontWeight: typography.dashCardTitle.fontWeight,
            color: colors.textPrimary,
          }}
        >
          Water Level
        </span>

        {/* Row: Left (Tank + Scale) | Right (Level %, Height, Volume, Status) */}
        <div style={{ display: 'flex', flex: 1, gap: '12px', flexWrap: 'wrap', alignItems: 'stretch' }}>
          {/* Left: Tank Vessel + Vertical Scale */}
          <div style={{ display: 'flex', gap: '6px', alignItems: 'stretch', flex: '1 1 200px', minWidth: '180px', maxWidth: '300px' }}>
            {/* Vessel Container */}
            <div
              style={{
                flex: 1,
                minWidth: '130px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                position: 'relative',
              }}
            >
              {/* Top Pipe / Nozzle Lid (36x12 px) */}
              <div
                style={{
                  width: '36px',
                  height: '12px',
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  zIndex: 5,
                  marginBottom: '-2px',
                }}
              >
                {/* Cap */}
                <div
                  style={{
                    width: '36px',
                    height: '4px',
                    borderRadius: '2px',
                    backgroundColor: colors.surface,
                    border: `1.5px solid ${colors.tankOutline}`,
                    boxSizing: 'border-box',
                  }}
                />
                {/* Collar */}
                <div
                  style={{
                    width: '24px',
                    height: '9px',
                    borderRadius: '2px',
                    backgroundColor: colors.surface,
                    border: `1.5px solid ${colors.tankOutline}`,
                    boxSizing: 'border-box',
                    marginTop: '-1px',
                  }}
                />
              </div>

              {/* Canvas Tank Body */}
              <div style={{ width: '100%', height: '220px', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <canvas
                  ref={canvasRef}
                  width={metrics.vesselPreferredWidth}
                  height={220}
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }}
                />
              </div>
            </div>

            {/* Vertical Scale Ruler (42px width) */}
            <div
              style={{
                width: `${metrics.rulerPreferredWidth}px`,
                display: 'flex',
                position: 'relative',
                paddingTop: '16px',
                paddingBottom: '8px',
                boxSizing: 'border-box',
              }}
            >
              {/* Vertical line */}
              <div
                style={{
                  width: '1px',
                  height: '100%',
                  backgroundColor: colors.dividerStrong,
                }}
              />
              {/* 21 Tick marks (every 5%) */}
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  paddingLeft: '3px',
                }}
              >
                {Array.from({ length: 21 }).map((_, i) => {
                  const percent = 100 - i * 5;
                  const isMajor = percent % 25 === 0;
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '3px', height: '1px' }}>
                      <div
                        style={{
                          width: isMajor ? '7px' : '3px',
                          height: '1px',
                          backgroundColor: colors.dividerStrong,
                        }}
                      />
                      {isMajor && (
                        <span
                          style={{
                            fontFamily: typography.fontFamily,
                            fontSize: '10px',
                            color: colors.textSecondary,
                            lineHeight: 1,
                          }}
                        >
                          {percent}%
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Column: Values, Sub-Cards, & Status */}
          <div style={{ flex: '1 1 140px', minWidth: '130px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span
              style={{
                fontFamily: typography.fontFamily,
                fontSize: '14px',
                fontWeight: 500,
                color: colors.textSecondary,
              }}
            >
              Current Level
            </span>

            <span
              style={{
                fontFamily: typography.fontFamily,
                fontSize: state === 'NO_TELEMETRY' ? '18px' : typography.dashPercentage.fontSize,
                fontWeight: typography.dashPercentage.fontWeight,
                color: isOverflow || state === 'VALID_ZERO' ? colors.critical : state === 'STALE' ? colors.warning : colors.primary,
                lineHeight: 1.1,
              }}
            >
              {levelDisplay}
            </span>

            {/* 1. Water Height Card Block */}
            <div
              style={{
                backgroundColor: '#F8FAFC',
                border: `1px solid ${colors.divider}`,
                borderRadius: '8px',
                padding: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '1px',
                boxSizing: 'border-box',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path
                    d="M2 1L2 13M2 3L7 3M2 7L10 7M2 11L7 11M2 13L10 13"
                    stroke={colors.primary}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span
                  style={{
                    fontFamily: typography.fontFamily,
                    fontSize: '12px',
                    fontWeight: 500,
                    color: colors.textSecondary,
                  }}
                >
                  Water Height
                </span>
              </div>
              <span
                style={{
                  fontFamily: typography.fontFamily,
                  fontSize: '18px',
                  fontWeight: 700,
                  color: colors.textPrimary,
                }}
              >
                {heightDisplay}
              </span>
              <span
                style={{
                  fontFamily: typography.fontFamily,
                  fontSize: '11px',
                  color: colors.textSecondary,
                }}
              >
                of {tankHeightCm.toFixed(2)} cm
              </span>
            </div>

            {/* 2. Tank Volume Card Block */}
            <div
              style={{
                backgroundColor: '#F8FAFC',
                border: `1px solid ${colors.divider}`,
                borderRadius: '8px',
                padding: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '1px',
                boxSizing: 'border-box',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path
                    d="M2 2C2 1 10 1 10 2L10 12C10 13 2 13 2 12ZM4 1L8 1"
                    stroke={colors.primary}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span
                  style={{
                    fontFamily: typography.fontFamily,
                    fontSize: '12px',
                    fontWeight: 500,
                    color: colors.textSecondary,
                  }}
                >
                  Tank Volume
                </span>
              </div>
              <span
                style={{
                  fontFamily: typography.fontFamily,
                  fontSize: '18px',
                  fontWeight: 700,
                  color: colors.textPrimary,
                }}
              >
                {volumeDisplay}
              </span>
              <span
                style={{
                  fontFamily: typography.fontFamily,
                  fontSize: '11px',
                  color: colors.textSecondary,
                }}
              >
                of {capacityLiters.toFixed(2)} L
              </span>
            </div>

            <span
              style={{
                fontFamily: typography.fontFamily,
                fontSize: '11px',
                color: colors.textSecondary,
                marginTop: '2px',
              }}
            >
              Status
            </span>

            <StatusBadge severity={severity} label={badgeLabel} />

            <span
              style={{
                fontFamily: typography.fontFamily,
                fontSize: '11px',
                color: colors.textSecondary,
                marginTop: '1px',
              }}
            >
              Last Update: {lastUpdated}
            </span>
          </div>
        </div>

        {/* Bottom Full-width Light Blue Tank Capacity Banner */}
        <div
          style={{
            minHeight: '30px',
            borderRadius: '6px',
            backgroundColor: colors.primarySurface,
            border: '1px solid #DBEAFE',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 14px',
            boxSizing: 'border-box',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <span
            style={{
              fontFamily: typography.fontFamily,
              fontSize: '12px',
              fontWeight: 700,
              color: '#1E40AF',
            }}
          >
            Tank Height: {tankHeightCm.toFixed(2)} cm
          </span>
          <span
            style={{
              fontFamily: typography.fontFamily,
              fontSize: '12px',
              fontWeight: 700,
              color: '#1E40AF',
            }}
          >
            Tank Capacity: {capacityLiters.toFixed(2)} L
          </span>
        </div>
      </div>
    </BaseCard>
  );
};
