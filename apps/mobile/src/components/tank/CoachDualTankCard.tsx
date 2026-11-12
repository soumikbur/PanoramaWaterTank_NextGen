import React, { useEffect, useRef, useState, useMemo } from 'react';
import { colors, typography } from '../../theme';
import { Clock, Cpu, Droplet, Radio, CheckCircle2, AlertTriangle, AlertCircle, RefreshCw } from 'lucide-react';

export interface CoachDualTankCardProps {
  tankId: string;
  tankIndex: 1 | 2;
  tankName: string;
  sensorLabel: string;
  capacityLiters: number;
  maxHeightCm: number;
  fillPercent: number | null;
  waterHeightCm: number | null;
  volumeLiters: number | null;
  isOnline: boolean;
  hasTelemetry: boolean;
  isStale?: boolean;
  lastUpdated?: string | null;
  batteryPercent?: number | null;
  deviceId?: string;
  valveState?: 'NORMAL' | 'REFILLING' | 'ALERT';
}

export const CoachDualTankCard: React.FC<CoachDualTankCardProps> = ({
  tankIndex,
  tankName,
  sensorLabel,
  capacityLiters,
  maxHeightCm,
  fillPercent,
  waterHeightCm,
  volumeLiters,
  isOnline,
  hasTelemetry,
  isStale = false,
  lastUpdated,
  batteryPercent,
  deviceId = 'Not Mapped',
  valveState = 'NORMAL',
}) => {
  // Determine state
  const isTelemetryAvailable = Boolean(hasTelemetry && fillPercent != null);
  const isZero = isTelemetryAvailable && fillPercent === 0;

  const state: 'NO_TELEMETRY' | 'STALE' | 'VALID_ZERO' | 'VALID_READING' = !isTelemetryAvailable
    ? 'NO_TELEMETRY'
    : isStale
    ? 'STALE'
    : isZero
    ? 'VALID_ZERO'
    : 'VALID_READING';

  const clampedPercent = fillPercent != null ? Math.max(0, Math.min(100, fillPercent)) : 0;
  const isOverflow = clampedPercent >= 100.0;
  const isWarning = clampedPercent > 0 && clampedPercent < 20.0;
  const isCritical = isZero || (clampedPercent > 0 && clampedPercent < 10.0) || isOverflow;

  // Status Badge Label & Color
  const { statusLabel, statusBg, statusColor, statusBorder } = useMemo(() => {
    if (state === 'NO_TELEMETRY') {
      return {
        statusLabel: 'Awaiting Telemetry',
        statusBg: '#F1F5F9',
        statusColor: '#64748B',
        statusBorder: '#CBD5E1',
      };
    }
    if (state === 'STALE') {
      return {
        statusLabel: 'Stale Data (Offline)',
        statusBg: '#FEF3C7',
        statusColor: '#D97706',
        statusBorder: '#FDE68A',
      };
    }
    if (isOverflow) {
      return {
        statusLabel: 'Overflow Alert (100%)',
        statusBg: '#FEE2E2',
        statusColor: '#DC2626',
        statusBorder: '#FCA5A5',
      };
    }
    if (isCritical) {
      return {
        statusLabel: 'Critical Low (< 10%)',
        statusBg: '#FEE2E2',
        statusColor: '#DC2626',
        statusBorder: '#FCA5A5',
      };
    }
    if (isWarning) {
      return {
        statusLabel: 'Warning Low (< 20%)',
        statusBg: '#FEF3C7',
        statusColor: '#D97706',
        statusBorder: '#FDE68A',
      };
    }
    return {
      statusLabel: 'Nominal Telemetry',
      statusBg: '#ECFDF5',
      statusColor: '#16A34A',
      statusBorder: '#DCFCE7',
    };
  }, [state, isOverflow, isCritical, isWarning]);

  // Primary Percent Readout Color
  const levelTextColor = useMemo(() => {
    if (state === 'NO_TELEMETRY') return '#64748B';
    if (state === 'STALE') return '#D97706';
    if (isCritical) return '#DC2626';
    if (isWarning) return '#D97706';
    return '#2563EB';
  }, [state, isCritical, isWarning]);

  // Animation Refs & State
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [wavePhase, setWavePhase] = useState(0);
  const targetFillRef = useRef(clampedPercent);
  const animatedFillRef = useRef(clampedPercent);
  const shouldAnimate = state === 'VALID_READING' && clampedPercent > 0;

  useEffect(() => {
    targetFillRef.current = clampedPercent;
  }, [clampedPercent]);

  useEffect(() => {
    let animId: number;
    let start: number | null = null;

    const animate = (timestamp: number) => {
      if (shouldAnimate) {
        if (!start) start = timestamp;
        const progress = (timestamp - start) % 4000;
        setWavePhase((progress / 4000) * Math.PI * 2);
      }

      // Smooth fill interpolation
      const target = targetFillRef.current;
      const current = animatedFillRef.current;
      if (Math.abs(target - current) < 0.05) {
        animatedFillRef.current = target;
      } else {
        animatedFillRef.current = current + (target - current) * 0.1;
      }

      animId = requestAnimationFrame(animate);
    };

    animId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animId);
  }, [shouldAnimate]);

  // Canvas Drawing
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const w = 100;
    const h = 150;

    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const tr = 8;
    const br = 12;

    // 1. Vessel Body Outline
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

    // 2. Clip water interior
    ctx.save();
    ctx.clip();

    if (state === 'VALID_READING') {
      const waterH = h * (animatedFillRef.current / 100.0);
      if (waterH > 0) {
        const waterTopY = h - waterH;

        const grad = ctx.createLinearGradient(0, waterTopY, 0, h);
        if (isOverflow || isCritical) {
          grad.addColorStop(0, '#EF4444');
          grad.addColorStop(1, '#B91C1C');
        } else if (isWarning) {
          grad.addColorStop(0, '#F59E0B');
          grad.addColorStop(1, '#D97706');
        } else {
          grad.addColorStop(0, '#0284C7');
          grad.addColorStop(1, '#1D4ED8');
        }
        ctx.fillStyle = grad;

        const phase1 = wavePhase;
        const phase2 = wavePhase * 1.5 + 1.0;
        const amp1 = 2.2;
        const amp2 = 1.2;

        ctx.beginPath();
        ctx.moveTo(0, h);
        ctx.lineTo(0, waterTopY);

        for (let x = 0; x <= w; x += 2) {
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
        for (let x2 = 0; x2 <= w; x2 += 2) {
          const waveY2 =
            waterTopY +
            Math.sin((x2 / w) * Math.PI * 2.0 + phase1) * amp1 +
            Math.sin((x2 / w) * Math.PI * 4.0 + phase2) * amp2;
          if (x2 === 0) ctx.moveTo(x2, waveY2);
          else ctx.lineTo(x2, waveY2);
        }
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
        ctx.stroke();
      }
    } else if (state === 'STALE') {
      const waterH = h * (animatedFillRef.current / 100.0);
      if (waterH > 0) {
        const waterTopY = h - waterH;
        ctx.fillStyle = 'rgba(148, 163, 184, 0.7)';
        ctx.fillRect(0, waterTopY, w, waterH);

        // Stale line
        ctx.strokeStyle = '#D97706';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, waterTopY);
        ctx.lineTo(w, waterTopY);
        ctx.stroke();
      }
    } else if (state === 'VALID_ZERO') {
      ctx.strokeStyle = '#EF4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(6, h - 2);
      ctx.lineTo(w - 6, h - 2);
      ctx.stroke();

      ctx.fillStyle = '#EF4444';
      ctx.font = '700 9px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('0.0% EMPTY', w / 2, h - 10);
    } else {
      // Awaiting Telemetry
      ctx.fillStyle = '#94A3B8';
      ctx.font = '600 10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Awaiting', w / 2, h / 2 - 4);
      ctx.fillStyle = '#CBD5E1';
      ctx.font = '500 8.5px Inter, sans-serif';
      ctx.fillText('Telemetry', w / 2, h / 2 + 8);
    }

    ctx.restore(); // end clipping

    // 3. Vessel Outer Steel Border
    ctx.beginPath();
    ctx.moveTo(tr, 0.5);
    ctx.lineTo(w - tr, 0.5);
    ctx.quadraticCurveTo(w - 0.5, 0.5, w - 0.5, tr);
    ctx.lineTo(w - 0.5, h - br);
    ctx.quadraticCurveTo(w - 0.5, h - 0.5, w - br, h - 0.5);
    ctx.lineTo(br, h - 0.5);
    ctx.quadraticCurveTo(0.5, h - 0.5, 0.5, h - br);
    ctx.lineTo(0.5, tr);
    ctx.quadraticCurveTo(0.5, 0.5, tr, 0.5);
    ctx.closePath();

    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#94A3B8';
    ctx.stroke();

    ctx.restore();
  }, [state, clampedPercent, wavePhase, isOverflow, isCritical, isWarning]);

  const displayPercent = fillPercent != null ? `${clampedPercent.toFixed(1)}%` : 'Awaiting';
  const displayHeight = waterHeightCm != null ? `${waterHeightCm.toFixed(1)} cm` : '--';
  const displayVolume = volumeLiters != null ? `${volumeLiters.toFixed(1)} L` : (fillPercent != null ? `${((clampedPercent / 100) * capacityLiters).toFixed(1)} L` : '--');
  const displayTime = lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : (hasTelemetry ? new Date().toLocaleTimeString() : 'Awaiting');

  return (
    <div
      className="coach-details-tank-card"
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '8px',
        border: '1px solid #E2E8F0',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        overflow: 'hidden',
        height: '100%',
        minHeight: '270px',
      }}
    >
      {/* 1. Header Bar: Tank Identity & Physical Spec */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          borderBottom: '1px solid #E2E8F0',
          backgroundColor: '#F8FAFC',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              backgroundColor: tankIndex === 1 ? '#2563EB' : '#0284C7',
              color: '#FFFFFF',
              fontSize: '10px',
              fontWeight: 800,
              padding: '2px 8px',
              borderRadius: '4px',
              letterSpacing: '0.4px',
            }}
          >
            {sensorLabel}
          </span>
          <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A' }}>
            {tankName}
          </span>
        </div>

        {/* Live Status Badge */}
        <span
          style={{
            backgroundColor: statusBg,
            color: statusColor,
            border: `1px solid ${statusBorder}`,
            fontSize: '10px',
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: '4px',
            whiteSpace: 'nowrap',
          }}
        >
          {statusLabel}
        </span>
      </div>

      {/* 2. Main Body: Left (Vessel + Scale) | Right (Telemetry & Diagnostics) */}
      <div
        style={{
          padding: '14px',
          display: 'flex',
          alignItems: 'stretch',
          gap: '16px',
          flex: 1,
        }}
      >
        {/* Left: Vessel Body & Precision Ruler */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexShrink: 0,
          }}
        >
          {/* Vessel Container with Nozzle */}
          <div
            ref={containerRef}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              width: '100px',
            }}
          >
            {/* Top Nozzle Cap */}
            <div
              style={{
                width: '26px',
                height: '7px',
                border: '1px solid #94A3B8',
                borderBottom: 'none',
                borderRadius: '3px 3px 0 0',
                backgroundColor: '#E2E8F0',
                boxSizing: 'border-box',
              }}
            />
            {/* Canvas */}
            <canvas
              ref={canvasRef}
              style={{
                width: '100px',
                height: '150px',
                display: 'block',
                borderRadius: '0 0 12px 12px',
              }}
            />
          </div>

          {/* Scale Ruler (0% to 100%) */}
          <div
            style={{
              height: '150px',
              marginTop: '7px',
              display: 'flex',
              position: 'relative',
              width: '38px',
              flexShrink: 0,
            }}
          >
            <div style={{ width: '1.5px', height: '100%', backgroundColor: '#CBD5E1' }} />
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                paddingLeft: '3px',
                height: '100%',
                boxSizing: 'border-box',
              }}
            >
              {[100, 75, 50, 25, 0].map((tick) => (
                <div key={tick} style={{ display: 'flex', alignItems: 'center', height: '0px', position: 'relative' }}>
                  <div style={{ width: '6px', height: '1px', backgroundColor: '#64748B' }} />
                  <span
                    style={{
                      fontFamily: typography.fontFamily,
                      fontSize: '9.5px',
                      fontWeight: 600,
                      color: '#64748B',
                      lineHeight: 1,
                      marginLeft: '3px',
                      userSelect: 'none',
                    }}
                  >
                    {tick}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Telemetry Readouts & SCADA Diagnostics */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '10px',
            minWidth: 0,
          }}
        >
          {/* Primary Water Level Readout */}
          <div>
            <div style={{ fontSize: '9.5px', fontWeight: 700, color: '#64748B', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
              Current Water Level
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', marginTop: '2px' }}>
              <span
                style={{
                  fontSize: '22px',
                  fontWeight: 900,
                  color: levelTextColor,
                  lineHeight: 1.1,
                  fontFamily: typography.fontFamily,
                }}
              >
                {displayPercent}
              </span>
              <span style={{ fontSize: '10px', color: '#64748B', fontWeight: 500 }}>
                {maxHeightCm.toFixed(1)} cm &bull; {capacityLiters.toFixed(0)} L Max
              </span>
            </div>
          </div>

          {/* 2x2 Diagnostics Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '6px',
            }}
          >
            {/* 1. Water Height */}
            <div
              style={{
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '6px',
                padding: '6px 8px',
              }}
            >
              <div style={{ fontSize: '9.5px', color: '#64748B', fontWeight: 600 }}>WATER HEIGHT</div>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', marginTop: '1px' }}>
                {displayHeight}
              </div>
              <div style={{ fontSize: '9px', color: '#94A3B8' }}>of {maxHeightCm.toFixed(1)} cm</div>
            </div>

            {/* 2. Estimated Volume */}
            <div
              style={{
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '6px',
                padding: '6px 8px',
              }}
            >
              <div style={{ fontSize: '9.5px', color: '#64748B', fontWeight: 600 }}>ESTIMATED VOL</div>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', marginTop: '1px' }}>
                {displayVolume}
              </div>
              <div style={{ fontSize: '9px', color: '#94A3B8' }}>of {capacityLiters.toFixed(0)} L</div>
            </div>

            {/* 3. Sensor Status */}
            <div
              style={{
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '6px',
                padding: '6px 8px',
              }}
            >
              <div style={{ fontSize: '9.5px', color: '#64748B', fontWeight: 600 }}>SENSOR TRANSCEIVER</div>
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: isOnline && hasTelemetry ? '#16A34A' : '#64748B',
                  marginTop: '1px',
                }}
              >
                {isOnline && hasTelemetry ? 'Active Stream' : (isOnline ? 'Standby' : 'No Signal')}
              </div>
              <div style={{ fontSize: '9px', color: '#94A3B8' }}>Ultrasonic Probe</div>
            </div>

            {/* 4. Valve State */}
            <div
              style={{
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '6px',
                padding: '6px 8px',
              }}
            >
              <div style={{ fontSize: '9.5px', color: '#64748B', fontWeight: 600 }}>VALVE STATE</div>
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: valveState === 'ALERT' ? '#DC2626' : (valveState === 'REFILLING' ? '#2563EB' : '#16A34A'),
                  marginTop: '1px',
                }}
              >
                {valveState === 'ALERT' ? 'Valve Alert' : (valveState === 'REFILLING' ? 'Refilling Active' : 'Normal (Closed)')}
              </div>
              <div style={{ fontSize: '9px', color: '#94A3B8' }}>Solenoid Auto-Cut</div>
            </div>
          </div>

          {/* Footer Connectivity & Timestamp */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '10px',
              color: '#64748B',
              paddingTop: '2px',
              borderTop: '1px solid #F1F5F9',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '3px',
                  backgroundColor: isOnline ? '#16A34A' : '#DC2626',
                  display: 'inline-block',
                }}
              />
              <span>Node: <strong>{deviceId}</strong></span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Clock size={11} />
              <span>Update: <strong>{displayTime}</strong></span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
