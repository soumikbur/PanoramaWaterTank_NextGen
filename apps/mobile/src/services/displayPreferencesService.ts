/**
 * Display Preferences Service.
 *
 * Centralizes user-specific display scaling, typography preferences, layout density,
 * visual contrast, theme (light/dark/system), sidebar behavior, and dashboard layouts.
 *
 * Persists settings across reloads and browser restarts with user-level isolation.
 * Safe against missing/invalid values.
 */

export type ThemeMode = 'light' | 'dark' | 'system';
export type ZoomLevel = '80%' | '90%' | '100%' | '110%' | '125%' | '150%';
export type FontSize = 'small' | 'default' | 'large' | 'extralarge';
export type Density = 'compact' | 'comfortable' | 'spacious';
export type SidebarMode = 'expanded' | 'collapsed' | 'iconOnly';

export interface DashboardPreferences {
  showSummaryCards: boolean;
  showSecondaryInfo: boolean;
  layout: 'standard' | 'compact' | 'expanded';
}

export interface DisplayPreferences {
  version: 2;
  theme: ThemeMode;
  zoom: ZoomLevel;
  fontSize: FontSize;
  density: Density;
  sidebarMode: SidebarMode;
  dashboard: DashboardPreferences;
  // Legacy compatibility fields
  scale?: ZoomLevel;
  layoutDensity?: Density;
  contrastMode?: 'STANDARD' | 'HIGH_CONTRAST';
}

export const ZOOM_FACTORS: Record<ZoomLevel, number> = {
  '80%': 0.8,
  '90%': 0.9,
  '100%': 1.0,
  '110%': 1.1,
  '125%': 1.25,
  '150%': 1.5,
};

export const FONT_SIZE_FACTORS: Record<FontSize, number> = {
  'small': 0.9,
  'default': 1.0,
  'large': 1.15,
  'extralarge': 1.3,
};

