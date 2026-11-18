import React, { useState } from 'react';
import {
  Cpu,
  Radio,
  Thermometer,
  Gauge,
  Activity,
  Bluetooth,
  Cable,
  Signal,
  ShieldCheck,
  Copy,
  Edit3,
  ChevronDown,
  ChevronUp,
  X,
  Save,
  Info,
  Wrench,
} from 'lucide-react';
import { DeviceMetadataModel, DeviceHardwareOverrides } from '../../services/deviceMetadata';
import { MqttBrokerDiagnostics } from '../../services/mqttService';
import { ManagedDevice } from '../../services/deviceRegistry';

export interface LiveTelemetryMetrics {
  hasData: boolean;
  lastReceivedAt: number | null;
  lastReceivedFormatted: string | null;
  rawPayload: Record<string, any> | null;
  waterLevelCm: number | null;
  waterLevelPercent: number | null;
  tank2Cm: number | null;
  tank2Percent: number | null;
  temperature: number | null;
  atmosphericPressure: number | null;
  humidity: number | null;
  rawVoltage: number | null;
  adcRaw: number | null;
  battery: number | null;
  signalStrength: number | null;
  sensorStatus: string | null;
  deviceTimestamp: string | null;
  hasAds1115Diag: boolean;
  hasBme280Diag: boolean;
  hasModemDiag: boolean;
  hasRs485Diag: boolean;
  hasBleDiag: boolean;
}

/** Extract only fields actually present in the latest live MQTT payload. Never invents values. */
export function extractLiveTelemetryMetrics(
  rawPayload: Record<string, any> | null,
  lastReceivedAt: number | null,
  lastReceivedFormatted: string | null
): LiveTelemetryMetrics {
  if (!rawPayload || typeof rawPayload !== 'object') {
    return {
      hasData: false,
      lastReceivedAt: null,
      lastReceivedFormatted: null,
      rawPayload: null,
      waterLevelCm: null,
      waterLevelPercent: null,
      tank2Cm: null,
      tank2Percent: null,
      temperature: null,
      atmosphericPressure: null,
      humidity: null,
      rawVoltage: null,
      adcRaw: null,
      battery: null,
      signalStrength: null,
      sensorStatus: null,
      deviceTimestamp: null,
      hasAds1115Diag: false,
      hasBme280Diag: false,
      hasModemDiag: false,
      hasRs485Diag: false,
      hasBleDiag: false,
    };
  }

  const num = (...keys: string[]): number | null => {
    for (const k of keys) {
      if (rawPayload[k] !== undefined && rawPayload[k] !== null && rawPayload[k] !== '') {
        const n = Number(rawPayload[k]);
        if (Number.isFinite(n)) return n;
      }
    }
    return null;
  };

  const str = (...keys: string[]): string | null => {
    for (const k of keys) {
      if (rawPayload[k] !== undefined && rawPayload[k] !== null && String(rawPayload[k]).trim() !== '') {
        return String(rawPayload[k]).trim();
      }
    }
    return null;
  };

  const rawVoltage = num('rawVoltage', 'raw_voltage', 'voltage', 'v1');
  const adcRaw = num('adcRaw', 'adc_raw', 'adc', 'ads1115Raw');
  const atmosphericPressure = num('bmePressure', 'bme_pressure', 'atmPressure', 'pressure_hpa');
  const humidity = num('humidity', 'bmeHumidity', 'rh');
  const temperature = num('temp', 'temperature', 'bmeTemp', 'temperature_c');
  const signalStrength = num('csq', 'signal_csq', 'rssi', 'signalStrength');

  return {
    hasData: true,
    lastReceivedAt,
    lastReceivedFormatted,
    rawPayload,
    waterLevelCm: num('cm1', 'water_level_cm', 'waterLevelCm'),
    waterLevelPercent: num('wlp1', 'water_level_percentage', 'waterLevelPercent'),
    tank2Cm: num('cm2'),
    tank2Percent: num('wlp2'),
    temperature,
    atmosphericPressure,
    humidity,
    rawVoltage,
    adcRaw,
    battery: num('bat', 'battery_voltage', 'battery_v', 'batteryPercent'),
    signalStrength,
    sensorStatus: str('sensorStatus', 'sensor_status'),
    deviceTimestamp: str('time', 'timestamp', 'dt'),
    hasAds1115Diag: adcRaw !== null || rawVoltage !== null || rawPayload.ads1115Status !== undefined,
    hasBme280Diag: atmosphericPressure !== null || humidity !== null || rawPayload.bme280Status !== undefined,
    hasModemDiag: signalStrength !== null || rawPayload.modemStatus !== undefined || rawPayload.lteStatus !== undefined,
    hasRs485Diag: rawPayload.rs485Status !== undefined || rawPayload.modbusStatus !== undefined,
    hasBleDiag: rawPayload.bleStatus !== undefined || rawPayload.bleAdvertising !== undefined,
  };
}

