/**
 * Display Preferences Service.
 *
 * Centralizes user-specific display scaling, typography preferences, layout density,
 * and visual contrast modes. Persists settings across reloads and browser restarts
 * with user-level isolation.
 *
 * Global default scale is 100% (Small / Standard SCADA baseline).
 */

export type ScalePreset = '90%' | '100%' | '110%' | '120%' | '130%' | '150%';
export type LayoutDensity = 'COMFORTABLE' | 'COMPACT';
export type ContrastMode = 'STANDARD' | 'HIGH_CONTRAST';

export interface DisplayPreferences {
  scale: ScalePreset;
  fontSize: 'compact' | 'small' | 'normal' | 'large' | 'extralarge' | 'maximum';
  layoutDensity: LayoutDensity;
  contrastMode: ContrastMode;
}

export const SCALE_FACTORS: Record<ScalePreset, number> = {
  '90%': 0.9,
  '100%': 1.0,
  '110%': 1.1,
  '120%': 1.2,
  '130%': 1.3,
  '150%': 1.5,
};

export const DEFAULT_DISPLAY_PREFERENCES: DisplayPreferences = {
  scale: '100%',
  fontSize: 'small',
  layoutDensity: 'COMFORTABLE',
  contrastMode: 'STANDARD',
};

const BASE_STORAGE_KEY = 'panorama_display_preferences';
const LEGACY_STORAGE_KEY = 'panorama_display_scale';

function getStorageKey(username?: string | null): string {
  if (username && username.trim().length > 0) {
    const clean = username.trim().toLowerCase().replace(/^@/, '');
    return `${BASE_STORAGE_KEY}_${clean}`;
  }
  return BASE_STORAGE_KEY;
}

export class DisplayPreferencesService {
  /**
   * Load display preferences for a specific authenticated user, falling back to global or default.
   */
  static loadPreferences(username?: string | null): DisplayPreferences {
    if (typeof localStorage === 'undefined') {
      return { ...DEFAULT_DISPLAY_PREFERENCES };
    }

    try {
      // 1. Try user-specific storage key
      if (username) {
        const userRaw = localStorage.getItem(getStorageKey(username));
        if (userRaw) {
          const parsed = JSON.parse(userRaw);
          return this.sanitizePreferences(parsed);
        }
      }

      // 2. Try global shared preferences key
      const globalRaw = localStorage.getItem(BASE_STORAGE_KEY);
      if (globalRaw) {
        const parsed = JSON.parse(globalRaw);
        return this.sanitizePreferences(parsed);
      }

      // 3. Fallback: migrate legacy single scale string if present
      const legacyScale = localStorage.getItem(LEGACY_STORAGE_KEY) as ScalePreset | null;
      if (legacyScale && SCALE_FACTORS[legacyScale] !== undefined) {
        const migrated: DisplayPreferences = {
          ...DEFAULT_DISPLAY_PREFERENCES,
          scale: legacyScale,
          fontSize: this.scaleToFontSize(legacyScale),
        };
        this.savePreferences(migrated, username);
        return migrated;
      }
    } catch (e) {
      console.warn('[DisplayPreferencesService] Error reading stored preferences:', e);
    }

    return { ...DEFAULT_DISPLAY_PREFERENCES };
  }

  /**
   * Persist display preferences immediately to localStorage.
   */
  static savePreferences(preferences: DisplayPreferences, username?: string | null): void {
    if (typeof localStorage === 'undefined') return;

    try {
      const sanitized = this.sanitizePreferences(preferences);
      const json = JSON.stringify(sanitized);

      // Save user-specific preference
      if (username) {
        localStorage.setItem(getStorageKey(username), json);
      }

      // Also update baseline global preference and legacy scale key for compatibility
      localStorage.setItem(BASE_STORAGE_KEY, json);
      localStorage.setItem(LEGACY_STORAGE_KEY, sanitized.scale);
    } catch (e) {
      console.error('[DisplayPreferencesService] Error saving preferences:', e);
    }
  }

  /**
   * Reset display preferences to default (100% Small, Comfortable, Standard).
   */
  static resetPreferences(username?: string | null): DisplayPreferences {
    const defaults = { ...DEFAULT_DISPLAY_PREFERENCES };
    this.savePreferences(defaults, username);
    return defaults;
  }

  /**
   * Numeric scale factor (0.9 to 1.5). Default is 1.0.
   */
  static getScaleFactor(scale: ScalePreset | string): number {
    if (scale in SCALE_FACTORS) {
      return SCALE_FACTORS[scale as ScalePreset];
    }
    const parsed = parseFloat(scale);
    if (!isNaN(parsed) && parsed > 0) {
      return Math.max(0.8, Math.min(1.8, parsed / 100));
    }
    return 1.0;
  }

  static scaleToFontSize(scale: ScalePreset): DisplayPreferences['fontSize'] {
    switch (scale) {
      case '90%':
        return 'compact';
      case '100%':
        return 'small';
      case '110%':
        return 'normal';
      case '120%':
        return 'large';
      case '130%':
        return 'extralarge';
      case '150%':
        return 'maximum';
      default:
        return 'small';
    }
  }

  private static sanitizePreferences(raw: any): DisplayPreferences {
    const scale: ScalePreset =
      raw && raw.scale && SCALE_FACTORS[raw.scale as ScalePreset] !== undefined
        ? (raw.scale as ScalePreset)
        : DEFAULT_DISPLAY_PREFERENCES.scale;

    const density: LayoutDensity =
      raw && (raw.layoutDensity === 'COMPACT' || raw.layoutDensity === 'COMFORTABLE')
        ? raw.layoutDensity
        : DEFAULT_DISPLAY_PREFERENCES.layoutDensity;

    const contrast: ContrastMode =
      raw && (raw.contrastMode === 'HIGH_CONTRAST' || raw.contrastMode === 'STANDARD')
        ? raw.contrastMode
        : DEFAULT_DISPLAY_PREFERENCES.contrastMode;

    return {
      scale,
      fontSize: this.scaleToFontSize(scale),
      layoutDensity: density,
      contrastMode: contrast,
    };
  }
}
