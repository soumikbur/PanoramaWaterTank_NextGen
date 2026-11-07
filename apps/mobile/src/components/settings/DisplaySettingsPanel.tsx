import React, { useState } from 'react';
import { colors, typography, metrics } from '../../theme';
import { useApp } from '../../state/AppContext';
import { useDisplayPreferences } from '../../context/DisplayPreferencesContext';
import { FontSize, ZOOM_MIN, ZOOM_MAX, ZOOM_DEFAULT } from '../../services/displayPreferencesService';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Type,
  Check,
  Sliders,
  CheckCircle2,
} from 'lucide-react';

interface DisplaySettingsPanelProps {
  isAdminView?: boolean;
}

export const DisplaySettingsPanel: React.FC<DisplaySettingsPanelProps> = ({ isAdminView = false }) => {
  const { currentUser } = useApp();
  const {
    zoom,
    zoomPercent,
    fontSize,
    zoomIn,
    zoomOut,
    resetZoom,
    setFontSize,
    resetDisplayPreferences,
  } = useDisplayPreferences();

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const handleResetAll = () => {
    resetDisplayPreferences();
    showToast('Display settings reset to 100% Zoom and Medium Font Size.');
  };

  const fontSizeOptions: { label: string; value: FontSize; subtitle: string; previewPx: string }[] = [
    { label: 'Small', value: 'small', subtitle: 'Compact overview', previewPx: '12px' },
    { label: 'Medium', value: 'medium', subtitle: 'Recommended baseline (Default)', previewPx: '14px' },
    { label: 'Large', value: 'large', subtitle: 'High readability', previewPx: '16px' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '880px', margin: '0 auto' }}>
      {/* Toast Notification */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            backgroundColor: '#0F172A',
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
          border: '1px solid var(--color-border, #E2E8F0)',
          backgroundColor: 'var(--color-surface, #FFFFFF)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          boxShadow: 'var(--shadow-card, 0 1px 3px rgba(0,0,0,0.05))',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '8px',
              backgroundColor: 'var(--color-primary-surface, #EFF6FF)',
              border: '1px solid var(--color-primary-border, #BFDBFE)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-primary, #2563EB)',
            }}
          >
            <Sliders size={20} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--color-text-primary, #0F172A)' }}>
              Display Settings
            </h2>
            <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--color-text-muted, #64748B)' }}>
              Configure your personal interface scaling and typography preferences
            </p>
          </div>
        </div>

        {/* Global Reset Button */}
        <button
          onClick={handleResetAll}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 14px',
            borderRadius: '6px',
            border: '1px solid var(--color-border-strong, #CBD5E1)',
            backgroundColor: 'var(--color-surface-alt, #F8FAFC)',
            color: 'var(--color-text-secondary, #475569)',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          title="Reset Zoom to 100% and Font Size to Medium"
        >
          <RotateCcw size={14} />
          <span>Reset to Defaults</span>
        </button>
      </div>

      {/* =========================================================================
          SETTING 1: DISPLAY ZOOM (80% - 125%, 5% steps)
          ========================================================================= */}
      <div
        className="interactive-card"
        style={{
          padding: '20px 24px',
          borderRadius: `${metrics.radiusLarge}px`,
          border: '1px solid var(--color-border, #E2E8F0)',
          backgroundColor: 'var(--color-surface, #FFFFFF)',
          boxShadow: 'var(--shadow-card, 0 1px 3px rgba(0,0,0,0.05))',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '6px',
                backgroundColor: 'var(--color-primary-surface, #EFF6FF)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-primary, #2563EB)',
              }}
            >
              <ZoomIn size={16} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--color-text-primary, #0F172A)' }}>
                Display Zoom
              </h3>
              <span style={{ fontSize: '11px', color: 'var(--color-text-muted, #64748B)' }}>
                Scale application cards, tables, maps, and telemetry monitors (Range: 80% &ndash; 125%)
              </span>
            </div>
          </div>

          {/* Current Zoom Percentage Badge */}
          <div
            style={{
              padding: '4px 14px',
              borderRadius: '20px',
              backgroundColor: 'var(--color-primary-surface, #EFF6FF)',
              border: '1px solid var(--color-primary-border, #BFDBFE)',
              color: 'var(--color-primary, #2563EB)',
              fontSize: '14px',
              fontWeight: 800,
              letterSpacing: '0.3px',
            }}
          >
            {zoomPercent}%
          </div>
        </div>

        {/* Zoom Controls Row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            backgroundColor: 'var(--color-surface-alt, #F8FAFC)',
            padding: '14px 18px',
            borderRadius: '8px',
            border: '1px solid var(--color-border, #E2E8F0)',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Zoom Out Button */}
            <button
              id="zoom-out-btn"
              onClick={zoomOut}
              disabled={zoomPercent <= ZOOM_MIN}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '6px',
                border: '1px solid var(--color-border-strong, #CBD5E1)',
                backgroundColor: zoomPercent <= ZOOM_MIN ? 'var(--color-surface-alt, #F1F5F9)' : 'var(--color-surface, #FFFFFF)',
                color: zoomPercent <= ZOOM_MIN ? 'var(--color-text-placeholder, #94A3B8)' : 'var(--color-text-primary, #0F172A)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: zoomPercent <= ZOOM_MIN ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <ZoomOut size={15} />
              <span>Zoom Out (-5%)</span>
            </button>

            {/* Reset to 100% Button */}
            <button
              id="zoom-reset-btn"
              onClick={resetZoom}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '6px',
                border: '1px solid var(--color-border-strong, #CBD5E1)',
                backgroundColor: zoomPercent === ZOOM_DEFAULT ? 'var(--color-primary-surface, #EFF6FF)' : 'var(--color-surface, #FFFFFF)',
                color: zoomPercent === ZOOM_DEFAULT ? 'var(--color-primary, #2563EB)' : 'var(--color-text-secondary, #475569)',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <RotateCcw size={13} />
              <span>Reset 100%</span>
            </button>

            {/* Zoom In Button */}
            <button
              id="zoom-in-btn"
              onClick={zoomIn}
              disabled={zoomPercent >= ZOOM_MAX}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '6px',
                border: '1px solid var(--color-border-strong, #CBD5E1)',
                backgroundColor: zoomPercent >= ZOOM_MAX ? 'var(--color-surface-alt, #F1F5F9)' : 'var(--color-surface, #FFFFFF)',
                color: zoomPercent >= ZOOM_MAX ? 'var(--color-text-placeholder, #94A3B8)' : 'var(--color-text-primary, #0F172A)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: zoomPercent >= ZOOM_MAX ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <ZoomIn size={15} />
              <span>Zoom In (+5%)</span>
            </button>
          </div>

          {/* Stepper Level Indicators */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {[80, 85, 90, 95, 100, 105, 110, 115, 120, 125].map((level) => {
              const isCurrent = level === zoomPercent;
              return (
                <div
                  key={level}
                  title={`${level}%`}
                  style={{
                    width: '16px',
                    height: '14px',
                    borderRadius: '2px',
                    backgroundColor: isCurrent
                      ? 'var(--color-primary, #2563EB)'
                      : level < zoomPercent
                      ? 'var(--color-primary-border, #BFDBFE)'
                      : 'var(--color-border, #E2E8F0)',
                    transition: 'all 0.15s ease',
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* =========================================================================
          SETTING 2: FONT SIZE (Small, Medium, Large)
          ========================================================================= */}
      <div
        className="interactive-card"
        style={{
          padding: '20px 24px',
          borderRadius: `${metrics.radiusLarge}px`,
          border: '1px solid var(--color-border, #E2E8F0)',
          backgroundColor: 'var(--color-surface, #FFFFFF)',
          boxShadow: 'var(--shadow-card, 0 1px 3px rgba(0,0,0,0.05))',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '6px',
              backgroundColor: 'var(--color-primary-surface, #EFF6FF)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-primary, #2563EB)',
            }}
          >
            <Type size={16} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--color-text-primary, #0F172A)' }}>
              Font Size
            </h3>
            <span style={{ fontSize: '11px', color: 'var(--color-text-muted, #64748B)' }}>
              Applies proportionally across headings, tables, telemetry readouts, cards, and navigation
            </span>
          </div>
        </div>

        {/* 3 Options: Small, Medium, Large */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '12px',
            marginBottom: '16px',
          }}
        >
          {fontSizeOptions.map((opt) => {
            const isSelected = fontSize === opt.value;
            return (
              <div
                key={opt.value}
                data-font-option={opt.value}
                onClick={() => setFontSize(opt.value)}
                style={{
                  padding: '14px 16px',
                  borderRadius: '8px',
                  border: isSelected
                    ? '2px solid var(--color-primary, #2563EB)'
                    : '1px solid var(--color-border, #CBD5E1)',
                  backgroundColor: isSelected
                    ? 'var(--color-primary-surface, #EFF6FF)'
                    : 'var(--color-surface-alt, #F8FAFC)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  transition: 'all 0.15s ease',
                  position: 'relative',
                  boxShadow: isSelected ? '0 0 0 1px rgba(37,99,235,0.2)' : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span
                    style={{
                      fontSize: '14px',
                      fontWeight: 800,
                      color: isSelected ? 'var(--color-primary, #2563EB)' : 'var(--color-text-primary, #0F172A)',
                    }}
                  >
                    {opt.label}
                  </span>
                  {isSelected && <Check size={16} color="var(--color-primary, #2563EB)" />}
                </div>
                <span style={{ fontSize: '11px', color: 'var(--color-text-muted, #64748B)' }}>
                  {opt.subtitle} &bull; {opt.previewPx}
                </span>
              </div>
            );
          })}
        </div>

        {/* Live Font Scaling Preview Box */}
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '6px',
            backgroundColor: 'var(--color-surface-alt, #F8FAFC)',
            border: '1px solid var(--color-border, #E2E8F0)',
          }}
        >
          <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-text-muted, #64748B)', marginBottom: '4px', textTransform: 'uppercase' }}>
            Live Preview
          </div>
          <div style={{ fontSize: 'var(--font-base, 14px)', color: 'var(--color-text-primary, #0F172A)', fontWeight: 600 }}>
            WLI SCADA System &mdash; Train 225256 Special Express &bull; Coach CR123456 Arrival Tank: 80.5% (120.8 cm)
          </div>
        </div>
      </div>
    </div>
  );
};

export default DisplaySettingsPanel;