type StatusTone = 'success' | 'danger' | 'warning' | 'neutral' | 'info';

const TONE_STYLES: Record<StatusTone, { bg: string; border: string; text: string; dot: string }> = {
  success: { bg: '#F0FDF4', border: '#BBF7D0', text: '#15803D', dot: '#16A34A' },
  danger: { bg: '#FEF2F2', border: '#FECACA', text: '#B91C1C', dot: '#DC2626' },
  warning: { bg: '#FFFBEB', border: '#FDE68A', text: '#B45309', dot: '#D97706' },
  info: { bg: '#EFF6FF', border: '#BFDBFE', text: '#1D4ED8', dot: '#2563EB' },
  neutral: { bg: '#F8FAFC', border: '#E2E8F0', text: '#475569', dot: '#94A3B8' },
};

export const StatusPill: React.FC<{ label: string; tone?: StatusTone }> = ({ label, tone = 'neutral' }) => {
  const s = TONE_STYLES[tone];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        padding: '2px 7px',
        borderRadius: '4px',
        fontSize: '10px',
        fontWeight: 700,
        backgroundColor: s.bg,
        border: `1px solid ${s.border}`,
        color: s.text,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: s.dot, flexShrink: 0 }} />
      {label}
    </span>
  );
};

export const SpecRow: React.FC<{ label: string; value: React.ReactNode; mono?: boolean }> = ({ label, value, mono }) => (
  <div
    style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: '8px',
      padding: '4px 0',
      borderBottom: '1px solid #F1F5F9',
      fontSize: '11px',
    }}
  >
    <span style={{ color: '#64748B', fontWeight: 600, flexShrink: 0 }}>{label}</span>
    <span
      style={{
        color: '#0F172A',
        fontWeight: 600,
        textAlign: 'right',
        fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' : 'inherit',
        wordBreak: 'break-word',
      }}
    >
      {value}
    </span>
  </div>
);

