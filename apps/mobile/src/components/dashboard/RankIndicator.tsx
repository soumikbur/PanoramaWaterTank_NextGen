import React from 'react';
import { colors, metrics, typography } from '../../theme';
import { BaseCard } from '../common/BaseCard';

interface RankIndicatorProps {
  fillPercentage?: number | null;
  style?: React.CSSProperties;
}

export const RankIndicator: React.FC<RankIndicatorProps> = ({ fillPercentage, style }) => {
  const hasData = fillPercentage != null;
  const clampedPercentage = hasData ? Math.max(0, Math.min(100, fillPercentage)) : 0;

  const segments = [
    { label: 'LOW', color: '#EF4444' },
    { label: 'MODERATE', color: '#F97316' },
    { label: 'GOOD', color: '#EAB308' },
    { label: 'HIGH', color: '#22C55E' },
  ];

  return (
    <BaseCard
      padding={14}
      style={{
        minHeight: '124px',
        height: 'auto',
        boxSizing: 'border-box',
        ...style,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '4px' }}>
        {/* Section Title */}
        <span
          style={{
            fontFamily: typography.fontFamily,
            fontSize: '14px',
            fontWeight: 700,
            color: colors.textPrimary,
          }}
        >
          Water Level Indicator (Rank)
        </span>

        {/* Percentage Scale Labels Row (0%, 25%, 50%, 75%, 100%) */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingLeft: '2px',
            paddingRight: '2px',
          }}
        >
          {['0%', '25%', '50%', '75%', '100%'].map((mark, i) => (
            <span
              key={i}
              style={{
                fontFamily: typography.fontFamily,
                fontSize: '11px',
                fontWeight: 500,
                color: colors.textSecondary,
              }}
            >
              {mark}
            </span>
          ))}
        </div>

        {/* Segmented Color Bar (26px height) */}
        <div style={{ display: 'flex', height: '26px', gap: '3px' }}>
          {segments.map((seg, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                backgroundColor: seg.color,
                borderRadius: i === 0 ? '6px 0 0 6px' : i === segments.length - 1 ? '0 6px 6px 0' : '0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span
                style={{
                  fontFamily: typography.fontFamily,
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#FFFFFF',
                  letterSpacing: '0.3px',
                }}
              >
                {seg.label}
              </span>
            </div>
          ))}
        </div>

        {/* Pointer Indicator (Upward Triangle + Percentage Readout) */}
        <div style={{ position: 'relative', height: '28px', width: '100%', overflow: 'hidden' }}>
          {hasData ? (
            <div
              style={{
                position: 'absolute',
                left: `${clampedPercentage}%`,
                transform: 'translateX(-50%)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                transition: 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >
              {/* Upward Triangle */}
              <svg width="14" height="8" viewBox="0 0 14 8" fill="none">
                <path d="M7 0L14 8L0 8Z" fill={colors.primary} />
              </svg>
              <span
                style={{
                  fontFamily: typography.fontFamily,
                  fontSize: '13px',
                  fontWeight: 700,
                  color: colors.primary,
                  lineHeight: 1.1,
                  whiteSpace: 'nowrap',
                }}
              >
                {clampedPercentage.toFixed(2)}%
              </span>
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                fontSize: '11px',
                color: colors.textMuted,
                fontWeight: 600,
              }}
            >
              Awaiting Telemetry
            </div>
          )}
        </div>
      </div>
    </BaseCard>
  );
};