export const DEFAULT_DISPLAY_PREFERENCES: DisplayPreferences = {
  version: 2,
  theme: 'system',
  zoom: '100%',
  fontSize: 'default',
  density: 'comfortable',
  sidebarMode: 'expanded',
  dashboard: {
    showSummaryCards: true,
    showSecondaryInfo: true,
    layout: 'standard',
  },
  // Legacy compatibility
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
   * Determine whether dark mode should be applied based on the theme setting.
   */
  static resolveTheme(theme: ThemeMode): 'light' | 'dark' {
    if (theme === 'dark') return 'dark';
    if (theme === 'light') return 'light';
    // System default
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  }

  /**
   * Apply display preferences directly to document DOM without reload.
   */
  static applyToDOM(prefs: DisplayPreferences): void {
    if (typeof document === 'undefined') return;

    const resolvedTheme = this.resolveTheme(prefs.theme);
    document.documentElement.setAttribute('data-theme', resolvedTheme);
    document.documentElement.setAttribute('data-density', prefs.density);
    document.documentElement.setAttribute('data-font-size', prefs.fontSize);
    document.documentElement.setAttribute('data-zoom', prefs.zoom.replace('%', ''));

    const zoomFactor = ZOOM_FACTORS[prefs.zoom] || 1.0;
    const fontFactor = FONT_SIZE_FACTORS[prefs.fontSize] || 1.0;
    const combinedFontScale = zoomFactor * fontFactor;

    document.documentElement.style.setProperty('--app-scale', String(zoomFactor));
    document.documentElement.style.setProperty('--font-scale', String(combinedFontScale));

    const densitySpaceScale = prefs.density === 'compact' ? 0.82 : prefs.density === 'spacious' ? 1.2 : 1.0;
    document.documentElement.style.setProperty('--space-scale', String(zoomFactor * densitySpaceScale));

    // Guarantee that native document zoom remains clean to avoid breaking transforms
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
      // 1. Try user-scoped V2 key
      if (username) {
        const userRaw = localStorage.getItem(getStorageKey(username));
        if (userRaw) {
          const parsed = JSON.parse(userRaw);
          return this.sanitizePreferences(parsed);
        }
      }

      // 2. Try global shared V2 key
      const globalRaw = localStorage.getItem(STORAGE_KEY_V2);
      if (globalRaw) {
        const parsed = JSON.parse(globalRaw);
        return this.sanitizePreferences(parsed);
      }

      // 3. Fallback: migrate from V1 storage key if present
      const v1Raw = localStorage.getItem(STORAGE_KEY_V1);
      if (v1Raw) {
        const parsed = JSON.parse(v1Raw);
        const migrated = this.sanitizePreferences(parsed);
        this.savePreferences(migrated, username);
        return migrated;
      }

      // 4. Fallback: migrate from legacy single scale string
      const legacyScale = localStorage.getItem(STORAGE_KEY_LEGACY);
      if (legacyScale && (ZOOM_FACTORS as any)[legacyScale] !== undefined) {
        const migrated: DisplayPreferences = {
          ...DEFAULT_DISPLAY_PREFERENCES,
          zoom: legacyScale as ZoomLevel,
          scale: legacyScale as ZoomLevel,
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
   * Persist display preferences immediately to localStorage and apply to DOM.
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

      // Save global baseline
      localStorage.setItem(STORAGE_KEY_V2, json);
      localStorage.setItem(STORAGE_KEY_V1, json);
      localStorage.setItem(STORAGE_KEY_LEGACY, sanitized.zoom);

      // Immediately apply to DOM
      this.applyToDOM(sanitized);
    } catch (e) {
      console.error('[DisplayPreferencesService] Error saving preferences:', e);
    }
  }

  /**
   * Reset display preferences to system defaults with user confirmation.
   */
  static resetPreferences(username?: string | null): DisplayPreferences {
    const defaults = { ...DEFAULT_DISPLAY_PREFERENCES };
    this.savePreferences(defaults, username);
    return defaults;
  }

  /**
   * Numeric zoom factor (0.8 to 1.5). Default is 1.0.
   */
  static getZoomFactor(zoom: ZoomLevel | string): number {
    if (zoom in ZOOM_FACTORS) {
      return ZOOM_FACTORS[zoom as ZoomLevel];
    }
    const parsed = parseFloat(zoom);
    if (!isNaN(parsed) && parsed > 0) {
      return Math.max(0.75, Math.min(1.8, parsed / 100));
    }
    return 1.0;
  }

  static getFontSizeFactor(fontSize: FontSize | string): number {
    if (fontSize in FONT_SIZE_FACTORS) {
      return FONT_SIZE_FACTORS[fontSize as FontSize];
    }
    return 1.0;
  }

  private static sanitizePreferences(raw: any): DisplayPreferences {
    if (!raw || typeof raw !== 'object') {
      return { ...DEFAULT_DISPLAY_PREFERENCES };
    }

    // Theme: 'light' | 'dark' | 'system'
    const theme: ThemeMode =
      raw.theme === 'light' || raw.theme === 'dark' || raw.theme === 'system'
        ? raw.theme
        : 'system';

    // Zoom: '80%' | '90%' | '100%' | '110%' | '125%' | '150%'
    // Migrate legacy scale: '120%' -> '125%', '130%' -> '125%'
    let zoom: ZoomLevel = '100%';
    const rawZoom = raw.zoom || raw.scale;
    if (rawZoom === '80%' || rawZoom === '90%' || rawZoom === '100%' || rawZoom === '110%' || rawZoom === '125%' || rawZoom === '150%') {
      zoom = rawZoom;
    } else if (rawZoom === '120%' || rawZoom === '130%') {
      zoom = '125%';
    }

    // Font size: 'small' | 'default' | 'large' | 'extralarge'
    let fontSize: FontSize = 'default';
    if (raw.fontSize === 'small' || raw.fontSize === 'default' || raw.fontSize === 'large' || raw.fontSize === 'extralarge') {
      fontSize = raw.fontSize;
    } else if (raw.fontSize === 'compact') {
      fontSize = 'small';
    } else if (raw.fontSize === 'normal') {
      fontSize = 'default';
    } else if (raw.fontSize === 'maximum') {
      fontSize = 'extralarge';
    }

    // Density: 'compact' | 'comfortable' | 'spacious'
    let density: Density = 'comfortable';
    const rawDensity = (raw.density || raw.layoutDensity || '').toLowerCase();
    if (rawDensity === 'compact' || rawDensity === 'comfortable' || rawDensity === 'spacious') {
      density = rawDensity as Density;
    }

    // Sidebar: 'expanded' | 'collapsed' | 'iconOnly'
    let sidebarMode: SidebarMode = 'expanded';
    if (raw.sidebarMode === 'expanded' || raw.sidebarMode === 'collapsed' || raw.sidebarMode === 'iconOnly') {
      sidebarMode = raw.sidebarMode;
    }

    // Dashboard preferences
    const dashboard: DashboardPreferences = {
      showSummaryCards: raw.dashboard && typeof raw.dashboard.showSummaryCards === 'boolean'
        ? raw.dashboard.showSummaryCards
        : true,
      showSecondaryInfo: raw.dashboard && typeof raw.dashboard.showSecondaryInfo === 'boolean'
        ? raw.dashboard.showSecondaryInfo
        : true,
      layout: raw.dashboard && (raw.dashboard.layout === 'standard' || raw.dashboard.layout === 'compact' || raw.dashboard.layout === 'expanded')
        ? raw.dashboard.layout
        : 'standard',
    };

    return {
      version: 2,
      theme,
      zoom,
      fontSize,
      density,
      sidebarMode,
      dashboard,
      // Legacy compatibility
      scale: zoom,
      layoutDensity: density,
      contrastMode: raw.contrastMode === 'HIGH_CONTRAST' ? 'HIGH_CONTRAST' : 'STANDARD',
    };
  }
}