export const CollapsibleCard: React.FC<{
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  actions?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, subtitle, icon, badge, defaultOpen = true, actions, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '6px',
        border: '1px solid #E2E8F0',
        boxShadow: '0 1px 2px rgba(15, 23, 42, 0.03)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          padding: '8px 12px',
          backgroundColor: '#F8FAFC',
          borderBottom: open ? '1px solid #E2E8F0' : 'none',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <span style={{ color: '#0284C7', display: 'flex', alignItems: 'center', flexShrink: 0 }}>{icon}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A', letterSpacing: '0.2px', textTransform: 'uppercase' }}>
              {title}
            </div>
            {subtitle && (
              <div style={{ fontSize: '10px', color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {subtitle}
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
          {badge}
          {actions}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? `Collapse ${title}` : `Expand ${title}`}
            style={{
              background: '#FFFFFF',
              border: '1px solid #CBD5E1',
              borderRadius: '4px',
              width: '22px',
              height: '22px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#475569',
              padding: 0,
            }}
          >
            {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>
      </div>
      {open && <div style={{ padding: '10px 12px' }}>{children}</div>}
    </div>
  );
};

/* ============================================================================
 * SECTION 9: DEVICE HEALTH SUMMARY STRIP (9 Independent Status Indicators)
 * ============================================================================ */
export const DeviceHealthSummaryBar: React.FC<{
  brokerDiag: MqttBrokerDiagnostics;
  isTopicConfirmed: boolean;
  liveMetrics: LiveTelemetryMetrics;
  deviceOnline: boolean | null;
}> = ({ brokerDiag, isTopicConfirmed, liveMetrics, deviceOnline }) => {
  const isFreshTelemetry =
    liveMetrics.hasData && liveMetrics.lastReceivedAt !== null && Date.now() - liveMetrics.lastReceivedAt < 180000;

  const deviceStatus =
    isFreshTelemetry || deviceOnline === true
      ? { label: 'Online', tone: 'success' as StatusTone }
      : deviceOnline === false
      ? { label: 'Offline', tone: 'danger' as StatusTone }
      : { label: 'Unknown', tone: 'neutral' as StatusTone };

  const indicators: Array<{ param: string; label: string; tone: StatusTone; tip: string }> = [
    {
      param: 'Device',
      label: deviceStatus.label,
      tone: deviceStatus.tone,
      tip: 'Derived from actual telemetry freshness / device registry online state',
    },
    {
      param: 'MQTT Broker',
      label: brokerDiag.mqttSessionConnected ? 'Connected' : 'Disconnected',
      tone: brokerDiag.mqttSessionConnected ? 'success' : 'danger',
      tip: 'Actual Paho MQTT session status',
    },
    {
      param: 'MQTT Subscription',
      label: isTopicConfirmed ? 'Active' : 'Inactive',
      tone: isTopicConfirmed ? 'success' : 'warning',
      tip: 'Confirmed topic SUBACK from broker',
    },
    {
      param: 'Telemetry',
      label: liveMetrics.hasData ? 'Receiving' : 'No Data',
      tone: liveMetrics.hasData ? 'success' : 'neutral',
      tip: 'Actual incoming messages received on subscribed topic',
    },
    {
      param: 'ADS1115',
      label: liveMetrics.hasAds1115Diag ? 'Available' : 'Unknown',
      tone: liveMetrics.hasAds1115Diag ? 'success' : 'neutral',
      tip: 'Requires live ADC/voltage field in telemetry to confirm availability',
    },
    {
      param: 'BME280',
      label: liveMetrics.hasBme280Diag ? 'Available' : 'Unknown',
      tone: liveMetrics.hasBme280Diag ? 'success' : 'neutral',
      tip: 'Requires live BME280 pressure/humidity diagnostic in telemetry',
    },
    {
      param: 'LTE Modem',
      label: liveMetrics.hasModemDiag ? 'Connected' : 'Unknown',
      tone: liveMetrics.hasModemDiag ? 'success' : 'neutral',
      tip: 'Requires explicit modem/CSQ status in telemetry (never inferred from broker)',
    },
    {
      param: 'RS485',
      label: liveMetrics.hasRs485Diag ? 'Active' : 'Unknown',
      tone: liveMetrics.hasRs485Diag ? 'success' : 'neutral',
      tip: 'Requires RS485/Modbus diagnostic flag in telemetry',
    },
    {
      param: 'BLE',
      label: liveMetrics.hasBleDiag ? 'Advertising' : 'Unknown',
      tone: liveMetrics.hasBleDiag ? 'success' : 'neutral',
      tip: 'Requires BLE diagnostic flag in telemetry',
    },
  ];

  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #E2E8F0',
        borderRadius: '6px',
        padding: '8px 12px',
        boxShadow: '0 1px 2px rgba(15,23,42,0.03)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px', flexWrap: 'wrap', gap: '6px' }}>
        <span style={{ fontSize: '10px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
          Device Health Summary (Hardware status never assumed from broker connection)
        </span>
        <span style={{ fontSize: '10px', color: '#64748B' }}>
          Last Telemetry: <strong style={{ fontFamily: 'monospace', color: '#0F172A' }}>{liveMetrics.lastReceivedFormatted || 'No Data'}</strong>
        </span>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(108px, 1fr))',
          gap: '6px',
        }}
      >
        {indicators.map((item) => (
          <div
            key={item.param}
            title={item.tip}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '3px',
              padding: '5px 7px',
              backgroundColor: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '5px',
            }}
          >
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#64748B' }}>{item.param}</span>
            <div>
              <StatusPill label={item.label} tone={item.tone} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ============================================================================
 * SECTION 5: DEVICE IDENTITY CARD
 * ============================================================================ */
export const DeviceIdentityCard: React.FC<{
  metadata: DeviceMetadataModel;
  managedDevice: ManagedDevice | null;
  apiDevice: any | null;
  liveMetrics: LiveTelemetryMetrics;
  activeTopic: string;
  onCopyUid: () => void;
  onEditMetadata: () => void;
}> = ({ metadata, managedDevice, apiDevice, liveMetrics, activeTopic, onCopyUid, onEditMetadata }) => {
  const lastSeen =
    liveMetrics.lastReceivedFormatted ||
    apiDevice?.lastSeenAt ||
    apiDevice?.last_seen_at ||
    (managedDevice?.lastSeenTimestamp ? managedDevice.lastSeen : 'No Data');
  const firstRegistered =
    apiDevice?.createdAt ||
    apiDevice?.created_at ||
    managedDevice?.firstDiscovered ||
    'Not Configured';
  const statusLabel = liveMetrics.hasData
    ? 'RECEIVING TELEMETRY'
    : managedDevice?.isOnline || apiDevice?.isOnline
    ? 'ONLINE'
    : managedDevice || apiDevice
    ? (apiDevice?.status || managedDevice?.registrationStatus || 'REGISTERED')
    : 'UNKNOWN';

  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #E2E8F0',
        borderRadius: '6px',
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        boxShadow: '0 1px 2px rgba(15,23,42,0.03)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Cpu size={14} color="#0284C7" />
          <span style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase' }}>
            Device Identity
          </span>
        </div>
        <button
          type="button"
          onClick={onEditMetadata}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '3px 8px',
            fontSize: '10px',
            fontWeight: 700,
            color: '#1D4ED8',
            backgroundColor: '#EFF6FF',
            border: '1px solid #BFDBFE',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          <Edit3 size={11} />
          Edit Metadata
        </button>
      </div>

      {/* Prominent UID box with copy button */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          padding: '6px 9px',
          backgroundColor: '#0F172A',
          borderRadius: '5px',
          color: '#F8FAFC',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '9px', color: '#94A3B8', fontWeight: 700, letterSpacing: '0.5px' }}>DEVICE UID</div>
          <div
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              fontSize: '12px',
              fontWeight: 800,
              color: '#38BDF8',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {metadata.uid}
          </div>
        </div>
        <button
          type="button"
          onClick={onCopyUid}
          title="Copy Device UID"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 8px',
            backgroundColor: '#1E293B',
            color: '#E2E8F0',
            border: '1px solid #334155',
            borderRadius: '4px',
            fontSize: '10px',
            fontWeight: 700,
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <Copy size={11} />
          Copy
        </button>
      </div>

      <div>
        <SpecRow label="Device Name" value={metadata.deviceName} />
        <SpecRow label="Device Type" value={metadata.deviceType} />
        <SpecRow label="Hardware Model" value={metadata.hardwareModel} />
        <SpecRow label="Firmware Version" value={metadata.firmware.version} mono />
        <SpecRow
          label="Device Status"
          value={<StatusPill label={statusLabel} tone={liveMetrics.hasData ? 'success' : 'neutral'} />}
        />
        <SpecRow label="MQTT Topic" value={activeTopic} mono />
        <SpecRow label="Last Seen" value={String(lastSeen)} mono />
        <SpecRow label="First Registered" value={String(firstRegistered)} mono />
        <SpecRow label="Protocols" value={apiDevice?.protocol || 'MQTT/WSS (Dashboard) • LTE/RS485/BLE (Edge)'} />
      </div>
    </div>
  );
};

