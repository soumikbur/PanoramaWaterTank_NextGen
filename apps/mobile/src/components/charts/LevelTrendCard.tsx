import React, { useState, useEffect } from 'react';
import { colors, metrics, typography } from '../../theme';
import { BaseCard } from '../common/BaseCard';
import { TrendChart, TrendPoint } from './TrendChart';
import { useApp } from '../../state/AppContext';
import { ApiClient } from '../../api/client';

interface LevelTrendCardProps {
  tankId?: string;
  height?: number;
  dataPoints?: any[];
  style?: React.CSSProperties;
}

export const LevelTrendCard: React.FC<LevelTrendCardProps> = ({ tankId, height, dataPoints, style }) => {
  const { liveTank } = useApp();
  const [historyPoints, setHistoryPoints] = useState<any[]>(dataPoints || []);

  const [rangeIndex, setRangeIndex] = useState(0); // 0: 12 Hours, 1: 24 Hours, 2: 7 Days
  const rangeLabels = ['12 Hours', '24 Hours', '7 Days'];
  const rangeHours = [12, 24, 168];

  useEffect(() => {
    let mounted = true;
    if (dataPoints) {
      setHistoryPoints(dataPoints);
      return;
    }
    const targetId = tankId || liveTank?.tankId;
    if (!targetId) return;
    const rangeStr = rangeIndex === 2 ? '7d' : rangeIndex === 1 ? '24h' : '12h';
    ApiClient.fetchTelemetryHistory(targetId, rangeStr)
      .then((res) => {
        if (mounted && res?.dataPoints) {
          setHistoryPoints(res.dataPoints);
        }
      })
      .catch((err) => {
        console.warn('Failed to load level trend:', err);
      });
    return () => {
      mounted = false;
    };
  }, [tankId, liveTank?.tankId, rangeIndex, dataPoints]);

  // Dynamically append new live telemetry readings as they arrive
  useEffect(() => {
    if (liveTank?.levelPercent != null && liveTank?.hasTelemetry !== false) {
      const nowMs = liveTank.lastUpdate ? new Date(liveTank.lastUpdate).getTime() : Date.now();
      setHistoryPoints((prev) => {
        if (prev && prev.length > 0) {
          const lastPt = prev[prev.length - 1];
          const lastTime = new Date(lastPt.timestamp).getTime();
          if (Math.abs(nowMs - lastTime) < 2000) return prev;
        }
        return [
          ...(prev || []),
          {
            timestamp: liveTank.lastUpdate || new Date().toISOString(),
            levelPercent: liveTank.levelPercent,
            volumeLiters: liveTank.volumeLiters,
            heightCm: liveTank.heightCm,
          },
        ];
      });
    }
  }, [liveTank?.levelPercent, liveTank?.lastUpdate, liveTank?.hasTelemetry]);


  const currentDurationMs = rangeHours[rangeIndex] * 3600 * 1000;
  const now = Date.now();
  const plotStartMs = now - currentDurationMs;

  // Format local 12h time (e.g., "8:00 PM")
  const formatTime12h = (date: Date) => {
    let hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    const mm = minutes < 10 ? `0${minutes}` : `${minutes}`;
    return `${hours}:${mm} ${ampm}`;
  };

  // Format 7-day date (e.g., "Aug 17")
  const formatDate7d = (date: Date) => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[date.getMonth()]} ${date.getDate()}`;
  };

  // Generate 6 or 7 non-overlapping time labels
  const timeLabels = (() => {
    const labels: string[] = [];
    const count = rangeIndex === 2 ? 7 : 6;
    const step = count > 1 ? (now - plotStartMs) / (count - 1) : 0;
    for (let k = 0; k < count; k++) {
      const t = new Date(plotStartMs + k * step);
      if (rangeIndex === 2) {
        labels.push(formatDate7d(t));
      } else {
        labels.push(formatTime12h(t));
      }
    }
    return labels;
  })();

  // Transform historyPoints into TrendPoint array strictly from real telemetry
  const trendPoints: TrendPoint[] = (() => {
    const source = historyPoints && historyPoints.length > 0 ? historyPoints : [];

    if (source.length === 0) {
      return [];
    }

    return source.map((pt: any, idx: number) => {
      const ptTime = new Date(pt.timestamp).getTime();
      let xRatio = (ptTime - plotStartMs) / currentDurationMs;
      xRatio = Math.max(0.0, Math.min(1.0, isNaN(xRatio) ? idx / (source.length - 1 || 1) : xRatio));
      return {
        xRatio,
        value: pt.levelPercent,
        timestampMs: ptTime,
      };
    });
  })();

  const hasData = trendPoints.length > 0;
  const lastUpdated = liveTank?.lastUpdate
    ? new Date(liveTank.lastUpdate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : 'Live Polling';

  return (
    <BaseCard padding={metrics.cardPadding} style={{ minHeight: `${metrics.tankCardMinHeight}px`, height, ...style }}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '8px' }}>
        {/* Card Header Row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span
            style={{
              fontFamily: typography.fontFamily,
              fontSize: typography.dashCardTitle.fontSize,
              fontWeight: typography.dashCardTitle.fontWeight,
              color: colors.textPrimary,
            }}
          >
            Level Trend ({rangeLabels[rangeIndex]})
          </span>

          {/* ComboBox / Select */}
          <select
            value={rangeIndex}
            onChange={(e) => setRangeIndex(Number(e.target.value))}
            style={{
              fontFamily: typography.fontFamily,
              fontSize: typography.dashLabel.fontSize,
              color: colors.textPrimary,
              backgroundColor: '#FFFFFF',
              border: `1px solid ${colors.dividerStrong}`,
              borderRadius: '6px',
              padding: '4px 10px',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            {rangeLabels.map((label, idx) => (
              <option key={idx} value={idx}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {/* Chart Plot Row: Y-Axis (48px) + TrendChart */}
        <div style={{ display: 'flex', flex: 1, minHeight: '190px', gap: '4px', marginTop: '8px' }}>
          {/* Y-Axis Area (48px fixed width) */}
          <div
            style={{
              width: '48px',
              minWidth: '48px',
              maxWidth: '48px',
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {/* Rotated Axis Label */}
            <span
              style={{
                fontFamily: typography.fontFamily,
                fontSize: '9px',
                color: colors.textSecondary,
                transform: 'rotate(-90deg)',
                position: 'absolute',
                left: '-14px',
                whiteSpace: 'nowrap',
              }}
            >
              Water Level (%)
            </span>

            {/* 5 Tick Labels (100%, 75%, 50%, 25%, 0%) */}
            <div
              style={{
                position: 'absolute',
                right: '4px',
                top: '4px',
                bottom: '6px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                alignItems: 'flex-end',
              }}
            >
              {['100%', '75%', '50%', '25%', '0%'].map((txt, i) => (
                <span
                  key={i}
                  style={{
                    fontFamily: typography.fontFamily,
                    fontSize: '10px',
                    color: colors.textSecondary,
                    lineHeight: 1,
                  }}
                >
                  {txt}
                </span>
              ))}
            </div>
          </div>

          {/* Chart Container Area */}
          <div style={{ flex: 1, position: 'relative' }}>
            <TrendChart values={trendPoints} />

            {!hasData && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'rgba(248, 250, 252, 0.88)',
                  backdropFilter: 'blur(2px)',
                  borderRadius: '6px',
                  padding: '16px',
                  textAlign: 'center',
                  gap: '6px',
                }}
              >
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    backgroundColor: '#E0F2FE',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0284C7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                  </svg>
                </div>
                <span
                  style={{
                    fontFamily: typography.fontFamily,
                    fontSize: '13px',
                    fontWeight: 600,
                    color: colors.textPrimary,
                  }}
                >
                  Awaiting Historical Telemetry
                </span>
                <span
                  style={{
                    fontFamily: typography.fontFamily,
                    fontSize: '11px',
                    color: colors.textSecondary,
                    maxWidth: '220px',
                    lineHeight: 1.3,
                  }}
                >
                  Live graph will populate as MQTT telemetry readings arrive
                </span>
              </div>
            )}
          </div>
        </div>

        {/* X-Axis Time Labels Row */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <div style={{ display: 'flex', gap: '4px' }}>
            {/* Left offset matching yAxisArea */}
            <div style={{ width: '48px', minWidth: '48px' }} />

            {/* Labels container beneath chart */}
            <div
              style={{
                flex: 1,
                display: 'flex',
                justifyContent: 'space-between',
                paddingLeft: '2px',
                paddingRight: '2px',
              }}
            >
              {timeLabels.map((lbl, idx) => (
                <span
                  key={idx}
                  style={{
                    fontFamily: typography.fontFamily,
                    fontSize: '10px',
                    color: colors.textSecondary,
                  }}
                >
                  {lbl}
                </span>
              ))}
            </div>
          </div>

          <span
            style={{
              fontFamily: typography.fontFamily,
              fontSize: '10px',
              color: colors.textSecondary,
              textAlign: 'center',
            }}
          >
            Time
          </span>
        </div>

        {/* Card Footer Timestamp */}
        <span
          style={{
            fontFamily: typography.fontFamily,
            fontSize: typography.dashLabel.fontSize,
            color: colors.textSecondary,
            marginTop: '2px',
          }}
        >
          Last Update: {lastUpdated}
        </span>
      </div>
    </BaseCard>
  );
};
