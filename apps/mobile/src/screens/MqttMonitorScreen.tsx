import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { typography } from '../theme';
import { useApp } from '../state/AppContext';
import {
  mqttService,
  RawMqttFrame,
  formatMqttTimestamp,
} from '../services/mqttService';
import { deviceRegistry, ManagedDevice } from '../services/deviceRegistry';
import {
  Terminal,
  Play,
  Pause,
  Trash2,
  Copy,
  Check,
  Radio,
  Clock,
  Cpu,
  ChevronDown,
  ChevronUp,
  X,
  Code2,
  AlertTriangle,
  RefreshCw,
  Wifi,
  WifiOff,
  Filter,
} from 'lucide-react';

export const DEFAULT_HARDWARE_UID = '002F00654B42501320353332';
export const TARGET_MQTT_TOPIC = DEFAULT_HARDWARE_UID;
const MAX_MESSAGE_BUFFER = 500;

/**
 * Strict 15 telemetry fields permitted in the Raw Data console.
 * Strictly in canonical order per the industrial specification.
 */
export const ALLOWED_TELEMETRY_FIELDS = [
  'uid',
  'lat',
  'long',
  'speed',
  'time',
  'cm1',
  'cm2',
  'wlp1',
  'wlp2',
  'wlv1',
  'wlv2',
  'bat',
  'temp',
  'chno',
  'trno',
] as const;

export type TelemetryFieldKey = typeof ALLOWED_TELEMETRY_FIELDS[number];

export interface CleanDeviceTelemetry {
  uid: string;
  lat: number | null;
  long: number | null;
  speed: number | null;
  time: string | null;
  cm1: number | null;
  cm2: number | null;
  wlp1: number | null;
  wlp2: number | null;
  wlv1: boolean | null;
  wlv2: boolean | null;
  bat: number | null;
  temp: number | null;
  chno: string | null;
  trno: string | null;
}

export interface CleanTelemetryFrame {
  id: string;
  topic: string;
  receivedAt: number;
  receivedAtFormatted: string; // Broker reception timestamp (e.g. 2026-11-16 12:20:23.444)
  deviceTimestamp: string | null; // Device internal time (e.g. "12:20:14")
  payload: CleanDeviceTelemetry;
  rawJsonString: string;
  qos: number;
  payloadSize: number;
}

/**
 * Filter an incoming MQTT payload strictly to the 15 telemetry fields.
 * Discards fleet synchronization, configuration JSON, train metadata,
 * deleted train records, and unrelated device messages.
 */
