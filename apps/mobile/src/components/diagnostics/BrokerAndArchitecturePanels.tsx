import React from 'react';
import {
  Server,
  Shield,
  Activity,
  Network,
  AlertTriangle,
  ArrowDown,
  CheckCircle2,
  XCircle,
  Clock,
} from 'lucide-react';
import { MqttBrokerDiagnostics, formatMqttTimestamp } from '../../services/mqttService';
import { CollapsibleCard, SpecRow, StatusPill } from './HardwareDiagnosticsPanels';

function formatDuration(connectedAt: number | null, isConnected: boolean, nowTick: number): string {
  if (!isConnected || !connectedAt) return 'Not Connected';
  const secs = Math.max(0, Math.floor((nowTick - connectedAt) / 1000));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/* ============================================================================
 * SECTION 4: MQTT BROKER INFORMATION & CONNECTION DIAGNOSTICS (ROW 4)
 * ============================================================================ */
export const MqttBrokerDetailsRow: React.FC<{
  brokerDiag: MqttBrokerDiagnostics;
  activeTopic: string;
  activeQos: number;
  isTopicConfirmed: boolean;
  topicMessagesCount: number;
  lastReceivedFormatted: string | null;
  nowTick: number;
}> = ({
  brokerDiag,
  activeTopic,
  activeQos,
  isTopicConfirmed,
  topicMessagesCount,
  lastReceivedFormatted,
  nowTick,
}) => {
  const stages = [
    {
      step: '1',
      label: 'WebSocket Connected',
      ok: brokerDiag.websocketConnected,
      detail: brokerDiag.websocketConnected ? `WSS ${brokerDiag.host}:${brokerDiag.port}` : 'Socket closed',
    },
    {
      step: '2',
      label: 'MQTT Session Connected',
      ok: brokerDiag.mqttSessionConnected,
      detail: brokerDiag.mqttSessionConnected ? `CONNACK OK (${brokerDiag.mqttVersion})` : 'No active session',
    },
    {
      step: '3',
      label: 'Topic Subscribed',
      ok: isTopicConfirmed,
      detail: isTopicConfirmed ? `SUBACK confirmed (${activeTopic})` : 'Subscription not confirmed',
    },
    {
      step: '4',
      label: 'Telemetry Received',
      ok: topicMessagesCount > 0,
      detail: topicMessagesCount > 0 ? `${topicMessagesCount} message(s) received` : 'No messages yet',
    },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '10px' }}>
      {/* Left: Broker Configuration & Security Information */}
      <CollapsibleCard
        title="MQTT Broker Configuration & Security"
        subtitle={`${brokerDiag.host}:${brokerDiag.port}${brokerDiag.path}`}
        icon={<Server size={15} />}
        badge={
          <StatusPill
            label={brokerDiag.mqttSessionConnected ? 'CONNECTED' : 'DISCONNECTED'}
            tone={brokerDiag.mqttSessionConnected ? 'success' : 'danger'}
          />
        }
      >
        <div style={{ fontSize: '10px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '4px' }}>
          Broker Configuration
        </div>
        <SpecRow label="Broker Name" value={brokerDiag.brokerName} />
        <SpecRow label="Broker Host" value={brokerDiag.host} mono />
        <SpecRow label="Broker Port" value={String(brokerDiag.port)} mono />
        <SpecRow label="WebSocket Path" value={brokerDiag.path} mono />
        <SpecRow label="Protocol" value={brokerDiag.protocol} />
        <SpecRow label="MQTT Version" value={brokerDiag.mqttVersion} mono />
        <SpecRow label="Transport Security" value={brokerDiag.transportSecurity} />
        <SpecRow
          label="Connection Status"
          value={
            <StatusPill
              label={brokerDiag.mqttSessionConnected ? 'CONNECTED' : 'DISCONNECTED'}
              tone={brokerDiag.mqttSessionConnected ? 'success' : 'danger'}
            />
          }
        />
        <SpecRow
          label="Subscription Status"
          value={
            <StatusPill
              label={isTopicConfirmed ? 'SUBSCRIBED' : 'UNSUBSCRIBED'}
              tone={isTopicConfirmed ? 'success' : 'warning'}
            />
          }
        />
        <SpecRow label="Configured QoS" value={`QoS ${activeQos}`} mono />
        <SpecRow label="Current Topic" value={activeTopic} mono />
        <SpecRow label="Last Received Message" value={lastReceivedFormatted || 'No Data'} mono />
        <SpecRow label="Messages Received (Topic)" value={String(topicMessagesCount)} mono />
        <SpecRow
          label="Connection Duration"
          value={formatDuration(brokerDiag.connectedAt ?? null, brokerDiag.mqttSessionConnected, nowTick)}
          mono
        />
        <SpecRow label="Reconnection Attempts" value={String(brokerDiag.reconnectAttempts)} mono />

        <div
          style={{
            marginTop: '10px',
            fontSize: '10px',
            fontWeight: 800,
            color: '#475569',
            textTransform: 'uppercase',
            marginBottom: '4px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <Shield size={12} color="#0284C7" /> Security Information (Credentials Never Exposed)
        </div>
        <SpecRow label="Transport Security" value={brokerDiag.transportSecurity} />
        <SpecRow label="Authentication Mode" value={brokerDiag.authMode} />
        <SpecRow label="Certificate Validation" value={brokerDiag.certValidation} />
      </CollapsibleCard>

      {/* Right: Connection Diagnostics & 4-Stage Pipeline */}
      <CollapsibleCard
        title="MQTT Connection & Network Diagnostics"
        subtitle="Real-time Paho client session events (no assumed states)"
        icon={<Activity size={15} />}
        badge={
          <StatusPill
            label={brokerDiag.brokerReachable || 'UNKNOWN'}
            tone={brokerDiag.brokerReachable === 'REACHABLE' ? 'success' : brokerDiag.brokerReachable === 'UNREACHABLE' ? 'danger' : 'neutral'}
          />
        }
      >
        {/* 4-Stage Connection Funnel */}
        <div style={{ fontSize: '10px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '6px' }}>
          4-Stage Connection Verification
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '6px', marginBottom: '10px' }}>
          {stages.map((st) => (
            <div
              key={st.step}
              style={{
                padding: '7px 8px',
                borderRadius: '5px',
                backgroundColor: st.ok ? '#F0FDF4' : '#F8FAFC',
                border: `1px solid ${st.ok ? '#BBF7D0' : '#E2E8F0'}`,
                display: 'flex',
                flexDirection: 'column',
                gap: '3px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                <span style={{ fontSize: '10px', fontWeight: 800, color: st.ok ? '#15803D' : '#475569' }}>
                  {st.step}. {st.label}
                </span>
                {st.ok ? <CheckCircle2 size={13} color="#16A34A" /> : <XCircle size={13} color="#94A3B8" />}
              </div>
              <span style={{ fontSize: '9px', color: '#64748B', fontFamily: 'monospace' }}>{st.detail}</span>
            </div>
          ))}
        </div>

        <SpecRow
          label="WebSocket Connection"
          value={<StatusPill label={brokerDiag.websocketConnected ? 'CONNECTED' : 'DISCONNECTED'} tone={brokerDiag.websocketConnected ? 'success' : 'danger'} />}
        />
        <SpecRow
          label="MQTT Session Status"
          value={<StatusPill label={brokerDiag.mqttSessionConnected ? 'ACTIVE' : 'INACTIVE'} tone={brokerDiag.mqttSessionConnected ? 'success' : 'danger'} />}
        />
        <SpecRow label="Broker Reachability" value={brokerDiag.brokerReachable} />
        <SpecRow
          label="Last Connection Time"
          value={brokerDiag.connectedAt ? formatMqttTimestamp(new Date(brokerDiag.connectedAt)) : 'Not Connected Yet'}
          mono
        />
        <SpecRow
          label="Last Disconnection Time"
          value={brokerDiag.disconnectedAt ? formatMqttTimestamp(new Date(brokerDiag.disconnectedAt)) : 'None Recorded'}
          mono
        />
        <SpecRow
          label="Connection Latency"
          value={brokerDiag.connectionLatencyMs !== null ? `${brokerDiag.connectionLatencyMs} ms` : 'Not Measured'}
          mono
        />
        <SpecRow
          label="Automatic Reconnection"
          value={<StatusPill label={brokerDiag.autoReconnect ? 'ENABLED (Backoff 1s–10s)' : 'DISABLED'} tone={brokerDiag.autoReconnect ? 'info' : 'neutral'} />}
        />
        <SpecRow label="Keep-Alive / Clean Session" value={`${brokerDiag.keepAliveSeconds}s • Clean: ${String(brokerDiag.cleanSession)}`} mono />
        <SpecRow label="Total Client Frames (All Topics)" value={String(brokerDiag.totalBrokerMessages)} mono />
        <SpecRow
          label="Last Error"
          value={
            brokerDiag.lastError ? (
              <span style={{ color: '#DC2626', fontWeight: 700 }}>{brokerDiag.lastError}</span>
            ) : (
              <span style={{ color: '#16A34A' }}>None</span>
            )
          }
        />
      </CollapsibleCard>
    </div>
  );
};

/* ============================================================================
 * SECTION 7: COMMUNICATION ARCHITECTURE PANEL (ROW 5)
 * ============================================================================ */
const ArchBox: React.FC<{ title: string; subtitle?: string; accent?: string }> = ({
  title,
  subtitle,
  accent = '#0284C7',
}) => (
  <div
    style={{
      padding: '6px 10px',
      borderRadius: '5px',
      backgroundColor: '#FFFFFF',
      border: `1px solid #CBD5E1`,
      borderLeft: `3px solid ${accent}`,
      textAlign: 'center',
      minWidth: '175px',
    }}
  >
    <div style={{ fontSize: '11px', fontWeight: 800, color: '#0F172A' }}>{title}</div>
    {subtitle && <div style={{ fontSize: '9px', color: '#64748B', fontFamily: 'monospace' }}>{subtitle}</div>}
  </div>
);

const FlowArrow: React.FC<{ label?: string }> = ({ label }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#64748B', margin: '2px 0' }}>
    <ArrowDown size={13} />
    {label && <span style={{ fontSize: '9px', fontFamily: 'monospace', color: '#475569' }}>{label}</span>}
  </div>
);

export const CommunicationArchitecturePanel: React.FC<{
  brokerDiag: MqttBrokerDiagnostics;
  activeTopic: string;
}> = ({ brokerDiag, activeTopic }) => {
  return (
    <CollapsibleCard
      title="Communication Architecture — Hardware Path vs. Dashboard MQTT Path"
      subtitle="Verified separation between edge cellular upload path and browser MQTT subscription path"
      icon={<Network size={15} />}
      defaultOpen={false}
    >
      {/* Important Architectural Verification Note */}
      <div
        style={{
          padding: '7px 10px',
          marginBottom: '10px',
          backgroundColor: '#FFFBEB',
          border: '1px solid #FDE68A',
          borderRadius: '5px',
          fontSize: '11px',
          color: '#92400E',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '8px',
          lineHeight: 1.45,
        }}
      >
        <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: '1px' }} />
        <div>
          <strong>Architecture Audit Verification:</strong> The supplied firmware flow describes <strong>HTTP POST uploads to Ubidots</strong> via the EC200U LTE modem (and this repository also includes an HTTPS receiver module in <code>EC200U/</code> + <code>HTTPS_Server/</code>). Direct firmware publishing to <code>{brokerDiag.host}</code> is <strong>not confirmed</strong> in the supplied firmware flow document — verify whether an external gateway/bridge or alternate MQTT-enabled firmware revision publishes to topic <code>{activeTopic}</code>.
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: '12px' }}>
        {/* Diagram A: Edge Hardware & Firmware Path */}
        <div
          style={{
            padding: '12px',
            backgroundColor: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: '6px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <div style={{ fontSize: '11px', fontWeight: 800, color: '#0F172A', marginBottom: '8px', textTransform: 'uppercase' }}>
            A. Edge Hardware & Cellular Path (Firmware Flow)
          </div>
          <ArchBox title="Hydrostatic Pressure Sensor" subtitle="Analog Differential" accent="#0284C7" />
          <FlowArrow label="A0-A1" />
          <ArchBox title="ADS1115 (16-bit ADC)" subtitle="I2C 0x48 • ±4.096V • 128 SPS" accent="#0284C7" />
          <FlowArrow label="I2C (Pins 14, 15)" />
          <ArchBox title="Main Controller (MCU)" subtitle="Model: Verify on Physical PCB" accent="#0F172A" />

          {/* Local Peripherals Fan-out */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: '6px',
              margin: '8px 0',
              padding: '6px',
              borderRadius: '5px',
              border: '1px dashed #CBD5E1',
              backgroundColor: '#FFFFFF',
              width: '100%',
            }}
          >
            <span style={{ fontSize: '9px', fontFamily: 'monospace', padding: '2px 6px', backgroundColor: '#F1F5F9', borderRadius: '3px', color: '#334155' }}>
              BME280 (I2C)
            </span>
            <span style={{ fontSize: '9px', fontFamily: 'monospace', padding: '2px 6px', backgroundColor: '#F1F5F9', borderRadius: '3px', color: '#334155' }}>
              RS485 / Modbus RTU (ID:1, 9600)
            </span>
            <span style={{ fontSize: '9px', fontFamily: 'monospace', padding: '2px 6px', backgroundColor: '#F1F5F9', borderRadius: '3px', color: '#334155' }}>
              BLE Server (Water Level Sensor)
            </span>
            <span style={{ fontSize: '9px', fontFamily: 'monospace', padding: '2px 6px', backgroundColor: '#F1F5F9', borderRadius: '3px', color: '#334155' }}>
              EEPROM 512B • Buzzer • RGB LED
            </span>
          </div>

          <FlowArrow label="UART AT Commands (Pins 7, 8)" />
          <ArchBox title="EC200U LTE Modem" subtitle="4G LTE Cat-1 + GNSS" accent="#16A34A" />
          <FlowArrow label="Cellular Network" />
          <ArchBox title="Remote Server (HTTP / HTTPS / Gateway)" subtitle="Ubidots (Flow) / FastAPI HTTPS / MQTT Bridge" accent="#D97706" />
        </div>

        {/* Diagram B: Panorama Dashboard MQTT Path */}
        <div
          style={{
            padding: '12px',
            backgroundColor: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: '6px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{ fontSize: '11px', fontWeight: 800, color: '#0F172A', marginBottom: '8px', textTransform: 'uppercase' }}>
            B. Panorama Dashboard MQTT Path (Active Browser Link)
          </div>
          <ArchBox title="Panorama Web Dashboard" subtitle="Browser Paho MQTT JS Client (v3.1.1)" accent="#2563EB" />
          <FlowArrow label={`${brokerDiag.useSSL ? 'WSS / TLS' : 'WS'} :${brokerDiag.port}${brokerDiag.path}`} />
          <ArchBox title={`MQTT Broker (${brokerDiag.brokerName})`} subtitle={`${brokerDiag.host}:${brokerDiag.port}`} accent="#7C3AED" />
          <FlowArrow label="Topic Subscription" />
          <ArchBox title="Device Topic" subtitle={activeTopic} accent="#0284C7" />
          <FlowArrow label="Incoming JSON Frames" />
          <ArchBox title="Live Telemetry Inspector" subtitle="Raw JSON + Dynamic Parsed Telemetry" accent="#16A34A" />
        </div>
      </div>
    </CollapsibleCard>
  );
};
