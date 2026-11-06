/**
 * Display Preferences Service — Light Mode Only
 *
 * Persists and applies Display Zoom (80%-125%) and Font Size (Small, Medium, Large).
 * Enforces pure Light SCADA theme globally with user-level persistence.
 */

export type ThemeMode = 'light';
export type ZoomLevel = string; // '80%' to '125%'
export type FontSize = 'small' | 'medium' | 'large';
export type ScalePreset = string;

export interface DisplayPreferences {
  version: 3;
  theme: 'light';
  zoom: string; // e.g. '100%'
  fontSize: FontSize; // 'small' | 'medium' | 'large'
  // Legacy compatibility fields to prevent breaks on existing callers
  density?: 'comfortable';
  sidebarMode?: 'expanded' | 'collapsed' | 'iconOnly';
  dashboard?: {
    showSummaryCards: boolean;
    showSecondaryInfo: boolean;
    layout: 'standard' | 'compact' | 'expanded';
  };
  scale?: string;
  layoutDensity?: 'comfortable';
  contrastMode?: 'STANDARD';
}

export const ZOOM_MIN = 80;
export const ZOOM_MAX = 125;
export const ZOOM_STEP = 5;
export const ZOOM_DEFAULT = 100;

export const FONT_SIZE_FACTORS: Record<FontSize, number> = {
  small: 0.9,
  medium: 1.0,
  large: 1.15,
};

export const DEFAULT_DISPLAY_PREFERENCES: DisplayPreferences = {
  version: 3,
  theme: 'light',
  zoom: '100%',
  fontSize: 'medium',
  density: 'comfortable',
  sidebarMode: 'expanded',
  dashboard: {
    showSummaryCards: true,
    showSecondaryInfo: true,
    layout: 'standard',
  },
  scale: '100%',
  layoutDensity: 'comfortable',
  contrastMode: 'STANDARD',
};

const STORAGE_KEY_V2 = 'panorama_display_preferences_v2';
const STORAGE_KEY_V1 = 'panorama_display_preferences';
const STORAGE_KEY_LEGACY = 'panorama_display_scale';

function getStorageKey(username?: string | null): string {
  if (username && username.trim().length > 0) {
    const clean = username.trim().toLowerCase().replace(/^@/, '');
    return `${STORAGE_KEY_V2}_${clean}`;
  }
  return STORAGE_KEY_V2;
}

export class DisplayPreferencesService {
  /**
   * Globally enforced light mode.
   */
  static resolveTheme(): 'light' {
    return 'light';
  }

