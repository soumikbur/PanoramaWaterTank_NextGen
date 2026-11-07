import React from 'react';
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

  // 1. Employee Navigation Items
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

  // 2. Admin Primary Fleet Navigation Items
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
        backgroundColor: 'var(--color-surface, #FFFFFF)',
        borderRight: '1px solid var(--color-border, #E2E8F0)',
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
          borderBottom: '1px solid var(--color-border, #E2E8F0)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        <img
          src={panoramaLogoIcon}
          alt="Panorama"
          style={{
            width: '28px',
            height: '28px',
            objectFit: 'contain',
            borderRadius: '4px',
            flexShrink: 0,
          }}
        />
        {!sidebarCollapsed && (
          <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <span
              style={{
                fontFamily: typography.fontFamily,
                fontSize: '12px',
                fontWeight: 800,
                color: 'var(--color-text-primary, #0F172A)',
                letterSpacing: '0.5px',
                lineHeight: 1.2,
              }}
            >
              PANORAMA SCADA
            </span>
            <span
              style={{
                fontFamily: typography.fontFamily,
                fontSize: '10px',
                color: 'var(--color-text-muted, #64748B)',
                fontWeight: 500,
              }}
            >
              {isAdmin ? 'Admin HMI Console' : 'Water Tank Telemetry'}
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
            backgroundColor: 'var(--color-surface-alt, #F8FAFC)',
            border: '1px solid var(--color-border, #CBD5E1)',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--color-text-primary, #0F172A)',
              }}
            >
              {selectedTrainNumber} &bull; Active Consist
            </span>
            <span
              style={{
                fontSize: '9px',
                fontWeight: 700,
                color: 'var(--color-primary, #2563EB)',
                backgroundColor: 'var(--color-primary-surface, #EFF6FF)',
                border: '1px solid var(--color-primary-border, #BFDBFE)',
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
              color: 'var(--color-text-muted, #64748B)',
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
            <div style={{ backgroundColor: 'var(--color-surface, #FFFFFF)', padding: '4px 6px', borderRadius: '4px', border: '1px solid var(--color-border, #E2E8F0)' }}>
              <span style={{ color: 'var(--color-text-muted, #64748B)' }}>Coaches: </span>
              <strong style={{ color: 'var(--color-text-primary, #0F172A)' }}>{devices.length || 1}</strong>
            </div>
            <div style={{ backgroundColor: 'var(--color-surface, #FFFFFF)', padding: '4px 6px', borderRadius: '4px', border: '1px solid var(--color-border, #E2E8F0)' }}>
              <span style={{ color: 'var(--color-text-muted, #64748B)' }}>Tanks: </span>
              <strong style={{ color: 'var(--color-text-primary, #0F172A)' }}>{totalTanksCount || 2}</strong>
            </div>
            <div style={{ backgroundColor: 'var(--color-surface, #FFFFFF)', padding: '4px 6px', borderRadius: '4px', border: '1px solid var(--color-border, #E2E8F0)' }}>
              <span style={{ color: 'var(--color-text-muted, #64748B)' }}>Online: </span>
              <strong style={{ color: onlineDevicesCount > 0 ? 'var(--color-success, #16A34A)' : 'var(--color-text-muted, #64748B)' }}>{onlineDevicesCount}</strong>
            </div>
            <div style={{ backgroundColor: 'var(--color-surface, #FFFFFF)', padding: '4px 6px', borderRadius: '4px', border: '1px solid var(--color-border, #E2E8F0)' }}>
              <span style={{ color: 'var(--color-text-muted, #64748B)' }}>Offline: </span>
              <strong style={{ color: 'var(--color-text-muted, #64748B)' }}>{offlineDevicesCount}</strong>
            </div>
          </div>

          {/* Alerts Row */}
          <div
            style={{
              marginTop: '6px',
              padding: '3px 6px',
              borderRadius: '4px',
              backgroundColor: totalAlertsCount > 0 ? 'var(--color-critical-surface, #FEE2E2)' : 'var(--color-success-surface, #ECFDF5)',
              color: totalAlertsCount > 0 ? 'var(--color-critical, #DC2626)' : 'var(--color-success, #16A34A)',
              border: `1px solid ${totalAlertsCount > 0 ? 'var(--color-critical-border, #FCA5A5)' : 'var(--color-success-border, #DCFCE7)'}`,
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
              color: 'var(--color-text-muted, #64748B)',
              letterSpacing: '0.6px',
              textTransform: 'uppercase',
            }}
          >
            {isAdmin ? 'Fleet Operations' : 'Employee Operations'}
          </div>
        )}

        {/* Primary Items */}
        {currentNavItems.map((item) => {
          const isActive = activeScreen === item.id || (item.id === 'coaches' && activeScreen === 'coach-details');
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
                backgroundColor: isActive ? 'var(--color-primary-surface, #EFF6FF)' : 'transparent',
                border: 'none',
                borderLeft: isActive ? '3px solid var(--color-primary, #2563EB)' : '3px solid transparent',
                cursor: 'pointer',
                fontFamily: typography.fontFamily,
                fontSize: '12px',
                fontWeight: isActive ? 700 : 500,
                color: isActive ? 'var(--color-primary, #2563EB)' : 'var(--color-text-secondary, #475569)',
                boxSizing: 'border-box',
                textAlign: 'left',
                transition: 'all 0.12s ease',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: isActive ? 'var(--color-primary, #2563EB)' : 'var(--color-text-muted, #64748B)' }}>
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
              color: 'var(--color-text-muted, #64748B)',
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
                  backgroundColor: isActive ? 'var(--color-primary-surface, #EFF6FF)' : 'transparent',
                  border: 'none',
                  borderLeft: isActive ? '3px solid var(--color-primary, #2563EB)' : '3px solid transparent',
                  cursor: 'pointer',
                  fontFamily: typography.fontFamily,
                  fontSize: '12px',
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? 'var(--color-primary, #2563EB)' : 'var(--color-text-secondary, #475569)',
                  boxSizing: 'border-box',
                  textAlign: 'left',
                  transition: 'all 0.12s ease',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: isActive ? 'var(--color-primary, #2563EB)' : 'var(--color-text-muted, #64748B)' }}>
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

        {/* Logout Button */}
        <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--color-border, #E2E8F0)' }}>
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
              color: 'var(--color-critical, #DC2626)',
              boxSizing: 'border-box',
              textAlign: 'left',
              transition: 'all 0.12s ease',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-critical, #DC2626)' }}>
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
          borderTop: '1px solid var(--color-border, #E2E8F0)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: sidebarCollapsed ? 'center' : 'space-between',
          backgroundColor: 'var(--color-surface-alt, #F8FAFC)',
        }}
      >
        {!sidebarCollapsed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: isConnected ? 'var(--color-success, #16A34A)' : 'var(--color-critical, #DC2626)',
              }}
            />
            <span style={{ fontSize: '10px', color: 'var(--color-text-muted, #64748B)', fontWeight: 500 }}>
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
            background: 'var(--color-surface, #FFFFFF)',
            border: '1px solid var(--color-border-strong, #CBD5E1)',
            borderRadius: '4px',
            cursor: 'pointer',
            padding: '4px 6px',
            color: 'var(--color-text-secondary, #475569)',
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
