import React from 'react';
import { colors, metrics, typography } from '../../theme';

export const Footer: React.FC = () => {
  return (
    <footer
      style={{
        height: `${metrics.footerHeight}px`,
        backgroundColor: 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
        flexShrink: 0,
        boxSizing: 'border-box',
      }}
    >
      <span
        style={{
          color: colors.textSecondary,
          fontFamily: typography.fontFamily,
          fontSize: '12px',
          fontWeight: 400,
        }}
      >
        &copy; 2026 Panorama Water Tank Monitoring System
      </span>
    </footer>
  );
};
