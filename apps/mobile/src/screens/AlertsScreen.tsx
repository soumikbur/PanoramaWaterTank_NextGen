import React, { useState, useMemo, useEffect } from 'react';
import { colors, metrics, typography } from '../theme';
import { useApp } from '../state/AppContext';
import { BaseCard } from '../components/common/BaseCard';
import { ApiClient } from '../api/client';
import { CheckCircle2 } from 'lucide-react';

interface AlertItemData {
  id: string;
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
}

export const AlertsScreen: React.FC = () => {
  const { liveTank, activeAlarms, acknowledgeAlarm, connectionStatus, currentTime } = useApp();

  const [waterLevelAlertAcked, setWaterLevelAlertAcked] = useState(false);
  const [sensorAlertAcked, setSensorAlertAcked] = useState(false);
  const [alertHistory, setAlertHistory] = useState<AlertHistoryEvent[]>([]);

  const hasData = liveTank?.levelPercent != null && liveTank?.hasTelemetry !== false;
  const fillPct = liveTank?.levelPercent ?? null;
  const waterHeight = liveTank?.heightCm ?? null;
  const maxHeight = liveTank?.maxHeightCm ?? 50.0;
  const isOffline = connectionStatus === 'DISCONNECTED';
  const alarmLevel = liveTank?.alarmStatus || (hasData ? 'Normal' : 'Awaiting Telemetry');

  // Fetch real past alarms from database
  useEffect(() => {
    let mounted = true;
    ApiClient.fetchAlarms().then((data) => {
      if (mounted) {
        setAlertHistory(
          data.map((a: any) => ({
            time: new Date(a.triggeredAt || a.triggered_at || Date.now()).toLocaleTimeString(),
            title: a.alarmType || a.alarm_type || 'System Alert',
            severity: (a.severity || 'WARNING') as any,
            value: a.triggerValue != null ? `${a.triggerValue.toFixed(1)}%` : 'N/A',
            threshold: a.thresholdValue != null ? `${a.thresholdValue.toFixed(1)}%` : 'Nominal',
            status: a.status === 'RESOLVED' ? 'Resolved' : a.status === 'ACKNOWLEDGED' ? 'Acknowledged' : 'Active',
          }))
        );
      }
    }).catch(() => {});
    return () => {
      mounted = false;
    };
  }, [activeAlarms]);

  // Active alerts list strictly from backend active alarms or real telemetry conditions
  const activeAlertsList: AlertItemData[] = useMemo(() => {
    const list: AlertItemData[] = [];
    const nowTime = currentTime || 'Just now';

    // Map from real database active alarms if available
    if (activeAlarms && activeAlarms.length > 0) {
      activeAlarms.forEach((a) => {
        const isCrit = a.severity === 'CRITICAL';
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
          acknowledged: a.status === 'ACKNOWLEDGED',
          statusText: a.status === 'ACKNOWLEDGED' ? 'Acknowledged' : 'Active Alarm',
          type: (a.alarmType || '').includes('SENSOR') ? 'sensor' : 'level',
        });
      });
      return list;
    }

    // Direct telemetry condition evaluation if real telemetry is active
    if (hasData && fillPct != null) {
      if (fillPct >= 100.0) {
        list.push({
          id: 'ALT-WLI-OVERFLOW',
          severity: 'CRITICAL',
          badgeColor: '#EF4444',
          bgColor: '#FEF2F2',
          borderColor: '#FECACA',
          textColor: '#991B1B',
          title: 'Tank Level Overflow Condition',
          description: `Measured water level reaches or exceeds maximum configured safe height (${maxHeight.toFixed(1)} cm). Shut off pump immediately.`,
          currentValue: `${fillPct.toFixed(2)}% (${waterHeight != null ? waterHeight.toFixed(1) : 'N/A'} cm)`,
          threshold: `≥ 100.0% (${maxHeight.toFixed(1)} cm)`,
          timestamp: nowTime,
          acknowledged: waterLevelAlertAcked,
          statusText: waterLevelAlertAcked ? 'Acknowledged' : 'Active Overflow',
          type: 'level',
        });
      } else if (fillPct < 10.0) {
        list.push({
          id: 'ALT-WLI-CRIT',
          severity: 'CRITICAL',
          badgeColor: '#EF4444',
          bgColor: '#FEF2F2',
          borderColor: '#FECACA',
          textColor: '#991B1B',
          title: 'Water Level Critically Low',
          description: 'Measured level is below the 10% critical threshold (3 kHz buzzer / RGB blinking). Immediate refill required.',
          currentValue: `${fillPct.toFixed(2)}% (${waterHeight != null ? waterHeight.toFixed(1) : 'N/A'} cm)`,
          threshold: `< 10.0% (${(maxHeight * 0.1).toFixed(1)} cm)`,
          timestamp: nowTime,
          acknowledged: waterLevelAlertAcked,
          statusText: waterLevelAlertAcked ? 'Acknowledged' : 'Active Alarm',
          type: 'level',
        });
      } else if (fillPct < 20.0) {
        list.push({
          id: 'ALT-WLI-WARN',
          severity: 'WARNING',
          badgeColor: '#F59E0B',
          bgColor: '#FFFBEB',
          borderColor: '#FDE68A',
          textColor: '#92400E',
          title: 'Water Level Low Warning',
          description: 'Measured level is below the 20% warning threshold (2 kHz buzzer / RGB solid ON).',
          currentValue: `${fillPct.toFixed(2)}% (${waterHeight != null ? waterHeight.toFixed(1) : 'N/A'} cm)`,
          threshold: `< 20.0% (${(maxHeight * 0.2).toFixed(1)} cm)`,
          timestamp: nowTime,
          acknowledged: waterLevelAlertAcked,
          statusText: waterLevelAlertAcked ? 'Acknowledged' : 'Active Warning',
          type: 'level',
        });
      }
    }

    // Sensor Disconnection / Offline
    if (isOffline) {
      list.push({
        id: 'ALT-SNS-FAULT',
        severity: 'WARNING',
        badgeColor: '#F59E0B',
        bgColor: '#FFFBEB',
        borderColor: '#FDE68A',
        textColor: '#92400E',
        title: 'Broker Disconnection / Offline Alert',
        description: 'MQTT client disconnected from broker. Telemetry ingestion inactive.',
        currentValue: 'Offline',
        threshold: 'Connection Lost',
        timestamp: nowTime,
        acknowledged: sensorAlertAcked,
        statusText: sensorAlertAcked ? 'Acknowledged' : 'Active Warning',
        type: 'sensor',
      });
    }

    return list;
  }, [activeAlarms, hasData, fillPct, waterHeight, maxHeight, isOffline, currentTime, waterLevelAlertAcked, sensorAlertAcked]);

  const criticalCount = activeAlertsList.filter((a) => a.severity === 'CRITICAL').length;
  const warningCount = activeAlertsList.filter((a) => a.severity === 'WARNING').length;
  const activeCount = activeAlertsList.length;
  const resolvedCount = alertHistory.filter((h) => h.status === 'Resolved').length;

  const handleAcknowledgeAll = async () => {
    setWaterLevelAlertAcked(true);
    setSensorAlertAcked(true);
    for (const a of activeAlarms) {
      await acknowledgeAlarm(a.id, 'Acknowledged by operator');
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
            disabled={activeAlertsList.length === 0 || (waterLevelAlertAcked && sensorAlertAcked)}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: '1px solid #CBD5E1',
              backgroundColor: '#FFFFFF',
              color: '#334155',
              fontSize: '13px',
              fontWeight: 500,
              cursor: activeAlertsList.length > 0 ? 'pointer' : 'default',
              opacity: activeAlertsList.length > 0 && (!waterLevelAlertAcked || !sensorAlertAcked) ? 1 : 0.5,
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

      {/* 2. Alert Summary Statistics Cards (4 Tiles) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: metrics.space12, width: '100%' }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr auto 1fr auto 1fr', alignItems: 'center', gap: '16px' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748B', fontFamily: typography.fontFamily }}>
              CURRENT WATER LEVEL
            </div>
            <div style={{ fontSize: '15px', fontWeight: 'bold', color: alarmLevel === 'Critical' || alarmLevel === 'Overflow' ? '#EF4444' : colors.primary, fontFamily: typography.fontFamily, marginTop: '2px' }}>
              {fillPct != null ? `${fillPct.toFixed(1)}% (${waterHeight != null ? waterHeight.toFixed(1) : 'N/A'} cm of ${maxHeight.toFixed(0)} cm)` : 'Awaiting Telemetry'}
            </div>
          </div>

          <div style={{ width: '1px', height: '32px', backgroundColor: '#E2E8F0' }} />

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

          <div style={{ width: '1px', height: '32px', backgroundColor: '#E2E8F0' }} />

          <div>
            <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748B', fontFamily: typography.fontFamily }}>
              SENSOR HEALTH
            </div>
            <div style={{ fontSize: '15px', fontWeight: 600, color: '#059669', fontFamily: typography.fontFamily, marginTop: '2px' }}>
              Healthy (ADS1115 Active)
            </div>
          </div>

          <div style={{ width: '1px', height: '32px', backgroundColor: '#E2E8F0' }} />

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
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '14px',
                    boxSizing: 'border-box',
                  }}
                >
                  {/* Left Severity Indicator & Badge */}
                  <div style={{ width: '100px', display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
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
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ fontSize: '15px', fontWeight: 'bold', color: alert.textColor, fontFamily: typography.fontFamily }}>
                      {alert.title}
                    </div>
                    <div style={{ fontSize: '13px', color: '#475569', fontFamily: typography.fontFamily }}>
                      {alert.description}
                    </div>
                    <div style={{ display: 'flex', gap: '16px', marginTop: '2px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#334155', fontFamily: typography.fontFamily }}>
                        Current Level: {alert.currentValue}
                      </span>
                      <span style={{ fontSize: '12px', color: '#64748B', fontFamily: typography.fontFamily }}>
                        Threshold: {alert.threshold}
                      </span>
                    </div>
                  </div>

                  {/* Right Status & Acknowledge Action */}
                  <div style={{ width: '130px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                    <div
                      style={{
                        height: '22px',
                        padding: '0 10px',
                        borderRadius: '11px',
                        backgroundColor: alert.acknowledged ? '#E0E7FF' : '#FEE2E2',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <span style={{ fontSize: '10px', fontWeight: 'bold', color: alert.acknowledged ? '#3730A3' : '#991B1B' }}>
                        {alert.statusText}
                      </span>
                    </div>

                    <button
                      onClick={() => {
                        if (alert.type === 'level') setWaterLevelAlertAcked(true);
                        if (alert.type === 'sensor') setSensorAlertAcked(true);
                      }}
                      disabled={alert.acknowledged}
                      style={{
                        width: '100%',
                        padding: '6px 12px',
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
                {item.status}
              </span>
            </div>
          ))}
        </div>
      </BaseCard>
    </div>
  );
};
