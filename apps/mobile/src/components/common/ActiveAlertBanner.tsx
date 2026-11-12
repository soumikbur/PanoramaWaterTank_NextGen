import React from 'react';
import { useApp } from '../../state/AppContext';
import { NOTIFICATION_CONFIG } from '../../config/notificationConfig';
import { Bell, BellOff, AlertTriangle, ArrowRight } from 'lucide-react';

export const ActiveAlertBanner: React.FC = () => {
  const {
    managedAlerts,
    activeAlarms,
    notificationPermission,
    requestNotificationPermission,
    setActiveScreen,
    activeScreen,
  } = useApp();

  const unackedManaged = managedAlerts.filter((a) => a.status === 'ACTIVE');
  const unackedBackend = activeAlarms.filter(
    (a) =>
      a.status === 'ACTIVE' &&
      !managedAlerts.some((m) => m.id === a.id && m.status !== 'ACTIVE')
  );

  // Deduplicate overlapping count while preserving both sources
  const activeCount = Math.max(unackedManaged.length, unackedBackend.length);
  const criticalCount = unackedManaged.filter((a) => a.severity === 'CRITICAL').length ||
    unackedBackend.filter((a) => a.severity === 'CRITICAL').length;

  const isDenied = notificationPermission === 'denied';
  const isDefault = notificationPermission === 'default';

  if (activeCount === 0 && !isDenied && !isDefault) {
    return null;
  }

  return (
    <div
      data-testid="active-alert-banner"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px',
        padding: '8px 16px',
        backgroundColor: activeCount > 0 ? (criticalCount > 0 ? '#FEF2F2' : '#FFFBEB') : isDenied ? '#FFF7ED' : '#EFF6FF',
        borderBottom: `1px solid ${activeCount > 0 ? (criticalCount > 0 ? '#FECACA' : '#FDE68A') : isDenied ? '#FED7AA' : '#BFDBFE'}`,
        fontSize: '12px',
        lineHeight: 1.4,
        zIndex: 50,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', minWidth: 0, flex: '1 1 220px' }}>
        {activeCount > 0 ? (
          <>
            <AlertTriangle size={15} color={criticalCount > 0 ? '#DC2626' : '#D97706'} style={{ flexShrink: 0 }} />
            <span style={{ fontWeight: 700, color: criticalCount > 0 ? '#991B1B' : '#92400E' }}>
              {activeCount} Active Unacknowledged Alert{activeCount > 1 ? 's' : ''}
            </span>
            <span style={{ color: criticalCount > 0 ? '#B91C1C' : '#B45309', fontSize: '11px' }}>
              (Reminders every {NOTIFICATION_CONFIG.REMINDER_INTERVAL_SECONDS}s until acknowledged or resolved)
            </span>
          </>
        ) : isDenied ? (
          <>
            <BellOff size={15} color="#C2410C" style={{ flexShrink: 0 }} />
            <span style={{ fontWeight: 600, color: '#9A3412' }}>
              Browser popup notifications are disabled/blocked in browser settings. In-app alerts remain active.
            </span>
          </>
        ) : (
          <>
            <Bell size={15} color="#1D4ED8" style={{ flexShrink: 0 }} />
            <span style={{ fontWeight: 600, color: '#1E40AF' }}>
              Enable browser popup alerts for real-time SCADA reminders (desktop & mobile).
            </span>
          </>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        {isDenied && activeCount > 0 && (
          <span
            data-testid="notification-denied-note"
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: '#9A3412',
              backgroundColor: '#FFEDD5',
              border: '1px solid #FDBA74',
              borderRadius: '4px',
              padding: '3px 8px',
            }}
          >
            Browser Popups Blocked — Using In-App Alerts
          </span>
        )}

        {isDefault && (
          <button
            type="button"
            data-testid="enable-browser-notifications-btn"
            onClick={() => void requestNotificationPermission()}
            style={{
              minHeight: '30px',
              padding: '4px 10px',
              borderRadius: '6px',
              border: '1px solid #93C5FD',
              backgroundColor: '#2563EB',
              color: '#FFFFFF',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <Bell size={12} />
            Enable Popups
          </button>
        )}

        {activeCount > 0 && activeScreen !== 'alerts' && (
          <button
            type="button"
            data-testid="banner-open-alerts-btn"
            onClick={() => setActiveScreen('alerts')}
            style={{
              minHeight: '30px',
              padding: '4px 10px',
              borderRadius: '6px',
              border: `1px solid ${criticalCount > 0 ? '#FCA5A5' : '#FCD34D'}`,
              backgroundColor: '#FFFFFF',
              color: criticalCount > 0 ? '#991B1B' : '#92400E',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            View Alerts
            <ArrowRight size={12} />
          </button>
        )}
      </div>
    </div>
  );
};

export default ActiveAlertBanner;

