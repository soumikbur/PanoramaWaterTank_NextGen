/**
 * Typography.ts — Exact reproduction of PanoramaWaterTank Qt Typography.qml
 * Strict token definitions matching the industrial dashboard design system.
 * Dynamically scales via CSS custom properties (--font-scale).
 */

export const typography = {
  fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  fontFamilyMonospace: "Consolas, 'Liberation Mono', Menlo, Courier, monospace",

  display: {
    fontSize: 'var(--font-display-stat, 44px)',
    fontWeight: '700' as const,
    lineHeight: 1.1,
    letterSpacing: '-0.5px',
  },
  h1: {
    fontSize: 'var(--font-page-heading, 20px)',
    fontWeight: '600' as const,
    lineHeight: 1.3,
    letterSpacing: '0px',
  },
  h2: {
    fontSize: 'var(--font-section-heading, 16px)',
    fontWeight: '600' as const,
    lineHeight: 1.3,
    letterSpacing: '0px',
  },
  valueLarge: {
    fontSize: 'var(--font-value-large, 22px)',
    fontWeight: '700' as const,
    lineHeight: 1.2,
    letterSpacing: '0px',
  },
  valueMedium: {
    fontSize: 'var(--font-card-heading, 16px)',
    fontWeight: '600' as const,
    lineHeight: 1.3,
    letterSpacing: '0px',
  },
  body: {
    fontSize: 'var(--font-body, 14px)',
    fontWeight: '500' as const,
    lineHeight: 1.4,
    letterSpacing: '0px',
  },
  label: {
    fontSize: 'var(--font-table, 13px)',
    fontWeight: '500' as const,
    lineHeight: 1.3,
    letterSpacing: '0.1px',
  },
  caption: {
    fontSize: 'var(--font-secondary, 12px)',
    fontWeight: '400' as const,
    lineHeight: 1.3,
    letterSpacing: '0.15px',
  },

  // Dashboard Redesign Tokens (Typography.qml)
  dashTitle: {
    fontSize: 'var(--font-display-title, 30px)',
    fontWeight: '700' as const,
    lineHeight: 1.2,
    letterSpacing: '0px',
  },
  dashSectionTitle: {
    fontSize: 'var(--font-section-heading, 22px)',
    fontWeight: '600' as const,
    lineHeight: 1.25,
    letterSpacing: '0px',
  },
  dashCardTitle: {
    fontSize: 'var(--font-card-title, 18px)',
    fontWeight: '600' as const,
    lineHeight: 1.3,
    letterSpacing: '0px',
  },
  dashPercentage: {
    fontSize: 'var(--font-display-stat, 48px)',
    fontWeight: '700' as const,
    lineHeight: 1.0,
    letterSpacing: '-1px',
  },
  dashValue: {
    fontSize: 'var(--font-card-title, 18px)',
    fontWeight: '600' as const,
    lineHeight: 1.2,
    letterSpacing: '0px',
  },
  dashLabel: {
    fontSize: 'var(--font-body, 14px)',
    fontWeight: '500' as const,
    lineHeight: 1.3,
    letterSpacing: '0px',
  },

  // Backward compatibility aliases
  bodyPrimary: { fontSize: 'var(--font-body, 14px)', fontWeight: '500' as const },
  bodySecondary: { fontSize: 'var(--font-table, 13px)', fontWeight: '400' as const },
} as const;