export function filterDeviceTelemetry(
  raw: any,
  expectedUid: string
): CleanDeviceTelemetry | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  // Reject fleet-wide configuration, train metadata, or synchronization packets
  if (
    'trains' in raw ||
    'devices' in raw ||
    'consist' in raw ||
    'settings' in raw ||
    'action' in raw ||
    'fleet' in raw ||
    'delta' in raw ||
    'event' in raw ||
    'eventType' in raw ||
    'sync_type' in raw
  ) {
    return null;
  }

  // Extract UID
  const rawUid = raw.uid !== undefined ? String(raw.uid).trim() : (raw.deviceId !== undefined ? String(raw.deviceId).trim() : null);
  if (!rawUid) {
    return null;
  }

  // Strict UID validation against selected device
  if (expectedUid && rawUid !== expectedUid.trim()) {
    return null;
  }

  // Construct projected object with strictly allowed fields in canonical order
  const result: CleanDeviceTelemetry = {
    uid: rawUid,
    lat: raw.lat !== undefined ? (typeof raw.lat === 'number' ? raw.lat : (Number.isFinite(Number(raw.lat)) ? Number(raw.lat) : null)) : null,
    long: raw.long !== undefined ? (typeof raw.long === 'number' ? raw.long : (Number.isFinite(Number(raw.long)) ? Number(raw.long) : null)) : (raw.lon !== undefined ? (typeof raw.lon === 'number' ? raw.lon : (Number.isFinite(Number(raw.lon)) ? Number(raw.lon) : null)) : null),
    speed: raw.speed !== undefined ? (typeof raw.speed === 'number' ? raw.speed : (Number.isFinite(Number(raw.speed)) ? Number(raw.speed) : null)) : null,
    time: raw.time !== undefined && raw.time !== null ? String(raw.time) : null,
    cm1: raw.cm1 !== undefined ? (typeof raw.cm1 === 'number' ? raw.cm1 : (Number.isFinite(Number(raw.cm1)) ? Number(raw.cm1) : null)) : null,
    cm2: raw.cm2 !== undefined ? (typeof raw.cm2 === 'number' ? raw.cm2 : (Number.isFinite(Number(raw.cm2)) ? Number(raw.cm2) : null)) : null,
    wlp1: raw.wlp1 !== undefined ? (typeof raw.wlp1 === 'number' ? raw.wlp1 : (Number.isFinite(Number(raw.wlp1)) ? Number(raw.wlp1) : null)) : null,
    wlp2: raw.wlp2 !== undefined ? (typeof raw.wlp2 === 'number' ? raw.wlp2 : (Number.isFinite(Number(raw.wlp2)) ? Number(raw.wlp2) : null)) : null,
    wlv1: raw.wlv1 !== undefined ? (typeof raw.wlv1 === 'boolean' ? raw.wlv1 : Boolean(raw.wlv1)) : (raw.wlvl !== undefined ? (typeof raw.wlvl === 'boolean' ? raw.wlvl : Boolean(raw.wlvl)) : null),
    wlv2: raw.wlv2 !== undefined ? (typeof raw.wlv2 === 'boolean' ? raw.wlv2 : Boolean(raw.wlv2)) : null,
    bat: raw.bat !== undefined ? (typeof raw.bat === 'number' ? raw.bat : (Number.isFinite(Number(raw.bat)) ? Number(raw.bat) : null)) : null,
    temp: raw.temp !== undefined ? (typeof raw.temp === 'number' ? raw.temp : (Number.isFinite(Number(raw.temp)) ? Number(raw.temp) : null)) : null,
    chno: raw.chno !== undefined && raw.chno !== null ? String(raw.chno) : null,
    trno: raw.trno !== undefined && raw.trno !== null ? String(raw.trno) : null,
  };

  return result;
}

/**
 * Format telemetry to clean JSON string with exact 2-space indentation,
 * canonical field ordering, and float precision formatting for 0.0 parity with MQTT.fx.
 */
export function formatTelemetryJson(t: CleanDeviceTelemetry): string {
  const lines: string[] = ['{'];
  const keys = ALLOWED_TELEMETRY_FIELDS;
  keys.forEach((k, idx) => {
    const val = (t as any)[k];
    const isLast = idx === keys.length - 1;
    let renderedVal: string;
    if (typeof val === 'string') {
      renderedVal = `"${val}"`;
    } else if (typeof val === 'number') {
      renderedVal = (['cm1', 'cm2', 'wlp1', 'wlp2', 'bat', 'temp', 'speed'].includes(k) && val % 1 === 0)
        ? val.toFixed(1)
        : String(val);
    } else if (typeof val === 'boolean') {
      renderedVal = String(val);
    } else {
      renderedVal = 'null';
    }
    lines.push(`  "${k}": ${renderedVal}${isLast ? '' : ','}`);
  });
  lines.push('}');
  return lines.join('\n');
}

interface JsonSyntaxViewerProps {
  data: CleanDeviceTelemetry;
  onCopyValue?: (key: string, val: any) => void;
}

/**
 * Syntax-highlighted JSON viewer matching MQTT.fx Plain Text / JSON Decoder.
 * Renders keys in blue, numbers in orange, strings in green, booleans in coral, and null in gray.
 */
