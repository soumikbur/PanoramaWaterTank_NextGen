import React, { ReactNode } from 'react';
import { colors, metrics, typography } from '../../theme';

interface BaseCardProps {
  title?: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  style?: React.CSSProperties;
  padding?: number;
  elevated?: boolean;
}

export const BaseCard: React.FC<BaseCardProps> = ({
  title,
  icon,
  action,
  children,
  style,
  padding = metrics.cardPadding,
  elevated = true,
}) => {
  return (
    <div
      className="interactive-card"
      style={{
        backgroundColor: colors.surface,
        borderRadius: `${metrics.radiusLarge}px`,
        border: `1px solid ${colors.border}`,
        boxShadow: elevated ? colors.shadowCard : 'none',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        transition: 'all 0.15s ease-in-out',
        ...style,
      }}
    >
      {(title || icon || action) && (
        <div
          style={{
            padding: `${metrics.space8}px ${metrics.cardPadding}px`,
            borderBottom: `1px solid ${colors.divider}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: colors.surfaceAlt,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: `${metrics.space8}px` }}>
            {icon}
            {title && (
              <h3
                style={{
                  margin: 0,
                  fontSize: typography.dashCardTitle.fontSize,
                  fontWeight: typography.dashCardTitle.fontWeight,
                  color: colors.textPrimary,
                }}
              >
                {title}
              </h3>
            )}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      <div style={{ padding: `${padding}px`, flex: 1, display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
    </div>
  );
};
