/**
 * Display Preferences Context — Light Mode Only
 *
 * Provides reactive controls for Display Zoom (80%-125%) and Font Size (Small, Medium, Large).
 * Enforces pure Light theme globally.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import {
  DisplayPreferences,
  DEFAULT_DISPLAY_PREFERENCES,
  DisplayPreferencesService,
  FontSize,
  ZOOM_MIN,
  ZOOM_MAX,
  ZOOM_STEP,
  ZOOM_DEFAULT,
} from '../services/displayPreferencesService';

export interface DisplayPreferencesContextType {
  preferences: DisplayPreferences;
  zoom: string; // e.g. '100%'
  zoomPercent: number; // e.g. 100
  fontSize: FontSize; // 'small' | 'medium' | 'large'
  zoomFactor: number;
  fontSizeFactor: number;

  // Zoom controls
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  setZoom: (zoom: string) => void;

  // Font size control
  setFontSize: (size: FontSize) => void;

  // Global reset
  resetDisplayPreferences: () => void;

  // Enforced Light Mode indicators
  theme: 'light';
  resolvedTheme: 'light';
  isDark: boolean;
  setTheme: (theme: any) => void;

  // Legacy compatibility helpers
  density: 'comfortable';
  sidebarMode: 'expanded';
  dashboard: {
    showSummaryCards: boolean;
    showSecondaryInfo: boolean;
    layout: 'standard';
  };
  displayScale: string;
  displayScaleFactor: number;
  layoutDensity: 'comfortable';
  contrastMode: 'STANDARD';
  setDensity: (density: any) => void;
  setSidebarMode: (mode: any) => void;
  updateDashboardPreferences: (updates: any) => void;
  updatePreferences: (updates: Partial<DisplayPreferences>) => void;
  applyPreferencesForUser: (username: string | null) => void;
  setDisplayScale: (scale: string) => void;
  setLayoutDensity: (density: any) => void;
  setContrastMode: (mode: any) => void;
}

const DisplayPreferencesContext = createContext<DisplayPreferencesContextType | undefined>(undefined);

export const DisplayPreferencesProvider: React.FC<{
  children: ReactNode;
  activeUsername?: string | null;
}> = ({ children, activeUsername }) => {
  const [preferences, setPreferences] = useState<DisplayPreferences>(() => {
    return DisplayPreferencesService.loadPreferences(activeUsername);
  });

  // Re-load preferences whenever active user changes
  useEffect(() => {
    const loaded = DisplayPreferencesService.loadPreferences(activeUsername);
    setPreferences(loaded);
    DisplayPreferencesService.applyToDOM(loaded);
  }, [activeUsername]);

  // Apply to DOM whenever preferences change
  useEffect(() => {
    DisplayPreferencesService.applyToDOM(preferences);
  }, [preferences]);

  const zoomPercent = DisplayPreferencesService.parseZoomPercent(preferences.zoom);
  const zoomFactor = zoomPercent / 100.0;
  const fontSizeFactor = DisplayPreferencesService.getFontSizeFactor(preferences.fontSize);

  const setZoom = useCallback((newZoom: string) => {
    const clamped = DisplayPreferencesService.parseZoomPercent(newZoom);
    setPreferences((prev) => {
      const updated: DisplayPreferences = { ...prev, zoom: `${clamped}%`, scale: `${clamped}%` };
      DisplayPreferencesService.savePreferences(updated, activeUsername);
      return updated;
    });
  }, [activeUsername]);

  const zoomIn = useCallback(() => {
    const next = Math.min(ZOOM_MAX, zoomPercent + ZOOM_STEP);
    setZoom(`${next}%`);
  }, [zoomPercent, setZoom]);

  const zoomOut = useCallback(() => {
    const next = Math.max(ZOOM_MIN, zoomPercent - ZOOM_STEP);
    setZoom(`${next}%`);
  }, [zoomPercent, setZoom]);

  const resetZoom = useCallback(() => {
    setZoom(`${ZOOM_DEFAULT}%`);
  }, [setZoom]);

  const setFontSize = useCallback((fontSize: FontSize) => {
    setPreferences((prev) => {
      const updated: DisplayPreferences = { ...prev, fontSize };
      DisplayPreferencesService.savePreferences(updated, activeUsername);
      return updated;
    });
  }, [activeUsername]);

  const resetDisplayPreferences = useCallback(() => {
    const defaults = DisplayPreferencesService.resetPreferences(activeUsername);
    setPreferences(defaults);
  }, [activeUsername]);

  const updatePreferences = useCallback((updates: Partial<DisplayPreferences>) => {
    setPreferences((prev) => {
      const updated: DisplayPreferences = { ...prev, ...updates };
      DisplayPreferencesService.savePreferences(updated, activeUsername);
      return updated;
    });
  }, [activeUsername]);

  const applyPreferencesForUser = useCallback((username: string | null) => {
    const loaded = DisplayPreferencesService.loadPreferences(username);
    setPreferences(loaded);
    DisplayPreferencesService.applyToDOM(loaded);
  }, []);

  return (
    <DisplayPreferencesContext.Provider
      value={{
        preferences,
        zoom: preferences.zoom,
        zoomPercent,
        fontSize: preferences.fontSize,
        zoomFactor,
        fontSizeFactor,

        zoomIn,
        zoomOut,
        resetZoom,
        setZoom,
        setFontSize,
        resetDisplayPreferences,

        theme: 'light',
        resolvedTheme: 'light',
        isDark: false,
        setTheme: () => {},

        density: 'comfortable',
        sidebarMode: 'expanded',
        dashboard: {
          showSummaryCards: true,
          showSecondaryInfo: true,
          layout: 'standard',
        },
        displayScale: preferences.zoom,
        displayScaleFactor: zoomFactor,
        layoutDensity: 'comfortable',
        contrastMode: 'STANDARD',
        setDensity: () => {},
        setSidebarMode: () => {},
        updateDashboardPreferences: () => {},
        updatePreferences,
        applyPreferencesForUser,
        setDisplayScale: setZoom,
        setLayoutDensity: () => {},
        setContrastMode: () => {},
      }}
    >
      {children}
    </DisplayPreferencesContext.Provider>
  );
};

export const useDisplayPreferences = (): DisplayPreferencesContextType => {
  const context = useContext(DisplayPreferencesContext);
  if (!context) {
    throw new Error('useDisplayPreferences must be used within a DisplayPreferencesProvider');
  }
  return context;
};

export default DisplayPreferencesContext;
