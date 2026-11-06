import React, { useState } from 'react';
import { colors, typography, metrics } from '../../theme';
import { useApp } from '../../state/AppContext';
import { useDisplayPreferences } from '../../context/DisplayPreferencesContext';
import {
  ThemeMode,
  ZoomLevel,
  FontSize,
  Density,
  SidebarMode,
} from '../../services/displayPreferencesService';
import {
  Sun,
  Moon,
  Monitor,
  ZoomIn,
  Type,
  LayoutGrid,
  Menu,
  RotateCcw,
  Check,
  AlertTriangle,
  Sliders,
  Sparkles,
  Eye,
  EyeOff,
  User,
  ShieldCheck,
} from 'lucide-react';

interface DisplaySettingsPanelProps {
  isAdminView?: boolean;
}

export const DisplaySettingsPanel: React.FC<DisplaySettingsPanelProps> = ({ isAdminView = false }) => {
  const { currentUser } = useApp();
  const {
    theme,
    resolvedTheme,
    isDark,
    zoom,
    fontSize,
    density,
    sidebarMode,
    dashboard,
    setTheme,
    setZoom,
    setFontSize,
    setDensity,
    setSidebarMode,
    updateDashboardPreferences,
    resetDisplayPreferences,
  } = useDisplayPreferences();

  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const zoomOptions: { label: string; value: ZoomLevel; desc: string }[] = [
    { label: 'Compact', value: '80%', desc: 'Ultra-dense overview' },
    { label: 'Small', value: '90%', desc: 'Space-saving' },
    { label: 'Default', value: '100%', desc: 'Recommended SCADA baseline' },
    { label: 'Large', value: '110%', desc: 'Enhanced clarity' },
    { label: 'Extra Large', value: '125%', desc: 'Comfort viewing' },
    { label: 'Maximum', value: '150%', desc: 'High visibility / Wallboards' },
  ];

  const fontSizeOptions: { label: string; value: FontSize; px: string }[] = [
    { label: 'Small', value: 'small', px: '~13px' },
    { label: 'Default', value: 'default', px: '~14px' },
    { label: 'Large', value: 'large', px: '~16px' },
    { label: 'Extra Large', value: 'extralarge', px: '~18px' },
  ];

  const densityOptions: { label: string; value: Density; desc: string }[] = [
    { label: 'Compact', value: 'compact', desc: 'Dense padding, smaller row heights, maximum data visible' },
    { label: 'Comfortable', value: 'comfortable', desc: 'Standard balanced industrial spacing (Recommended)' },
    { label: 'Spacious', value: 'spacious', desc: 'Generous padding and separation for touch / relaxed viewing' },
  ];

  const sidebarOptions: { label: string; value: SidebarMode; desc: string }[] = [
    { label: 'Expanded', value: 'expanded', desc: 'Full 224px navigation with module labels and metrics' },
    { label: 'Collapsed', value: 'collapsed', desc: '64px width with compact tooltips' },
    { label: 'Icon-Only', value: 'iconOnly', desc: 'Minimalist 64px icon navigation' },
  ];

  const handleReset = () => {
    resetDisplayPreferences();
    setShowResetConfirm(false);
    showToast('Display settings restored to system defaults.');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1000px', margin: '0 auto' }}>
      {/* Toast Notification */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            backgroundColor: isDark ? '#1E293B' : '#0F172A',
            color: '#FFFFFF',
            padding: '10px 18px',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 600,
            boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Check size={16} color="#22C55E" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Banner */}
      <div
        className="interactive-card"
        style={{
          padding: '18px 24px',
          borderRadius: `${metrics.radiusLarge}px`,
          border: `1px solid ${colors.border}`,
          backgroundColor: colors.surface,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              backgroundColor: colors.primarySurface,
              border: `1px solid ${colors.primaryBorder}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: colors.primary,
            }}
          >
            <Sliders size={22} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: colors.textPrimary }}>
              Display & Interface Preferences
            </h2>
            <p style={{ margin: '3px 0 0 0', fontSize: '12px', color: colors.textSecondary }}>
              Personal workstation settings for viewing density, theme contrast, font sizing, and dashboard layouts.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 12px',
              borderRadius: '6px',
              backgroundColor: colors.surfaceAlt,
              border: `1px solid ${colors.border}`,
              fontSize: '11px',
              color: colors.textMuted,
            }}
          >
            <User size={13} color={colors.primary} />
            <span>Profile: <strong>{currentUser?.username || 'Guest'}</strong></span>
          </div>

          <button
            id="btn-reset-display-preferences"
            onClick={() => setShowResetConfirm(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              backgroundColor: colors.surfaceAlt,
              border: `1px solid ${colors.borderStrong}`,
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              color: colors.textSecondary,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            title="Restore all display options to default"
          >
            <RotateCcw size={13} />
            <span>Reset Display Settings</span>
          </button>
        </div>
      </div>

      {/* SECTION 1: THEME SELECTION (Light / Dark / System Default) */}
      <div
        className="interactive-card"
        style={{
          padding: '20px 24px',
          borderRadius: `${metrics.radiusLarge}px`,
          border: `1px solid ${colors.border}`,
          backgroundColor: colors.surface,
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: colors.textPrimary }}>
              Theme & Visual Appearance
            </h3>
            <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: colors.textMuted }}>
              Select between high-contrast SCADA daytime theme, low-glare dark monitoring mode, or automatic system matching.
            </p>
          </div>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              padding: '3px 9px',
              borderRadius: '12px',
              backgroundColor: colors.primarySurface,
              color: colors.primary,
              border: `1px solid ${colors.primaryBorder}`,
            }}
          >
            Active: {theme === 'system' ? `System (${resolvedTheme.toUpperCase()})` : theme.toUpperCase()}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
          {/* Light Theme Card */}
          <div
            data-theme-choice="light"
            onClick={() => {
              setTheme('light');
              showToast('Light theme applied.');
            }}
            style={{
              padding: '16px',
              borderRadius: '8px',
              border: `2px solid ${theme === 'light' ? colors.primary : colors.border}`,
              backgroundColor: theme === 'light' ? colors.primarySurface : colors.surfaceAlt,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '6px',
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #CBD5E1',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#D97706',
                  }}
                >
                  <Sun size={18} />
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: colors.textPrimary }}>Light Theme</div>
                  <div style={{ fontSize: '11px', color: colors.textMuted }}>High-contrast daytime SCADA</div>
                </div>
              </div>
              {theme === 'light' && <Check size={18} color={colors.primary} />}
            </div>
            <div
              style={{
                height: '34px',
                borderRadius: '4px',
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                display: 'flex',
                alignItems: 'center',
                padding: '0 8px',
                gap: '6px',
              }}
            >
              <div style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: '#2563EB' }} />
              <div style={{ width: '40px', height: '6px', borderRadius: '3px', backgroundColor: '#CBD5E1' }} />
              <div style={{ width: '20px', height: '6px', borderRadius: '3px', backgroundColor: '#16A34A', marginLeft: 'auto' }} />
            </div>
          </div>

          {/* Dark Theme Card */}
          <div
            data-theme-choice="dark"
            onClick={() => {
              setTheme('dark');
              showToast('Dark theme applied.');
            }}
            style={{
              padding: '16px',
              borderRadius: '8px',
              border: `2px solid ${theme === 'dark' ? colors.primary : colors.border}`,
              backgroundColor: theme === 'dark' ? colors.primarySurface : colors.surfaceAlt,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '6px',
                    backgroundColor: '#0F172A',
                    border: '1px solid #334155',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#38BDF8',
                  }}
                >
                  <Moon size={18} />
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: colors.textPrimary }}>Dark Theme</div>
                  <div style={{ fontSize: '11px', color: colors.textMuted }}>Low-glare industrial night mode</div>
                </div>
              </div>
              {theme === 'dark' && <Check size={18} color={colors.primary} />}
            </div>
            <div
              style={{
                height: '34px',
                borderRadius: '4px',
                backgroundColor: '#0B1120',
                border: '1px solid #334155',
                display: 'flex',
                alignItems: 'center',
                padding: '0 8px',
                gap: '6px',
              }}
            >
              <div style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: '#3B82F6' }} />
              <div style={{ width: '40px', height: '6px', borderRadius: '3px', backgroundColor: '#475569' }} />
              <div style={{ width: '20px', height: '6px', borderRadius: '3px', backgroundColor: '#22C55E', marginLeft: 'auto' }} />
            </div>
          </div>

          {/* System Default Card */}
          <div
            data-theme-choice="system"
            onClick={() => {
              setTheme('system');
              showToast('System Default theme enabled.');
            }}
            style={{
              padding: '16px',
              borderRadius: '8px',
              border: `2px solid ${theme === 'system' ? colors.primary : colors.border}`,
              backgroundColor: theme === 'system' ? colors.primarySurface : colors.surfaceAlt,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '6px',
                    backgroundColor: colors.surface,
                    border: `1px solid ${colors.borderStrong}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: colors.primary,
                  }}
                >
                  <Monitor size={18} />
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: colors.textPrimary }}>System Default</div>
                  <div style={{ fontSize: '11px', color: colors.textMuted }}>Follows Windows OS preference</div>
                </div>
              </div>
              {theme === 'system' && <Check size={18} color={colors.primary} />}
            </div>
            <div
              style={{
                height: '34px',
                borderRadius: '4px',
                background: 'linear-gradient(90deg, #F8FAFC 50%, #0F172A 50%)',
                border: `1px solid ${colors.border}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span style={{ fontSize: '10px', fontWeight: 600, color: '#3B82F6', backgroundColor: 'rgba(0,0,0,0.4)', padding: '1px 6px', borderRadius: '3px' }}>
                Auto Sync
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: DISPLAY ZOOM (80% to 150%) */}
      <div
        className="interactive-card"
        style={{
          padding: '20px 24px',
          borderRadius: `${metrics.radiusLarge}px`,
          border: `1px solid ${colors.border}`,
          backgroundColor: colors.surface,
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: colors.textPrimary }}>
              Display Zoom & Scale
            </h3>
            <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: colors.textMuted }}>
              Scales application layout and cards cleanly using responsive root CSS design tokens. Preserves responsive viewport layout without overflow.
            </p>
          </div>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              padding: '3px 9px',
              borderRadius: '12px',
              backgroundColor: colors.surfaceAlt,
              color: colors.textPrimary,
              border: `1px solid ${colors.borderStrong}`,
            }}
          >
            Zoom: {zoom}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
          {zoomOptions.map((opt) => {
            const isSelected = zoom === opt.value;
            return (
              <button
                key={opt.value}
                data-zoom-choice={opt.value.replace('%', '')}
                onClick={() => {
                  setZoom(opt.value);
                  showToast(`Zoom set to ${opt.value} (${opt.label})`);
                }}
                style={{
                  padding: '12px 10px',
                  borderRadius: '6px',
                  border: `2px solid ${isSelected ? colors.primary : colors.border}`,
                  backgroundColor: isSelected ? colors.primarySurface : colors.surfaceAlt,
                  color: isSelected ? colors.primary : colors.textPrimary,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'all 0.15s ease',
                  outline: 'none',
                }}
              >
                <span style={{ fontSize: '14px', fontWeight: 800 }}>{opt.value}</span>
                <span style={{ fontSize: '11px', fontWeight: 600 }}>{opt.label}</span>
                <span style={{ fontSize: '9px', color: colors.textMuted, textAlign: 'center', marginTop: '2px' }}>
                  {opt.desc}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* SECTION 3: FONT SIZE HIERARCHY */}
      <div
        className="interactive-card"
        style={{
          padding: '20px 24px',
          borderRadius: `${metrics.radiusLarge}px`,
          border: `1px solid ${colors.border}`,
          backgroundColor: colors.surface,
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: colors.textPrimary }}>
              Font Size & Typography Hierarchy
            </h3>
            <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: colors.textMuted }}>
              Adjusts baseline text size across navigation, dashboard telemetry metrics, tables, and dialogs.
            </p>
          </div>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              padding: '3px 9px',
              borderRadius: '12px',
              backgroundColor: colors.surfaceAlt,
              color: colors.textPrimary,
              border: `1px solid ${colors.borderStrong}`,
            }}
          >
            Size: {fontSize.toUpperCase()}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
          {fontSizeOptions.map((opt) => {
            const isSelected = fontSize === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => {
                  setFontSize(opt.value);
                  showToast(`Font size set to ${opt.label}`);
                }}
                style={{
                  padding: '12px 14px',
                  borderRadius: '6px',
                  border: `2px solid ${isSelected ? colors.primary : colors.border}`,
                  backgroundColor: isSelected ? colors.primarySurface : colors.surfaceAlt,
                  color: isSelected ? colors.primary : colors.textPrimary,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Type size={16} />
                  <span style={{ fontSize: '12px', fontWeight: 700 }}>{opt.label}</span>
                </div>
                <span style={{ fontSize: '11px', color: colors.textMuted }}>{opt.px}</span>
              </button>
            );
          })}
        </div>

        {/* Live Font Hierarchy Sample Preview */}
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '6px',
            backgroundColor: colors.surfaceAlt,
            border: `1px solid ${colors.border}`,
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          <div style={{ fontSize: '10px', fontWeight: 700, color: colors.textMuted, letterSpacing: '0.5px' }}>
            TYPOGRAPHY PREVIEW:
          </div>
          <div style={{ fontSize: 'var(--font-xl)', fontWeight: 800, color: colors.textPrimary }}>
            Train 12002 — Shatabdi Express
          </div>
          <div style={{ fontSize: 'var(--font-base)', color: colors.textSecondary }}>
            Coach B4 Dual Reservoir: Tank 1 (Primary 78.4% / 1568L), Tank 2 (Auxiliary 82.1% / 1642L)
          </div>
          <div style={{ fontSize: 'var(--font-xs)', color: colors.textMuted }}>
            GNSS Coordinates: 22.5841° N, 88.3429° E • Speed: 84 km/h • Battery Voltage: 12.82 V
          </div>
        </div>
      </div>

      {/* SECTION 4: INTERFACE DENSITY SETTINGS */}
      <div
        className="interactive-card"
        style={{
          padding: '20px 24px',
          borderRadius: `${metrics.radiusLarge}px`,
          border: `1px solid ${colors.border}`,
          backgroundColor: colors.surface,
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: colors.textPrimary }}>
              Interface Density
            </h3>
            <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: colors.textMuted }}>
              Adjusts spacing between cards, metrics rows, and table row heights.
            </p>
          </div>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              padding: '3px 9px',
              borderRadius: '12px',
              backgroundColor: colors.surfaceAlt,
              color: colors.textPrimary,
              border: `1px solid ${colors.borderStrong}`,
            }}
          >
            Density: {density.toUpperCase()}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
          {densityOptions.map((opt) => {
            const isSelected = density === opt.value;
            return (
              <div
                key={opt.value}
                data-density-choice={opt.value}
                onClick={() => {
                  setDensity(opt.value);
                  showToast(`Density set to ${opt.label}`);
                }}
                style={{
                  padding: '14px',
                  borderRadius: '6px',
                  border: `2px solid ${isSelected ? colors.primary : colors.border}`,
                  backgroundColor: isSelected ? colors.primarySurface : colors.surfaceAlt,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <LayoutGrid size={16} color={isSelected ? colors.primary : colors.textMuted} />
                    <span style={{ fontSize: '13px', fontWeight: 700, color: colors.textPrimary }}>{opt.label}</span>
                  </div>
                  {isSelected && <Check size={16} color={colors.primary} />}
                </div>
                <p style={{ margin: 0, fontSize: '11px', color: colors.textMuted, lineHeight: 1.4 }}>
                  {opt.desc}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION 5: SIDEBAR & NAVIGATION PREFERENCES */}
      <div
        className="interactive-card"
        style={{
          padding: '20px 24px',
          borderRadius: `${metrics.radiusLarge}px`,
          border: `1px solid ${colors.border}`,
          backgroundColor: colors.surface,
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: colors.textPrimary }}>
            Sidebar & Navigation Behavior
          </h3>
          <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: colors.textMuted }}>
            Choose whether the operational sidebar remains expanded with labels or collapses into high-density icon navigation.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
          {sidebarOptions.map((opt) => {
            const isSelected = sidebarMode === opt.value;
            return (
              <div
                key={opt.value}
                onClick={() => {
                  setSidebarMode(opt.value);
                  showToast(`Sidebar set to ${opt.label}`);
                }}
                style={{
                  padding: '14px',
                  borderRadius: '6px',
                  border: `2px solid ${isSelected ? colors.primary : colors.border}`,
                  backgroundColor: isSelected ? colors.primarySurface : colors.surfaceAlt,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Menu size={16} color={isSelected ? colors.primary : colors.textMuted} />
                    <span style={{ fontSize: '13px', fontWeight: 700, color: colors.textPrimary }}>{opt.label}</span>
                  </div>
                  {isSelected && <Check size={16} color={colors.primary} />}
                </div>
                <p style={{ margin: 0, fontSize: '11px', color: colors.textMuted, lineHeight: 1.4 }}>
                  {opt.desc}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION 6: DASHBOARD LAYOUT PREFERENCES */}
      <div
        className="interactive-card"
        style={{
          padding: '20px 24px',
          borderRadius: `${metrics.radiusLarge}px`,
          border: `1px solid ${colors.border}`,
          backgroundColor: colors.surface,
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: colors.textPrimary }}>
            Dashboard Layout Preferences
          </h3>
          <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: colors.textMuted }}>
            Customize the personal presentation of cards and diagnostic details on your operational dashboard.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {/* Toggle: Summary Cards */}
          <div
            style={{
              padding: '12px 16px',
              borderRadius: '6px',
              backgroundColor: colors.surfaceAlt,
              border: `1px solid ${colors.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {dashboard.showSummaryCards ? <Eye size={16} color={colors.primary} /> : <EyeOff size={16} color={colors.textMuted} />}
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: colors.textPrimary }}>
                  Show Fleet Summary Cards
                </div>
                <div style={{ fontSize: '11px', color: colors.textMuted }}>
                  Display aggregate metrics (online/offline devices, total reservoirs, active alarms) above train tables.
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                updateDashboardPreferences({ showSummaryCards: !dashboard.showSummaryCards });
                showToast(`Summary cards ${!dashboard.showSummaryCards ? 'enabled' : 'hidden'}.`);
              }}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                border: `1px solid ${dashboard.showSummaryCards ? colors.primary : colors.borderStrong}`,
                backgroundColor: dashboard.showSummaryCards ? colors.primarySurface : colors.surface,
                color: dashboard.showSummaryCards ? colors.primary : colors.textMuted,
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {dashboard.showSummaryCards ? 'VISIBLE' : 'HIDDEN'}
            </button>
          </div>

          {/* Toggle: Secondary Diagnostic Info */}
          <div
            style={{
              padding: '12px 16px',
              borderRadius: '6px',
              backgroundColor: colors.surfaceAlt,
              border: `1px solid ${colors.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {dashboard.showSecondaryInfo ? <Eye size={16} color={colors.primary} /> : <EyeOff size={16} color={colors.textMuted} />}
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: colors.textPrimary }}>
                  Show Secondary Telemetry Calculations
                </div>
                <div style={{ fontSize: '11px', color: colors.textMuted }}>
                  Display Doppler ground speed, battery voltage status, and raw sensor readings alongside water fill levels.
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                updateDashboardPreferences({ showSecondaryInfo: !dashboard.showSecondaryInfo });
                showToast(`Secondary info ${!dashboard.showSecondaryInfo ? 'enabled' : 'hidden'}.`);
              }}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                border: `1px solid ${dashboard.showSecondaryInfo ? colors.primary : colors.borderStrong}`,
                backgroundColor: dashboard.showSecondaryInfo ? colors.primarySurface : colors.surface,
                color: dashboard.showSecondaryInfo ? colors.primary : colors.textMuted,
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {dashboard.showSecondaryInfo ? 'VISIBLE' : 'HIDDEN'}
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation Modal for Reset */}
      {showResetConfirm && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '16px',
          }}
        >
          <div
            className="dialog-content"
            style={{
              width: '100%',
              maxWidth: '440px',
              backgroundColor: colors.surface,
              borderRadius: '8px',
              border: `1px solid ${colors.border}`,
              padding: '24px',
              boxShadow: colors.shadowModal,
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  backgroundColor: '#FEF3C7',
                  color: '#D97706',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <AlertTriangle size={20} />
              </div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: colors.textPrimary }}>
                Reset Display Settings?
              </h3>
            </div>

            <p style={{ margin: 0, fontSize: '13px', color: colors.textSecondary, lineHeight: 1.5 }}>
              This will restore all personal display preferences to defaults:
            </p>

            <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '12px', color: colors.textMuted, lineHeight: 1.6 }}>
              <li>Theme: <strong>System Default</strong></li>
              <li>Display Zoom: <strong>100% (Default)</strong></li>
              <li>Font Size: <strong>Default (~14px)</strong></li>
              <li>Density: <strong>Comfortable</strong></li>
              <li>Sidebar: <strong>Expanded</strong></li>
              <li>Dashboard Layout: <strong>All cards visible</strong></li>
            </ul>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
              <button
                onClick={() => setShowResetConfirm(false)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: colors.surfaceAlt,
                  border: `1px solid ${colors.border}`,
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: colors.textSecondary,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleReset}
                style={{
                  padding: '8px 18px',
                  backgroundColor: colors.primary,
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Confirm Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DisplaySettingsPanel;
