/**
 * AppLayout.tsx — Authenticated Application Environment Layout
 *
 * Scopes display scaling, typography, layout density, and contrast modes strictly
 * to the authenticated shell using a centralized design-token system (--app-scale, --font-scale).
 * Completely isolates the authentication environment.
 *
 * Never uses CSS zoom or transform: scale(). Fills the browser viewport naturally at 100% width and height.
 */

import React, { useEffect } from 'react';
import { useDisplayPreferences } from '../../context/DisplayPreferencesContext';
import { colors, typography } from '../../theme';
import '../../styles/index.css';

interface AppLayoutProps {
  children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const { displayScale, displayScaleFactor, layoutDensity, contrastMode } = useDisplayPreferences();

  useEffect(() => {
    // Notify resize listeners (Leaflet maps, charts, virtualized lists) of scaling adjustments
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 60);
    return () => clearTimeout(timer);
  }, [displayScaleFactor, layoutDensity]);

  // Guarantee that document.documentElement and document.body zoom remain clean
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.style.zoom = '';
      if (document.body) {
        document.body.style.zoom = '';
      }
    }
  }, []);

  const scale = displayScaleFactor || 1.0;
  const scaleClass = `scale-${(displayScale || '100%').replace('%', '')}`;

  return (
    <div
      id="app-root"
      className={`app-layout ${scaleClass} density-${layoutDensity.toLowerCase()} contrast-${contrastMode.toLowerCase()}`}
      style={
        {
          '--app-scale': scale,
          '--font-scale': scale,
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100vh',
          maxHeight: '100vh',
          overflow: 'hidden',
          position: 'relative',
          backgroundColor: colors.background,
          fontFamily: typography.fontFamily,
          color: colors.textPrimary,
          boxSizing: 'border-box',
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
};

export default AppLayout;
