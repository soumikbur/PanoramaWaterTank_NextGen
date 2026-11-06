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
  Droplet,
  ChevronLeft,
  ChevronRight,
  Layers,
  Activity,
  LogOut,
  LucideIcon,
  Sliders,
} from 'lucide-react';
import { useDisplayPreferences } from '../../context/DisplayPreferencesContext';

export const Sidebar: React.FC = () => {
  const {
    activeScreen,
    setActiveScreen,
    connectionStatus,
    mqttBrokerStatus,
    sidebarCollapsed,
    toggleSidebar,
    devices,
    activeAlarms,
    selectedTrainNumber,
    currentUser,
    logout,
  } = useApp();

  const { sidebarMode, setSidebarMode } = useDisplayPreferences();

  const isConnected = connectionStatus === 'CONNECTED';
  const isAdmin = currentUser?.role === 'ADMIN';

  // 1. Employee Navigation Items (Covering operations, consists, GPS tracking, and display settings)
  const employeeNavItems: { id: ScreenName; label: string; icon: LucideIcon }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'trains', label: 'Train Management', icon: Train },
    { id: 'coaches', label: 'Coach Management', icon: Layers },
    { id: 'devices', label: 'Device Mapping', icon: Cpu },
    { id: 'location', label: 'GPS Tracking', icon: MapPin },
    { id: 'monitoring', label: 'Monitoring', icon: Gauge },
    { id: 'history', label: 'History', icon: LineChart },
    { id: 'reports', label: 'Reports', icon: FileText },
    { id: 'settings', label: 'Display Settings', icon: Sliders },
  ];

  // 2. Admin Fleet Navigation Items (Preserving full admin access)
  const adminPrimaryNavItems: { id: ScreenName; label: string; icon: LucideIcon }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'trains', label: 'Train Management', icon: Train },
    { id: 'coaches', label: 'Coach Management', icon: Layers },
    { id: 'watertank', label: 'All Tanks', icon: Gauge },
    { id: 'devices', label: 'Devices', icon: Cpu },
    { id: 'location', label: 'Location & GPS', icon: MapPin },
    { id: 'monitoring', label: 'Live Monitoring', icon: Activity },
    { id: 'alerts', label: 'Alerts', icon: AlertTriangle },
    { id: 'history', label: 'History', icon: LineChart },
    { id: 'reports', label: 'Reports', icon: FileText },
  ];

  // 3. System & Administration Items (Admin Only)
  const adminSystemNavItems: { id: ScreenName; label: string; icon: LucideIcon }[] = [
    { id: 'settings', label: 'Settings', icon: SettingsIcon },
    { id: 'users', label: 'User Management', icon: UsersIcon },
    { id: 'logs', label: 'System Logs', icon: ScrollText },
  ];

  const currentNavItems = isAdmin ? adminPrimaryNavItems : employeeNavItems;

  // Train summary metrics
  const onlineDevicesCount = devices.filter((d) => d.isOnline ?? d.is_online).length;
  const offlineDevicesCount = devices.length - onlineDevicesCount;
  const totalTanksCount = devices.length * 2;
  const totalAlertsCount = activeAlarms.length;

  const isCollapsed = sidebarMode === 'collapsed' || sidebarMode === 'iconOnly' || sidebarCollapsed;
  const sidebarWidth = isCollapsed ? '64px' : '224px';

  const handleToggle = () => {
    const next = isCollapsed ? 'expanded' : 'collapsed';
    setSidebarMode(next);
    if ((isCollapsed && sidebarCollapsed) || (!isCollapsed && !sidebarCollapsed)) {
      toggleSidebar();
    }
  };

  return (
    <aside
      className="sidebar-container"
      style={{
        width: sidebarWidth,
        minWidth: sidebarWidth,
        maxWidth: sidebarWidth,
        height: '100%',
        backgroundColor: '#0F172A', // Dark Navy SCADA Theme
        borderRight: '1px solid #1E293B',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        transition: 'width 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        userSelect: 'none',
        zIndex: 90,
        overflow: 'hidden',
      }}
    >
      {/* Brand Header */}
      <div
        style={{
          padding: isCollapsed ? '16px 8px' : '16px 14px',
          borderBottom: '1px solid #1E293B',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        <div
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '6px',
            backgroundColor: '#1E293B',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#38BDF8',
            flexShrink: 0,
            border: '1px solid #334155',
          }}
        >
          <Droplet size={18} strokeWidth={2.2} />
        </div>
        {!sidebarCollapsed && (
          <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <span
              style={{
                fontFamily: typography.fontFamily,
                fontSize: '13px',
                fontWeight: 800,
                color: '#F8FAFC',
                letterSpacing: '0.6px',
              }}
            >
              WLI RAILWAY
            </span>
            <span
              style={{
                fontFamily: typography.fontFamily,
                fontSize: '10px',
                color: '#94A3B8',
                fontWeight: 500,
              }}
            >
              {isAdmin ? 'Admin SCADA Console' : 'Employee Portal'}
            </span>
          </div>
        )}
      </div>

      {/* Train Summary Card (Collapsible) */}
      {!sidebarCollapsed && (
        <div
          style={{
            margin: '10px 12px',
            padding: '10px 12px',
            borderRadius: '8px',
            backgroundColor: '#1E293B',
            border: '1px solid #334155',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: '#F8FAFC',
              }}
            >
              {selectedTrainNumber} &bull; Active Consist
            </span>
            <span
              style={{
                fontSize: '9px',
                fontWeight: 600,
                color: '#38BDF8',
                backgroundColor: 'rgba(56, 189, 248, 0.12)',
                border: '1px solid rgba(56, 189, 248, 0.25)',
                padding: '1px 5px',
                borderRadius: '4px',
              }}
            >
              LIVE
            </span>
          </div>
          <div
            style={{
              fontSize: '10px',
              color: '#94A3B8',
              marginTop: '2px',
              marginBottom: '8px',
            }}
          >
            Railway Telemetry Corridor
          </div>

          {/* 2x2 Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '6px',
              fontSize: '10px',
            }}
          >
            <div style={{ backgroundColor: '#0F172A', padding: '4px 6px', borderRadius: '4px', border: '1px solid #334155' }}>
              <span style={{ color: '#94A3B8' }}>Coaches: </span>
              <strong style={{ color: '#F8FAFC' }}>{devices.length || 1}</strong>
            </div>
            <div style={{ backgroundColor: '#0F172A', padding: '4px 6px', borderRadius: '4px', border: '1px solid #334155' }}>
              <span style={{ color: '#94A3B8' }}>Tanks: </span>
              <strong style={{ color: '#F8FAFC' }}>{totalTanksCount || 2}</strong>
            </div>
            <div style={{ backgroundColor: '#0F172A', padding: '4px 6px', borderRadius: '4px', border: '1px solid #334155' }}>
              <span style={{ color: '#94A3B8' }}>Online: </span>
              <strong style={{ color: onlineDevicesCount > 0 ? '#4ADE80' : '#94A3B8' }}>{onlineDevicesCount}</strong>
            </div>
            <div style={{ backgroundColor: '#0F172A', padding: '4px 6px', borderRadius: '4px', border: '1px solid #334155' }}>
              <span style={{ color: '#94A3B8' }}>Offline: </span>
              <strong style={{ color: '#94A3B8' }}>{offlineDevicesCount}</strong>
            </div>
          </div>

          {/* Alerts Row */}
          <div
            style={{
              marginTop: '6px',
              padding: '3px 6px',
              borderRadius: '4px',
              backgroundColor: totalAlertsCount > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
              color: totalAlertsCount > 0 ? '#F87171' : '#4ADE80',
              border: `1px solid ${totalAlertsCount > 0 ? 'rgba(239, 68, 68, 0.3)' : 'rgba(34, 197, 94, 0.3)'}`,
              fontSize: '10px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>Alerts:</span>
            <span>{totalAlertsCount > 0 ? `${totalAlertsCount} Active` : '0 Normal'}</span>
          </div>
        </div>
      )}

      {/* Nav List Area */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          paddingTop: '6px',
          paddingBottom: '6px',
        }}
      >
        {/* Navigation Section Header */}
        {!sidebarCollapsed && (
          <div
            style={{
              padding: '6px 14px 2px 14px',
              fontSize: '10px',
              fontWeight: 700,
              color: '#64748B',
              letterSpacing: '0.6px',
              textTransform: 'uppercase',
            }}
          >
            {isAdmin ? 'Fleet Operations' : 'Employee Operations'}
          </div>
        )}

        {/* Primary Items */}
        {currentNavItems.map((item) => {
          const isActive = activeScreen === item.id;
          const IconComp = item.icon;
          return (
            <button
              key={item.id}
              data-screen={item.id}
              className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
              onClick={() => setActiveScreen(item.id)}
              title={sidebarCollapsed ? item.label : undefined}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: sidebarCollapsed ? '10px 0' : '9px 14px',
                justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                backgroundColor: isActive ? '#1E293B' : 'transparent',
                border: 'none',
                borderLeft: isActive ? '3px solid #38BDF8' : '3px solid transparent',
                cursor: 'pointer',
                fontFamily: typography.fontFamily,
                fontSize: '12px',
                fontWeight: isActive ? 600 : 500,
                color: isActive ? '#38BDF8' : '#94A3B8',
                boxSizing: 'border-box',
                textAlign: 'left',
                transition: 'all 0.12s ease',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: isActive ? '#38BDF8' : '#64748B' }}>
                <IconComp size={16} strokeWidth={isActive ? 2.2 : 1.8} />
              </span>
              {!sidebarCollapsed && (
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.label}
                </span>
              )}
            </button>
          );
        })}

        {/* System Section Header (Admin Only) */}
        {isAdmin && !sidebarCollapsed && (
          <div
            style={{
              padding: '12px 14px 2px 14px',
              fontSize: '10px',
              fontWeight: 700,
              color: '#64748B',
              letterSpacing: '0.6px',
              textTransform: 'uppercase',
            }}
          >
            System & Fleet
          </div>
        )}

        {/* System Items (Admin Only) */}
        {isAdmin &&
          adminSystemNavItems.map((item) => {
            const isActive = activeScreen === item.id;
            const IconComp = item.icon;
            return (
              <button
                key={item.id}
                data-screen={item.id}
                className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
                onClick={() => setActiveScreen(item.id)}
                title={sidebarCollapsed ? item.label : undefined}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: sidebarCollapsed ? '10px 0' : '9px 14px',
                  justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                  backgroundColor: isActive ? '#1E293B' : 'transparent',
                  border: 'none',
                  borderLeft: isActive ? '3px solid #38BDF8' : '3px solid transparent',
                  cursor: 'pointer',
                  fontFamily: typography.fontFamily,
                  fontSize: '12px',
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? '#38BDF8' : '#94A3B8',
                  boxSizing: 'border-box',
                  textAlign: 'left',
                  transition: 'all 0.12s ease',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: isActive ? '#38BDF8' : '#64748B' }}>
                  <IconComp size={16} strokeWidth={isActive ? 2.2 : 1.8} />
                </span>
                {!sidebarCollapsed && (
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.label}
                  </span>
                )}
              </button>
            );
          })}

        {/* Item 8: Logout Button for Employee and Admin */}
        <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #1E293B' }}>
          <button
            id="sidebar-logout-btn"
            onClick={logout}
            title={sidebarCollapsed ? 'Logout' : undefined}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: sidebarCollapsed ? '10px 0' : '9px 14px',
              justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
              backgroundColor: 'transparent',
              border: 'none',
              borderLeft: '3px solid transparent',
              cursor: 'pointer',
              fontFamily: typography.fontFamily,
              fontSize: '12px',
              fontWeight: 500,
              color: '#F87171',
              boxSizing: 'border-box',
              textAlign: 'left',
              transition: 'all 0.12s ease',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#F87171' }}>
              <LogOut size={16} strokeWidth={1.8} />
            </span>
            {!sidebarCollapsed && (
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                Logout
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Footer / Toggle Sidebar Area */}
      <div
        style={{
          padding: '10px 14px',
          borderTop: '1px solid #1E293B',
          display: 'flex',
          alignItems: 'center',
          justifyContent: sidebarCollapsed ? 'center' : 'space-between',
          backgroundColor: '#0F172A',
        }}
      >
        {!sidebarCollapsed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: isConnected ? '#4ADE80' : '#EF4444',
              }}
            />
            <span style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 500 }}>
              {isConnected
                ? (mqttBrokerStatus === 'CONNECTED' ? 'SCADA & MQTT Online' : 'SCADA Online')
                : 'SCADA Offline'}
            </span>
          </div>
        )}
        <button
          onClick={handleToggle}
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{
            background: '#1E293B',
            border: '1px solid #334155',
            borderRadius: '4px',
            cursor: 'pointer',
            padding: '4px 6px',
            color: '#94A3B8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>
    </aside>
  );
};
