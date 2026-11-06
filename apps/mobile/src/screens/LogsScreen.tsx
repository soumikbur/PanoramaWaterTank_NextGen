import React, { useState, useEffect } from 'react';
import { colors, typography } from '../theme';
import { useApp } from '../state/AppContext';
import { wsService } from '../services/websocket';
import { ScrollText, ShieldAlert } from 'lucide-react';

interface LogEntry {
  time: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  module: string;
  msg: string;
}

export const LogsScreen: React.FC = () => {
  const { liveTank, connectionStatus, currentUser } = useApp();
  const [filterLevel, setFilterLevel] = useState<'ALL' | 'INFO' | 'WARN' | 'ERROR'>('ALL');

  if (currentUser?.role !== 'ADMIN') {
    return (
      <div
        style={{
          padding: '48px',
          textAlign: 'center',
          backgroundColor: '#FFFFFF',
          borderRadius: '8px',
          border: '1px solid #E2E8F0',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <ShieldAlert size={40} color={colors.critical} />
        <h2 style={{ color: '#0F172A', fontSize: '18px', fontWeight: 700, margin: 0 }}>
          Access Restricted
        </h2>
        <p style={{ color: '#64748B', fontSize: '13px', margin: 0, maxWidth: '400px' }}>
          Diagnostic system logs require administrator authorization. Please sign in as an Administrator to view raw system events.
        </p>
      </div>
    );
  }
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      time: new Date().toLocaleTimeString(),
      level: 'INFO',
      module: 'panorama.mqtt',
      msg: 'MQTT Broker client active. Subscribed to topic pattern: panorama/telemetry/+',
    },
    {
      time: new Date().toLocaleTimeString(),
      level: 'INFO',
      module: 'panorama.ws',
      msg: `WebSocket connection status: ${connectionStatus}`,
    },
  ]);

  // Append live telemetry updates as real logs
  useEffect(() => {
    const unsubTelemetry = wsService.addEventListener('TELEMETRY_UPDATE', (data: any) => {
      const now = new Date().toLocaleTimeString();
      const level = data.status === 'CRITICAL' ? 'ERROR' : data.status === 'WARNING' ? 'WARN' : 'INFO';
      const newEntry: LogEntry = {
        time: now,
        level,
        module: 'panorama.telemetry',
        msg: `Telemetry frame received for Train ${data.trainNumber || 'N/A'} Coach ${data.coachNumber || 'N/A'} (Level: ${data.primaryLevel != null ? `${data.primaryLevel.toFixed(1)}%` : 'N/A'}, Vol: ${data.primaryVolume != null ? `${data.primaryVolume.toFixed(1)}L` : 'N/A'})`,
      };
      setLogs((prev) => [newEntry, ...prev.slice(0, 99)]);
    });

    const unsubAlarm = wsService.addEventListener('ALARM_TRIGGERED', (data: any) => {
      const now = new Date().toLocaleTimeString();
      const newEntry: LogEntry = {
        time: now,
        level: 'WARN',
        module: 'panorama.alarm',
        msg: `Alarm triggered: ${data.message || data.type} (Severity: ${data.severity})`,
      };
      setLogs((prev) => [newEntry, ...prev.slice(0, 99)]);
    });

    return () => {
      unsubTelemetry();
      unsubAlarm();
    };
  }, []);

  const filtered = filterLevel === 'ALL' ? logs : logs.filter((l) => l.level === filterLevel);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        backgroundColor: colors.background,
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '8px',
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A', margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ScrollText size={18} color="#2563EB" />
            <span>Diagnostic System Logs</span>
          </h2>
          <span style={{ fontSize: '12px', color: '#64748B' }}>
            Telemetry reception pipeline, MQTT events, and broker diagnostics
          </span>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          {(['ALL', 'INFO', 'WARN', 'ERROR'] as const).map((lvl) => (
            <button
              key={lvl}
              onClick={() => setFilterLevel(lvl)}
              style={{
                backgroundColor: filterLevel === lvl ? '#2563EB' : '#F1F5F9',
                color: filterLevel === lvl ? '#FFFFFF' : '#475569',
                border: 'none',
                borderRadius: '4px',
                padding: '4px 10px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {lvl}
            </button>
          ))}
        </div>
      </div>

      <div
        style={{
          backgroundColor: 'var(--color-surface-alt, #F8FAFC)',
          border: '1px solid var(--color-border, #CBD5E1)',
          color: 'var(--color-text-primary, #0F172A)',
          borderRadius: '8px',
          padding: '16px',
          fontFamily: 'monospace',
          fontSize: '12px',
          lineHeight: '1.6',
          minHeight: '360px',
        }}
      >
        {filtered.map((log, idx) => (
          <div key={idx} style={{ display: 'flex', gap: '12px' }}>
            <span style={{ color: '#64748B' }}>[{log.time}]</span>
            <span
              style={{
                color: log.level === 'INFO' ? '#0284C7' : log.level === 'WARN' ? '#D97706' : '#DC2626',
                fontWeight: 700,
              }}
            >
              [{log.level}]
            </span>
            <span style={{ color: '#475569', fontWeight: 600 }}>{log.module}:</span>
            <span style={{ color: '#0F172A' }}>{log.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

