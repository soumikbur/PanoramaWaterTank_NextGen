/**
 * Unified SCADA/HMI Design Tokens: Colors
 * Standardized across all NextGen pages for a crisp, high-contrast industrial light theme.
 */

export const colors = {
  // Primary Accents
  primary: '#2563EB',         // Industrial Royal Blue
  primaryHover: '#1D4ED8',
  primaryPressed: '#1E40AF',
  primarySurface: '#EFF6FF',   // Subtle Ice Blue fill
  primaryBorder: '#BFDBFE',

  // Surfaces & Backgrounds
  background: '#F8FAFC',       // Cool Slate Canvas
  surface: '#FFFFFF',          // Clean White Cards & Headers
  surfaceAlt: '#F1F5F9',       // Muted Sections / Table Headers
  surfaceHighlight: '#F8FAFC',

  // Dividers & Borders
  border: '#E2E8F0',           // 1px Slate Border
  borderSubtle: '#F1F5F9',
  borderStrong: '#CBD5E1',     // Input & control borders
  divider: '#E2E8F0',
  dividerStrong: '#CBD5E1',

  // Operational Status Badges & Indicators
  success: '#16A34A',          // Emerald Green (Online / All Normal)
  successText: '#059669',
  successSurface: '#ECFDF5',
  successBorder: '#DCFCE7',

  warning: '#D97706',          // Amber Orange (Low Warning)
  warningSurface: '#FEF3C7',
  warningBorder: '#FDE68A',

  critical: '#DC2626',         // Crimson Red (Critical Low / Fault)
  criticalSurface: '#FEE2E2',
  criticalBorder: '#FCA5A5',

  offline: '#64748B',          // Slate Grey (Gateway / Broker Offline)
  offlineSurface: '#F1F5F9',
  offlineBorder: '#E2E8F0',

  // Typography
  textPrimary: '#0F172A',      // High-contrast Navy/Charcoal
  textSecondary: '#475569',    // Body & secondary labels
  textMuted: '#64748B',        // Subtitles, table headers, units
  textPlaceholder: '#94A3B8',  // Empty state & placeholders
  textOnPrimary: '#FFFFFF',

  // Water & Telemetry Visuals
  water: '#2563EB',
  waterTop: '#0284C7',
  waterBottom: '#1D4ED8',
  waterWaveFront: '#3B82F6',
  waterWaveBack: '#60A5FA',
  waterGlow: 'rgba(37, 99, 235, 0.25)',
  tankOutline: '#94A3B8',

  // 4-Tier Rank Bar Indicators
  rankEmpty: '#DC2626',
  rankLow: '#EA580C',
  rankMedium: '#D97706',
  rankHigh: '#16A34A',

  // Shadows
  shadowSubtle: '0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02)',
  shadowCard: '0 1px 4px rgba(15, 23, 42, 0.06)',
  shadowModal: '0 20px 25px -5px rgba(15, 23, 42, 0.1), 0 8px 10px -6px rgba(15, 23, 42, 0.1)',
};
