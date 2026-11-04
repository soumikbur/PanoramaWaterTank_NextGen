/**
 * AppLayout.tsx — Authenticated Application Environment Layout
 *
 * Scopes display scaling, layout density, and contrast modes strictly to the
 * authenticated shell, completely isolating the unauthenticated / login environment.
 * Ensures the root viewport remains at 1.0 while #app-root applies scoped zoom and
 * inverse dimensions to guarantee full screen coverage without coordinate distortion.
 */

import React, { useEffect } from 'react';
import { useDisplayPreferences } from '../../context/DisplayPreferencesContext';
import { colors, typography } from '../../theme';
import '../../styles/index.css';

interface AppLayoutProps {
  children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const { displayScaleFactor, layoutDensity, contrastMode } = useDisplayPreferences();

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

  const scale = displayScaleFactor || 1.2;
  const invWidth = `${100 / scale}vw`;
  const invHeight = `${100 / scale}vh`;

  return (
    <div
      id="app-root"
      className={`app-layout density-${layoutDensity.toLowerCase()} contrast-${contrastMode.toLowerCase()}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: invWidth,
        height: invHeight,
        maxHeight: invHeight,
        zoom: scale,
        overflow: 'hidden',
        position: 'relative',
        backgroundColor: colors.background,
        fontFamily: typography.fontFamily,
        color: colors.textPrimary,
        boxSizing: 'border-box',
      }}
    >
      {children}
    </div>
  );
};

export default AppLayout;
