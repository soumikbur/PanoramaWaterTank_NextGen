import React from 'react';
import { colors, typography } from '../../theme';
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
  Shield,
  Activity,
  LucideIcon,
} from 'lucide-react';

export const Sidebar: React.FC = () => {
  const {
    activeScreen,
    setActiveScreen,
    connectionStatus,
    sidebarCollapsed,
    toggleSidebar,
    devices,
    activeAlarms,
    selectedTrainNumber,
    currentUser,
  } = useApp();

  const isConnected = connectionStatus === 'CONNECTED';
  const isAdmin = currentUser?.role === 'ADMIN';

  // 8 Main Operational Navigation Items
  const primaryNavItems: { id: ScreenName; label: string; icon: LucideIcon }[] = [
    { id: 'trains', label: 'Train Management', icon: Train },
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'watertank', label: 'All Tanks', icon: Gauge },
    { id: 'devices', label: 'Devices', icon: Cpu },
    { id: 'location', label: 'Location & GPS', icon: MapPin },
    { id: 'alerts', label: 'Alerts', icon: AlertTriangle },
    { id: 'history', label: 'History', icon: LineChart },
    { id: 'reports', label: 'Reports', icon: FileText },
  ];

  // System & Management Navigation Items (Admin Only)
  const systemNavItems: { id: ScreenName; label: string; icon: LucideIcon }[] = [
    { id: 'settings', label: 'Settings', icon: SettingsIcon },
    { id: 'users', label: 'User Management', icon: UsersIcon },
    { id: 'logs', label: 'System Logs', icon: ScrollText },
  ];

  // Train summary metrics
  const onlineDevicesCount = devices.filter((d) => d.isOnline ?? d.is_online).length;
  const offlineDevicesCount = devices.length - onlineDevicesCount;
  const totalTanksCount = devices.length * 2;
  const totalAlertsCount = activeAlarms.length;

  const sidebarWidth = sidebarCollapsed ? '64px' : '224px';

  return (
    <aside
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
      {/* Brand Header */}
      <div
        style={{
          padding: sidebarCollapsed ? '16px 8px' : '16px 14px',
          borderBottom: '1px solid #F1F5F9',
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
            backgroundColor: '#EFF6FF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#2563EB',
            flexShrink: 0,
          }}
        >
          <Droplet size={18} strokeWidth={2.2} />
        </div>
        {!sidebarCollapsed && (
          <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <span
              style={{
                fontFamily: typography.fontFamily,
                fontSize: '14px',
                fontWeight: 800,
                color: '#0F172A',
                letterSpacing: '0.6px',
              }}
            >
              PANORAMA
            </span>
            <span
              style={{
                fontFamily: typography.fontFamily,
                fontSize: '10px',
                color: '#64748B',
                fontWeight: 500,
              }}
            >
              Water Tank NextGen
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
            backgroundColor: '#F8FAFC',
            border: '1px solid #E2E8F0',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: '#1E293B',
              }}
            >
              {selectedTrainNumber} &bull; Shatabdi
            </span>
            <span
              style={{
                fontSize: '9px',
                fontWeight: 600,
                color: '#2563EB',
                backgroundColor: '#EFF6FF',
                padding: '1px 5px',
                borderRadius: '4px',
              }}
            >
              NR
            </span>
          </div>
          <div
            style={{
              fontSize: '10px',
              color: '#64748B',
              marginTop: '2px',
              marginBottom: '8px',
            }}
          >
            Northern Railway Corridor
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
            <div style={{ backgroundColor: '#FFFFFF', padding: '4px 6px', borderRadius: '4px', border: '1px solid #E2E8F0' }}>
              <span style={{ color: '#64748B' }}>Coaches: </span>
              <strong style={{ color: '#0F172A' }}>{devices.length}</strong>
            </div>
            <div style={{ backgroundColor: '#FFFFFF', padding: '4px 6px', borderRadius: '4px', border: '1px solid #E2E8F0' }}>
              <span style={{ color: '#64748B' }}>Tanks: </span>
              <strong style={{ color: '#0F172A' }}>{totalTanksCount}</strong>
            </div>
            <div style={{ backgroundColor: '#FFFFFF', padding: '4px 6px', borderRadius: '4px', border: '1px solid #E2E8F0' }}>
              <span style={{ color: '#64748B' }}>Online: </span>
              <strong style={{ color: onlineDevicesCount > 0 ? '#16A34A' : '#64748B' }}>{onlineDevicesCount}</strong>
            </div>
            <div style={{ backgroundColor: '#FFFFFF', padding: '4px 6px', borderRadius: '4px', border: '1px solid #E2E8F0' }}>
              <span style={{ color: '#64748B' }}>Offline: </span>
              <strong style={{ color: '#64748B' }}>{offlineDevicesCount}</strong>
            </div>
          </div>

          {/* Alerts Row */}
          <div
            style={{
              marginTop: '6px',
              padding: '3px 6px',
              borderRadius: '4px',
              backgroundColor: totalAlertsCount > 0 ? '#FEE2E2' : '#ECFDF5',
              color: totalAlertsCount > 0 ? '#DC2626' : '#16A34A',
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
        {/* Operations Section Header */}
        {!sidebarCollapsed && (
          <div
            style={{
              padding: '6px 14px 2px 14px',
              fontSize: '10px',
              fontWeight: 700,
              color: '#94A3B8',
              letterSpacing: '0.5px',
              textTransform: 'uppercase',
            }}
          >
            Operations
          </div>
        )}

        {/* Primary Items */}
        {primaryNavItems.map((item) => {
          const isActive = activeScreen === item.id;
          const IconComp = item.icon;
          return (
            <button
              key={item.id}
              data-screen={item.id}
              onClick={() => setActiveScreen(item.id)}
              title={sidebarCollapsed ? item.label : undefined}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: sidebarCollapsed ? '10px 0' : '9px 14px',
                justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                backgroundColor: isActive ? '#EFF6FF' : 'transparent',
                border: 'none',
                borderLeft: isActive ? '3px solid #2563EB' : '3px solid transparent',
                cursor: 'pointer',
                fontFamily: typography.fontFamily,
                fontSize: '12px',
                fontWeight: isActive ? 600 : 500,
                color: isActive ? '#2563EB' : '#475569',
                boxSizing: 'border-box',
                textAlign: 'left',
                transition: 'background-color 0.1s ease',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
              color: '#94A3B8',
              letterSpacing: '0.5px',
              textTransform: 'uppercase',
            }}
          >
            System & Fleet
          </div>
        )}

        {/* System Items (Admin Only) */}
        {isAdmin &&
          systemNavItems.map((item) => {
            const isActive = activeScreen === item.id;
            const IconComp = item.icon;
            return (
              <button
                key={item.id}
                data-screen={item.id}
                onClick={() => setActiveScreen(item.id)}
                title={sidebarCollapsed ? item.label : undefined}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: sidebarCollapsed ? '10px 0' : '9px 14px',
                  justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                  backgroundColor: isActive ? '#EFF6FF' : 'transparent',
                  border: 'none',
                  borderLeft: isActive ? '3px solid #2563EB' : '3px solid transparent',
                  cursor: 'pointer',
                  fontFamily: typography.fontFamily,
                  fontSize: '12px',
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? '#2563EB' : '#475569',
                  boxSizing: 'border-box',
                  textAlign: 'left',
                  transition: 'background-color 0.1s ease',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
      </div>

      {/* Footer / Toggle Sidebar Area */}
      <div
        style={{
          padding: '10px 14px',
          borderTop: '1px solid #F1F5F9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: sidebarCollapsed ? 'center' : 'space-between',
        }}
      >
        {!sidebarCollapsed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: isConnected ? '#16A34A' : '#DC2626',
              }}
            />
            <span style={{ fontSize: '10px', color: '#64748B', fontWeight: 500 }}>
              {isConnected ? 'MQTT Online' : 'MQTT Offline'}
            </span>
          </div>
        )}
        <button
          onClick={toggleSidebar}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{
            background: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: '4px',
            cursor: 'pointer',
            padding: '4px 6px',
            color: '#64748B',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {sidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>
    </aside>
  );
};
