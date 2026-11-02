import React from 'react';
import { colors, typography } from '../../theme';

interface StatusBadgeProps {
  severity?: string; // Normal | Low | Critical | Overflow | SensorError | Offline | Waiting
  label?: string;
  style?: React.CSSProperties;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ severity = 'Normal', label, style }) => {
  const displayLabel = label || severity;

  let accentColor = '#16A34A';
  switch (severity) {
    case 'Critical':
    case 'Overflow':
    case 'SensorError':
      accentColor = '#EF2020';
      break;
    case 'Low':
    case 'Warning':
      accentColor = '#F97316';
      break;
    case 'Offline':
      accentColor = '#6B7280';
      break;
    case 'Waiting':
      accentColor = '#111827';
      break;
    default:
      accentColor = '#16A34A';
      break;
  }

  return (
    <div
      style={{
        borderRadius: '10px',
        backgroundColor: '#F3F4F6',
        padding: '8px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        boxSizing: 'border-box',
        ...style,
      }}
    >
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path
          d="M9 1C9 1 2 9.5 2 13.5C2 17.09 5.134 20 9 20C12.866 20 16 17.09 16 13.5C16 9.5 9 1 9 1Z"
          fill="#5F6B7A"
        />
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <span
          style={{
            fontFamily: typography.fontFamily,
            fontSize: '11px',
            color: colors.textSecondary,
            lineHeight: 1,
          }}
        >
          Status
        </span>
        <span
          style={{
            fontFamily: typography.fontFamily,
            fontSize: '13px',
            fontWeight: 700,
            color: accentColor,
            lineHeight: 1.2,
          }}
        >
          {displayLabel}
        </span>
      </div>
    </div>
  );
};
