import React from 'react';
import { colors, typography } from '../../theme';

interface InfoRowProps {
  label: string;
  value: string | number;
  valueColor?: string;
  highlight?: boolean;
  style?: React.CSSProperties;
}

export const InfoRow: React.FC<InfoRowProps> = ({
  label,
  value,
  valueColor = colors.textPrimary,
  highlight = false,
  style,
}) => {
  const effectiveColor = highlight ? colors.primary : valueColor;
  const valStr = String(value ?? '');
  const isLong = valStr.length > 20;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: '26px',
        gap: '6px',
        boxSizing: 'border-box',
        ...style,
      }}
    >
      <span
        style={{
          fontFamily: typography.fontFamily,
          fontSize: '12px',
          fontWeight: 500,
          color: colors.textSecondary,
          minWidth: '80px',
          maxWidth: '120px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
      <span
        title={valStr}
        style={{
          fontFamily: typography.fontFamily,
          fontSize: isLong ? '10px' : '12px',
          fontWeight: 700,
          color: effectiveColor,
          textAlign: 'right',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
        }}
      >
        {valStr}
      </span>
    </div>
  );
};
