/**
 * Typography.ts — Exact reproduction of PanoramaWaterTank Qt Typography.qml
 * Strict token definitions matching the industrial dashboard design system.
 */

export const typography = {
  fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  fontFamilyMonospace: "Consolas, 'Liberation Mono', Menlo, Courier, monospace",

  display: {
    fontSize: '44px',
    fontWeight: '700' as const,
    lineHeight: 1.1,
    letterSpacing: '-0.5px',
  },
  h1: {
    fontSize: '20px',
    fontWeight: '600' as const,
    lineHeight: 1.3,
    letterSpacing: '0px',
  },
  h2: {
    fontSize: '16px',
    fontWeight: '600' as const,
    lineHeight: 1.3,
    letterSpacing: '0px',
  },
  valueLarge: {
    fontSize: '22px',
    fontWeight: '700' as const,
    lineHeight: 1.2,
    letterSpacing: '0px',
  },
  valueMedium: {
    fontSize: '16px',
    fontWeight: '600' as const,
    lineHeight: 1.3,
    letterSpacing: '0px',
  },
  body: {
    fontSize: '14px',
    fontWeight: '500' as const,
    lineHeight: 1.4,
    letterSpacing: '0px',
  },
  label: {
    fontSize: '13px',
    fontWeight: '500' as const,
    lineHeight: 1.3,
    letterSpacing: '0.1px',
  },
  caption: {
    fontSize: '12px',
    fontWeight: '400' as const,
    lineHeight: 1.3,
    letterSpacing: '0.15px',
  },

  // Dashboard Redesign Tokens (Typography.qml)
  dashTitle: {
    fontSize: '30px',
    fontWeight: '700' as const,
    lineHeight: 1.2,
    letterSpacing: '0px',
  },
  dashSectionTitle: {
    fontSize: '22px',
    fontWeight: '600' as const,
    lineHeight: 1.25,
    letterSpacing: '0px',
  },
  dashCardTitle: {
    fontSize: '18px',
    fontWeight: '600' as const,
    lineHeight: 1.3,
    letterSpacing: '0px',
  },
  dashPercentage: {
    fontSize: '48px',
    fontWeight: '700' as const,
    lineHeight: 1.0,
    letterSpacing: '-1px',
  },
  dashValue: {
    fontSize: '18px',
    fontWeight: '600' as const,
    lineHeight: 1.2,
    letterSpacing: '0px',
  },
  dashLabel: {
    fontSize: '14px',
    fontWeight: '500' as const,
    lineHeight: 1.3,
    letterSpacing: '0px',
  },

  // Backward compatibility aliases
  bodyPrimary: { fontSize: '14px', fontWeight: '500' as const },
  bodySecondary: { fontSize: '13px', fontWeight: '400' as const },
} as const;
