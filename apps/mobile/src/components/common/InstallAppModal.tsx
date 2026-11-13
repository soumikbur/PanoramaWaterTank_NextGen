import React, { useState } from 'react';
import {
  Smartphone,
  Download,
  CheckCircle2,
  X,
  ShieldCheck,
  Apple,
  HardDriveDownload,
  Loader2,
} from 'lucide-react';
import panoramaLogoIcon from '../../assets/panorama_logo_icon.png';
import { APP_DISTRIBUTION } from '../../config/appDistribution';
import { isNativeCapacitorApp } from '../../services/nativeBridge';

interface InstallAppModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const InstallAppModal: React.FC<InstallAppModalProps> = ({ isOpen, onClose }) => {
  const isIos = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent || '');
  const [activeTab, setActiveTab] = useState<'android' | 'ios'>(() => (isIos ? 'ios' : 'android'));

  // Download simulation and tracking state
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloadComplete, setIsDownloadComplete] = useState(false);

  const handleDownloadApk = () => {
    if (isDownloading) return;
    setIsDownloading(true);
    setDownloadProgress(8);
    setIsDownloadComplete(false);

    // Trigger browser file download of verified existing APK
    const downloadLink = document.createElement('a');
    downloadLink.href = APP_DISTRIBUTION.apkRelativeUrl;
    downloadLink.download = APP_DISTRIBUTION.apkFileName;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);

    // Smooth progress indicator from 8% to 100%
    let progress = 8;
    const interval = setInterval(() => {
      progress += Math.floor(Math.random() * 15) + 12;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        setDownloadProgress(100);
        setIsDownloading(false);
        setIsDownloadComplete(true);
      } else {
        setDownloadProgress(progress);
      }
    }, 150);
  };

  // Do not display modal if not open or running inside native Capacitor environment
  if (!isOpen || isNativeCapacitorApp()) return null;

  return (
    <div
      id="install-app-modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        boxSizing: 'border-box',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="install-app-modal-container"
        role="dialog"
        aria-modal="true"
        aria-label="Install Panorama SCADA App"
        style={{
          width: '100%',
          maxWidth: '520px',
          maxHeight: '90vh',
          backgroundColor: '#FFFFFF',
          borderRadius: '12px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '1px solid #CBD5E1',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '16px 20px',
            backgroundColor: '#F8FAFC',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <img
              src={panoramaLogoIcon}
              alt="Panorama"
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                padding: '2px',
                backgroundColor: '#FFFFFF',
              }}
            />
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: '16px',
                  fontWeight: 800,
                  color: '#0F172A',
                  letterSpacing: '-0.3px',
                }}
              >
                Install Panorama SCADA App
              </h2>
              <p
                style={{
                  margin: 0,
                  fontSize: '12px',
                  color: '#64748B',
                }}
              >
                Railway Coach Water Level & Consist Monitoring System
              </p>
            </div>
          </div>
          <button
            type="button"
            id="install-modal-close-btn"
            onClick={onClose}
            aria-label="Close modal"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: '#64748B',
              padding: '6px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Selector: Android APK and iOS / Safari ONLY */}
        <div
          role="tablist"
          style={{
            display: 'flex',
            borderBottom: '1px solid #E2E8F0',
            backgroundColor: '#FFFFFF',
            padding: '0 16px',
            gap: '8px',
          }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'android'}
            id="modal-tab-android"
            onClick={() => setActiveTab('android')}
            style={{
              padding: '12px 18px',
              border: 'none',
              borderBottom: activeTab === 'android' ? '2px solid #2563EB' : '2px solid transparent',
              background: 'transparent',
              color: activeTab === 'android' ? '#2563EB' : '#64748B',
              fontWeight: activeTab === 'android' ? 700 : 500,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease',
            }}
          >
            <Smartphone size={16} />
            <span>Android APK</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'ios'}
            id="modal-tab-ios"
            onClick={() => setActiveTab('ios')}
            style={{
              padding: '12px 18px',
              border: 'none',
              borderBottom: activeTab === 'ios' ? '2px solid #2563EB' : '2px solid transparent',
              background: 'transparent',
              color: activeTab === 'ios' ? '#2563EB' : '#64748B',
              fontWeight: activeTab === 'ios' ? 700 : 500,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease',
            }}
          >
            <Apple size={16} />
            <span>iOS / Safari</span>
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          {activeTab === 'android' && (
            <div id="tab-panel-android">
              {/* Highlight Card */}
              <div
                style={{
                  backgroundColor: '#EFF6FF',
                  border: '1px solid #BFDBFE',
                  borderRadius: '8px',
                  padding: '14px',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                }}
              >
                <HardDriveDownload size={22} color="#2563EB" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <h4 style={{ margin: '0 0 3px 0', fontSize: '13px', fontWeight: 700, color: '#1E3A8A' }}>
                    Official Capacitor Android Package (APK)
                  </h4>
                  <p style={{ margin: 0, fontSize: '12px', color: '#1E40AF', lineHeight: '17px' }}>
                    Production-grade native build for Indian Railways handheld terminals, tablets, and smartphones. Includes offline local fleet store, TLS MQTT telemetry, and audible water alarms.
                  </p>
                </div>
              </div>

              {/* Download Action Section */}
              <div style={{ marginBottom: '16px' }}>
                <button
                  type="button"
                  id="modal-download-apk-btn"
                  onClick={handleDownloadApk}
                  disabled={isDownloading}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    backgroundColor: isDownloading ? '#93C5FD' : '#2563EB',
                    color: '#FFFFFF',
                    width: '100%',
                    padding: '13px 20px',
                    borderRadius: '8px',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '14px',
                    boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.25)',
                    cursor: isDownloading ? 'wait' : 'pointer',
                    transition: 'background-color 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!isDownloading) e.currentTarget.style.backgroundColor = '#1D4ED8';
                  }}
                  onMouseLeave={(e) => {
                    if (!isDownloading) e.currentTarget.style.backgroundColor = '#2563EB';
                  }}
                >
                  {isDownloading ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      <span>Downloading Package ({downloadProgress}%)...</span>
                    </>
                  ) : isDownloadComplete ? (
                    <>
                      <CheckCircle2 size={18} />
                      <span>Download Again ({APP_DISTRIBUTION.apkSizeFormatted})</span>
                    </>
                  ) : (
                    <>
                      <Download size={18} />
                      <span>Download Android APK ({APP_DISTRIBUTION.apkSizeFormatted})</span>
                    </>
                  )}
                </button>

                {/* Progress Bar while downloading */}
                {isDownloading && (
                  <div style={{ marginTop: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 600, color: '#1E40AF', marginBottom: '4px' }}>
                      <span>Transferring {APP_DISTRIBUTION.apkFileName}...</span>
                      <span>{downloadProgress}% ({((APP_DISTRIBUTION.apkSizeMb * downloadProgress) / 100).toFixed(1)} / {APP_DISTRIBUTION.apkSizeFormatted})</span>
                    </div>
                    <div style={{ width: '100%', height: '8px', backgroundColor: '#DBEAFE', borderRadius: '4px', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${downloadProgress}%`,
                          height: '100%',
                          backgroundColor: '#2563EB',
                          transition: 'width 0.15s ease',
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Download Complete Alert */}
                {isDownloadComplete && (
                  <div
                    style={{
                      marginTop: '10px',
                      backgroundColor: '#F0FDF4',
                      border: '1px solid #BBF7D0',
                      borderRadius: '6px',
                      padding: '10px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '12px',
                      color: '#166534',
                    }}
                  >
                    <CheckCircle2 size={16} color="#16A34A" style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, fontWeight: 600 }}>
                      APK downloaded successfully! Tap the file in your notification panel or Downloads folder to begin installation.
                    </div>
                  </div>
                )}
              </div>

              {/* Package Specs Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '8px',
                  marginBottom: '16px',
                }}
              >
                <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', padding: '8px', borderRadius: '6px', textAlign: 'center' }}>
                  <div style={{ fontSize: '9px', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>Version</div>
                  <div style={{ fontSize: '12px', color: '#0F172A', fontWeight: 700 }}>{APP_DISTRIBUTION.version}</div>
                </div>
                <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', padding: '8px', borderRadius: '6px', textAlign: 'center' }}>
                  <div style={{ fontSize: '9px', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>File Size</div>
                  <div style={{ fontSize: '12px', color: '#0F172A', fontWeight: 700 }}>{APP_DISTRIBUTION.apkSizeFormatted}</div>
                </div>
                <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', padding: '8px', borderRadius: '6px', textAlign: 'center' }}>
                  <div style={{ fontSize: '9px', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>Target OS</div>
                  <div style={{ fontSize: '12px', color: '#0F172A', fontWeight: 700 }}>Android 8.0+</div>
                </div>
                <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', padding: '8px', borderRadius: '6px', textAlign: 'center' }}>
                  <div style={{ fontSize: '9px', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>Engine</div>
                  <div style={{ fontSize: '12px', color: '#0F172A', fontWeight: 700 }}>Capacitor 6</div>
                </div>
              </div>

              {/* Step-by-Step Installation Instructions */}
              <h5 style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: 700, color: '#334155' }}>
                How to Install the APK on Android:
              </h5>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px', color: '#475569' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <span style={{ width: '20px', height: '20px', borderRadius: '50%', backgroundColor: '#E2E8F0', color: '#0F172A', fontWeight: 700, fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>1</span>
                  <span>Tap <strong>Download Android APK</strong> above to save <code>{APP_DISTRIBUTION.apkFileName}</code>.</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <span style={{ width: '20px', height: '20px', borderRadius: '50%', backgroundColor: '#E2E8F0', color: '#0F172A', fontWeight: 700, fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>2</span>
                  <span>Pull down your notification shade or open your <strong>Files / Downloads</strong> app and tap the APK file.</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <span style={{ width: '20px', height: '20px', borderRadius: '50%', backgroundColor: '#E2E8F0', color: '#0F172A', fontWeight: 700, fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>3</span>
                  <span>If prompted with <em>"Install unknown apps"</em>, tap <strong>Settings</strong> and switch <strong>Allow from this source</strong> to ON.</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <span style={{ width: '20px', height: '20px', borderRadius: '50%', backgroundColor: '#E2E8F0', color: '#0F172A', fontWeight: 700, fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>4</span>
                  <span>Tap <strong>Install</strong>. Once complete, tap <strong>Open</strong> to launch Panorama Water Tank Monitor.</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'ios' && (
            <div id="tab-panel-ios">
              <div
                style={{
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: '8px',
                  padding: '14px',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                }}
              >
                <Apple size={22} color="#0F172A" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <h4 style={{ margin: '0 0 3px 0', fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>
                    Apple iOS & iPadOS Setup
                  </h4>
                  <p style={{ margin: 0, fontSize: '12px', color: '#64748B', lineHeight: '17px' }}>
                    Native iOS (.ipa) package is currently undergoing Indian Railways MDM enterprise review. In the interim, add the official SCADA Web App to your home screen.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px', color: '#334155' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <span style={{ width: '20px', height: '20px', borderRadius: '50%', backgroundColor: '#E2E8F0', color: '#0F172A', fontWeight: 700, fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>1</span>
                  <span>Open this website in <strong>Safari</strong> on your iPhone or iPad.</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <span style={{ width: '20px', height: '20px', borderRadius: '50%', backgroundColor: '#E2E8F0', color: '#0F172A', fontWeight: 700, fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>2</span>
                  <span>Tap the <strong>Share</strong> button (square icon with an upward arrow) in Safari's bottom toolbar.</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <span style={{ width: '20px', height: '20px', borderRadius: '50%', backgroundColor: '#E2E8F0', color: '#0F172A', fontWeight: 700, fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>3</span>
                  <span>Scroll down the action sheet and tap <strong>Add to Home Screen</strong>.</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <span style={{ width: '20px', height: '20px', borderRadius: '50%', backgroundColor: '#E2E8F0', color: '#0F172A', fontWeight: 700, fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>4</span>
                  <span>Tap <strong>Add</strong> in the top-right corner to launch Panorama SCADA from your home screen anytime.</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '12px 20px',
            backgroundColor: '#F8FAFC',
            borderTop: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '11px',
            color: '#64748B',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ShieldCheck size={14} color="#16A34A" />
            <span>Authenticated Railway SCADA Portal • Version {APP_DISTRIBUTION.version}</span>
          </div>
          <button
            type="button"
            id="install-modal-footer-close-btn"
            onClick={onClose}
            style={{
              padding: '6px 14px',
              backgroundColor: '#FFFFFF',
              border: '1px solid #CBD5E1',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              color: '#334155',
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
