import React from 'react';
import { colors, metrics, typography } from '../../theme';
import { BaseCard } from '../common/BaseCard';

interface SummaryCardProps {
  iconGlyph: 'drop' | 'volume' | 'status' | 'thermometer' | 'clock';
  iconColor?: string;
  valueColor?: string;
  title: string;
  value: string;
  subtitle?: string;
  style?: React.CSSProperties;
}

export const SummaryCard: React.FC<SummaryCardProps> = ({
  iconGlyph,
  iconColor = colors.primary,
  valueColor = colors.textPrimary,
  title,
  value,
  subtitle,
  style,
}) => {
  const renderGlyph = () => {
    switch (iconGlyph) {
      case 'drop':
        return (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M9 1C9 1 2 9.5 2 13.5C2 17.09 5.134 20 9 20C12.866 20 16 17.09 16 13.5C16 9.5 9 1 9 1Z"
              fill={iconColor}
            />
          </svg>
        );

      case 'volume':
        return (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M4 3L16 3L14 17L6 17Z M4 7L16 7"
              stroke={iconColor}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        );

      case 'status':
        return (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M2 10L6 10L8 4L12 16L14 10L18 10"
              stroke={iconColor}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        );

      case 'thermometer':
        return (
          <svg width="16" height="20" viewBox="0 0 16 20" fill="none">
            <rect x="5" y="1" width="6" height="12" rx="3" stroke={iconColor} strokeWidth="2" />
            <circle cx="8" cy="14" r="5" stroke={iconColor} strokeWidth="2" />
            <circle cx="8" cy="14" r="2.5" fill={iconColor} />
            <line x1="8" y1="5" x2="8" y2="11" stroke={iconColor} strokeWidth="2" />
          </svg>
        );

      case 'clock':
        return (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="10" r="8" stroke={iconColor} strokeWidth="2" />
            <line x1="10" y1="5" x2="10" y2="10" stroke={iconColor} strokeWidth="2" strokeLinecap="round" />
            <line x1="10" y1="10" x2="14" y2="10" stroke={iconColor} strokeWidth="2" strokeLinecap="round" />
          </svg>
        );

      default:
        return null;
    }
  };

  return (
    <BaseCard
      padding={metrics.cardPadding}
      style={{
        minHeight: '110px',
        height: 'auto',
        boxSizing: 'border-box',
        ...style,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: `${metrics.space4}px`,
          textAlign: 'center',
        }}
      >
        {/* 38x38 Icon Badge Container */}
        <div
          style={{
            width: `${metrics.summaryIconBadgeSize}px`,
            height: `${metrics.summaryIconBadgeSize}px`,
            borderRadius: `${metrics.summaryIconBadgeRadius}px`,
            backgroundColor: `${iconColor}1F`, // ~12% opacity
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {renderGlyph()}
        </div>

        {/* Value */}
        <span
          title={value}
          style={{
            fontFamily: typography.fontFamily,
            fontSize: value.length > 12 ? '14px' : typography.dashValue.fontSize,
            fontWeight: typography.dashValue.fontWeight,
            color: valueColor,
            lineHeight: 1.1,
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
            overflow: 'hidden',
            maxWidth: '100%',
          }}
        >
          {value}
        </span>

        {/* Title */}
        <span
          style={{
            fontFamily: typography.fontFamily,
            fontSize: typography.dashLabel.fontSize,
            fontWeight: typography.dashLabel.fontWeight,
            color: colors.textSecondary,
            lineHeight: 1.1,
          }}
        >
          {title}
        </span>

        {/* Optional Subtitle */}
        {subtitle && (
          <span
            style={{
              fontFamily: typography.fontFamily,
              fontSize: typography.caption.fontSize,
              fontWeight: 400,
              color: colors.textSecondary,
              lineHeight: 1.1,
            }}
          >
            {subtitle}
          </span>
        )}
      </div>
    </BaseCard>
  );
};

