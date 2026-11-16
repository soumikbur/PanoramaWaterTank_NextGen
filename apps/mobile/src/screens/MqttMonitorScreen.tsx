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
  Wifi,
  WifiOff,
  Filter,
  ArrowDown,
  AlignLeft,
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
  seq: number;
  topic: string;
  receivedAt: number;
  receivedAtFormatted: string; // Broker reception timestamp (e.g. 2026-11-16 12:20:23.444)
  deviceTimestamp: string | null; // Device internal time (e.g. "12:20:14")
  payload: CleanDeviceTelemetry;
  rawJsonString: string;
  rawPayloadString: string;
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

  // Active topic & input state
  const [topicInput, setTopicInput] = useState<string>(() => {
    if (typeof window === 'undefined') return DEFAULT_HARDWARE_UID;
    const saved = localStorage.getItem('panorama_mqtt_selected_device') || localStorage.getItem('panorama_mqtt_target_topic');
    if (saved && !saved.includes('33332') && !saved.includes('0023004D') && !saved.startsWith('panorama/')) {
      return saved.split('/')[0].trim();
    }
    return DEFAULT_HARDWARE_UID;
  });

  const [activeTopic, setActiveTopic] = useState<string>(() => {
    if (typeof window === 'undefined') return DEFAULT_HARDWARE_UID;
    const saved = localStorage.getItem('panorama_mqtt_selected_device') || localStorage.getItem('panorama_mqtt_target_topic');
    if (saved && !saved.includes('33332') && !saved.includes('0023004D') && !saved.startsWith('panorama/')) {
      return saved.split('/')[0].trim();
    }
    return DEFAULT_HARDWARE_UID;
  });

  const [qosInput, setQosInput] = useState<number>(0);
  const [isSubscribed, setIsSubscribed] = useState<boolean>(true);

  const activeTopicRef = useRef<string>(activeTopic);
  activeTopicRef.current = activeTopic;

  // Raw telemetry message buffer
  const [messages, setMessages] = useState<CleanTelemetryFrame[]>([]);
  const [seqCounter, setSeqCounter] = useState<number>(0);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [autoScroll, setAutoScroll] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('panorama_mqtt_autoscroll') !== 'false';
  });
  const [showTimestamps, setShowTimestamps] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('panorama_mqtt_show_timestamps') !== 'false';
  });
  const [formatMode, setFormatMode] = useState<'pretty' | 'raw'>(() => {
    if (typeof window === 'undefined') return 'pretty';
    return (localStorage.getItem('panorama_mqtt_format_mode') as 'pretty' | 'raw') || 'pretty';
  });

  // Expand / collapse state for individual cards (empty set = all expanded by default)
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [totalMessagesCount, setTotalMessagesCount] = useState<number>(0);
  const [lastReceivedTimestamp, setLastReceivedTimestamp] = useState<string | null>(null);

  const terminalStreamRef = useRef<HTMLDivElement | null>(null);
  const isPausedRef = useRef<boolean>(isPaused);
  isPausedRef.current = isPaused;
  const autoScrollRef = useRef<boolean>(autoScroll);
  autoScrollRef.current = autoScroll;

  const brokerInfo = mqttService.getBrokerInfo();
  const isBrokerConnected = mqttBrokerStatus === 'CONNECTED' || brokerInfo.status === 'CONNECTED';

  // Compute available devices list for quick selection
  const availableDevices = useMemo(() => {
    const list: Array<{ uid: string; label: string }> = [];
    const seenUids = new Set<string>();

    // Always put default hardware device at the top
    list.push({
      uid: DEFAULT_HARDWARE_UID,
      label: `${DEFAULT_HARDWARE_UID} (Hardware Node)`,
    });
    seenUids.add(DEFAULT_HARDWARE_UID);

    // Merge from app context & device registry
    const registryDevices = deviceRegistry.getDevices();
    const all = [...(devices || []), ...registryDevices];

    all.forEach((d) => {
      if (!d || !d.uid || seenUids.has(d.uid) || d.uid.startsWith('PANORAMA-')) return;
      seenUids.add(d.uid);
      const assignment = d.trainNumber && d.coachNumber ? ` (${d.trainNumber}/${d.coachNumber})` : '';
      list.push({
        uid: d.uid,
        label: `${d.uid}${assignment}`,
      });
    });

    return list;
  }, [devices]);

  // Ensure default target topic is subscribed upon mounting
  useEffect(() => {
    const topic = activeTopicRef.current;
    mqttService.subscribeTopic(topic, qosInput);
    setIsSubscribed(true);
    // Explicitly clean up any previous wildcard subscriptions
    mqttService.unsubscribeTopic(`${topic}/#`);
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

      const currentTopic = activeTopicRef.current.trim();
      const topicBase = frame.topic.split('/')[0].trim();

      // 2. Reject messages from unrelated device topics
      if (frame.topic !== currentTopic && topicBase !== currentTopic) {
        return;
      }

      // 3. Must be valid JSON object
      if (!frame.isJson || !frame.parsedJson) {
        return;
      }

      // 4. Validate UID and filter strictly to the 15 telemetry fields
      const filtered = filterDeviceTelemetry(frame.parsedJson, currentTopic);
      if (!filtered) {
        return;
      }

      setTotalMessagesCount((prev) => prev + 1);
      setLastReceivedTimestamp(frame.receivedAtFormatted);

      if (isPausedRef.current) {
        return;
      }

      setSeqCounter((prevSeq) => {
        const nextSeq = prevSeq + 1;
        const cleanFrame: CleanTelemetryFrame = {
          id: frame.id || `msg-${Date.now()}-${nextSeq}`,
          seq: nextSeq,
          topic: frame.topic,
          receivedAt: frame.receivedAt,
          receivedAtFormatted: frame.receivedAtFormatted,
          deviceTimestamp: filtered.time,
          payload: filtered,
          rawJsonString: formatTelemetryJson(filtered),
          rawPayloadString: frame.payloadString || JSON.stringify(frame.parsedJson),
          qos: frame.qos,
          payloadSize: frame.payloadSize || frame.payloadString?.length || 0,
        };

        setMessages((prev) => {
          const next = [...prev, cleanFrame];
          if (next.length > MAX_MESSAGE_BUFFER) {
            return next.slice(next.length - MAX_MESSAGE_BUFFER);
          }
          return next;
        });

        return nextSeq;
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

  // Handle explicit Subscribe action
  const handleSubscribe = useCallback((overrideTopic?: string) => {
    const target = (overrideTopic || topicInput).trim();
    if (!target) return;

    if (activeTopic && activeTopic !== target) {
      mqttService.unsubscribeTopic(activeTopic);
      mqttService.unsubscribeTopic(`${activeTopic}/#`);
      setMessages([]);
    }

    mqttService.subscribeTopic(target, qosInput);
    setActiveTopic(target);
    activeTopicRef.current = target;
    setIsSubscribed(true);

    if (typeof window !== 'undefined') {
      localStorage.setItem('panorama_mqtt_selected_device', target);
      localStorage.setItem('panorama_mqtt_target_topic', target);
    }

    setCopyFeedback(`Subscribed: ${target}`);
    setTimeout(() => setCopyFeedback(null), 1800);
  }, [topicInput, qosInput, activeTopic]);

  // Handle explicit Unsubscribe action
  const handleUnsubscribe = useCallback(() => {
    if (!activeTopic) return;
    mqttService.unsubscribeTopic(activeTopic);
    mqttService.unsubscribeTopic(`${activeTopic}/#`);
    setIsSubscribed(false);
    setCopyFeedback(`Unsubscribed: ${activeTopic}`);
    setTimeout(() => setCopyFeedback(null), 1800);
  }, [activeTopic]);

  // Handle Quick Select change
  const handleQuickSelectChange = useCallback((newUid: string) => {
    const cleanUid = newUid.trim();
    if (!cleanUid) return;
    setTopicInput(cleanUid);
    handleSubscribe(cleanUid);
  }, [handleSubscribe]);

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

  const handleToggleFormatMode = useCallback(() => {
    setFormatMode((prev) => {
      const next = prev === 'pretty' ? 'raw' : 'pretty';
      if (typeof window !== 'undefined') {
        localStorage.setItem('panorama_mqtt_format_mode', next);
      }
      return next;
    });
  }, []);

  // Card Expand / Collapse Toggle
  const toggleCollapse = useCallback((id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Copy helpers
  const handleCopy = useCallback((text: string, label: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        setCopyFeedback(label);
        setTimeout(() => setCopyFeedback(null), 1800);
      });
    }
  }, []);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        width: '100%',
        maxWidth: '100%',
        height: 'calc(100vh - 146px)',
        maxHeight: 'calc(100vh - 146px)',
        minHeight: '520px',
        fontFamily: typography.fontFamily,
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      {/* 1. COMPACT MQTT CONNECTION STATUS SECTION */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '6px',
          border: '1px solid #E2E8F0',
          padding: '8px 14px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
          flexShrink: 0,
        }}
      >
        {/* Title & Broker */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              backgroundColor: '#0F172A',
              color: '#38BDF8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Terminal size={16} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <h1 style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.2px', margin: 0 }}>
                RAW MQTT DATA MONITOR
              </h1>
              <span
                style={{
                  fontSize: '9px',
                  fontWeight: 700,
                  padding: '1px 6px',
                  borderRadius: '10px',
                  backgroundColor: '#F1F5F9',
                  color: '#475569',
                  border: '1px solid #CBD5E1',
                }}
              >
                MQTT.fx Parity
              </span>
            </div>
            <div style={{ fontSize: '11px', color: '#64748B' }}>
              Broker: <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#334155' }}>broker.hivemq.com:8884</span> (WSS)
            </div>
          </div>
        </div>

        {/* Status Metrics Badges */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' }}>
          {/* Connection Status */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '4px 8px',
              borderRadius: '4px',
              backgroundColor: isBrokerConnected ? '#F0FDF4' : '#FEF2F2',
              border: `1px solid ${isBrokerConnected ? '#BBF7D0' : '#FECACA'}`,
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: isBrokerConnected ? '#16A34A' : '#DC2626',
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
          </div>

          {/* Active Topic */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 8px',
              borderRadius: '4px',
              backgroundColor: isSubscribed ? '#EFF6FF' : '#F8FAFC',
              border: `1px solid ${isSubscribed ? '#BFDBFE' : '#CBD5E1'}`,
            }}
          >
            <Cpu size={12} color={isSubscribed ? '#2563EB' : '#64748B'} />
            <span style={{ fontSize: '11px', color: '#475569', fontWeight: 600 }}>Topic:</span>
            <span
              style={{
                fontSize: '11px',
                fontFamily: 'monospace',
                fontWeight: 700,
                color: isSubscribed ? '#1D4ED8' : '#64748B',
              }}
            >
              {activeTopic}
            </span>
          </div>

          {/* Stream Status */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 8px',
              borderRadius: '4px',
              backgroundColor: isPaused ? '#FFFBEB' : '#F0FDF4',
              border: `1px solid ${isPaused ? '#FDE68A' : '#BBF7D0'}`,
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: isPaused ? '#D97706' : '#16A34A',
              }}
            />
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: isPaused ? '#B45309' : '#15803D',
              }}
            >
              {isPaused ? 'PAUSED' : 'LIVE'}
            </span>
          </div>

          {/* Total Messages Count */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 8px',
              borderRadius: '4px',
              backgroundColor: '#F8FAFC',
              border: '1px solid #E2E8F0',
            }}
          >
            <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>Total Msgs:</span>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#2563EB' }}>
              {totalMessagesCount}
            </span>
          </div>

          {/* Last Received Timestamp */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 8px',
              borderRadius: '4px',
              backgroundColor: '#F8FAFC',
              border: '1px solid #E2E8F0',
            }}
          >
            <Clock size={11} color="#64748B" />
            <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>Last:</span>
            <span style={{ fontSize: '11px', fontFamily: 'monospace', fontWeight: 700, color: '#0F172A' }}>
              {lastReceivedTimestamp ? lastReceivedTimestamp.split(' ')[1] || lastReceivedTimestamp : 'Waiting...'}
            </span>
          </div>
        </div>
      </div>

      {/* 2. COMPACT, PROPERLY ALIGNED MQTT CONTROL TOOLBAR */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '6px',
          border: '1px solid #E2E8F0',
          padding: '6px 12px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
          flexShrink: 0,
        }}
      >
        {/* Left side: Topic Input, Presets, QoS Selector, Subscribe & Unsubscribe */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', flex: '1 1 auto' }}>
          {/* Topic Input */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>Topic:</span>
            <input
              type="text"
              value={topicInput}
              onChange={(e) => setTopicInput(e.target.value)}
              placeholder="MQTT Topic..."
              style={{
                width: '180px',
                padding: '5px 8px',
                fontFamily: 'monospace',
                fontSize: '11px',
                fontWeight: 700,
                color: '#0F172A',
                backgroundColor: '#F8FAFC',
                border: '1px solid #CBD5E1',
                borderRadius: '4px',
                outline: 'none',
              }}
            />
          </div>

          {/* Quick Select Preset Dropdown */}
          <select
            value={availableDevices.some((d) => d.uid === topicInput) ? topicInput : ''}
            onChange={(e) => {
              if (e.target.value) handleQuickSelectChange(e.target.value);
            }}
            title="Quick-select registered device"
            style={{
              padding: '5px 6px',
              fontSize: '11px',
              color: '#475569',
              backgroundColor: '#F1F5F9',
              border: '1px solid #CBD5E1',
              borderRadius: '4px',
              outline: 'none',
              cursor: 'pointer',
              maxWidth: '150px',
            }}
          >
            <option value="" disabled>Device Presets...</option>
            {availableDevices.map((d) => (
              <option key={d.uid} value={d.uid}>
                {d.label}
              </option>
            ))}
          </select>

          {/* QoS Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>QoS:</span>
            <select
              value={qosInput}
              onChange={(e) => setQosInput(Number(e.target.value))}
              style={{
                padding: '5px 6px',
                fontSize: '11px',
                fontWeight: 700,
                color: '#0F172A',
                backgroundColor: '#F8FAFC',
                border: '1px solid #CBD5E1',
                borderRadius: '4px',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value={0}>QoS 0</option>
              <option value={1}>QoS 1</option>
              <option value={2}>QoS 2</option>
            </select>
          </div>

          {/* Subscribe Button */}
          <button
            onClick={() => handleSubscribe()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '5px 10px',
              backgroundColor: isSubscribed && activeTopic === topicInput.trim() ? '#15803D' : '#2563EB',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <Radio size={12} />
            {isSubscribed && activeTopic === topicInput.trim() ? 'Subscribed' : 'Subscribe'}
          </button>

          {/* Unsubscribe Button */}
          <button
            onClick={handleUnsubscribe}
            disabled={!isSubscribed}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '5px 10px',
              backgroundColor: '#FFFFFF',
              color: isSubscribed ? '#DC2626' : '#94A3B8',
              border: `1px solid ${isSubscribed ? '#FECACA' : '#E2E8F0'}`,
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: isSubscribed ? 'pointer' : 'not-allowed',
            }}
          >
            <WifiOff size={12} />
            Unsubscribe
          </button>
        </div>

        {/* Right side: Stream Controls, Toggles, and Formatter */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' }}>
          {/* Pause / Resume Button */}
          <button
            onClick={handleTogglePause}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '5px 9px',
              backgroundColor: isPaused ? '#ECFDF5' : '#FFFBEB',
              color: isPaused ? '#059669' : '#D97706',
              border: `1px solid ${isPaused ? '#A7F3D0' : '#FDE68A'}`,
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {isPaused ? <Play size={11} /> : <Pause size={11} />}
            {isPaused ? 'Resume' : 'Pause'}
          </button>

          {/* Clear Console Button */}
          <button
            onClick={handleClearConsole}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '5px 9px',
              backgroundColor: '#FFFFFF',
              color: '#64748B',
              border: '1px solid #CBD5E1',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Trash2 size={11} />
            Clear Console
          </button>

          {/* Show Timestamps Toggle */}
          <button
            onClick={handleToggleTimestamps}
            title={showTimestamps ? 'Hide reception timestamps' : 'Show reception timestamps'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '5px 9px',
              backgroundColor: showTimestamps ? '#EFF6FF' : '#F8FAFC',
              color: showTimestamps ? '#1D4ED8' : '#64748B',
              border: `1px solid ${showTimestamps ? '#BFDBFE' : '#CBD5E1'}`,
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Clock size={11} />
            {showTimestamps ? 'Hide Timestamps' : 'Show Timestamps'}
          </button>

          {/* Auto Scroll Toggle */}
          <button
            onClick={handleToggleAutoScroll}
            title={autoScroll ? 'Disable auto-scroll' : 'Enable auto-scroll'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '5px 9px',
              backgroundColor: autoScroll ? '#EFF6FF' : '#F8FAFC',
              color: autoScroll ? '#1D4ED8' : '#64748B',
              border: `1px solid ${autoScroll ? '#BFDBFE' : '#CBD5E1'}`,
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <ArrowDown size={11} />
            {autoScroll ? 'Auto Scroll' : 'Manual Scroll'}
          </button>

          {/* Pretty JSON / Raw String Toggle */}
          <button
            onClick={handleToggleFormatMode}
            title="Switch between syntax-highlighted JSON and raw string"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '5px 9px',
              backgroundColor: formatMode === 'pretty' ? '#F0FDF4' : '#F8FAFC',
              color: formatMode === 'pretty' ? '#15803D' : '#475569',
              border: `1px solid ${formatMode === 'pretty' ? '#BBF7D0' : '#CBD5E1'}`,
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {formatMode === 'pretty' ? <Code2 size={11} /> : <AlignLeft size={11} />}
            {formatMode === 'pretty' ? 'Pretty JSON' : 'Raw String'}
          </button>

          {/* Toast / Feedback Banner */}
          {copyFeedback && (
            <span
              style={{
                fontSize: '10px',
                fontWeight: 700,
                color: '#16A34A',
                backgroundColor: '#DCFCE7',
                padding: '3px 8px',
                borderRadius: '4px',
                border: '1px solid #86EFAC',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
              }}
            >
              <Check size={11} /> {copyFeedback}
            </span>
          )}
        </div>
      </div>

      {/* 3. PRIMARY TERMINAL CONTAINER */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          backgroundColor: '#0D1117',
          borderRadius: '6px',
          border: '1px solid #30363D',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 4px 14px rgba(0,0,0,0.2)',
        }}
      >
        {/* Terminal Header Bar */}
        <div
          style={{
            backgroundColor: '#161B22',
            borderBottom: '1px solid #30363D',
            padding: '7px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontFamily: 'monospace',
            fontSize: '11px',
            color: '#8B949E',
            flexShrink: 0,
          }}
        >
          {/* Traffic light dots and prompt */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
            <div style={{ display: 'flex', gap: '5px', flexShrink: 0 }}>
              <span style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: '#FF5F56', display: 'inline-block' }} />
              <span style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: '#FFBD2E', display: 'inline-block' }} />
              <span style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: '#27C93F', display: 'inline-block' }} />
            </div>
            <span
              style={{
                color: '#C9D1D9',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              scada@panorama: mqtt sub -h broker.hivemq.com -p 8884 -t {activeTopic}
            </span>
          </div>

          {/* Buffer, Mode & Live Indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
            <span style={{ color: '#58A6FF', fontWeight: 600 }}>{formatMode.toUpperCase()}</span>
            <span>Buffer: {messages.length}/{MAX_MESSAGE_BUFFER}</span>
            <span style={{ color: isPaused ? '#D97706' : '#27C93F', fontWeight: 700 }}>
              {isPaused ? '⏸ PAUSED' : '● LIVE'}
            </span>
          </div>
        </div>

        {/* Terminal Message Stream Scroll Area */}
        <div
          ref={terminalStreamRef}
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            padding: '10px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
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
                minHeight: '260px',
                gap: '10px',
                color: '#8B949E',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '50%',
                  border: '2px dashed #30363D',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#58A6FF',
                }}
              >
                <Radio size={20} />
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 700, color: '#C9D1D9' }}>
                Waiting for live MQTT telemetry on topic: {activeTopic}
              </div>
              <div style={{ fontSize: '11px', maxWidth: '480px', lineHeight: 1.5, color: '#8B949E' }}>
                Directly connected to HiveMQ broker over WebSocket TLS. When device {activeTopic} broadcasts its hardware telemetry packet, the exact 15-field JSON payload will stream here instantaneously.
              </div>
            </div>
          ) : (
            messages.map((frame, index) => {
              const isCollapsed = collapsedIds.has(frame.id);

              return (
                <div
                  key={frame.id}
                  style={{
                    backgroundColor: '#161B22',
                    border: '1px solid #30363D',
                    borderRadius: '5px',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                  }}
                >
                  {/* Unified Message Header Bar */}
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 10px',
                      backgroundColor: '#1C2128',
                      borderBottom: isCollapsed ? 'none' : '1px solid #30363D',
                      fontFamily: 'monospace',
                      fontSize: '11px',
                      gap: '6px',
                    }}
                  >
                    {/* Left: Sequence, Topic, QoS, Payload Size & Optional Timestamp */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' }}>
                      <span
                        style={{
                          backgroundColor: '#1F2937',
                          color: '#58A6FF',
                          padding: '1px 6px',
                          borderRadius: '3px',
                          fontWeight: 800,
                          fontSize: '10px',
                          border: '1px solid #374151',
                        }}
                      >
                        #{frame.seq}
                      </span>
                      <span
                        style={{
                          backgroundColor: '#0F172A',
                          color: '#79C0FF',
                          padding: '1px 7px',
                          borderRadius: '3px',
                          border: '1px solid #1E293B',
                          fontWeight: 700,
                          fontSize: '10px',
                        }}
                      >
                        {frame.topic}
                      </span>
                      <span
                        style={{
                          color: '#8B949E',
                          fontSize: '10px',
                          backgroundColor: '#21262D',
                          padding: '1px 5px',
                          borderRadius: '3px',
                        }}
                      >
                        QoS {frame.qos}
                      </span>
                      <span
                        style={{
                          color: '#8B949E',
                          fontSize: '10px',
                          backgroundColor: '#21262D',
                          padding: '1px 5px',
                          borderRadius: '3px',
                        }}
                      >
                        {frame.payloadSize} B
                      </span>

                      {/* Reception Timestamp (when Timestamps enabled) */}
                      {showTimestamps && (
                        <span
                          style={{
                            color: '#58A6FF',
                            fontWeight: 700,
                            fontSize: '10px',
                            backgroundColor: '#1E293B',
                            padding: '1px 6px',
                            borderRadius: '3px',
                            border: '1px solid #334155',
                          }}
                        >
                          [{frame.receivedAtFormatted}] MQTT MESSAGE RECEIVED
                        </span>
                      )}

                      {/* Device Internal Time */}
                      {frame.deviceTimestamp && (
                        <span style={{ color: '#8B949E', fontSize: '10px' }}>
                          Dev Time: &quot;{frame.deviceTimestamp}&quot;
                        </span>
                      )}

                      {/* Collapsed state badge */}
                      {isCollapsed && (
                        <span
                          style={{
                            color: '#F59E0B',
                            fontSize: '9px',
                            fontWeight: 700,
                            backgroundColor: '#2D2006',
                            padding: '1px 5px',
                            borderRadius: '3px',
                          }}
                        >
                          [Collapsed]
                        </span>
                      )}
                    </div>

                    {/* Right: Copy JSON, Copy Raw, and Expand/Collapse Chevron */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {/* Copy Formatted JSON */}
                      <button
                        onClick={() => handleCopy(frame.rawJsonString, `JSON #${frame.seq} copied`)}
                        title="Copy formatted 15-field JSON"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '3px',
                          padding: '2px 7px',
                          backgroundColor: '#21262D',
                          color: '#C9D1D9',
                          border: '1px solid #30363D',
                          borderRadius: '3px',
                          fontSize: '10px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        <Copy size={10} />
                        Copy JSON
                      </button>

                      {/* Copy Raw Payload String */}
                      <button
                        onClick={() => handleCopy(frame.rawPayloadString, `Raw #${frame.seq} copied`)}
                        title="Copy raw MQTT payload string"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '3px',
                          padding: '2px 7px',
                          backgroundColor: '#21262D',
                          color: '#C9D1D9',
                          border: '1px solid #30363D',
                          borderRadius: '3px',
                          fontSize: '10px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        <Copy size={10} />
                        Copy Raw
                      </button>

                      {/* Expand / Collapse Chevron */}
                      <button
                        onClick={() => toggleCollapse(frame.id)}
                        title={isCollapsed ? 'Expand payload' : 'Collapse payload'}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '20px',
                          height: '20px',
                          backgroundColor: '#21262D',
                          color: '#8B949E',
                          border: '1px solid #30363D',
                          borderRadius: '3px',
                          cursor: 'pointer',
                          padding: 0,
                        }}
                      >
                        {isCollapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
                      </button>
                    </div>
                  </div>

                  {/* Message Body (When NOT collapsed) */}
                  {!isCollapsed && (
                    <div
                      style={{
                        padding: '10px 14px',
                        overflowX: 'auto',
                        backgroundColor: '#0D1117',
                      }}
                    >
                      {formatMode === 'pretty' ? (
                        <JsonSyntaxViewer
                          data={frame.payload}
                          onCopyValue={(key, val) => handleCopy(String(val), `Copied ${key}`)}
                        />
                      ) : (
                        <pre
                          style={{
                            margin: 0,
                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                            fontSize: '11px',
                            lineHeight: '17px',
                            color: '#7EE787',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-all',
                          }}
                        >
                          {frame.rawPayloadString}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
