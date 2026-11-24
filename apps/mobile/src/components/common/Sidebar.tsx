import React, { useEffect, useState, useRef } from 'react';
import { typography } from '../../theme';
import { useApp, ScreenName } from '../../state/AppContext';
import panoramaLogoIcon from '../../assets/panorama_logo_icon.png';
import {
  Train,
  LayoutDashboard,
  Gauge,
  Cpu,
  MapPin,
  AlertTriangle,
  LineChart,
  FileText,
  Settings as SettingsIcon,
  Users as UsersIcon,
  ScrollText,
  ChevronLeft,
  ChevronRight,
  Layers,
  Activity,
  LogOut,
  LucideIcon,
  Sliders,
  ShieldCheck,
  Radio,
  Droplet,
  X,
  Menu,
  RadioTower,
  Terminal,
} from 'lucide-react';
import { useDisplayPreferences } from '../../context/DisplayPreferencesContext';

interface NavItemDef {
  id: ScreenName;
  label: string;
  icon: LucideIcon;
  badge?: number;
}

export const Sidebar: React.FC = () => {
  const {
    activeScreen,
    setActiveScreen,
    connectionStatus,
    mqttBrokerStatus,
    mqttConnectionStatus,
    sidebarCollapsed,
    toggleSidebar,
    isMobileNavOpen,
    setIsMobileNavOpen,
    devices,
    activeAlarms,
    managedAlerts,
    selectedTrainNumber,
    configuredTrains,
    currentUser,
    logout,
    liveTelemetry,
    consistMetrics,
  } = useApp();

  useEffect(() => {
    if (isMobileNavOpen) {
      if (typeof document !== 'undefined' && document.body) {
        document.body.style.overflow = 'hidden';
      }
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setIsMobileNavOpen(false);
        }
      };
      if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('keydown', handleKeyDown);
      }
      return () => {
        if (typeof document !== 'undefined' && document.body) {
          document.body.style.overflow = '';
        }
        if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
          window.removeEventListener('keydown', handleKeyDown);
        }
      };
    } else {
      if (typeof document !== 'undefined' && document.body) {
        document.body.style.overflow = '';
      }
    }
  }, [isMobileNavOpen, setIsMobileNavOpen]);

  // Edge Swipe Listener: Right swipe from screen's left edge (<= 32px) opens mobile drawer
  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let trackingEdge = false;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      if (t.clientX <= 32) {
        startX = t.clientX;
        startY = t.clientY;
        trackingEdge = true;
      } else {
        trackingEdge = false;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!trackingEdge || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      // Trigger if horizontal right swipe dominates vertical movement (no conflict with table scrolling)
      if (dx > 48 && Math.abs(dx) > Math.abs(dy) * 1.3) {
        setIsMobileNavOpen(true);
        trackingEdge = false;
      }
    };

    const onTouchEnd = () => {
      trackingEdge = false;
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [setIsMobileNavOpen]);

  const drawerTouchRef = useRef<{ startX: number; startY: number } | null>(null);

  const { sidebarMode, setSidebarMode } = useDisplayPreferences();

  const isConnected = connectionStatus === 'CONNECTED' || mqttConnectionStatus === 'CONNECTED';
  const storedRole = typeof window !== 'undefined' ? (() => {
    try {
      return JSON.parse(localStorage.getItem('panorama_demo_user') || '{}')?.role ||
             localStorage.getItem('panorama_user_role') ||
             JSON.parse(localStorage.getItem('panorama_user') || '{}')?.role;
    } catch {
      return '';
    }
  })() : '';
  const effectiveRole = currentUser?.role || storedRole || '';
  const isAdmin = String(effectiveRole).toUpperCase() === 'ADMIN';

  const unackedAlertCount = Math.max(
    managedAlerts.filter((a) => a.status === 'ACTIVE').length,
    activeAlarms.filter((a) => a.status === 'ACTIVE').length
  );

  // Navigation Items matching restructured SCADA specification
  const primaryNavItems: NavItemDef[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'trains', label: 'Train Management', icon: Train },
    { id: 'watertank', label: 'All Tanks', icon: Gauge },
    { id: 'devices', label: 'Devices', icon: Cpu },
    ...(isAdmin ? [{ id: 'raw-data' as ScreenName, label: 'Raw Data', icon: Terminal }] : []),
    { id: 'location', label: 'Location', icon: MapPin },
    { id: 'alerts', label: 'Alerts', icon: AlertTriangle, badge: unackedAlertCount },
    { id: 'history', label: 'History', icon: LineChart },
    { id: 'reports', label: 'Reports', icon: FileText },
  ];

  const systemNavItems: NavItemDef[] = [
    { id: 'settings', label: 'Settings', icon: SettingsIcon },
    ...(isAdmin ? [
      { id: 'users' as ScreenName, label: 'Users', icon: UsersIcon },
      { id: 'logs' as ScreenName, label: 'Logs', icon: ScrollText },
    ] : []),
  ];

  const onlineDevicesCount = devices.filter((d) => d.isOnline ?? d.is_online).length;
  const offlineDevicesCount = devices.length - onlineDevicesCount;
  const totalCoachesCount = consistMetrics.totalCoaches;
  const totalTanksCount = consistMetrics.totalTanks;
  const onlineTanksCount = consistMetrics.onlineTanks;
  const offlineTanksCount = consistMetrics.offlineTanks;
  const totalAlertsCount = unackedAlertCount;

  const [isTabletViewport, setIsTabletViewport] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth >= 768 && window.innerWidth < 1024;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const checkViewport = () => {
      const w = window.innerWidth;
      setIsTabletViewport(w >= 768 && w < 1024);
    };
    checkViewport();
    window.addEventListener('resize', checkViewport);
    return () => window.removeEventListener('resize', checkViewport);
  }, []);

  const isCollapsed = isTabletViewport || sidebarMode === 'collapsed' || sidebarMode === 'iconOnly' || sidebarCollapsed;
  const sidebarWidth = isCollapsed ? '68px' : '240px';

  const handleToggle = () => {
    const next = isCollapsed ? 'expanded' : 'collapsed';
    setSidebarMode(next);
    if ((isCollapsed && sidebarCollapsed) || (!isCollapsed && !sidebarCollapsed)) {
      toggleSidebar();
    }
  };

  const activeConfiguredTrain = configuredTrains.find((t) => t.train_number === selectedTrainNumber) || configuredTrains[0];
  const trainDisplayTitle = liveTelemetry
    ? `${liveTelemetry.trno} - Live Consist`
    : activeConfiguredTrain
    ? `${activeConfiguredTrain.train_number} - ${activeConfiguredTrain.name}`
    : 'No Train Configured';

  return (
    <>
      <aside
      className={`sidebar-container sidebar-desktop ${isCollapsed ? 'is-collapsed collapsed' : ''}`}
      style={{
        width: sidebarWidth,
        minWidth: sidebarWidth,
        maxWidth: sidebarWidth,
        height: '100%',
        backgroundColor: '#FFFFFF',
        borderRight: '1px solid #E2E8F0',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        transition: 'width 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        userSelect: 'none',
        zIndex: 90,
        overflow: 'hidden',
      }}
    >
      {/* 1. TOP: TRAIN SUMMARY CARD (Directly at top of sidebar) */}
      <div style={{ padding: isCollapsed ? '12px 10px 6px 10px' : '12px 12px 6px 12px', flexShrink: 0 }}>
        {!isCollapsed ? (
          <div
            id="sidebar-train-summary-card"
            style={{
              backgroundColor: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '8px',
              padding: '10px 10px 8px 10px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            {/* Header: TRAIN SUMMARY */}
            <div
              style={{
                fontSize: '10px',
                fontWeight: 700,
                color: '#94A3B8',
                letterSpacing: '0.8px',
                textTransform: 'uppercase',
              }}
            >
              TRAIN SUMMARY
            </div>

            {/* Active Train Context Capsule */}
            <div
              onClick={() => setActiveScreen('dashboard')}
              title="Click to view train details"
              style={{
                backgroundColor: '#EFF6FF',
                border: '1px solid #BFDBFE',
                borderRadius: '4px',
                height: '24px',
                padding: '0 8px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
              }}
            >
              <div style={{ width: '6px', height: '6px', borderRadius: '3px', backgroundColor: '#2563EB', flexShrink: 0 }} />
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#2563EB',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {trainDisplayTitle}
              </span>
            </div>

            {/* Subtitle Zone */}
            <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 500, paddingLeft: '2px' }}>
              {activeConfiguredTrain
                ? `${activeConfiguredTrain.railway_zone || activeConfiguredTrain.region}${liveTelemetry ? ' • Live Telemetry' : ''}`
                : liveTelemetry
                ? 'Live MQTT Telemetry'
                : 'Awaiting Train Assignment'}
            </div>

            {/* 2x2 Metric Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '6px',
                paddingTop: '2px',
              }}
            >
              {/* Coaches */}
              <div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', lineHeight: '18px' }}>
                  {totalCoachesCount}
                </div>
                <div style={{ fontSize: '10px', fontWeight: 500, color: '#64748B' }}>
                  Coaches
                </div>
              </div>

              {/* Tanks */}
              <div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', lineHeight: '18px' }}>
                  {totalTanksCount}
                </div>
                <div style={{ fontSize: '10px', fontWeight: 500, color: '#64748B' }}>
                  Tanks
                </div>
              </div>

              {/* Online */}
              <div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: onlineTanksCount > 0 ? '#16A34A' : '#64748B', lineHeight: '18px' }}>
                  {onlineTanksCount}
                </div>
                <div style={{ fontSize: '10px', fontWeight: 500, color: '#64748B' }}>
                  Online
                </div>
              </div>

              {/* Offline */}
              <div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: offlineTanksCount > 0 ? '#DC2626' : '#64748B', lineHeight: '18px' }}>
                  {offlineTanksCount}
                </div>
                <div style={{ fontSize: '10px', fontWeight: 500, color: '#64748B' }}>
                  Offline
                </div>
              </div>
            </div>

            {/* Divider */}
            <div style={{ height: '1px', backgroundColor: '#E2E8F0', margin: '2px 0' }} />

            {/* Alerts Row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2px' }}>
              <span style={{ fontSize: '10px', fontWeight: 500, color: '#64748B' }}>Alerts</span>
              <span style={{ fontSize: '12px', fontWeight: 700, color: totalAlertsCount > 0 ? '#DC2626' : '#64748B' }}>
                {totalAlertsCount}
              </span>
            </div>
          </div>
        ) : (
          /* Collapsed Compact Train Summary Indicator */
          <div
            onClick={() => setActiveScreen('dashboard')}
            title={`Train Summary: ${trainDisplayTitle}`}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '8px',
              backgroundColor: '#EFF6FF',
              border: '1px solid #BFDBFE',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              margin: '0 auto',
              color: '#2563EB',
            }}
          >
            <Train size={18} strokeWidth={2} />
          </div>
        )}
      </div>

      {/* 2. NAVIGATION LIST: PRIMARY & SYSTEM SECTIONS */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          paddingTop: '4px',
          paddingBottom: '6px',
        }}
      >
        {/* SECTION: PRIMARY */}
        {!isCollapsed && (
          <div
            style={{
              padding: '8px 14px 4px 14px',
              fontSize: '10px',
              fontWeight: 700,
              color: '#64748B',
              letterSpacing: '0.8px',
              textTransform: 'uppercase',
            }}
          >
            PRIMARY
          </div>
        )}

        {primaryNavItems.map((item) => {
          const isActive =
            item.id === 'dashboard'
              ? activeScreen === 'dashboard'
              : item.id === 'trains'
              ? activeScreen === 'trains' || activeScreen === 'coaches' || activeScreen === 'coach-details'
              : item.id === 'raw-data'
              ? activeScreen === 'raw-data' || activeScreen === 'mqtt-monitor'
              : activeScreen === item.id;
          const IconComp = item.icon;

          return (
            <button
              key={`${item.id}-${item.label}`}
              data-screen={item.id}
              className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
              onClick={() => setActiveScreen(item.id)}
              title={isCollapsed ? item.label : undefined}
              style={{
                width: isCollapsed ? '42px' : 'calc(100% - 16px)',
                margin: isCollapsed ? '3px auto' : '2px 8px',
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: isCollapsed ? '0' : '0 10px',
                justifyContent: isCollapsed ? 'center' : 'flex-start',
                backgroundColor: isActive ? '#EFF6FF' : 'transparent',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontFamily: typography.fontFamily,
                fontSize: '12px',
                fontWeight: isActive ? 600 : 500,
                color: isActive ? '#2563EB' : '#475569',
                boxSizing: 'border-box',
                textAlign: 'left',
                transition: 'all 0.12s ease',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = '#F8FAFC';
                  e.currentTarget.style.color = '#0F172A';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = '#475569';
                }
              }}
            >
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: isActive ? '#2563EB' : '#64748B',
                  flexShrink: 0,
                }}
              >
                <IconComp size={16} strokeWidth={isActive ? 2.2 : 1.8} />
              </span>

              {!isCollapsed && (
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
                  {item.label}
                </span>
              )}

              {!isCollapsed && item.badge !== undefined && item.badge > 0 && (
                <span
                  style={{
                    backgroundColor: '#FEE2E2',
                    color: '#DC2626',
                    fontSize: '9px',
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: '10px',
                    border: '1px solid #FECACA',
                  }}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}

        {/* SECTION: SYSTEM */}
        {!isCollapsed && (
          <div
            style={{
              padding: '12px 14px 4px 14px',
              fontSize: '10px',
              fontWeight: 700,
              color: '#64748B',
              letterSpacing: '0.8px',
              textTransform: 'uppercase',
            }}
          >
            SYSTEM
          </div>
        )}

        {systemNavItems.map((item) => {
          const isActive = activeScreen === item.id;
          const IconComp = item.icon;

          return (
            <button
              key={`${item.id}-${item.label}`}
              data-screen={item.id}
              className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
              onClick={() => setActiveScreen(item.id)}
              title={isCollapsed ? item.label : undefined}
              style={{
                width: isCollapsed ? '42px' : 'calc(100% - 16px)',
                margin: isCollapsed ? '3px auto' : '2px 8px',
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: isCollapsed ? '0' : '0 10px',
                justifyContent: isCollapsed ? 'center' : 'flex-start',
                backgroundColor: isActive ? '#EFF6FF' : 'transparent',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontFamily: typography.fontFamily,
                fontSize: '12px',
                fontWeight: isActive ? 600 : 500,
                color: isActive ? '#2563EB' : '#475569',
                boxSizing: 'border-box',
                textAlign: 'left',
                transition: 'all 0.12s ease',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = '#F8FAFC';
                  e.currentTarget.style.color = '#0F172A';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = '#475569';
                }
              }}
            >
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: isActive ? '#2563EB' : '#64748B',
                  flexShrink: 0,
                }}
              >
                <IconComp size={16} strokeWidth={isActive ? 2.2 : 1.8} />
              </span>

              {!isCollapsed && (
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.label}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 3. BOTTOM: SYSTEM STATUS OPERATIONAL CARD */}
      <div style={{ padding: isCollapsed ? '8px 10px 4px 10px' : '8px 12px 4px 12px', flexShrink: 0 }}>
        {!isCollapsed ? (
          <div
            id="sidebar-system-status-card"
            style={{
              backgroundColor: isConnected ? '#E8F8EE' : '#FEF3E2',
              border: `1px solid ${isConnected ? '#DCFCE7' : '#FDE68A'}`,
              borderRadius: '8px',
              padding: '8px 10px',
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '3px',
                  backgroundColor: isConnected ? '#16A34A' : '#D97706',
                }}
              />
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: isConnected ? '#16A34A' : '#D97706',
                }}
              >
                {isConnected ? 'System Online' : 'Connecting...'}
              </span>
            </div>
            <div style={{ fontSize: '10px', color: '#64748B', paddingLeft: '12px' }}>
              {isConnected ? 'SCADA & MQTT Live' : 'Negotiating link'}
            </div>
          </div>
        ) : (
          <div
            title={`System Status: ${isConnected ? 'Online' : 'Connecting'}`}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '8px',
              backgroundColor: isConnected ? '#E8F8EE' : '#FEF3E2',
              border: `1px solid ${isConnected ? '#DCFCE7' : '#FDE68A'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto',
              color: isConnected ? '#16A34A' : '#D97706',
            }}
          >
            <ShieldCheck size={18} strokeWidth={2} />
          </div>
        )}
      </div>

      {/* 4. COLLAPSE NAVIGATION BUTTON (Qt Sidebar.qml) */}
      <div style={{ padding: isCollapsed ? '4px 10px' : '4px 12px', flexShrink: 0 }}>
        <button
          onClick={handleToggle}
          title={isCollapsed ? 'Expand navigation' : 'Collapse navigation'}
          style={{
            width: '100%',
            height: '34px',
            borderRadius: '6px',
            backgroundColor: '#F8FAFC',
            border: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: isCollapsed ? 'center' : 'flex-start',
            gap: '8px',
            padding: isCollapsed ? '0' : '0 10px',
            cursor: 'pointer',
            color: '#64748B',
            fontSize: '11px',
            fontWeight: 500,
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#EFF6FF';
            e.currentTarget.style.borderColor = '#2563EB';
            e.currentTarget.style.color = '#2563EB';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#F8FAFC';
            e.currentTarget.style.borderColor = '#E2E8F0';
            e.currentTarget.style.color = '#64748B';
          }}
        >
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          {!isCollapsed && <span>Collapse Navigation</span>}
        </button>
      </div>

      {/* 5. COPYRIGHT FOOTER (Qt Sidebar.qml) */}
      {!isCollapsed && (
        <div style={{ padding: '8px 14px 12px 14px', flexShrink: 0 }}>
          <div style={{ fontSize: '10px', color: '#94A3B8', lineHeight: '14px' }}>
            © 2026 Panorama Systems
          </div>
          <div style={{ fontSize: '10px', color: '#94A3B8', lineHeight: '14px' }}>
            All rights reserved.
          </div>
          {/* Accessible text for test runners & screen readers */}
          <span
            style={{
              position: 'absolute',
              width: '1px',
              height: '1px',
              padding: 0,
              margin: '-1px',
              overflow: 'hidden',
              clip: 'rect(0, 0, 0, 0)',
              whiteSpace: 'nowrap',
              border: 0,
            }}
          >
            PANORAMA WATER TANK MONITOR
          </span>
        </div>
      )}
    </aside>

    {/* =========================================================================
        MOBILE NAVIGATION DRAWER OVERLAY
        ========================================================================= */}
    {isMobileNavOpen && (
      <div className="sidebar-mobile-drawer-portal">
        <div
          className="mobile-drawer-backdrop"
          onClick={() => setIsMobileNavOpen(false)}
          aria-hidden="true"
        />
        <div
          className="mobile-drawer-sheet"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation Menu"
          onTouchStart={(e) => {
            if (e.touches.length === 1) {
              drawerTouchRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY };
            }
          }}
          onTouchMove={(e) => {
            if (!drawerTouchRef.current || e.touches.length !== 1) return;
            const dx = e.touches[0].clientX - drawerTouchRef.current.startX;
            const dy = e.touches[0].clientY - drawerTouchRef.current.startY;
            if (dx < -48 && Math.abs(dx) > Math.abs(dy) * 1.2) {
              setIsMobileNavOpen(false);
              drawerTouchRef.current = null;
            }
          }}
          onTouchEnd={() => {
            drawerTouchRef.current = null;
          }}
        >
          {/* 1. Header with Hamburger Toggle, Logo, Title, Role Badge, and Close Button */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 14px',
              borderBottom: '1px solid #E2E8F0',
              backgroundColor: '#FFFFFF',
              flexShrink: 0,
              gap: '8px',
            }}
          >
            {/* Left group: Hamburger toggle button matching Header position, Logo, Title */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
              <button
                type="button"
                onClick={() => setIsMobileNavOpen(false)}
                aria-label="Close Navigation Menu"
                className="touch-target-44"
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: '6px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  color: '#0F172A',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  width: '40px',
                  height: '40px',
                }}
              >
                <Menu size={22} />
              </button>
              <img
                src={panoramaLogoIcon}
                alt="Panorama"
                style={{ width: '28px', height: '28px', objectFit: 'contain', borderRadius: '6px', flexShrink: 0 }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2, minWidth: 0 }}>
                <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>
                  PANORAMA
                </span>
                <span style={{ fontSize: '9px', fontWeight: 700, color: '#2563EB', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>
                  WATER TANK MONITOR
                </span>
              </div>
            </div>

            {/* Right group: User Role Badge + Explicit Close Button (X) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  padding: '3px 7px',
                  borderRadius: '4px',
                  backgroundColor: isAdmin ? '#EFF6FF' : '#F1F5F9',
                  color: isAdmin ? '#2563EB' : '#475569',
                  border: `1px solid ${isAdmin ? '#BFDBFE' : '#CBD5E1'}`,
                  letterSpacing: '0.4px',
                }}
              >
                {isAdmin ? 'ADMIN' : 'OPR'}
              </span>
              <button
                type="button"
                onClick={() => setIsMobileNavOpen(false)}
                aria-label="Close menu"
                className="touch-target-44"
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '6px',
                  backgroundColor: '#F1F5F9',
                  border: '1px solid #CBD5E1',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#475569',
                }}
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* 2. Scrollable Drawer Content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Train Summary Card in Mobile Drawer */}
            <div
              id="mobile-drawer-train-summary-card"
              style={{
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '8px',
                padding: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.8px', textTransform: 'uppercase' }}>
                TRAIN SUMMARY
              </div>
              <div
                onClick={() => {
                  setActiveScreen('dashboard');
                  setIsMobileNavOpen(false);
                }}
                style={{
                  backgroundColor: '#EFF6FF',
                  border: '1px solid #BFDBFE',
                  borderRadius: '6px',
                  padding: '6px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                }}
              >
                <div style={{ width: '6px', height: '6px', borderRadius: '3px', backgroundColor: '#2563EB', flexShrink: 0 }} />
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#2563EB', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {trainDisplayTitle}
                </span>
              </div>

              <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 500 }}>
                {liveTelemetry ? 'Eastern Railway • Live Corridor' : 'Eastern Railway'}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', paddingTop: '4px' }}>
                <div style={{ backgroundColor: '#FFFFFF', padding: '8px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>
                    {totalCoachesCount}
                  </div>
                  <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 600 }}>Coaches</div>
                </div>
                <div style={{ backgroundColor: '#FFFFFF', padding: '8px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>
                    {totalTanksCount}
                  </div>
                  <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 600 }}>Tanks</div>
                </div>
                <div style={{ backgroundColor: '#FFFFFF', padding: '8px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: onlineTanksCount > 0 ? '#16A34A' : '#64748B' }}>
                    {onlineTanksCount}
                  </div>
                  <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 600 }}>Online</div>
                </div>
                <div style={{ backgroundColor: '#FFFFFF', padding: '8px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: offlineTanksCount > 0 ? '#DC2626' : '#64748B' }}>
                    {offlineTanksCount}
                  </div>
                  <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 600 }}>Offline</div>
                </div>
              </div>

              {/* Alerts Row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 2px 0 2px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748B' }}>Active Alerts</span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: totalAlertsCount > 0 ? '#DC2626' : '#16A34A' }}>
                  {totalAlertsCount} Alerts
                </span>
              </div>
            </div>

            {/* Primary Navigation List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: '4px' }}>
                NAVIGATION
              </div>
              {primaryNavItems.map((item) => {
                const isActive =
                  item.id === 'trains'
                    ? activeScreen === 'trains' || activeScreen === 'coaches' || activeScreen === 'coach-details'
                    : item.id === 'raw-data'
                    ? activeScreen === 'raw-data' || activeScreen === 'mqtt-monitor'
                    : activeScreen === item.id;
                const IconComp = item.icon;
                return (
                  <button
                    key={item.id}
                    data-screen={item.id}
                    onClick={() => {
                      setActiveScreen(item.id);
                      setIsMobileNavOpen(false);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      width: '100%',
                      minHeight: '48px',
                      padding: '0 12px',
                      borderRadius: '6px',
                      backgroundColor: isActive ? '#EFF6FF' : 'transparent',
                      border: 'none',
                      borderLeft: isActive ? '3px solid #2563EB' : '3px solid transparent',
                      color: isActive ? '#2563EB' : '#334155',
                      fontSize: '13px',
                      fontWeight: isActive ? 700 : 500,
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.15s ease',
                      boxSizing: 'border-box',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <IconComp size={18} color={isActive ? '#2563EB' : '#64748B'} />
                      <span>{item.label}</span>
                    </div>
                    {typeof item.badge === 'number' && item.badge > 0 && (
                      <span
                        style={{
                          backgroundColor: '#EF4444',
                          color: '#FFFFFF',
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '2px 7px',
                          borderRadius: '10px',
                        }}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* System Navigation Section */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px solid #E2E8F0', paddingTop: '12px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: '4px' }}>
                SYSTEM
              </div>
              {systemNavItems.map((item) => {
                const isActive = activeScreen === item.id;
                const IconComp = item.icon;
                return (
                  <button
                    key={item.id}
                    data-screen={item.id}
                    onClick={() => {
                      setActiveScreen(item.id);
                      setIsMobileNavOpen(false);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      width: '100%',
                      minHeight: '48px',
                      padding: '0 12px',
                      borderRadius: '6px',
                      backgroundColor: isActive ? '#EFF6FF' : 'transparent',
                      border: 'none',
                      borderLeft: isActive ? '3px solid #2563EB' : '3px solid transparent',
                      color: isActive ? '#2563EB' : '#334155',
                      fontSize: '13px',
                      fontWeight: isActive ? 700 : 500,
                      cursor: 'pointer',
                      gap: '12px',
                      textAlign: 'left',
                      boxSizing: 'border-box',
                    }}
                  >
                    <IconComp size={18} color={isActive ? '#2563EB' : '#64748B'} />
                    <span>{item.label}</span>
                  </button>
                );
              })}

              {/* Status Badges in Drawer */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    backgroundColor: isConnected ? '#ECFDF5' : '#FEF3C7',
                    border: `1px solid ${isConnected ? '#A7F3D0' : '#FDE68A'}`,
                  }}
                >
                  <div style={{ width: '8px', height: '8px', borderRadius: '4px', backgroundColor: isConnected ? '#16A34A' : '#D97706' }} />
                  <span style={{ fontSize: '11px', fontWeight: 700, color: isConnected ? '#065F46' : '#92400E' }}>
                    {isConnected ? 'System Online' : 'Connecting to Gateway'}
                  </span>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    backgroundColor: mqttConnectionStatus === 'CONNECTED' ? '#EFF6FF' : '#F1F5F9',
                    border: `1px solid ${mqttConnectionStatus === 'CONNECTED' ? '#BFDBFE' : '#CBD5E1'}`,
                  }}
                >
                  <Radio size={14} color={mqttConnectionStatus === 'CONNECTED' ? '#2563EB' : '#64748B'} />
                  <span style={{ fontSize: '11px', fontWeight: 600, color: mqttConnectionStatus === 'CONNECTED' ? '#1E40AF' : '#475569' }}>
                    {mqttConnectionStatus === 'CONNECTED' ? 'SCADA & MQTT Live' : 'MQTT Standby'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 3. Footer: System connection status, application version, user profile & logout */}
          <div
            style={{
              padding: '12px 14px',
              borderTop: '1px solid #E2E8F0',
              backgroundColor: '#F8FAFC',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              flexShrink: 0,
            }}
          >
            {/* System Status & Version Row */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '11px',
                color: '#64748B',
                paddingBottom: '4px',
                borderBottom: '1px solid #EDF2F7',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span
                  style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    backgroundColor: isConnected ? '#16A34A' : '#EAB308',
                    display: 'inline-block',
                  }}
                />
                <span style={{ fontWeight: 600, color: isConnected ? '#15803D' : '#854D0E' }}>
                  {isConnected ? 'SCADA Live' : 'Connecting'}
                </span>
              </div>
              <span style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 500 }}>
                v2.0.0 · Build 2026.11
              </span>
            </div>

            {currentUser && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '50%',
                    backgroundColor: '#2563EB',
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '12px',
                    flexShrink: 0,
                  }}
                >
                  {currentUser.username.substring(0, 2).toUpperCase()}
                </div>
                <div style={{ overflow: 'hidden' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {currentUser.full_name || currentUser.username}
                  </div>
                  <div style={{ fontSize: '10px', color: '#64748B' }}>
                    {isAdmin ? 'System Administrator' : 'Station Operator'}
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={() => {
                setIsMobileNavOpen(false);
                logout();
              }}
              className="touch-target-44"
              style={{
                width: '100%',
                minHeight: '44px',
                borderRadius: '6px',
                backgroundColor: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#EF4444',
                fontSize: '12px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                cursor: 'pointer',
              }}
            >
              <LogOut size={15} />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </div>
    )}
  </>
  );
};