/* ============================================================================
 * SECTION 3A & 3C: HARDWARE OVERVIEW & COMMUNICATION INTERFACES (ROW 2)
 * ============================================================================ */
export const HardwareAndCommsRow: React.FC<{
  metadata: DeviceMetadataModel;
  liveMetrics: LiveTelemetryMetrics;
}> = ({ metadata, liveMetrics }) => {
  const ctrl = metadata.hardware.controller;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '10px' }}>
      {/* Main Controller + Peripherals */}
      <CollapsibleCard
        title="Hardware Information — Main Controller & Peripherals"
        subtitle="Cross-checked against firmware flow & repository source"
        icon={<Cpu size={15} />}
        badge={<StatusPill label={ctrl.model === 'Not Configured' ? 'MCU Not Configured' : ctrl.model} tone={ctrl.model === 'Not Configured' ? 'warning' : 'info'} />}
      >
        <div
          style={{
            padding: '6px 8px',
            marginBottom: '8px',
            backgroundColor: '#FFFBEB',
            border: '1px solid #FDE68A',
            borderRadius: '4px',
            fontSize: '10px',
            color: '#92400E',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '6px',
          }}
        >
          <Info size={13} style={{ flexShrink: 0, marginTop: '1px' }} />
          <span>{ctrl.verificationNote}</span>
        </div>

        <SpecRow label="MCU / Board Model" value={ctrl.model} mono />
        <SpecRow label="MCU Architecture" value={ctrl.architecture} />
        <SpecRow label="Processor Frequency" value={ctrl.frequency} mono />
        <SpecRow label="Flash Memory" value={ctrl.flashMemory} mono />
        <SpecRow label="RAM" value={ctrl.ram} mono />
        <SpecRow label="Firmware Version" value={ctrl.firmwareVersion} mono />
        <SpecRow label="Firmware Build Date" value={ctrl.firmwareBuildDate} mono />
        <SpecRow label="Device UID" value={metadata.uid} mono />

        <div style={{ marginTop: '10px', fontSize: '10px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '4px' }}>
          Other Peripherals (Firmware Flow Reference)
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '6px' }}>
          {metadata.hardware.peripherals.map((p) => (
            <div
              key={p.name}
              style={{
                padding: '6px 8px',
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '5px',
                fontSize: '11px',
              }}
            >
              <div style={{ fontWeight: 700, color: '#0F172A' }}>{p.name}</div>
              <div style={{ fontFamily: 'monospace', fontSize: '11px', color: '#0284C7', fontWeight: 700 }}>{p.spec}</div>
              <div style={{ fontSize: '9px', color: '#64748B', marginTop: '2px' }}>{p.verificationStatus}</div>
            </div>
          ))}
        </div>
      </CollapsibleCard>

      {/* Communication Interfaces */}
      <CollapsibleCard
        title="Communication Hardware Interfaces"
        subtitle="EC200U LTE Modem, RS485 Modbus RTU, and BLE GATT Server"
        icon={<Radio size={15} />}
        badge={<StatusPill label="3 Interfaces" tone="info" />}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {metadata.hardware.communicationInterfaces.map((iface) => {
            const Icon = iface.id === 'ec200u' ? Signal : iface.id === 'rs485' ? Cable : Bluetooth;
            const liveStatus =
              iface.id === 'ec200u'
                ? liveMetrics.hasModemDiag
                  ? `Signal CSQ: ${liveMetrics.signalStrength}`
                  : 'Unknown'
                : iface.id === 'rs485'
                ? liveMetrics.hasRs485Diag
                  ? 'Active'
                  : 'Unknown'
                : liveMetrics.hasBleDiag
                ? 'Advertising'
                : 'Unknown';

            return (
              <div
                key={iface.id}
                style={{
                  border: '1px solid #E2E8F0',
                  borderRadius: '5px',
                  padding: '8px 10px',
                  backgroundColor: '#F8FAFC',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px', gap: '6px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Icon size={13} color="#0284C7" />
                    <span style={{ fontSize: '11px', fontWeight: 800, color: '#0F172A' }}>{iface.name}</span>
                  </div>
                  <StatusPill label={iface.verificationStatus} tone="warning" />
                </div>
                {iface.specs.map((s) => (
                  <SpecRow key={s.label} label={s.label} value={s.value} mono={s.label.includes('Pin') || s.label.includes('Baud') || s.label.includes('UUID')} />
                ))}
                {iface.id === 'ec200u' && (
                  <>
                    <SpecRow label="Network Registration" value="Unknown" />
                    <SpecRow label="Cellular Connectivity" value={<StatusPill label={liveStatus} tone={liveMetrics.hasModemDiag ? 'success' : 'neutral'} />} />
                    <SpecRow label="Last Successful Comm" value={liveMetrics.lastReceivedFormatted || 'No Data'} mono />
                  </>
                )}
                {iface.id === 'rs485' && (
                  <SpecRow label="Connection Status" value={<StatusPill label={liveStatus} tone={liveMetrics.hasRs485Diag ? 'success' : 'neutral'} />} />
                )}
                {iface.id === 'ble' && (
                  <>
                    <SpecRow label="Advertising Status" value={<StatusPill label={liveStatus} tone={liveMetrics.hasBleDiag ? 'success' : 'neutral'} />} />
                    <SpecRow label="Connection Status" value={<StatusPill label="Unknown" tone="neutral" />} />
                  </>
                )}
              </div>
            );
          })}
        </div>
      </CollapsibleCard>
    </div>
  );
};

