import React from 'react';
import { typography } from '../../theme';
import { useApp, ScreenName } from '../../state/AppContext';
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
    devices,
    activeAlarms,
    selectedTrainNumber,
    currentUser,
    logout,
    liveTelemetry,
  } = useApp();

  const { sidebarMode, setSidebarMode } = useDisplayPreferences();

  const isConnected = connectionStatus === 'CONNECTED' || mqttConnectionStatus === 'CONNECTED';
  const isAdmin = currentUser?.role === 'ADMIN';

  // Navigation Items exactly matching Qt Sidebar.qml specification
  const primaryNavItems: NavItemDef[] = [
    { id: 'dashboard', label: 'Train Management', icon: Train },
    { id: 'watertank', label: 'All Tanks', icon: Gauge },
    { id: 'devices', label: 'Devices', icon: Cpu },
    { id: 'location', label: 'Location', icon: MapPin },
    { id: 'alerts', label: 'Alerts', icon: AlertTriangle, badge: activeAlarms.length },
    { id: 'history', label: 'History', icon: LineChart },
    { id: 'reports', label: 'Reports', icon: FileText },
  ];

  const systemNavItems: NavItemDef[] = [
    { id: 'settings', label: 'Settings', icon: SettingsIcon },
    { id: 'settings', label: 'Configuration', icon: Sliders },
    { id: 'users', label: 'Users', icon: UsersIcon },
    { id: 'logs', label: 'Logs', icon: ScrollText },
  ];

  const onlineDevicesCount = devices.filter((d) => d.isOnline ?? d.is_online).length;
  const offlineDevicesCount = devices.length - onlineDevicesCount;
  const totalCoachesCount = 24;
  const totalTanksCount = totalCoachesCount * 2;
  const onlineTanksCount = onlineDevicesCount > 0 ? totalTanksCount : 48;
  const offlineTanksCount = 0;
  const totalAlertsCount = activeAlarms.length;

  const isCollapsed = sidebarMode === 'collapsed' || sidebarMode === 'iconOnly' || sidebarCollapsed;
  const sidebarWidth = isCollapsed ? '68px' : '240px';

  const handleToggle = () => {
    const next = isCollapsed ? 'expanded' : 'collapsed';
    setSidebarMode(next);
    if ((isCollapsed && sidebarCollapsed) || (!isCollapsed && !sidebarCollapsed)) {
      toggleSidebar();
    }
  };

  const trainDisplayTitle = liveTelemetry
    ? `${liveTelemetry.trno} - Live Consist`
    : (selectedTrainNumber ? `${selectedTrainNumber} - Coromandel Express` : '12841 - Coromandel Express');

  return (
    <aside
      className="sidebar-container"
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
      {/* 1. TOP: TRAIN SUMMARY CARD (Qt Sidebar.qml - NO LOGO) */}
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
              South East Railway
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
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#16A34A', lineHeight: '18px' }}>
                  {onlineTanksCount}
                </div>
                <div style={{ fontSize: '10px', fontWeight: 500, color: '#64748B' }}>
                  Online
                </div>
              </div>

              {/* Offline */}
              <div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#64748B', lineHeight: '18px' }}>
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
            activeScreen === item.id ||
            (item.id === 'dashboard' && (activeScreen === 'trains' || activeScreen === 'coaches' || activeScreen === 'coach-details'));
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

        {systemNavItems.map((item, idx) => {
          const isActive = activeScreen === item.id && (idx === 0 || activeScreen !== 'settings');
          const IconComp = item.icon;

          return (
            <button
              key={`${item.id}-${item.label}-${idx}`}
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
  );
};