const JsonSyntaxViewer: React.FC<JsonSyntaxViewerProps> = ({ data, onCopyValue }) => {
  if (!data || typeof data !== 'object') {
    return <span style={{ color: '#8B949E' }}>null</span>;
  }

  const renderValue = (val: any, keyName: string): React.ReactNode => {
    if (typeof val === 'string') {
      return (
        <span
          title={`Click to copy ${keyName}`}
          onClick={() => onCopyValue?.(keyName, val)}
          style={{ color: '#7EE787', cursor: 'pointer' }}
        >
          &quot;{val}&quot;
        </span>
      );
    }
    if (typeof val === 'number') {
      const formattedNum = (['cm1', 'cm2', 'wlp1', 'wlp2', 'bat', 'temp', 'speed'].includes(keyName) && val % 1 === 0)
        ? val.toFixed(1)
        : String(val);
      return (
        <span
          title={`Click to copy ${keyName}`}
          onClick={() => onCopyValue?.(keyName, val)}
          style={{ color: '#FFA657', cursor: 'pointer', fontWeight: 600 }}
        >
          {formattedNum}
        </span>
      );
    }
    if (typeof val === 'boolean') {
      return (
        <span
          title={`Click to copy ${keyName}`}
          onClick={() => onCopyValue?.(keyName, val)}
          style={{ color: '#FF7B72', cursor: 'pointer', fontWeight: 700 }}
        >
          {String(val)}
        </span>
      );
    }
    if (val === null) {
      return (
        <span
          title={`${keyName} is missing/null`}
          style={{ color: '#8B949E', fontStyle: 'italic' }}
        >
          null
        </span>
      );
    }
    return <span>{String(val)}</span>;
  };

  const keys = ALLOWED_TELEMETRY_FIELDS;

  return (
    <pre
      style={{
        margin: 0,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        fontSize: '12px',
        lineHeight: '19px',
        color: '#C9D1D9',
        whiteSpace: 'pre',
      }}
    >
      {'{'}{'\n'}
      {keys.map((k, idx) => {
        const val = (data as any)[k];
        const isLast = idx === keys.length - 1;
        return (
          <div key={k} style={{ paddingLeft: '20px' }}>
            <span
              title={`Click to copy "${k}"`}
              onClick={() => onCopyValue?.(k, k)}
              style={{ color: '#79C0FF', cursor: 'pointer' }}
            >
              &quot;{k}&quot;
            </span>
            <span style={{ color: '#C9D1D9' }}>: </span>
            {renderValue(val, k)}
            {!isLast ? <span style={{ color: '#8B949E' }}>,</span> : ''}
          </div>
        );
      })}
      {'}'}
    </pre>
  );
};