/* ============================================================================
 * SECTION 3B & 8: SENSOR DIAGNOSTICS & FIRMWARE CONFIGURATION (ROW 3)
 * ============================================================================ */
export const SensorsAndFirmwareRow: React.FC<{
  metadata: DeviceMetadataModel;
  liveMetrics: LiveTelemetryMetrics;
}> = ({ metadata, liveMetrics }) => {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '10px' }}>
      {/* Sensors Card Group */}
      <CollapsibleCard
        title="Sensor Diagnostics & Hardware Cards"
        subtitle="ADS1115 ADC, BME280 Environmental, and Hydrostatic Transducer"
        icon={<Gauge size={15} />}
        badge={<StatusPill label={liveMetrics.hasData ? 'Live Telemetry Linked' : 'Awaiting Telemetry'} tone={liveMetrics.hasData ? 'success' : 'neutral'} />}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* ADS1115 */}
          <div style={{ border: '1px solid #E2E8F0', borderRadius: '5px', padding: '8px 10px', backgroundColor: '#F8FAFC' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px', gap: '6px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Activity size={13} color="#0284C7" />
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#0F172A' }}>ADS1115 (16-bit I2C ADC)</span>
              </div>
              <StatusPill label="Configured – Hardware Verification Pending" tone="warning" />
            </div>
            <SpecRow label="Interface / I2C Address" value="I2C • 0x48" mono />
            <SpecRow label="Input Mode" value="Differential A0-A1" />
            <SpecRow label="Gain" value="±4.096V" mono />
            <SpecRow label="Data Rate" value="128 SPS" mono />
            <SpecRow
              label="Connection Status"
              value={<StatusPill label={liveMetrics.hasAds1115Diag ? 'Available' : 'Unknown'} tone={liveMetrics.hasAds1115Diag ? 'success' : 'neutral'} />}
            />
          </div>

          {/* BME280 */}
          <div style={{ border: '1px solid #E2E8F0', borderRadius: '5px', padding: '8px 10px', backgroundColor: '#F8FAFC' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px', gap: '6px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Thermometer size={13} color="#0284C7" />
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#0F172A' }}>BME280 (Environmental Sensor)</span>
              </div>
              <StatusPill label="Configured – Hardware Verification Pending" tone="warning" />
            </div>
            <SpecRow label="Interface" value="I2C (Pins 14, 15 per Firmware Flow)" mono />
            <SpecRow label="Temperature" value={liveMetrics.temperature !== null ? `${liveMetrics.temperature.toFixed(1)} °C` : 'No Data'} mono />
            <SpecRow label="Atmospheric Pressure" value={liveMetrics.atmosphericPressure !== null ? `${liveMetrics.atmosphericPressure.toFixed(2)} hPa` : 'Not in MQTT Payload'} mono />
            <SpecRow label="Humidity" value={liveMetrics.humidity !== null ? `${liveMetrics.humidity.toFixed(1)} %` : 'Not in MQTT Payload'} mono />
            <SpecRow
              label="Sensor Availability"
              value={<StatusPill label={liveMetrics.hasBme280Diag ? 'Available' : 'Unknown'} tone={liveMetrics.hasBme280Diag ? 'success' : 'neutral'} />}
            />
            <SpecRow label="Last Successful Reading" value={liveMetrics.temperature !== null ? (liveMetrics.lastReceivedFormatted || 'Received') : 'No Data'} mono />
          </div>

          {/* Hydrostatic Pressure Sensor */}
          <div style={{ border: '1px solid #E2E8F0', borderRadius: '5px', padding: '8px 10px', backgroundColor: '#F8FAFC' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px', gap: '6px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Gauge size={13} color="#0284C7" />
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#0F172A' }}>Hydrostatic Pressure Sensor</span>
              </div>
              <StatusPill label={liveMetrics.waterLevelCm !== null ? `${liveMetrics.waterLevelCm.toFixed(1)} cm` : 'No Live Reading'} tone={liveMetrics.waterLevelCm !== null ? 'success' : 'neutral'} />
            </div>
            <SpecRow label="Sensor Type" value="Hydrostatic Level Pressure Sensor" />
            <SpecRow label="ADC Channel" value="ADS1115 Differential A0-A1" mono />
            <SpecRow label="Raw ADC Value" value={liveMetrics.adcRaw !== null ? String(liveMetrics.adcRaw) : 'Not in MQTT Payload'} mono />
            <SpecRow label="Measured Voltage" value={liveMetrics.rawVoltage !== null ? `${liveMetrics.rawVoltage.toFixed(3)} V` : 'Not in MQTT Payload'} mono />
            <SpecRow
              label="Calculated Water Level"
              value={
                liveMetrics.waterLevelCm !== null
                  ? `${liveMetrics.waterLevelCm.toFixed(1)} cm (${liveMetrics.waterLevelPercent !== null ? liveMetrics.waterLevelPercent.toFixed(1) + '%' : '—'})`
                  : 'No Data'
              }
              mono
            />
            <SpecRow label="Calibration Status" value="Configured – Hardware Verification Pending" />
          </div>
        </div>
      </CollapsibleCard>

      {/* Firmware Configuration & FreeRTOS Tasks */}
      <CollapsibleCard
        title="Firmware Configuration & Safety Diagnostics"
        subtitle="Sensor processing pipeline, FreeRTOS task intervals, and safety guards"
        icon={<Wrench size={15} />}
        badge={<StatusPill label={`FW: ${metadata.firmware.version}`} tone="info" />}
      >
        <div style={{ fontSize: '10px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '4px' }}>
          Sensor Processing Parameters
        </div>
        <div style={{ marginBottom: '10px' }}>
          {metadata.firmware.sensorProcessing.map((sp) => (
            <SpecRow key={sp.label} label={sp.label} value={sp.value} mono={sp.value !== 'Not Configured'} />
          ))}
        </div>

        <div style={{ fontSize: '10px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '4px' }}>
          FreeRTOS Task Schedule (Firmware Flow Reference)
        </div>
        <div style={{ overflowX: 'auto', marginBottom: '10px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
            <thead>
              <tr style={{ backgroundColor: '#F1F5F9', color: '#475569', textAlign: 'left' }}>
                <th style={{ padding: '5px 6px', borderBottom: '1px solid #CBD5E1' }}>Task</th>
                <th style={{ padding: '5px 6px', borderBottom: '1px solid #CBD5E1' }}>Interval</th>
                <th style={{ padding: '5px 6px', borderBottom: '1px solid #CBD5E1' }}>Priority / Stack</th>
                <th style={{ padding: '5px 6px', borderBottom: '1px solid #CBD5E1' }}>Verification</th>
              </tr>
            </thead>
            <tbody>
              {metadata.firmware.freertosTasks.map((t) => (
                <tr key={t.name} style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '5px 6px', fontFamily: 'monospace', fontWeight: 700, color: '#0F172A' }}>{t.name}</td>
                  <td style={{ padding: '5px 6px', fontFamily: 'monospace', color: '#0284C7', fontWeight: 700 }}>{t.interval}</td>
                  <td style={{ padding: '5px 6px', color: '#475569' }}>
                    {t.priority === 'Not Configured' ? 'Not Configured' : `P${t.priority} • ${t.stack}`}
                  </td>
                  <td style={{ padding: '5px 6px', color: '#92400E', fontSize: '9px' }}>{t.verificationStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ fontSize: '10px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <ShieldCheck size={12} color="#0284C7" /> Safety Diagnostics
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {metadata.firmware.safetyDiagnostics.map((sd) => (
            <div
              key={sd.name}
              style={{
                padding: '5px 8px',
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '4px',
                fontSize: '10px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <strong style={{ color: '#0F172A' }}>{sd.name}</strong>
                <StatusPill label={sd.status} tone={sd.status === 'Unknown' ? 'neutral' : 'warning'} />
              </div>
              <div style={{ color: '#64748B', marginTop: '2px' }}>{sd.sourceNote}</div>
            </div>
          ))}
        </div>
      </CollapsibleCard>
    </div>
  );
};

/* ============================================================================
 * ADMIN HARDWARE METADATA ASSOCIATION MODAL (Section 5 & Section 11)
 * ============================================================================ */
export const DeviceMetadataModal: React.FC<{
  uid: string;
  initial: DeviceHardwareOverrides;
  deviceName: string;
  onSave: (overrides: DeviceHardwareOverrides) => void;
  onClose: () => void;
}> = ({ uid, initial, deviceName, onSave, onClose }) => {
  const [form, setForm] = useState<DeviceHardwareOverrides>({
    deviceName: initial.deviceName || deviceName,
    deviceType: initial.deviceType || '',
    hardwareModel: initial.hardwareModel || '',
    mcuModel: initial.mcuModel || '',
    mcuArchitecture: initial.mcuArchitecture || '',
    processorFrequency: initial.processorFrequency || '',
    flashMemory: initial.flashMemory || '',
    ram: initial.ram || '',
    firmwareVersion: initial.firmwareVersion || '',
    firmwareBuildDate: initial.firmwareBuildDate || '',
    modemVariant: initial.modemVariant || '',
    bleServiceUuid: initial.bleServiceUuid || '',
  });

  const field = (key: keyof DeviceHardwareOverrides, label: string, placeholder: string) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
      <label style={{ fontSize: '10px', fontWeight: 700, color: '#475569' }}>{label}</label>
      <input
        type="text"
        value={String(form[key] || '')}
        onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
        placeholder={placeholder}
        style={{
          padding: '6px 8px',
          fontSize: '11px',
          border: '1px solid #CBD5E1',
          borderRadius: '4px',
          fontFamily: key.includes('Uuid') || key.includes('Version') ? 'monospace' : 'inherit',
        }}
      />
    </div>
  );

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '8px',
          border: '1px solid #CBD5E1',
          width: '100%',
          maxWidth: '580px',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 16px',
            borderBottom: '1px solid #E2E8F0',
            backgroundColor: '#F8FAFC',
          }}
        >
          <div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A' }}>
              Associate Hardware & Firmware Metadata
            </div>
            <div style={{ fontSize: '11px', fontFamily: 'monospace', color: '#0284C7' }}>UID: {uid}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '14px 16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
          {field('deviceName', 'Device Name', 'e.g. Coach B4 Water Monitor')}
          {field('deviceType', 'Device Type', 'e.g. WLI Cellular Edge Node')}
          {field('hardwareModel', 'Hardware Model / Revision', 'e.g. WLI Rev 2.1')}
          {field('mcuModel', 'MCU / Board Model (Verified)', 'Leave blank if unverified')}
          {field('mcuArchitecture', 'MCU Architecture', 'e.g. ARM Cortex-M4 / Xtensa LX7')}
          {field('processorFrequency', 'Processor Frequency', 'e.g. 84 MHz / 240 MHz')}
          {field('flashMemory', 'Flash Memory', 'e.g. 512 KB / 8 MB')}
          {field('ram', 'RAM', 'e.g. 96 KB / 512 KB')}
          {field('firmwareVersion', 'Firmware Version', 'e.g. 2.2.0')}
          {field('firmwareBuildDate', 'Firmware Build Date', 'e.g. 2026-11-18')}
          {field('modemVariant', 'EC200U Exact Variant', 'e.g. EC200U-CNAA-N05')}
          {field('bleServiceUuid', 'BLE Service UUID', 'e.g. 4fafc201-1fb5-...')}
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '8px',
            padding: '10px 16px',
            borderTop: '1px solid #E2E8F0',
            backgroundColor: '#F8FAFC',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '6px 12px',
              fontSize: '11px',
              fontWeight: 600,
              color: '#475569',
              backgroundColor: '#FFFFFF',
              border: '1px solid #CBD5E1',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave(form)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '6px 14px',
              fontSize: '11px',
              fontWeight: 700,
              color: '#FFFFFF',
              backgroundColor: '#0284C7',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            <Save size={12} />
            Save Hardware Metadata
          </button>
        </div>
      </div>
    </div>
  );
};
