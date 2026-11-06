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
  const {
    zoom,
    zoomFactor,
    density,
    fontSize,
    resolvedTheme,
    displayScale,
    displayScaleFactor,
    layoutDensity,
    contrastMode
  } = useDisplayPreferences();

  useEffect(() => {
    // Notify resize listeners (Leaflet maps, charts, virtualized lists) of scaling adjustments
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 60);
    return () => clearTimeout(timer);
  }, [zoomFactor, density, resolvedTheme]);

  // Guarantee that document.documentElement and document.body zoom remain clean
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.style.zoom = '';
      if (document.body) {
        document.body.style.zoom = '';
      }
      document.documentElement.setAttribute('data-theme', resolvedTheme);
    }
  }, [resolvedTheme]);

  const scale = zoomFactor || displayScaleFactor || 1.0;
  const zoomClass = `scale-${(zoom || displayScale || '100%').replace('%', '')}`;
  const densityClass = `density-${(density || layoutDensity || 'comfortable').toLowerCase()}`;
  const fontClass = `font-${(fontSize || 'default').toLowerCase()}`;

  return (
    <div
      id="app-root"
      data-theme={resolvedTheme}
      data-density={density}
      className={`app-layout ${zoomClass} ${densityClass} ${fontClass} contrast-${(contrastMode || 'standard').toLowerCase()}`}
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
          backgroundColor: 'var(--color-background, #F1F5F9)',
          fontFamily: typography.fontFamily,
          color: 'var(--color-text-primary, #0F172A)',
          boxSizing: 'border-box',
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
};

export default AppLayout;
