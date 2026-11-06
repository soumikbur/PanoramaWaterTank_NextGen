/**
 * Unified SCADA/HMI Design Tokens: Colors
 * Centralized design token mapping using CSS custom properties with industrial fallbacks.
 * Seamlessly adapts between Light and Dark themes across all screens and components.
 */

export const colors = {
  // Primary Accents
  primary: 'var(--color-primary, #2563EB)',
  primaryHover: 'var(--color-primary-hover, #1D4ED8)',
  primaryPressed: 'var(--color-primary-pressed, #1E40AF)',
  primarySurface: 'var(--color-primary-surface, #EFF6FF)',
  primaryBorder: 'var(--color-primary-border, #BFDBFE)',
  primarySubtle: 'var(--color-primary-subtle, #E3F2FD)',

  // Surfaces & Backgrounds
  background: 'var(--color-background, #F1F5F9)',
  surface: 'var(--color-surface, #FFFFFF)',
  surfaceAlt: 'var(--color-surface-alt, #F8FAFC)',
  surfaceHighlight: 'var(--color-surface-highlight, #EDF2F7)',

  // Dividers & Borders
  border: 'var(--color-border, #E2E8F0)',
  borderSubtle: 'var(--color-border-subtle, #F1F5F9)',
  borderStrong: 'var(--color-border-strong, #CBD5E1)',
  divider: 'var(--color-divider, #E2E8F0)',
  dividerStrong: 'var(--color-divider-strong, #CBD5E1)',

  // Operational Status Badges & Indicators
  success: 'var(--color-success, #16A34A)',
  successText: 'var(--color-success-text, #059669)',
  successSurface: 'var(--color-success-surface, #ECFDF5)',
  successBorder: 'var(--color-success-border, #DCFCE7)',

  warning: 'var(--color-warning, #D97706)',
  warningSurface: 'var(--color-warning-surface, #FEF3C7)',
  warningBorder: 'var(--color-warning-border, #FDE68A)',

  critical: 'var(--color-critical, #DC2626)',
  criticalSurface: 'var(--color-critical-surface, #FEE2E2)',
  criticalBorder: 'var(--color-critical-border, #FCA5A5)',

  offline: 'var(--color-offline, #64748B)',
  offlineSurface: 'var(--color-offline-surface, #F1F5F9)',
  offlineBorder: 'var(--color-offline-border, #E2E8F0)',

  // Typography
  textPrimary: 'var(--color-text-primary, #0F172A)',
  textSecondary: 'var(--color-text-secondary, #334155)',
  textMuted: 'var(--color-text-muted, #64748B)',
  textPlaceholder: 'var(--color-text-placeholder, #94A3B8)',
  textOnPrimary: 'var(--color-text-on-primary, #FFFFFF)',

  // Form Controls
  inputBg: 'var(--color-input-bg, #FFFFFF)',
  inputBorder: 'var(--color-input-border, #CBD5E1)',
  inputText: 'var(--color-input-text, #0F172A)',

  // Water & Telemetry Visuals
  water: 'var(--color-water, #2563EB)',
  waterTop: 'var(--color-water-top, #0284C7)',
  waterBottom: 'var(--color-water-bottom, #1D4ED8)',
  waterWaveFront: 'var(--color-water, #3B82F6)',
  waterWaveBack: 'var(--color-water-top, #60A5FA)',
  waterGlow: 'var(--color-water-glow, rgba(37, 99, 235, 0.25))',
  tankOutline: 'var(--color-tank-outline, #94A3B8)',

  // 4-Tier Rank Bar Indicators
  rankEmpty: '#DC2626',
  rankLow: '#EA580C',
  rankMedium: '#D97706',
  rankHigh: '#16A34A',

  // Shadows
  shadowSubtle: 'var(--shadow-subtle, 0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02))',
  shadowCard: 'var(--shadow-card, 0 1px 4px rgba(15, 23, 42, 0.06))',
  shadowModal: 'var(--shadow-modal, 0 20px 25px -5px rgba(15, 23, 42, 0.1), 0 8px 10px -6px rgba(15, 23, 42, 0.1))',
};
