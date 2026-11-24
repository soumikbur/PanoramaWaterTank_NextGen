import React, { useState, useEffect } from 'react';
import { useDisplayPreferences } from '../../context/DisplayPreferencesContext';
import { ContrastMode, LayoutDensity, ScalePreset } from '../../services/displayPreferencesService';
import { RotateCcw, Check } from 'lucide-react';

interface DisplaySettingsPanelProps {
  isAdminView?: boolean;
  embedded?: boolean;
}

export const SCALE_PRESETS = [
  { label: 'Compact', value: '90%', numeric: 90 },
  { label: 'Small', value: '100%', numeric: 100, isDefault: true },
  { label: 'Normal', value: '110%', numeric: 110 },
  { label: 'Large', value: '120%', numeric: 120 },
  { label: 'Extra Large', value: '130%', numeric: 130 },
  { label: 'Maximum', value: '150%', numeric: 150 },
] as const;

export const DisplaySettingsPanel: React.FC<DisplaySettingsPanelProps> = ({ embedded = false }) => {
  const {
    displayScale,
    setDisplayScale,
    layoutDensity,
    setLayoutDensity,
    contrastMode,
    setContrastMode,
    resetDisplayPreferences,
  } = useDisplayPreferences();

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 768 : true));

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const handleResetAll = () => {
    resetDisplayPreferences();
    setDisplayScale('100%');
    setContrastMode('STANDARD');
    setLayoutDensity('COMFORTABLE');
    showToast('Display settings reset to 100% (Small · Default)');
  };

  const activeScale = displayScale || '100%';
  const currentIndex = SCALE_PRESETS.findIndex((p) => p.value === activeScale);
  const sliderIndex = currentIndex >= 0 ? currentIndex : 1;

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const idx = parseInt(e.target.value, 10);
    if (SCALE_PRESETS[idx]) {
      setDisplayScale(SCALE_PRESETS[idx].value);
    }
  };

  const handleSelectPreset = (value: string) => {
    setDisplayScale(value as ScalePreset);
  };

  return (
    <div
      style={
        embedded
          ? { width: '100%', boxSizing: 'border-box' }
          : {
              padding: isMobile ? '12px' : '20px',
              maxWidth: '820px',
              margin: '0 auto',
              width: '100%',
              boxSizing: 'border-box',
            }
      }
    >
      {/* Toast Feedback */}
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

      {/* Main Settings Card */}
      <div
        id="appearance-display-settings-card"
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '12px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
          padding: isMobile ? '16px' : '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          boxSizing: 'border-box',
        }}
      >
        {/* Header Heading & Subtitle */}
        <div>
          <h2
            style={{
              margin: 0,
              fontSize: '16px',
              fontWeight: 700,
              color: '#0F172A',
              letterSpacing: '-0.01em',
            }}
          >
            2. Appearance & Display Settings
          </h2>
          <p
            style={{
              margin: '4px 0 0 0',
              fontSize: '11.5px',
              color: '#64748B',
              lineHeight: 1.4,
            }}
          >
            Adjust application typography, visual zoom scale, layout density, and contrast across the entire system.
          </p>
        </div>

        {/* Global Display Size & Scaling Inner Card */}
        <div
          id="global-display-scaling-card"
          style={{
            backgroundColor: '#F8FAFC',
            borderRadius: '10px',
            border: '1px solid #E2E8F0',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            boxSizing: 'border-box',
          }}
        >
          {/* Header Row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '10px',
            }}
          >
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>
                Global Display Size & Scaling
              </div>
              <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
                Scales Header, Sidebar, titles, cards, tables, buttons, inputs, dialogs, and map controls globally.
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                id="current-scale-badge"
                style={{
                  backgroundColor: '#EFF6FF',
                  border: '1px solid #BFDBFE',
                  color: '#1D4ED8',
                  fontSize: '12px',
                  fontWeight: 700,
                  padding: '4px 10px',
                  borderRadius: '6px',
                  whiteSpace: 'nowrap',
                }}
              >
                Current {activeScale}
              </span>

              <button
                id="btn-reset-display-scale"
                type="button"
                onClick={handleResetAll}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #CBD5E1',
                  color: '#0F172A',
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '6px 12px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'background-color 0.15s ease',
                }}
                title="Reset to 100% default scale"
              >
                <RotateCcw size={12} />
                <span>Reset to Default</span>
              </button>
            </div>
          </div>

          {/* Preset Grid (2 columns) */}
          <div
            id="display-scale-preset-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '10px',
            }}
          >
            {SCALE_PRESETS.map((preset) => {
              const isSelected = activeScale === preset.value;
              return (
                <button
                  key={preset.value}
                  id={`btn-scale-preset-${preset.value.replace('%', '')}`}
                  type="button"
                  onClick={() => handleSelectPreset(preset.value)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '12px 8px',
                    borderRadius: '8px',
                    border: isSelected ? '2px solid #2563EB' : '1px solid #CBD5E1',
                    backgroundColor: isSelected ? '#EFF6FF' : '#FFFFFF',
                    color: isSelected ? '#1D4ED8' : '#0F172A',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: isSelected ? '0 2px 8px rgba(37, 99, 235, 0.15)' : 'none',
                    boxSizing: 'border-box',
                  }}
                >
                  <span style={{ fontSize: '13px', fontWeight: 700 }}>{preset.label}</span>
                  <span style={{ fontSize: '15px', fontWeight: 800, marginTop: '2px' }}>{preset.value}</span>
                  {preset.isDefault && (
                    <span
                      style={{
                        marginTop: '4px',
                        fontSize: '9px',
                        fontWeight: 700,
                        backgroundColor: isSelected ? '#2563EB' : '#E2E8F0',
                        color: isSelected ? '#FFFFFF' : '#475569',
                        padding: '1px 5px',
                        borderRadius: '3px',
                        letterSpacing: '0.02em',
                      }}
                    >
                      DEFAULT
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Interactive Scale Slider */}
          <div style={{ marginTop: '4px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '11px',
                color: '#64748B',
                marginBottom: '6px',
                padding: '0 2px',
                flexWrap: 'wrap',
                gap: '2px',
              }}
            >
              <span>90% (Compact)</span>
              <span style={{ fontWeight: 700, color: activeScale === '100%' ? '#2563EB' : '#64748B' }}>
                100% (Small · Default)
              </span>
              <span>110% (Normal)</span>
              <span>120% (Large)</span>
              <span>130% (Extra Large)</span>
              <span>150% (Maximum)</span>
            </div>

            <input
              id="display-scale-slider"
              type="range"
              min="0"
              max="5"
              step="1"
              value={sliderIndex}
              onChange={handleSliderChange}
              style={{
                width: '100%',
                cursor: 'pointer',
                accentColor: '#2563EB',
                height: '6px',
                background: `linear-gradient(to right, #2563EB 0%, #2563EB ${(sliderIndex / 5) * 100}%, #E2E8F0 ${(sliderIndex / 5) * 100}%, #E2E8F0 100%)`,
                borderRadius: '3px',
                outline: 'none',
              }}
            />
          </div>
        </div>

        {/* Contrast & Density Section */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)',
            gap: '16px',
          }}
        >
          {/* Visual Contrast Mode */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 600,
                color: '#475569',
                marginBottom: '6px',
              }}
            >
              Visual Contrast Mode
            </label>
            <div style={{ display: 'flex', gap: '10px' }}>
              {[
                { id: 'STANDARD', label: 'Standard Industrial' },
                { id: 'HIGH_CONTRAST', label: 'High Contrast (Darker Lines)' },
              ].map((c) => {
                const isSel = contrastMode === c.id;
                return (
                  <button
                    key={c.id}
                    id={`btn-contrast-${c.id.toLowerCase()}`}
                    type="button"
                    onClick={() => setContrastMode(c.id as ContrastMode)}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: `1px solid ${isSel ? '#2563EB' : '#CBD5E1'}`,
                      backgroundColor: isSel ? '#EFF6FF' : '#FFFFFF',
                      color: isSel ? '#1D4ED8' : '#0F172A',
                      fontWeight: isSel ? 700 : 500,
                      cursor: 'pointer',
                      fontSize: '12px',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Layout Density */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 600,
                color: '#475569',
                marginBottom: '6px',
              }}
            >
              Layout Density
            </label>
            <div style={{ display: 'flex', gap: '10px' }}>
              {[
                { id: 'COMFORTABLE', label: 'Comfortable' },
                { id: 'COMPACT', label: 'Compact SCADA' },
              ].map((d) => {
                const isSel = layoutDensity === d.id;
                return (
                  <button
                    key={d.id}
                    id={`btn-density-${d.id.toLowerCase()}`}
                    type="button"
                    onClick={() => setLayoutDensity(d.id as LayoutDensity)}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: `1px solid ${isSel ? '#2563EB' : '#CBD5E1'}`,
                      backgroundColor: isSel ? '#EFF6FF' : '#FFFFFF',
                      color: isSel ? '#1D4ED8' : '#0F172A',
                      fontWeight: isSel ? 700 : 500,
                      cursor: 'pointer',
                      fontSize: '12px',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer (rendered when not embedded in complete multi-section settings page) */}
        {!embedded && (
          <div
            style={{
              textAlign: 'center',
              fontSize: '11px',
              color: '#64748B',
              marginTop: '16px',
              borderTop: '1px solid #F1F5F9',
              paddingTop: '12px',
            }}
          >
            © 2026 Panorama Water Tank Monitoring System
          </div>
        )}
      </div>
    </div>
  );
};

export default DisplaySettingsPanel;
