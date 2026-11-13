import React, { useState, useMemo, useEffect } from 'react';
import { colors, metrics, typography } from '../theme';
import { useApp } from '../state/AppContext';
import { BaseCard } from '../components/common/BaseCard';
import { ApiClient } from '../api/client';
import { alertNotificationService } from '../services/alertNotificationService';
import { NOTIFICATION_CONFIG } from '../config/notificationConfig';
import { CheckCircle2, Bell, BellOff, Clock } from 'lucide-react';

interface AlertItemData {
  id: string;
  alertKey?: string;
  severity: 'CRITICAL' | 'WARNING';
  badgeColor: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
  title: string;
  description: string;
  currentValue: string;
  threshold: string;
  timestamp: string;
  acknowledged: boolean;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  reminderCount?: number;
  nextReminderInSec?: number;
  trainNumber?: string;
  coachNumber?: string;
  tankName?: string;
  statusText: string;
  type: 'level' | 'sensor';
}

interface AlertHistoryEvent {
  time: string;
  title: string;
  severity: 'CRITICAL' | 'WARNING' | 'NORMAL' | 'INFO';
  value: string;
  threshold: string;
  status: 'Active' | 'Acknowledged' | 'Resolved';
  acknowledgedBy?: string;
}

export const AlertsScreen: React.FC = () => {
  const {
    liveTank,
    activeAlarms,
    managedAlerts,
    alertHistory: contextAlertHistory,
    acknowledgeAlarm,
    connectionStatus,
    currentTime,
    notificationPermission,
    requestNotificationPermission,
    setActiveScreen,
    setSelectedTrainNumber,
    setSelectedCoachNumber,
    setSelectedTankId,
    configuredTrains,
    selectedTrainNumber,
  } = useApp();

  const [waterLevelAlertAcked, setWaterLevelAlertAcked] = useState(false);
  const [sensorAlertAcked, setSensorAlertAcked] = useState(false);
  const [alertHistory, setAlertHistory] = useState<AlertHistoryEvent[]>([]);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const hasData = liveTank?.levelPercent != null && liveTank?.hasTelemetry !== false;
  const fillPct = liveTank?.levelPercent ?? null;
  const waterHeight = liveTank?.heightCm ?? null;
  const maxHeight = liveTank?.maxHeightCm ?? 50.0;
  const isOffline = connectionStatus === 'DISCONNECTED';
  const alarmLevel = liveTank?.alarmStatus || (hasData ? 'Normal' : 'Awaiting Telemetry');

  // Fetch real past alarms from database or local persistent alert history
  useEffect(() => {
    let mounted = true;
    const mapLocalHistory = () => {
      const localHist = alertNotificationService.getHistory();
      return localHist.map((h) => ({
        time: new Date(h.timestamp).toLocaleTimeString(),
        title: h.trainNumber ? `${h.alertType} (Train ${h.trainNumber} · ${h.target})` : `${h.alertType} (${h.target})`,
        severity: h.severity as any,
        value: h.waterLevel != null ? `${h.waterLevel.toFixed(1)}%` : 'N/A',
        threshold: h.alertType === 'CRITICAL_LOW' ? '< 10%' : h.alertType === 'WARNING_LOW' ? '< 20%' : 'Limit',
        status: h.status,
        acknowledgedBy: h.acknowledgedBy,
      }));
    };

    ApiClient.fetchAlarms().then((data) => {
      if (mounted) {
        if (data && data.length > 0) {
          setAlertHistory(
            data.map((a: any) => ({
              time: new Date(a.triggeredAt || a.triggered_at || Date.now()).toLocaleTimeString(),
              title: a.alarmType || a.alarm_type || 'System Alert',
              severity: (a.severity || 'WARNING') as any,
              value: a.triggerValue != null ? `${a.triggerValue.toFixed(1)}%` : 'N/A',
              threshold: a.thresholdValue != null ? `${a.thresholdValue.toFixed(1)}%` : 'Nominal',
              status: a.status === 'RESOLVED' ? 'Resolved' : a.status === 'ACKNOWLEDGED' ? 'Acknowledged' : 'Active',
              acknowledgedBy: a.acknowledgedBy || a.acknowledged_by,
            }))
          );
        } else {
          setAlertHistory(mapLocalHistory());
        }
      }
    }).catch(() => {
      if (mounted) {
        setAlertHistory(mapLocalHistory());
      }
    });
    return () => {
      mounted = false;
    };
  }, [activeAlarms, managedAlerts, contextAlertHistory]);

  // Active & acknowledged non-resolved alerts list from notification engine + backend
  const activeAlertsList: AlertItemData[] = useMemo(() => {
    // If no trains are configured, no active alerts should ever be displayed
    if (!configuredTrains || configuredTrains.length === 0) {
      return [];
    }

    const trainSet = new Set(configuredTrains.map((t) => t.train_number.trim()));
    const list: AlertItemData[] = [];
    const seenIds = new Set<string>();
    const nowTime = currentTime || 'Just now';

    // 1. Primary persistent alerts managed by AlertNotificationService (supports 30-minute reminders & per-alert ack)
    managedAlerts
      .filter((m) => {
        if (m.status === 'RESOLVED') return false;
        if (m.trainNumber && !trainSet.has(m.trainNumber.trim())) return false;
        const devUid = alertNotificationService.extractDeviceUidFromAlert(m);
        if (devUid) {
          const match = devUid.match(/^PANORAMA-([A-Za-z0-9_-]+)-/);
          if (match && match[1] && !trainSet.has(match[1].trim())) return false;
        }
        return true;
      })
      .forEach((m) => {
        const isCrit = m.severity === 'CRITICAL';
        const isAcked = m.status === 'ACKNOWLEDGED';
        const nextSec = !isAcked ? Math.max(0, Math.ceil((m.nextReminderAt - nowMs) / 1000)) : undefined;
        seenIds.add(m.id);
        const formatInterval = (sec: number) => {
          if (sec >= 60) {
            const mins = Math.floor(sec / 60);
            const s = sec % 60;
            return s > 0 ? `${mins}m ${s}s` : `${mins}m`;
          }
          return `${sec}s`;
        };

        list.push({
          id: m.id,
          alertKey: m.alertKey,
          severity: isCrit ? 'CRITICAL' : 'WARNING',
          badgeColor: isCrit ? '#EF4444' : '#F59E0B',
          bgColor: isCrit ? '#FEF2F2' : '#FFFBEB',
          borderColor: isCrit ? '#FECACA' : '#FDE68A',
          textColor: isCrit ? '#991B1B' : '#92400E',
          title: m.title,
          description: m.message,
          currentValue: m.levelPercent != null ? `${m.levelPercent.toFixed(1)}%` : 'Fault / Offline',
          threshold:
            m.alertType === 'CRITICAL_LOW'
              ? '< 10.0%'
              : m.alertType === 'WARNING_LOW'
              ? '< 20.0%'
              : m.alertType === 'OVERFLOW'
              ? '>= 100.0%'
              : 'Signal / Link Check',
          timestamp: new Date(m.triggeredAt).toLocaleTimeString(),
          acknowledged: isAcked,
          acknowledgedAt: m.acknowledgedAt ? new Date(m.acknowledgedAt).toLocaleTimeString() : undefined,
          acknowledgedBy: m.acknowledgedBy,
          reminderCount: m.reminderCount,
          nextReminderInSec: nextSec,
          trainNumber: m.trainNumber,
          coachNumber: m.coachNumber,
          tankName: m.tankName,
          statusText: isAcked
            ? `Acknowledged${m.acknowledgedBy ? ` by ${m.acknowledgedBy}` : ''}`
            : `Active · Reminder in ${formatInterval(nextSec ?? NOTIFICATION_CONFIG.REMINDER_INTERVAL_SECONDS)}`,
          type: m.alertKey.startsWith('level-') ? 'level' : 'sensor',
        });
      });

    // 2. Include any backend/dynamic activeAlarms not already covered by managedAlerts
    if (activeAlarms && activeAlarms.length > 0) {
      activeAlarms.forEach((a) => {
        if (seenIds.has(a.id)) return;
        if (a.trainNumber && !trainSet.has(a.trainNumber.trim())) return;
        if (a.train_number && !trainSet.has(a.train_number.trim())) return;
        const alreadyInManaged = managedAlerts.some(
          (m) =>
            m.status !== 'RESOLVED' &&
            ((a.id.startsWith('alarm-low-tank2-') && m.alertKey === `level-${a.id.replace('alarm-low-tank2-', '')}-departure`) ||
              (a.id.startsWith('alarm-s1-') && m.alertKey === `sensor-s1-${a.id.replace('alarm-s1-', '')}`) ||
              (a.id.startsWith('alarm-s2-') && m.alertKey === `sensor-s2-${a.id.replace('alarm-s2-', '')}`) ||
              (a.id.startsWith('alarm-conn-') && m.alertKey === `conn-${a.id.replace('alarm-conn-', '')}`))
        );
        if (alreadyInManaged) return;

        const isCrit = a.severity === 'CRITICAL';
        const isAcked = a.status === 'ACKNOWLEDGED';
        list.push({
          id: a.id,
          severity: isCrit ? 'CRITICAL' : 'WARNING',
          badgeColor: isCrit ? '#EF4444' : '#F59E0B',
          bgColor: isCrit ? '#FEF2F2' : '#FFFBEB',
          borderColor: isCrit ? '#FECACA' : '#FDE68A',
          textColor: isCrit ? '#991B1B' : '#92400E',
          title: (a.alarmType || 'ALARM').replace(/_/g, ' '),
          description: a.message || `Telemetry parameter violated configured safety limit (${a.thresholdValue}%).`,
          currentValue: a.triggerValue != null ? `${a.triggerValue.toFixed(1)}%` : 'Active',
          threshold: a.thresholdValue != null ? `${a.thresholdValue.toFixed(1)}%` : 'Threshold',
          timestamp: a.triggeredAt ? new Date(a.triggeredAt).toLocaleTimeString() : nowTime,
          acknowledged: isAcked,
          acknowledgedAt: a.acknowledgedAt ? new Date(a.acknowledgedAt).toLocaleTimeString() : undefined,
          coachNumber: a.coachNumber,
          statusText: isAcked ? 'Acknowledged' : 'Active Alarm',
          type: (a.alarmType || '').includes('SENSOR') ? 'sensor' : 'level',
        });
      });
    }

    return list;
  }, [activeAlarms, managedAlerts, nowMs, currentTime, configuredTrains, selectedTrainNumber]);

  const unacknowledgedCount = activeAlertsList.filter((a) => !a.acknowledged).length;
  const criticalCount = activeAlertsList.filter((a) => a.severity === 'CRITICAL').length;
  const warningCount = activeAlertsList.filter((a) => a.severity === 'WARNING').length;
  const activeCount = activeAlertsList.length;
  const resolvedCount = alertHistory.filter((h) => h.status === 'Resolved').length;

  const handleAcknowledgeOne = async (alert: AlertItemData) => {
    if (alert.id === 'ALT-WLI-CRIT' || alert.id === 'ALT-WLI-WARN' || alert.id === 'ALT-WLI-OVERFLOW') {
      setWaterLevelAlertAcked(true);
    }
    if (alert.id === 'ALT-SNS-FAULT') {
      setSensorAlertAcked(true);
    }
    await acknowledgeAlarm(alert.id, 'Acknowledged by operator');
  };

  const handleAcknowledgeAll = async () => {
    setWaterLevelAlertAcked(true);
    setSensorAlertAcked(true);
    for (const item of activeAlertsList) {
      if (!item.acknowledged) {
        await acknowledgeAlarm(item.id, 'Acknowledged all active alerts');
      }
    }
  };

  const handleClearResolved = () => {
    setAlertHistory((prev) => prev.filter((item) => item.status !== 'Resolved'));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: metrics.space16, width: '100%' }}>
      {/* 1. Page Header with Title, Status & Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: metrics.space16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold', color: '#0F172A', fontFamily: typography.fontFamily }}>
            Alerts
          </h1>
          <p style={{ margin: '2px 0 0 0', fontSize: '14px', color: '#64748B', fontFamily: typography.fontFamily }}>
            Monitor system alarms and abnormal tank conditions
          </p>
        </div>

        {/* Header Action Buttons & Status Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Browser Notification Permission & Reminder Status */}
          {notificationPermission === 'granted' ? (
            <div
              data-testid="alerts-browser-notif-granted"
              style={{
                height: '32px',
                padding: '0 12px',
                borderRadius: '6px',
                backgroundColor: '#ECFDF5',
                border: '1px solid #A7F3D0',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Bell size={14} color="#059669" />
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#065F46', fontFamily: typography.fontFamily }}>
                Browser Popups: ON ({NOTIFICATION_CONFIG.REMINDER_INTERVAL_SECONDS >= 60 ? `${Math.round(NOTIFICATION_CONFIG.REMINDER_INTERVAL_SECONDS / 60)}m` : `${NOTIFICATION_CONFIG.REMINDER_INTERVAL_SECONDS}s`})
              </span>
            </div>
          ) : notificationPermission === 'denied' ? (
            <div
              data-testid="alerts-browser-notif-denied"
              style={{
                height: '32px',
                padding: '0 12px',
                borderRadius: '6px',
                backgroundColor: '#FFF7ED',
                border: '1px solid #FDBA74',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <BellOff size={14} color="#C2410C" />
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#9A3412', fontFamily: typography.fontFamily }}>
                Popups Blocked (In-App Active)
              </span>
            </div>
          ) : (
            <button
              type="button"
              data-testid="alerts-enable-popups-btn"
              onClick={() => void requestNotificationPermission()}
              style={{
                height: '32px',
                padding: '0 12px',
                borderRadius: '6px',
                backgroundColor: '#2563EB',
                border: 'none',
                color: '#FFFFFF',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontFamily: typography.fontFamily,
              }}
            >
              <Bell size={14} />
              Enable Browser Popups
            </button>
          )}

          {/* Alarm System State Badge */}
          <div
            style={{
              height: '32px',
              padding: '0 12px',
              borderRadius: '6px',
              backgroundColor: '#EFF6FF',
              border: '1px solid #BFDBFE',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <div style={{ width: '6px', height: '6px', borderRadius: '3px', backgroundColor: '#2563EB' }} />
            <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#1E40AF', fontFamily: typography.fontFamily }}>
              Alarm System: ENABLED
            </span>
          </div>

          <button
            onClick={handleAcknowledgeAll}
            disabled={unacknowledgedCount === 0}
            data-testid="acknowledge-all-btn"
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: '1px solid #CBD5E1',
              backgroundColor: '#FFFFFF',
              color: '#334155',
              fontSize: '13px',
              fontWeight: 500,
              cursor: unacknowledgedCount > 0 ? 'pointer' : 'default',
              opacity: unacknowledgedCount > 0 ? 1 : 0.5,
              fontFamily: typography.fontFamily,
            }}
          >
            Acknowledge All
          </button>

          <button
            onClick={handleClearResolved}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: '1px solid #CBD5E1',
              backgroundColor: '#FFFFFF',
              color: '#334155',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: typography.fontFamily,
            }}
          >
            Clear Resolved
          </button>
        </div>
      </div>

      {/* 2. Alert Summary Statistics Cards (4 Tiles - Responsive 2x2 on mobile) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))', gap: metrics.space12, width: '100%' }}>
        {/* Critical */}
        <BaseCard style={{ height: '96px', padding: '14px', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748B', fontFamily: typography.fontFamily }}>
                CRITICAL
              </span>
              <div style={{ width: '8px', height: '8px', borderRadius: '4px', backgroundColor: '#EF4444' }} />
            </div>
            <span style={{ fontSize: '24px', fontWeight: 'bold', color: criticalCount > 0 ? '#DC2626' : '#0F172A', fontFamily: typography.fontFamily }}>
              {criticalCount}
            </span>
            <span style={{ fontSize: '11px', color: '#94A3B8', fontFamily: typography.fontFamily }}>
              Level &lt; 10% / Overflow
            </span>
          </div>
        </BaseCard>

        {/* Warning */}
        <BaseCard style={{ height: '96px', padding: '14px', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748B', fontFamily: typography.fontFamily }}>
                WARNING
              </span>
              <div style={{ width: '8px', height: '8px', borderRadius: '4px', backgroundColor: '#F59E0B' }} />
            </div>
            <span style={{ fontSize: '24px', fontWeight: 'bold', color: warningCount > 0 ? '#D97706' : '#0F172A', fontFamily: typography.fontFamily }}>
              {warningCount}
            </span>
            <span style={{ fontSize: '11px', color: '#94A3B8', fontFamily: typography.fontFamily }}>
              Level 10% – 20% Threshold
            </span>
          </div>
        </BaseCard>

        {/* Active Alarms */}
        <BaseCard style={{ height: '96px', padding: '14px', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748B', fontFamily: typography.fontFamily }}>
                ACTIVE ALARMS
              </span>
              <div style={{ width: '8px', height: '8px', borderRadius: '4px', backgroundColor: '#3B82F6' }} />
            </div>
            <span style={{ fontSize: '24px', fontWeight: 'bold', color: activeCount > 0 ? colors.primary : '#0F172A', fontFamily: typography.fontFamily }}>
              {activeCount}
            </span>
            <span style={{ fontSize: '11px', color: '#94A3B8', fontFamily: typography.fontFamily }}>
              Unresolved Alarm Conditions
            </span>
          </div>
        </BaseCard>

        {/* Resolved */}
        <BaseCard style={{ height: '96px', padding: '14px', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748B', fontFamily: typography.fontFamily }}>
                RESOLVED
              </span>
              <div style={{ width: '8px', height: '8px', borderRadius: '4px', backgroundColor: '#10B981' }} />
            </div>
            <span style={{ fontSize: '24px', fontWeight: 'bold', color: '#059669', fontFamily: typography.fontFamily }}>
              {resolvedCount}
            </span>
            <span style={{ fontSize: '11px', color: '#94A3B8', fontFamily: typography.fontFamily }}>
              Historical Recovered Events
            </span>
          </div>
        </BaseCard>
      </div>

      {/* 3. Current Live System Status Strip */}
      <BaseCard style={{ padding: '14px', boxSizing: 'border-box' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', alignItems: 'center', gap: '14px' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748B', fontFamily: typography.fontFamily }}>
              CURRENT WATER LEVEL
            </div>
            <div style={{ fontSize: '15px', fontWeight: 'bold', color: alarmLevel === 'Critical' || alarmLevel === 'Overflow' ? '#EF4444' : colors.primary, fontFamily: typography.fontFamily, marginTop: '2px' }}>
              {fillPct != null ? `${fillPct.toFixed(1)}% (${waterHeight != null ? waterHeight.toFixed(1) : 'N/A'} cm of ${maxHeight.toFixed(0)} cm)` : 'Awaiting Telemetry'}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748B', fontFamily: typography.fontFamily }}>
              ALERT STATE
            </div>
            <div
              style={{
                fontSize: '15px',
                fontWeight: 'bold',
                color: alarmLevel === 'Critical' || alarmLevel === 'Overflow' ? '#DC2626' : alarmLevel === 'Warning' ? '#D97706' : '#059669',
                fontFamily: typography.fontFamily,
                marginTop: '2px',
              }}
            >
              {alarmLevel.toUpperCase()}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748B', fontFamily: typography.fontFamily }}>
              SENSOR HEALTH
            </div>
            <div style={{ fontSize: '15px', fontWeight: 600, color: '#059669', fontFamily: typography.fontFamily, marginTop: '2px' }}>
              Healthy (ADS1115 Active)
            </div>
          </div>

          <div>
            <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748B', fontFamily: typography.fontFamily }}>
              LAST TELEMETRY UPDATE
            </div>
            <div style={{ fontSize: '15px', fontWeight: 500, color: '#334155', fontFamily: typography.fontFamily, marginTop: '2px' }}>
              {currentTime || 'Live Polling'}
            </div>
          </div>
        </div>
      </BaseCard>

      {/* 4. Active Alerts Section */}
      <BaseCard style={{ padding: '16px', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#0F172A', fontFamily: typography.fontFamily }}>
              Active Alerts ({activeAlertsList.length})
            </span>
            <span style={{ fontSize: '12px', color: '#94A3B8', fontFamily: typography.fontFamily }}>
              Firmware logic: &lt;10% Critical, &lt;20% Warning, ≥20% Normal
            </span>
          </div>

          <div style={{ width: '100%', height: '1px', backgroundColor: '#E2E8F0' }} />

          {activeAlertsList.length === 0 ? (
            /* Zero State (No Active Alerts) */
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 0', gap: '8px' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '24px',
                  backgroundColor: '#ECFDF5',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <CheckCircle2 size={24} color="#059669" />
              </div>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#059669', fontFamily: typography.fontFamily }}>
                No Active Alerts
              </div>
              <div style={{ fontSize: '13px', color: '#64748B', fontFamily: typography.fontFamily }}>
                All monitored conditions are currently within normal operating limits (&gt; 20%).
              </div>
            </div>
          ) : (
            /* Active Alert Cards */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {activeAlertsList.map((alert) => (
                <div
                  key={alert.id}
                  style={{
                    minHeight: '110px',
                    borderRadius: '8px',
                    backgroundColor: alert.bgColor,
                    border: `1px solid ${alert.borderColor}`,
                    padding: '14px',
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '14px',
                    boxSizing: 'border-box',
                  }}
                >
                  {/* Left Severity Indicator & Badge */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
                    <div
                      style={{
                        height: '24px',
                        padding: '0 10px',
                        borderRadius: '12px',
                        backgroundColor: alert.severity === 'CRITICAL' ? '#FEE2E2' : '#FEF3C7',
                        border: `1px solid ${alert.severity === 'CRITICAL' ? '#FCA5A5' : '#FDE68A'}`,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <span style={{ fontSize: '11px', fontWeight: 'bold', color: alert.textColor, fontFamily: typography.fontFamily }}>
                        {alert.severity}
                      </span>
                    </div>
                    <span style={{ fontSize: '11px', color: '#64748B', fontFamily: typography.fontFamily }}>
                      {alert.timestamp}
                    </span>
                  </div>

                  {/* Center Alert Details */}
                  <div style={{ flex: '1 1 200px', minWidth: '180px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ fontSize: '15px', fontWeight: 'bold', color: alert.textColor, fontFamily: typography.fontFamily }}>
                      {alert.title}
                    </div>
                    <div style={{ fontSize: '13px', color: '#475569', fontFamily: typography.fontFamily }}>
                      {alert.description}
                    </div>
                    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '2px' }}>
                      {alert.trainNumber && (
                        <span style={{ fontSize: '12px', color: '#334155', fontFamily: typography.fontFamily }}>
                          Train: <strong>{alert.trainNumber}</strong>
                        </span>
                      )}
                      {alert.coachNumber && (
                        <span style={{ fontSize: '12px', color: '#334155', fontFamily: typography.fontFamily }}>
                          Coach: <strong>{alert.coachNumber}</strong>
                        </span>
                      )}
                      {alert.tankName && (
                        <span style={{ fontSize: '12px', color: '#334155', fontFamily: typography.fontFamily }}>
                          Tank: <strong>{alert.tankName}</strong>
                        </span>
                      )}
                      <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#334155', fontFamily: typography.fontFamily }}>
                        Current Level: {alert.currentValue}
                      </span>
                      <span style={{ fontSize: '12px', color: '#64748B', fontFamily: typography.fontFamily }}>
                        Threshold: {alert.threshold}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', marginTop: '2px', fontSize: '11px', color: '#64748B' }}>
                      {!alert.acknowledged ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#B45309', fontWeight: 600 }}>
                          <Clock size={12} />
                          Auto-reminder every {NOTIFICATION_CONFIG.REMINDER_INTERVAL_SECONDS >= 60 ? `${Math.round(NOTIFICATION_CONFIG.REMINDER_INTERVAL_SECONDS / 60)} minutes` : `${NOTIFICATION_CONFIG.REMINDER_INTERVAL_SECONDS}s`} (sent {alert.reminderCount ?? 0}×)
                        </span>
                      ) : (
                        <span style={{ color: '#3730A3', fontWeight: 600 }}>
                          Reminders stopped{alert.acknowledgedAt ? ` at ${alert.acknowledgedAt}` : ''}{alert.acknowledgedBy ? ` by ${alert.acknowledgedBy}` : ''}
                        </span>
                      )}
                      {alert.trainNumber && alert.coachNumber && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedTrainNumber(alert.trainNumber!);
                            setSelectedCoachNumber(alert.coachNumber!);
                            if (alert.alertKey?.startsWith('level-')) {
                              setSelectedTankId(alert.alertKey.replace('level-', ''));
                            }
                            setActiveScreen('watertank');
                          }}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            color: '#2563EB',
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            padding: 0,
                          }}
                        >
                          View Tank →
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Right Status & Acknowledge Action */}
                  <div style={{ minWidth: '150px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                    <div
                      style={{
                        minHeight: '22px',
                        padding: '2px 10px',
                        borderRadius: '11px',
                        backgroundColor: alert.acknowledged ? '#E0E7FF' : '#FEE2E2',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <span style={{ fontSize: '10px', fontWeight: 'bold', color: alert.acknowledged ? '#3730A3' : '#991B1B', textAlign: 'center' }}>
                        {alert.statusText}
                      </span>
                    </div>

                    <button
                      onClick={() => void handleAcknowledgeOne(alert)}
                      disabled={alert.acknowledged}
                      data-testid={`ack-btn-${alert.id}`}
                      className="touch-target-44"
                      style={{
                        width: '100%',
                        minHeight: '44px',
                        padding: '8px 14px',
                        borderRadius: '6px',
                        border: '1px solid #CBD5E1',
                        backgroundColor: alert.acknowledged ? '#F1F5F9' : '#FFFFFF',
                        color: alert.acknowledged ? '#64748B' : '#0F172A',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: alert.acknowledged ? 'default' : 'pointer',
                        fontFamily: typography.fontFamily,
                      }}
                    >
                      {alert.acknowledged ? 'Acknowledged' : 'Acknowledge'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </BaseCard>

      {/* 5. Alert History Log Table */}
      <BaseCard style={{ padding: '16px', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#0F172A', fontFamily: typography.fontFamily }}>
              Alert History ({alertHistory.length})
            </span>
            <span style={{ fontSize: '12px', color: '#94A3B8', fontFamily: typography.fontFamily }}>
              Generated on actual state transitions
            </span>
          </div>

          <div style={{ width: '100%', height: '1px', backgroundColor: '#E2E8F0' }} />

          {/* Table Column Headers */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '90px 220px 100px 130px 130px 1fr',
              gap: '12px',
              padding: '0 12px',
              fontSize: '11px',
              fontWeight: 'bold',
              color: '#64748B',
              fontFamily: typography.fontFamily,
            }}
          >
            <div>TIME</div>
            <div>ALERT TITLE</div>
            <div>SEVERITY</div>
            <div>MEASURED VALUE</div>
            <div>THRESHOLD</div>
            <div>STATUS</div>
          </div>

          <div style={{ width: '100%', height: '1px', backgroundColor: '#F1F5F9' }} />

          {/* History Rows */}
          {alertHistory.map((item, index) => (
            <div
              key={index}
              style={{
                display: 'grid',
                gridTemplateColumns: '90px 220px 100px 130px 130px 1fr',
                gap: '12px',
                alignItems: 'center',
                height: '48px',
                padding: '0 12px',
                borderRadius: '6px',
                backgroundColor: index % 2 === 1 ? '#FAFAFA' : '#FFFFFF',
                border: '1px solid #F1F5F9',
                boxSizing: 'border-box',
              }}
            >
              <span style={{ fontSize: '12px', color: '#64748B', fontFamily: typography.fontFamily }}>
                {item.time}
              </span>

              <span style={{ fontSize: '13px', fontWeight: 500, color: '#0F172A', fontFamily: typography.fontFamily, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.title}
              </span>

              <div>
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '22px',
                    padding: '0 10px',
                    borderRadius: '11px',
                    backgroundColor: item.severity === 'CRITICAL' ? '#FEE2E2' : item.severity === 'WARNING' ? '#FEF3C7' : '#ECFDF5',
                  }}
                >
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 'bold',
                      color: item.severity === 'CRITICAL' ? '#991B1B' : item.severity === 'WARNING' ? '#92400E' : '#065F46',
                      fontFamily: typography.fontFamily,
                    }}
                  >
                    {item.severity}
                  </span>
                </div>
              </div>

              <span style={{ fontSize: '12px', color: '#334155', fontFamily: typography.fontFamily }}>
                {item.value}
              </span>

              <span style={{ fontSize: '12px', color: '#64748B', fontFamily: typography.fontFamily }}>
                {item.threshold}
              </span>

              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 'bold',
                  color: item.status === 'Active' ? '#DC2626' : item.status === 'Acknowledged' ? '#3B82F6' : '#059669',
                  fontFamily: typography.fontFamily,
                }}
              >
                {item.status}{item.acknowledgedBy ? ` (${item.acknowledgedBy})` : ''}
              </span>
            </div>
          ))}
        </div>
      </BaseCard>
    </div>
  );
};
