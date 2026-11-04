/**
 * DisplayPreferencesContext.tsx
 *
 * Provides reactive display preferences (scaling, layout density, contrast mode)
 * across the authenticated application while ensuring complete isolation from
 * the authentication environment.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import {
  DisplayPreferences,
  DEFAULT_DISPLAY_PREFERENCES,
  DisplayPreferencesService,
  ScalePreset,
  LayoutDensity,
  ContrastMode,
} from '../services/displayPreferencesService';

export interface DisplayPreferencesContextType {
  preferences: DisplayPreferences;
  displayScale: ScalePreset;
  displayScaleFactor: number;
  layoutDensity: LayoutDensity;
  contrastMode: ContrastMode;
  setDisplayScale: (scale: ScalePreset) => void;
  setLayoutDensity: (density: LayoutDensity) => void;
  setContrastMode: (mode: ContrastMode) => void;
  updatePreferences: (updates: Partial<DisplayPreferences>) => void;
  resetDisplayPreferences: () => void;
  applyPreferencesForUser: (username: string | null) => void;
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
  }, [activeUsername]);

  const setDisplayScale = useCallback((scale: ScalePreset) => {
    setPreferences((prev) => {
      const updated: DisplayPreferences = {
        ...prev,
        scale,
        fontSize: DisplayPreferencesService.scaleToFontSize(scale),
      };
      DisplayPreferencesService.savePreferences(updated, activeUsername);
      return updated;
    });
  }, [activeUsername]);

  const setLayoutDensity = useCallback((density: LayoutDensity) => {
    setPreferences((prev) => {
      const updated: DisplayPreferences = {
        ...prev,
        layoutDensity: density,
      };
      DisplayPreferencesService.savePreferences(updated, activeUsername);
      return updated;
    });
  }, [activeUsername]);

  const setContrastMode = useCallback((mode: ContrastMode) => {
    setPreferences((prev) => {
      const updated: DisplayPreferences = {
        ...prev,
        contrastMode: mode,
      };
      DisplayPreferencesService.savePreferences(updated, activeUsername);
      return updated;
    });
  }, [activeUsername]);

  const updatePreferences = useCallback((updates: Partial<DisplayPreferences>) => {
    setPreferences((prev) => {
      const updated: DisplayPreferences = {
        ...prev,
        ...updates,
      };
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
  }, []);

  const factor = DisplayPreferencesService.getScaleFactor(preferences.scale);

  return (
    <DisplayPreferencesContext.Provider
      value={{
        preferences,
        displayScale: preferences.scale,
        displayScaleFactor: factor,
        layoutDensity: preferences.layoutDensity,
        contrastMode: preferences.contrastMode,
        setDisplayScale,
        setLayoutDensity,
        setContrastMode,
        updatePreferences,
        resetDisplayPreferences,
        applyPreferencesForUser,
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
