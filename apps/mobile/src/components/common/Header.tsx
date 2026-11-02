import React from 'react';
import { colors, typography } from '../../theme';
import { useApp, ScreenName } from '../../state/AppContext';
import {
  Droplet,
  Home,
  Search,
  X,
  Settings as SettingsIcon,
  LogOut,
  User as UserIcon,
} from 'lucide-react';

export const Header: React.FC = () => {
  const {
    activeScreen,
    setActiveScreen,
    connectionStatus,
    currentTime,
    currentDate,
    currentUser,
    searchQuery,
    setSearchQuery,
    logout,
  } = useApp();

  // Screen titles and subtitles
  const screenInfo: Record<ScreenName, { title: string; subtitle: string }> = {
    login: {
      title: 'Authentication',
      subtitle: 'Sign in to access Panorama SCADA console',
    },
    dashboard: {
      title: 'Water Tank Dashboard',
      subtitle: 'Real-time telemetry, capacity level & diagnostic indicators',
    },
    trains: {
      title: 'Train Management',
      subtitle: 'Railway fleet operations & regional consist management',
    },
    watertank: {
      title: 'All Tanks',
      subtitle: 'Fleet-wide water reservoir level & volume monitoring',
    },
    devices: {
      title: 'Devices',
      subtitle: 'Manage and monitor connected water-level monitoring devices',
    },
    location: {
      title: 'Location',
      subtitle: 'Route intelligence & water refill monitoring',
    },
    alerts: {
      title: 'Alerts & Alarm Management',
      subtitle: 'Active system alarms, critical thresholds & acknowledgments',
    },
    history: {
      title: 'Historical Telemetry Logs',
      subtitle: 'Downsampled multi-interval sensor time-series & CSV export',
    },
    reports: {
      title: 'Operational Reports',
      subtitle: 'Water consumption analysis, refill logs & compliance audit',
    },
    settings: {
      title: 'Settings',
      subtitle: 'Tank geometry, alarm thresholds & hardware configuration',
    },
    users: {
      title: 'User Management & RBAC',
      subtitle: 'Operator accounts, security policies & role-based permissions',
    },
    logs: {
      title: 'Diagnostics & Event Logs',
      subtitle: 'Raw edge payloads, connection handshakes & audit trails',
    },
  };

  const currentInfo = screenInfo[activeScreen] || {
    title: 'Panorama SCADA',
    subtitle: 'Railway IoT Water Monitoring Platform',
  };

  const isConnected = connectionStatus === 'CONNECTED';
  const isReconnecting = connectionStatus === 'RECONNECTING';
  const isAdmin = currentUser?.role === 'ADMIN';

  return (
    <header
      style={{
        height: '72px',
        backgroundColor: '#FFFFFF',
        borderBottom: '1px solid #E2E8F0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingLeft: '20px',
        paddingRight: '20px',
        boxSizing: 'border-box',
        userSelect: 'none',
        zIndex: 100,
        flexShrink: 0,
      }}
    >
      {/* Left: Brand Emblem + Home + Screen Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        {/* Brand Emblem */}
        <div
          onClick={() => setActiveScreen('dashboard')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            cursor: 'pointer',
          }}
          title="Panorama NextGen SCADA"
        >
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '8px',
              backgroundColor: '#EFF6FF',
              border: '1px solid #BFDBFE',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#2563EB',
            }}
          >
            <Droplet size={20} strokeWidth={2.2} />
          </div>
        </div>

        {/* Home Button */}
        <button
          onClick={() => setActiveScreen('dashboard')}
          title="Return to Home Dashboard"
          style={{
            background: activeScreen === 'dashboard' ? '#EFF6FF' : '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: '6px',
            width: '34px',
            height: '34px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: activeScreen === 'dashboard' ? '#2563EB' : '#64748B',
            transition: 'all 0.15s ease',
          }}
        >
          <Home size={16} />
        </button>

        {/* Vertical Divider */}
        <div style={{ width: '1px', height: '32px', backgroundColor: '#E2E8F0' }} />

        {/* Screen Title & Subtitle */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1
              style={{
                margin: 0,
                fontSize: '17px',
                fontWeight: 700,
                color: '#0F172A',
                fontFamily: typography.fontFamily,
                lineHeight: '22px',
                letterSpacing: '-0.2px',
              }}
            >
              {currentInfo.title}
            </h1>
            <span
              style={{
                fontSize: '10px',
                fontWeight: 600,
                color: '#2563EB',
                backgroundColor: '#EFF6FF',
                padding: '2px 7px',
                borderRadius: '4px',
                letterSpacing: '0.4px',
              }}
            >
              SCADA HMI
            </span>
          </div>
          <span
            style={{
              fontSize: '11px',
              color: '#64748B',
              fontFamily: typography.fontFamily,
              marginTop: '1px',
              lineHeight: '15px',
            }}
          >
            {currentInfo.subtitle}
          </span>
        </div>
      </div>

      {/* Center: Global Search Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          flex: 1,
          maxWidth: '380px',
          marginLeft: '24px',
          marginRight: '24px',
        }}
      >
        <div
          style={{
            position: 'relative',
            width: '100%',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <span
            style={{
              position: 'absolute',
              left: '10px',
              color: '#94A3B8',
              display: 'flex',
              alignItems: 'center',
              pointerEvents: 'none',
            }}
          >
            <Search size={14} />
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search trains, coaches, tanks, locations..."
            style={{
              width: '100%',
              height: '36px',
              paddingLeft: '32px',
              paddingRight: '32px',
              backgroundColor: '#F8FAFC',
              border: '1px solid #CBD5E1',
              borderRadius: '6px',
              fontSize: '12px',
              color: '#1E293B',
              outline: 'none',
              fontFamily: typography.fontFamily,
              boxSizing: 'border-box',
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              title="Clear search"
              style={{
                position: 'absolute',
                right: '8px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: '#94A3B8',
                display: 'flex',
                alignItems: 'center',
                padding: '2px',
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Right Controls: Role Badge, Status Pill, Settings, Logout, Live Clock */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {/* Role Badge */}
        {currentUser && (
          <div
            style={{
              backgroundColor: isAdmin ? '#EFF6FF' : '#F1F5F9',
              border: `1px solid ${isAdmin ? '#BFDBFE' : '#CBD5E1'}`,
              borderRadius: '6px',
              padding: '4px 9px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <UserIcon size={12} color={isAdmin ? '#2563EB' : '#64748B'} />
            <span
              style={{
                fontSize: '10px',
                fontWeight: 700,
                color: isAdmin ? '#2563EB' : '#475569',
                letterSpacing: '0.4px',
              }}
            >
              [{currentUser.role}]
            </span>
            <span style={{ fontSize: '11px', color: '#1E293B', fontWeight: 500 }}>
              {currentUser.username}
            </span>
          </div>
        )}

        {/* Online Status Pill */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: isConnected ? '#ECFDF5' : isReconnecting ? '#FEF3C7' : '#FEE2E2',
            border: `1px solid ${isConnected ? '#DCFCE7' : isReconnecting ? '#FDE68A' : '#FCA5A5'}`,
            borderRadius: '16px',
            padding: '3px 10px',
          }}
          title={isConnected ? 'MQTT Broker TLS Connected' : 'Broker Disconnected'}
        >
          <div
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              backgroundColor: isConnected ? '#16A34A' : isReconnecting ? '#D97706' : '#DC2626',
            }}
          />
          <span
            style={{
              fontSize: '10px',
              fontWeight: 700,
              color: isConnected ? '#16A34A' : isReconnecting ? '#D97706' : '#DC2626',
              letterSpacing: '0.4px',
            }}
          >
            {isConnected ? 'ONLINE' : isReconnecting ? 'RECONNECT' : 'OFFLINE'}
          </span>
        </div>

        {/* Settings Shortcut Button (Admin Only) */}
        {isAdmin && (
          <button
            onClick={() => setActiveScreen('settings')}
            title="Open System Settings"
            style={{
              backgroundColor: activeScreen === 'settings' ? '#EFF6FF' : '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '6px',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: activeScreen === 'settings' ? '#2563EB' : '#64748B',
            }}
          >
            <SettingsIcon size={16} />
          </button>
        )}

        {/* Logout Button */}
        <button
          id="header-signout-btn"
          onClick={logout}
          title="Sign out of console"
          style={{
            backgroundColor: '#F8FAFC',
            border: '1px solid #CBD5E1',
            borderRadius: '6px',
            padding: '5px 10px',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: 600,
            color: '#475569',
            fontFamily: typography.fontFamily,
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            transition: 'all 0.15s ease',
          }}
        >
          <LogOut size={13} />
          <span>Sign Out</span>
        </button>

        <div style={{ width: '1px', height: '24px', backgroundColor: '#E2E8F0', margin: '0 2px' }} />

        {/* Live Clock & Date */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: '95px' }}>
          <span
            style={{
              color: '#0F172A',
              fontFamily: typography.fontFamily,
              fontSize: '13px',
              fontWeight: 700,
              lineHeight: '16px',
              letterSpacing: '0.3px',
            }}
          >
            {currentTime || '--:--:--'}
          </span>
          <span
            style={{
              color: '#64748B',
              fontFamily: typography.fontFamily,
              fontSize: '10px',
              fontWeight: 400,
              lineHeight: '13px',
            }}
          >
            {currentDate || 'October 2026'}
          </span>
        </div>
      </div>
    </header>
  );
};
