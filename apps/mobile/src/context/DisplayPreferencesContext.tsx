/**
 * DisplayPreferencesContext.tsx
 *
 * Provides reactive display preferences (theme, scaling/zoom, typography, density, sidebar, dashboard)
 * across the authenticated application while ensuring complete isolation from the authentication environment.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import {
  DisplayPreferences,
  DEFAULT_DISPLAY_PREFERENCES,
  DisplayPreferencesService,
  ThemeMode,
  ZoomLevel,
  FontSize,
  Density,
  SidebarMode,
  DashboardPreferences,
} from '../services/displayPreferencesService';

export interface DisplayPreferencesContextType {
  preferences: DisplayPreferences;
  theme: ThemeMode;
  resolvedTheme: 'light' | 'dark';
  isDark: boolean;
  zoom: ZoomLevel;
  zoomFactor: number;
  fontSize: FontSize;
  fontSizeFactor: number;
  density: Density;
  sidebarMode: SidebarMode;
  dashboard: DashboardPreferences;

  // Setters
  setTheme: (theme: ThemeMode) => void;
  setZoom: (zoom: ZoomLevel) => void;
  setFontSize: (size: FontSize) => void;
  setDensity: (density: Density) => void;
  setSidebarMode: (mode: SidebarMode) => void;
  updateDashboardPreferences: (updates: Partial<DashboardPreferences>) => void;
  updatePreferences: (updates: Partial<DisplayPreferences>) => void;
  resetDisplayPreferences: () => void;
  applyPreferencesForUser: (username: string | null) => void;

  // Legacy compatibility
  displayScale: ZoomLevel;
  displayScaleFactor: number;
  layoutDensity: Density;
  contrastMode: 'STANDARD' | 'HIGH_CONTRAST';
  setDisplayScale: (scale: ZoomLevel) => void;
  setLayoutDensity: (density: Density) => void;
  setContrastMode: (mode: 'STANDARD' | 'HIGH_CONTRAST') => void;
}

const DisplayPreferencesContext = createContext<DisplayPreferencesContextType | undefined>(undefined);

export const DisplayPreferencesProvider: React.FC<{
  children: ReactNode;
  activeUsername?: string | null;
}> = ({ children, activeUsername }) => {
  const [preferences, setPreferences] = useState<DisplayPreferences>(() => {
    return DisplayPreferencesService.loadPreferences(activeUsername);
  });

  const [systemIsDark, setSystemIsDark] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  // Listen for system theme changes in real-time
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      setSystemIsDark(e.matches);
    };
    if (media.addEventListener) {
      media.addEventListener('change', handler);
      return () => media.removeEventListener('change', handler);
    } else if ((media as any).addListener) {
      (media as any).addListener(handler);
      return () => (media as any).removeListener(handler);
    }
  }, []);

  // Re-load preferences whenever active user changes
  useEffect(() => {
    const loaded = DisplayPreferencesService.loadPreferences(activeUsername);
    setPreferences(loaded);
    DisplayPreferencesService.applyToDOM(loaded);
  }, [activeUsername]);

  // Apply to DOM whenever preferences or system theme changes
  useEffect(() => {
    DisplayPreferencesService.applyToDOM(preferences);
  }, [preferences, systemIsDark]);

  const setTheme = useCallback((theme: ThemeMode) => {
    setPreferences((prev) => {
      const updated: DisplayPreferences = { ...prev, theme };
      DisplayPreferencesService.savePreferences(updated, activeUsername);
      return updated;
    });
  }, [activeUsername]);

  const setZoom = useCallback((zoom: ZoomLevel) => {
    setPreferences((prev) => {
      const updated: DisplayPreferences = { ...prev, zoom, scale: zoom };
      DisplayPreferencesService.savePreferences(updated, activeUsername);
      return updated;
    });
  }, [activeUsername]);

  const setFontSize = useCallback((fontSize: FontSize) => {
    setPreferences((prev) => {
      const updated: DisplayPreferences = { ...prev, fontSize };
      DisplayPreferencesService.savePreferences(updated, activeUsername);
      return updated;
    });
  }, [activeUsername]);

  const setDensity = useCallback((density: Density) => {
    setPreferences((prev) => {
      const updated: DisplayPreferences = { ...prev, density, layoutDensity: density };
      DisplayPreferencesService.savePreferences(updated, activeUsername);
      return updated;
    });
  }, [activeUsername]);

  const setSidebarMode = useCallback((sidebarMode: SidebarMode) => {
    setPreferences((prev) => {
      const updated: DisplayPreferences = { ...prev, sidebarMode };
      DisplayPreferencesService.savePreferences(updated, activeUsername);
      return updated;
    });
  }, [activeUsername]);

  const updateDashboardPreferences = useCallback((updates: Partial<DashboardPreferences>) => {
    setPreferences((prev) => {
      const updated: DisplayPreferences = {
        ...prev,
        dashboard: { ...prev.dashboard, ...updates },
      };
      DisplayPreferencesService.savePreferences(updated, activeUsername);
      return updated;
    });
  }, [activeUsername]);

  const updatePreferences = useCallback((updates: Partial<DisplayPreferences>) => {
    setPreferences((prev) => {
      const updated: DisplayPreferences = { ...prev, ...updates };
      DisplayPreferencesService.savePreferences(updated, activeUsername);
      return updated;
    });
  }, [activeUsername]);

  const resetDisplayPreferences = useCallback(() => {
    const defaults = DisplayPreferencesService.resetPreferences(activeUsername);
    setPreferences(defaults);
  }, [activeUsername]);

  const applyPreferencesForUser = useCallback((username: string | null) => {
    const loaded = DisplayPreferencesService.loadPreferences(username);
    setPreferences(loaded);
    DisplayPreferencesService.applyToDOM(loaded);
  }, []);

  const resolvedTheme: 'light' | 'dark' =
    preferences.theme === 'system'
      ? (systemIsDark ? 'dark' : 'light')
      : preferences.theme;

  const isDark = resolvedTheme === 'dark';
  const zoomFactor = DisplayPreferencesService.getZoomFactor(preferences.zoom);
  const fontSizeFactor = DisplayPreferencesService.getFontSizeFactor(preferences.fontSize);

  // Legacy setters
  const setDisplayScale = setZoom;
  const setLayoutDensity = setDensity;
  const setContrastMode = useCallback((mode: 'STANDARD' | 'HIGH_CONTRAST') => {
    updatePreferences({ contrastMode: mode });
  }, [updatePreferences]);

  return (
    <DisplayPreferencesContext.Provider
      value={{
        preferences,
        theme: preferences.theme,
        resolvedTheme,
        isDark,
        zoom: preferences.zoom,
        zoomFactor,
        fontSize: preferences.fontSize,
        fontSizeFactor,
        density: preferences.density,
        sidebarMode: preferences.sidebarMode,
        dashboard: preferences.dashboard,

        setTheme,
        setZoom,
        setFontSize,
        setDensity,
        setSidebarMode,
        updateDashboardPreferences,
        updatePreferences,
        resetDisplayPreferences,
        applyPreferencesForUser,

        // Legacy compatibility
        displayScale: preferences.zoom,
        displayScaleFactor: zoomFactor,
        layoutDensity: preferences.density,
        contrastMode: preferences.contrastMode || 'STANDARD',
        setDisplayScale,
        setLayoutDensity,
        setContrastMode,
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