  /**
   * Numeric zoom percentage (clamped between 80 and 125).
   */
  static parseZoomPercent(zoomStr: string | number): number {
    const parsed = typeof zoomStr === 'number' ? zoomStr : parseInt(String(zoomStr).replace('%', ''), 10);
    if (isNaN(parsed)) return ZOOM_DEFAULT;
    return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, parsed));
  }

  /**
   * Numeric zoom factor (e.g. 0.8 to 1.25).
   */
  static getZoomFactor(zoom: string | number): number {
    return this.parseZoomPercent(zoom) / 100.0;
  }

  /**
   * Numeric font size factor (small = 0.9, medium = 1.0, large = 1.15).
   */
  static getFontSizeFactor(fontSize: FontSize | string): number {
    if (fontSize === 'small') return FONT_SIZE_FACTORS.small;
    if (fontSize === 'large') return FONT_SIZE_FACTORS.large;
    return FONT_SIZE_FACTORS.medium;
  }

  static scaleToFontSize(scale: string): FontSize {
    const val = parseInt(scale, 10);
    if (!isNaN(val)) {
      if (val <= 90) return 'small';
      if (val >= 115) return 'large';
    }
    return 'medium';
  }

  /**
   * Apply display preferences directly to document DOM without reload.
   */
  static applyToDOM(prefs: DisplayPreferences): void {
    if (typeof document === 'undefined') return;

    // Enforce light theme on document
    document.documentElement.setAttribute('data-theme', 'light');
    document.documentElement.setAttribute('data-font-size', prefs.fontSize);
    
    const zoomPercent = this.parseZoomPercent(prefs.zoom);
    document.documentElement.setAttribute('data-zoom', String(zoomPercent));

    const zoomFactor = zoomPercent / 100.0;
    const fontFactor = this.getFontSizeFactor(prefs.fontSize);
    const combinedFontScale = zoomFactor * fontFactor;

    document.documentElement.style.setProperty('--app-scale', String(zoomFactor));
    document.documentElement.style.setProperty('--font-scale', String(combinedFontScale));
    document.documentElement.style.setProperty('--space-scale', String(zoomFactor));

    // Clear any conflicting body/html zoom
    document.documentElement.style.zoom = '';
    if (document.body) {
      document.body.style.zoom = '';
    }
  }

  /**
   * Load display preferences for a specific authenticated user, falling back to global or default.
   */
  static loadPreferences(username?: string | null): DisplayPreferences {
    if (typeof localStorage === 'undefined') {
      return { ...DEFAULT_DISPLAY_PREFERENCES };
    }

    try {
      if (username) {
        const userRaw = localStorage.getItem(getStorageKey(username));
        if (userRaw) {
          return this.sanitizePreferences(JSON.parse(userRaw));
        }
      }

      const globalRaw = localStorage.getItem(STORAGE_KEY_V2);
      if (globalRaw) {
        return this.sanitizePreferences(JSON.parse(globalRaw));
      }

      const v1Raw = localStorage.getItem(STORAGE_KEY_V1);
      if (v1Raw) {
        const migrated = this.sanitizePreferences(JSON.parse(v1Raw));
        this.savePreferences(migrated, username);
        return migrated;
      }
    } catch (e) {
      console.warn('[DisplayPreferencesService] Error reading stored preferences:', e);
    }

    return { ...DEFAULT_DISPLAY_PREFERENCES };
  }

  /**
   * Persist display preferences immediately to localStorage and apply to DOM.
   */
  static savePreferences(preferences: DisplayPreferences, username?: string | null): void {
    if (typeof localStorage === 'undefined') return;

    try {
      const sanitized = this.sanitizePreferences(preferences);
      const json = JSON.stringify(sanitized);

      if (username) {
        localStorage.setItem(getStorageKey(username), json);
      }

      localStorage.setItem(STORAGE_KEY_V2, json);
      localStorage.setItem(STORAGE_KEY_V1, json);
      localStorage.setItem(STORAGE_KEY_LEGACY, sanitized.zoom);

      this.applyToDOM(sanitized);
    } catch (e) {
      console.error('[DisplayPreferencesService] Error saving preferences:', e);
    }
  }

  /**
   * Reset display preferences to system defaults: 100% zoom and Medium font size.
   */
  static resetPreferences(username?: string | null): DisplayPreferences {
    const defaults = { ...DEFAULT_DISPLAY_PREFERENCES };
    this.savePreferences(defaults, username);
    return defaults;
  }

  static sanitizePreferences(raw: any): DisplayPreferences {
    if (!raw || typeof raw !== 'object') {
      return { ...DEFAULT_DISPLAY_PREFERENCES };
    }

    // Zoom: 80% to 125%
    let zoomVal = ZOOM_DEFAULT;
    const rawZoom = raw.zoom || raw.scale;
    if (rawZoom !== undefined) {
      zoomVal = this.parseZoomPercent(rawZoom);
    }

    // Font size: 'small' | 'medium' | 'large'
    let fontSize: FontSize = 'medium';
    if (raw.fontSize === 'small' || raw.fontSize === 'compact') {
      fontSize = 'small';
    } else if (raw.fontSize === 'large') {
      fontSize = 'large';
    } else if (raw.fontSize === 'extralarge' || raw.fontSize === 'maximum') {
      fontSize = 'large';
    } else {
      fontSize = 'medium';
    }

    return {
      version: 3,
      theme: 'light',
      zoom: `${zoomVal}%`,
      fontSize,
      density: 'comfortable',
      sidebarMode: 'expanded',
      dashboard: {
        showSummaryCards: true,
        showSecondaryInfo: true,
        layout: 'standard',
      },
      scale: `${zoomVal}%`,
      layoutDensity: 'comfortable',
      contrastMode: 'STANDARD',
    };
  }
}