export const MqttMonitorScreen: React.FC = () => {
  const { mqttBrokerStatus, devices } = useApp();

  // Selected device UID state (persisted in localStorage)
  const [selectedDeviceUid, setSelectedDeviceUid] = useState<string>(() => {
    if (typeof window === 'undefined') return DEFAULT_HARDWARE_UID;
    const saved = localStorage.getItem('panorama_mqtt_selected_device') || localStorage.getItem('panorama_mqtt_target_topic');
    if (saved && !saved.includes('33332') && !saved.includes('0023004D') && !saved.startsWith('panorama/')) {
      return saved.split('/')[0].trim();
    }
    return DEFAULT_HARDWARE_UID;
  });

  const selectedDeviceUidRef = useRef<string>(selectedDeviceUid);
  selectedDeviceUidRef.current = selectedDeviceUid;

  // Raw telemetry message buffer
  const [messages, setMessages] = useState<CleanTelemetryFrame[]>([]);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [autoScroll, setAutoScroll] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('panorama_mqtt_autoscroll') !== 'false';
  });
  const [showTimestamps, setShowTimestamps] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('panorama_mqtt_show_timestamps') !== 'false';
  });

  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [totalMessagesCount, setTotalMessagesCount] = useState<number>(0);

  const terminalStreamRef = useRef<HTMLDivElement | null>(null);
  const isPausedRef = useRef<boolean>(isPaused);
  isPausedRef.current = isPaused;
  const autoScrollRef = useRef<boolean>(autoScroll);
  autoScrollRef.current = autoScroll;

  const brokerInfo = mqttService.getBrokerInfo();
  const isBrokerConnected = mqttBrokerStatus === 'CONNECTED' || brokerInfo.status === 'CONNECTED';

  // Compute available devices list for dropdown
  const availableDevices = useMemo(() => {
    const list: Array<{ uid: string; label: string }> = [];
    const seenUids = new Set<string>();

    // Always put default hardware device at the top
    list.push({
      uid: DEFAULT_HARDWARE_UID,
      label: `${DEFAULT_HARDWARE_UID} (Physical Hardware Node)`,
    });
    seenUids.add(DEFAULT_HARDWARE_UID);

    // Merge from app context & device registry
    const registryDevices = deviceRegistry.getDevices();
    const all = [...(devices || []), ...registryDevices];

    all.forEach((d) => {
      if (!d || !d.uid || seenUids.has(d.uid) || d.uid.startsWith('PANORAMA-')) return;
      seenUids.add(d.uid);
      const assignment = d.trainNumber && d.coachNumber ? ` • ${d.trainNumber} / ${d.coachNumber}` : '';
      list.push({
        uid: d.uid,
        label: `${d.uid}${assignment}`,
      });
    });

    // If current selected device is not yet in the list, add it
    if (!seenUids.has(selectedDeviceUid)) {
      list.push({
        uid: selectedDeviceUid,
        label: selectedDeviceUid,
      });
    }

    return list;
  }, [devices, selectedDeviceUid]);

  // Ensure default target topic is subscribed upon mounting; do NOT subscribe to '#' wildcard
  useEffect(() => {
    const uid = selectedDeviceUidRef.current;
    mqttService.subscribeTopic(uid, 0);
    // Explicitly clean up any previous wildcard subscriptions
    mqttService.unsubscribeTopic(`${uid}/#`);
    mqttService.unsubscribeTopic(`${DEFAULT_HARDWARE_UID}/#`);
  }, []);

  // Listen directly to incoming MQTT message frames from Paho client
  useEffect(() => {
    const unsubscribe = mqttService.onRawMessage((frame: RawMqttFrame) => {
      // 1. Drop any messages from fleet, central, or sync topics
      if (
        frame.topic.startsWith('panorama/') ||
        frame.topic.includes('fleet') ||
        frame.topic.includes('sync') ||
        frame.topic.includes('central') ||
        frame.topic.includes('settings') ||
        frame.topic.includes('users')
      ) {
        return;
      }

      const activeUid = selectedDeviceUidRef.current.trim();
      const topicBase = frame.topic.split('/')[0].trim();

      // 2. Reject messages from unrelated device topics
      if (frame.topic !== activeUid && topicBase !== activeUid) {
        return;
      }

      // 3. Must be valid JSON object
      if (!frame.isJson || !frame.parsedJson) {
        return;
      }

      // 4. Validate UID and filter strictly to the 15 telemetry fields
      const filtered = filterDeviceTelemetry(frame.parsedJson, activeUid);
      if (!filtered) {
        return;
      }

      setTotalMessagesCount((prev) => prev + 1);

      if (isPausedRef.current) {
        return;
      }

      const cleanFrame: CleanTelemetryFrame = {
        id: frame.id,
        topic: frame.topic,
        receivedAt: frame.receivedAt,
        receivedAtFormatted: frame.receivedAtFormatted,
        deviceTimestamp: filtered.time,
        payload: filtered,
        rawJsonString: formatTelemetryJson(filtered),
        qos: frame.qos,
        payloadSize: frame.payloadSize,
      };

      setMessages((prev) => {
        const next = [...prev, cleanFrame];
        if (next.length > MAX_MESSAGE_BUFFER) {
          return next.slice(next.length - MAX_MESSAGE_BUFFER);
        }
        return next;
      });
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Auto-scroll stream to bottom whenever new messages arrive
  useEffect(() => {
    if (autoScroll && !isPaused && terminalStreamRef.current) {
      terminalStreamRef.current.scrollTop = terminalStreamRef.current.scrollHeight;
    }
  }, [messages, autoScroll, isPaused]);

  // Handle device selection change from dropdown
  const handleDeviceChange = useCallback((newUid: string) => {
    const cleanUid = newUid.trim();
    if (!cleanUid || cleanUid === selectedDeviceUid) return;

    // 1. Unsubscribe from previous device topic
    if (selectedDeviceUid) {
      mqttService.unsubscribeTopic(selectedDeviceUid);
      mqttService.unsubscribeTopic(`${selectedDeviceUid}/#`);
    }

    // 2. Subscribe specifically to new device topic (no '#' wildcard)
    mqttService.subscribeTopic(cleanUid, 0);

    // 3. Update state & persist
    setSelectedDeviceUid(cleanUid);
    selectedDeviceUidRef.current = cleanUid;
    if (typeof window !== 'undefined') {
      localStorage.setItem('panorama_mqtt_selected_device', cleanUid);
      localStorage.setItem('panorama_mqtt_target_topic', cleanUid);
    }

    // 4. Reset messages buffer for the newly selected device
    setMessages([]);
  }, [selectedDeviceUid]);

  // Terminal Controls
  const handleClearConsole = useCallback(() => {
    setMessages([]);
    setCopyFeedback('Console cleared');
    setTimeout(() => setCopyFeedback(null), 1500);
  }, []);

  const handleTogglePause = useCallback(() => {
    setIsPaused((prev) => !prev);
  }, []);

  const handleToggleAutoScroll = useCallback(() => {
    setAutoScroll((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        localStorage.setItem('panorama_mqtt_autoscroll', String(next));
      }
      return next;
    });
  }, []);

  const handleToggleTimestamps = useCallback(() => {
    setShowTimestamps((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        localStorage.setItem('panorama_mqtt_show_timestamps', String(next));
      }
      return next;
    });
  }, []);

  // Copy helper
  const handleCopy = useCallback((text: string, label: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        setCopyFeedback(label);
        setTimeout(() => setCopyFeedback(null), 1800);
      });
    }
  }, []);

  // Copy latest telemetry JSON
  const handleCopyLatestJson = useCallback(() => {
    if (messages.length === 0) {
      setCopyFeedback('No telemetry to copy');
      setTimeout(() => setCopyFeedback(null), 1500);
      return;
    }
    const latest = messages[messages.length - 1];
    handleCopy(latest.rawJsonString, 'Latest JSON copied');
  }, [messages, handleCopy]);

  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        width: '100%',
        maxWidth: '1440px',
        margin: '0 auto',
        fontFamily: typography.fontFamily,
        boxSizing: 'border-box',
      }}
    >
      {/* 1. TOP HEADER & CONNECTION STATUS BAR */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '8px',
          border: '1px solid #E2E8F0',
          padding: '14px 18px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '8px',
              backgroundColor: '#0F172A',
              color: '#38BDF8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Terminal size={20} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                RAW MQTT DATA MONITOR
              </h1>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '12px',
                  backgroundColor: '#F1F5F9',
                  color: '#475569',
                  border: '1px solid #CBD5E1',
                }}
              >
                MQTT.fx Terminal
              </span>
            </div>
            <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
              Direct HiveMQ WebSocket Stream • Sensor Telemetry Only • Zero Synthetic Data
            </div>
          </div>
        </div>

        {/* Status Metrics Badges */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
          {/* Selected Device UID Header Identifier */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '6px',
              backgroundColor: '#EFF6FF',
              border: '1px solid #BFDBFE',
            }}
          >
            <Cpu size={13} color="#2563EB" />
            <span style={{ fontSize: '11px', color: '#1E40AF', fontWeight: 700 }}>DEVICE:</span>
            <span
              style={{
                fontSize: '11px',
                fontFamily: 'monospace',
                fontWeight: 800,
                color: '#1D4ED8',
              }}
            >
              {selectedDeviceUid}
            </span>
          </div>

          {/* Broker Status */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 10px',
              borderRadius: '6px',
              backgroundColor: isBrokerConnected ? '#F0FDF4' : '#FEF2F2',
              border: `1px solid ${isBrokerConnected ? '#BBF7D0' : '#FECACA'}`,
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: isBrokerConnected ? '#16A34A' : '#DC2626',
                display: 'inline-block',
                boxShadow: isBrokerConnected ? '0 0 0 2px rgba(22, 163, 74, 0.2)' : 'none',
              }}
            />
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: isBrokerConnected ? '#15803D' : '#B91C1C',
              }}
            >
              {isBrokerConnected ? 'CONNECTED' : 'DISCONNECTED'}
            </span>
            <span style={{ fontSize: '11px', color: '#64748B', borderLeft: '1px solid #CBD5E1', paddingLeft: '6px' }}>
              broker.hivemq.com:8884
            </span>
          </div>

          {/* Live Streaming Indicator */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 10px',
              borderRadius: '6px',
              backgroundColor: isPaused ? '#FFFBEB' : '#F0FDF4',
              border: `1px solid ${isPaused ? '#FDE68A' : '#BBF7D0'}`,
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: isPaused ? '#D97706' : '#16A34A',
                display: 'inline-block',
              }}
            />
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: isPaused ? '#B45309' : '#15803D',
              }}
            >
              {isPaused ? 'STREAM PAUSED' : 'STREAMING LIVE'}
            </span>
          </div>

          {/* Message Count */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 10px',
              borderRadius: '6px',
              backgroundColor: '#F8FAFC',
              border: '1px solid #E2E8F0',
            }}
          >
            <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>Messages:</span>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#2563EB' }}>
              {messages.length}
            </span>
            <span style={{ fontSize: '10px', color: '#94A3B8' }}>/ {MAX_MESSAGE_BUFFER}</span>
          </div>
        </div>
      </div>

      {/* 2. DEVICE SELECTION & TERMINAL CONTROLS TOOLBAR */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '8px',
          border: '1px solid #E2E8F0',
          padding: '12px 16px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
        }}
      >
        {/* Device Selection Dropdown */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', flex: '1 1 360px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: '280px' }}>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: '#475569',
                textTransform: 'uppercase',
                letterSpacing: '0.4px',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <Filter size={13} color="#2563EB" />
              Device UID:
            </span>
            <select
              value={selectedDeviceUid}
              onChange={(e) => handleDeviceChange(e.target.value)}
              style={{
                flex: 1,
                padding: '7px 10px',
                fontFamily: 'monospace',
                fontSize: '12px',
                fontWeight: 700,
                color: '#0F172A',
                backgroundColor: '#F8FAFC',
                border: '1px solid #CBD5E1',
                borderRadius: '6px',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              {availableDevices.map((d) => (
                <option key={d.uid} value={d.uid}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Action Controls: Pause, Clear, Timestamps, Auto Scroll, Copy JSON */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
          {/* Pause / Resume Button */}
          <button
            onClick={handleTogglePause}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 12px',
              backgroundColor: isPaused ? '#ECFDF5' : '#FFFBEB',
              color: isPaused ? '#059669' : '#D97706',
              border: `1px solid ${isPaused ? '#A7F3D0' : '#FDE68A'}`,
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {isPaused ? <Play size={13} /> : <Pause size={13} />}
            {isPaused ? 'Resume Stream' : 'Pause Stream'}
          </button>

          {/* Clear Console Button */}
          <button
            onClick={handleClearConsole}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 12px',
              backgroundColor: '#FFFFFF',
              color: '#64748B',
              border: '1px solid #CBD5E1',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Trash2 size={13} />
            Clear Console
          </button>

          {/* Vertical Separator */}
          <div style={{ height: '22px', width: '1px', backgroundColor: '#E2E8F0', margin: '0 2px' }} />

          {/* Show / Hide Timestamps Button */}
          <button
            onClick={handleToggleTimestamps}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 12px',
              backgroundColor: showTimestamps ? '#EFF6FF' : '#F8FAFC',
              color: showTimestamps ? '#1D4ED8' : '#64748B',
              border: `1px solid ${showTimestamps ? '#BFDBFE' : '#CBD5E1'}`,
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <Clock size={13} />
            {showTimestamps ? 'Hide Timestamps' : 'Show Timestamps'}
          </button>

          {/* Auto Scroll Checkbox */}
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              fontWeight: 600,
              color: '#334155',
              cursor: 'pointer',
              userSelect: 'none',
              padding: '0 4px',
            }}
          >
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={handleToggleAutoScroll}
              style={{ cursor: 'pointer' }}
            />
            Auto Scroll
          </label>

          {/* Copy Latest JSON Button */}
          <button
            onClick={handleCopyLatestJson}
            disabled={messages.length === 0}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 12px',
              backgroundColor: messages.length > 0 ? '#238636' : '#94A3B8',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: messages.length > 0 ? 'pointer' : 'not-allowed',
            }}
          >
            <Code2 size={13} />
            Copy JSON
          </button>

          {/* Toast / Feedback Banner */}
          {copyFeedback && (
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: '#16A34A',
                backgroundColor: '#DCFCE7',
                padding: '4px 10px',
                borderRadius: '6px',
                border: '1px solid #86EFAC',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <Check size={12} /> {copyFeedback}
            </span>
          )}
        </div>
      </div>

      {/* 3. LIVE MQTT TERMINAL VIEW (Direct MQTT.fx Terminal Appearance) */}
      <div
        style={{
          backgroundColor: '#0D1117',
          borderRadius: '8px',
          border: '1px solid #30363D',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}
      >
        {/* Terminal Header Bar */}
        <div
          style={{
            backgroundColor: '#161B22',
            borderBottom: '1px solid #30363D',
            padding: '8px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontFamily: 'monospace',
            fontSize: '11px',
            color: '#8B949E',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '5px' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#FF5F56' }} />
              <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#FFBD2E' }} />
              <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#27C93F' }} />
            </div>
            <span style={{ color: '#C9D1D9', fontWeight: 600 }}>
              terminal@panorama: mqtt://broker.hivemq.com:8884/{selectedDeviceUid}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <span>Buffer: {messages.length}/{MAX_MESSAGE_BUFFER}</span>
            <span>QoS: 0</span>
          </div>
        </div>

        {/* Message Stream Scroll Area */}
        <div
          ref={terminalStreamRef}
          style={{
            height: 'calc(100vh - 290px)',
            minHeight: '450px',
            maxHeight: '750px',
            overflowY: 'auto',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            backgroundColor: '#0D1117',
          }}
        >
          {messages.length === 0 ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                minHeight: '320px',
                gap: '12px',
                color: '#8B949E',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  border: '2px dashed #30363D',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#58A6FF',
                }}
              >
                <Radio size={22} />
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 700, color: '#C9D1D9' }}>
                Waiting for live MQTT telemetry on topic: {selectedDeviceUid}
              </div>
              <div style={{ fontSize: '12px', maxWidth: '500px', lineHeight: 1.5, color: '#8B949E' }}>
                Directly connected to HiveMQ broker over WebSocket TLS. When device {selectedDeviceUid} broadcasts its hardware telemetry packet, the exact 15-field JSON payload will stream here instantaneously.
              </div>
            </div>
          ) : (
            messages.map((frame, index) => {
              return (
                <div
                  key={frame.id}
                  style={{
                    backgroundColor: '#161B22',
                    border: '1px solid #30363D',
                    borderRadius: '6px',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  {/* Timestamp Mode: Display Broker Reception Header Banner */}
                  {showTimestamps && (
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        backgroundColor: '#21262D',
                        borderBottom: '1px solid #30363D',
                        fontFamily: 'monospace',
                        fontSize: '11px',
                        gap: '8px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: '#58A6FF', fontWeight: 800 }}>#{index + 1}</span>
                        <span style={{ color: '#58A6FF', fontWeight: 700 }}>
                          [{frame.receivedAtFormatted}] MQTT MESSAGE RECEIVED
                        </span>
                        <span
                          style={{
                            backgroundColor: '#1F2937',
                            color: '#79C0FF',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            border: '1px solid #374151',
                            fontWeight: 700,
                          }}
                        >
                          {frame.topic}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ color: '#8B949E', fontSize: '10px' }}>
                          Device Timestamp: &quot;{frame.deviceTimestamp || 'N/A'}&quot;
                        </span>
                        <button
                          onClick={() => handleCopy(frame.rawJsonString, `Message #${index + 1} copied`)}
                          title="Copy formatted JSON"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '2px 8px',
                            backgroundColor: '#30363D',
                            color: '#C9D1D9',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '10px',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          <Copy size={10} />
                          Copy
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Clean JSON Payload Body (Exact MQTT.fx Presentation) */}
                  <div
                    style={{
                      padding: '14px 16px',
                      overflowX: 'auto',
                      backgroundColor: '#0D1117',
                      position: 'relative',
                    }}
                  >
                    {!showTimestamps && (
                      <div
                        style={{
                          position: 'absolute',
                          top: '10px',
                          right: '12px',
                          zIndex: 2,
                        }}
                      >
                        <button
                          onClick={() => handleCopy(frame.rawJsonString, `JSON copied`)}
                          title="Copy JSON"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '3px 8px',
                            backgroundColor: '#21262D',
                            color: '#8B949E',
                            border: '1px solid #30363D',
                            borderRadius: '4px',
                            fontSize: '10px',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          <Copy size={10} />
                          Copy
                        </button>
                      </div>
                    )}
                    <JsonSyntaxViewer
                      data={frame.payload}
                      onCopyValue={(key, val) => handleCopy(String(val), `Copied ${key}`)}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
