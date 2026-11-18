import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { typography } from '../theme';
import { useApp } from '../state/AppContext';
import { mqttService, RawMqttFrame } from '../services/mqttService';
import { deviceRegistry } from '../services/deviceRegistry';
import {
  Terminal,
  Play,
  Pause,
  Trash2,
  Copy,
  Check,
  Radio,
  Clock,
  WifiOff,
  ArrowDown,
  Code2,
  AlignLeft,
  Download,
} from 'lucide-react';

export const DEFAULT_HARDWARE_UID = '002F00654B42501320353332';
export const TARGET_MQTT_TOPIC = DEFAULT_HARDWARE_UID;
const DEFAULT_MAX_BUFFER = 500;
const BUFFER_OPTIONS = [100, 250, 500, 1000] as const;

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

/** Retained for compatibility with any existing imports/tests. */
export function filterDeviceTelemetry(raw: any, expectedUid: string): CleanDeviceTelemetry | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const rawUid = raw.uid ?? raw.device_uid ?? raw.deviceId ?? raw.device_id;
  if (!rawUid) return null;
  const uid = String(rawUid).trim();
  if (expectedUid && uid !== expectedUid.trim()) return null;
  const toNum = (v: any): number | null =>
    v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
  return {
    uid,
    lat: toNum(raw.lat ?? raw.latitude),
    long: toNum(raw.long ?? raw.lon ?? raw.longitude),
    speed: toNum(raw.speed ?? raw.speed_kmh),
    time: raw.time != null ? String(raw.time) : raw.timestamp != null ? String(raw.timestamp) : null,
    cm1: toNum(raw.cm1 ?? raw.water_level_cm),
    cm2: toNum(raw.cm2),
    wlp1: toNum(raw.wlp1 ?? raw.water_level_percentage),
    wlp2: toNum(raw.wlp2),
    wlv1: raw.wlv1 !== undefined ? Boolean(raw.wlv1) : raw.wlvl !== undefined ? Boolean(raw.wlvl) : null,
    wlv2: raw.wlv2 !== undefined ? Boolean(raw.wlv2) : null,
    bat: toNum(raw.bat ?? raw.battery_voltage),
    temp: toNum(raw.temp ?? raw.temperature),
    chno: raw.chno != null ? String(raw.chno) : null,
    trno: raw.trno != null ? String(raw.trno) : null,
  };
}

/** Retained for compatibility with any existing imports/tests. */
export function formatTelemetryJson(t: CleanDeviceTelemetry): string {
  return JSON.stringify(t, null, 2);
}

interface SerialMessage {
  id: string;
  seq: number;
  topic: string;
  qos: number;
  payloadSize: number;
  receivedAt: number;
  receivedTimeShort: string;     // HH:mm:ss.SSS (local reception time)
  receivedAtFormatted: string;   // YYYY-MM-DD HH:mm:ss.SSS
  deviceTimestamp: string | null; // Extracted from payload if present
  rawPayload: string;            // Verbatim original MQTT payload
  isJson: boolean;
  parsedJson: any;
  formattedJson: string | null;  // Pretty-printed JSON if valid
}

/** Standard MQTT wildcard matcher (+ and #) so subscribing to any topic works reliably. */
function mqttTopicMatches(subscription: string, incomingTopic: string): boolean {
  const sub = subscription.trim();
  const inc = incomingTopic.trim();
  if (!sub || !inc) return false;
  if (sub === inc) return true;
  const subParts = sub.split('/');
  const incParts = inc.split('/');
  for (let i = 0; i < subParts.length; i++) {
    if (subParts[i] === '#') return true;
    if (i >= incParts.length) return false;
    if (subParts[i] !== '+' && subParts[i] !== incParts[i]) return false;
  }
  return subParts.length === incParts.length;
}

function formatLocalTimeMs(date: Date): string {
  const pad = (n: number, z = 2) => String(n).padStart(z, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

/** Lightweight syntax-highlighted JSON renderer preserving exact original structure & nesting. */
const HighlightedJson: React.FC<{ text: string }> = React.memo(({ text }) => {
  const tokens = useMemo(() => {
    const regex = /("(?:\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(?:\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let key = 0;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }
      const token = match[0];
      let color = '#FFA657'; // number
      if (/^"/.test(token)) {
        if (/:$/.test(token)) {
          color = '#79C0FF'; // JSON key
        } else {
          color = '#7EE787'; // string value
        }
      } else if (/^(true|false)$/.test(token)) {
        color = '#FF7B72'; // boolean
      } else if (token === 'null') {
        color = '#8B949E'; // null
      }
      parts.push(
        <span key={key++} style={{ color }}>
          {token}
        </span>
      );
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }
    return parts;
  }, [text]);

  return (
    <pre
      style={{
        margin: 0,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        fontSize: '12.5px',
        lineHeight: '19px',
        color: '#C9D1D9',
        whiteSpace: 'pre',
      }}
    >
      {tokens}
    </pre>
  );
});

/** Single memoized terminal entry to prevent unnecessary re-renders during continuous streams. */
const SerialLogEntry: React.FC<{
  entry: SerialMessage;
  viewMode: 'json' | 'raw';
  showTimestamps: boolean;
  isSelected: boolean;
  isFirst: boolean;
  onSelect: (id: string) => void;
  onCopy: (entry: SerialMessage) => void;
}> = React.memo(({ entry, viewMode, showTimestamps, isSelected, isFirst, onSelect, onCopy }) => {
  return (
    <div
      onClick={() => onSelect(entry.id)}
      style={{
        padding: '8px 10px',
        borderRadius: '4px',
        backgroundColor: isSelected ? '#161B22' : 'transparent',
        border: isSelected ? '1px solid #30363D' : '1px solid transparent',
        borderTop: !isFirst && !isSelected ? '1px dashed #21262D' : isSelected ? '1px solid #30363D' : '1px solid transparent',
        cursor: 'pointer',
      }}
    >
      {/* Entry header line */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          marginBottom: '6px',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          fontSize: '11px',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: '#58A6FF', fontWeight: 700 }}>
            {showTimestamps ? `[${entry.receivedTimeShort}] ` : ''}MQTT MESSAGE RECEIVED
          </span>
          <span style={{ color: '#8B949E' }}>#{entry.seq}</span>
          <span style={{ color: '#79C0FF', backgroundColor: '#161B22', padding: '1px 6px', borderRadius: '3px', border: '1px solid #21262D' }}>
            {entry.topic}
          </span>
          <span style={{ color: '#8B949E' }}>QoS {entry.qos}</span>
          <span style={{ color: '#8B949E' }}>{entry.payloadSize} B</span>
          {!entry.isJson && (
            <span style={{ color: '#F59E0B', backgroundColor: '#2D2006', padding: '1px 5px', borderRadius: '3px', fontSize: '10px', fontWeight: 700 }}>
              PLAIN TEXT
            </span>
          )}
          {entry.deviceTimestamp && (
            <span style={{ color: '#A5D6FF' }}>Device Time: &quot;{entry.deviceTimestamp}&quot;</span>
          )}
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onCopy(entry);
          }}
          title="Copy message"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
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
          Copy
        </button>
      </div>

      {/* Entry body: Formatted JSON or verbatim Raw payload */}
      <div style={{ overflowX: 'auto', paddingLeft: '2px' }}>
        {viewMode === 'json' && entry.isJson && entry.formattedJson !== null ? (
          <HighlightedJson text={entry.formattedJson} />
        ) : (
          <pre
            style={{
              margin: 0,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              fontSize: '12px',
              lineHeight: '18px',
              color: entry.isJson ? '#7EE787' : '#E6EDF3',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {entry.rawPayload}
          </pre>
        )}
      </div>
    </div>
  );
});

export const MqttMonitorScreen: React.FC = () => {
  const { mqttBrokerStatus, devices } = useApp();

  // Preserve existing topic selection & localStorage keys
  const [topicInput, setTopicInput] = useState<string>(() => {
    if (typeof window === 'undefined') return DEFAULT_HARDWARE_UID;
    const saved =
      localStorage.getItem('panorama_mqtt_selected_device') ||
      localStorage.getItem('panorama_mqtt_target_topic');
    if (saved && !saved.includes('33332') && !saved.includes('0023004D') && !saved.startsWith('panorama/')) {
      return saved.split('/')[0].trim();
    }
    return DEFAULT_HARDWARE_UID;
  });

  const [activeTopic, setActiveTopic] = useState<string>(() => {
    if (typeof window === 'undefined') return DEFAULT_HARDWARE_UID;
    const saved =
      localStorage.getItem('panorama_mqtt_selected_device') ||
      localStorage.getItem('panorama_mqtt_target_topic');
    if (saved && !saved.includes('33332') && !saved.includes('0023004D') && !saved.startsWith('panorama/')) {
      return saved.split('/')[0].trim();
    }
    return DEFAULT_HARDWARE_UID;
  });

  const [qosInput, setQosInput] = useState<number>(0);
  const [isSubscribed, setIsSubscribed] = useState<boolean>(true);

  const [messages, setMessages] = useState<SerialMessage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [totalMessagesCount, setTotalMessagesCount] = useState<number>(0);
  const [queuedWhilePaused, setQueuedWhilePaused] = useState<number>(0);

  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [autoScroll, setAutoScroll] = useState<boolean>(() =>
    typeof window === 'undefined' ? true : localStorage.getItem('panorama_mqtt_autoscroll') !== 'false'
  );
  const [showTimestamps, setShowTimestamps] = useState<boolean>(() =>
    typeof window === 'undefined' ? true : localStorage.getItem('panorama_mqtt_show_timestamps') !== 'false'
  );
  const [viewMode, setViewMode] = useState<'json' | 'raw'>(() => {
    if (typeof window === 'undefined') return 'json';
    const saved = localStorage.getItem('panorama_mqtt_view_mode');
    return saved === 'raw' ? 'raw' : 'json';
  });
  const [maxBuffer, setMaxBuffer] = useState<number>(DEFAULT_MAX_BUFFER);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<string>(() => mqttService.getStatus());

  // Refs to avoid re-subscribing or recreating MQTT listeners on UI toggles
  const activeTopicRef = useRef<string>(activeTopic);
  activeTopicRef.current = activeTopic;
  const isSubscribedRef = useRef<boolean>(isSubscribed);
  isSubscribedRef.current = isSubscribed;
  const isPausedRef = useRef<boolean>(isPaused);
  isPausedRef.current = isPaused;
  const maxBufferRef = useRef<number>(maxBuffer);
  maxBufferRef.current = maxBuffer;
  const seqRef = useRef<number>(0);
  const pendingBufferRef = useRef<SerialMessage[]>([]);
  const terminalRef = useRef<HTMLDivElement | null>(null);

  const showToast = useCallback((msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 1800);
  }, []);

  // Track real MQTT connection status from existing singleton
  useEffect(() => {
    const unsub = mqttService.onStatusChange((st) => setLiveStatus(st));
    return () => unsub();
  }, []);

  const isBrokerConnected =
    mqttBrokerStatus === 'CONNECTED' ||
    liveStatus === 'CONNECTED' ||
    mqttService.getBrokerInfo().status === 'CONNECTED';

  // Existing registered device presets dropdown
  const availableDevices = useMemo(() => {
    const list: Array<{ uid: string; label: string }> = [];
    const seen = new Set<string>();
    list.push({ uid: DEFAULT_HARDWARE_UID, label: `${DEFAULT_HARDWARE_UID} (Default)` });
    seen.add(DEFAULT_HARDWARE_UID);

    const all = [...(devices || []), ...deviceRegistry.getDevices()];
    all.forEach((d: any) => {
      if (!d || !d.uid || seen.has(d.uid) || String(d.uid).startsWith('PANORAMA-')) return;
      seen.add(d.uid);
      const tag = d.trainNumber && d.coachNumber ? ` (${d.trainNumber}/${d.coachNumber})` : '';
      list.push({ uid: d.uid, label: `${d.uid}${tag}` });
    });
    return list;
  }, [devices]);

  // Subscribe once on mount without creating duplicate overlapping wildcard subscriptions
  useEffect(() => {
    const topic = activeTopicRef.current.trim();
    if (topic) {
      if (!topic.endsWith('/#')) {
        mqttService.unsubscribeTopic(`${topic}/#`);
      }
      mqttService.subscribeTopic(topic, qosInput);
      setIsSubscribed(true);
    }
  }, []);

  // Listen directly to existing MQTT client message event
  useEffect(() => {
    const unsubscribe = mqttService.onRawMessage((frame: RawMqttFrame) => {
      if (!isSubscribedRef.current) return;

      const subscribedTopic = activeTopicRef.current.trim();
      if (!subscribedTopic) return;

      // Ignore unrelated topics and internal fleet sync traffic unless explicitly subscribed
      if (!mqttTopicMatches(subscribedTopic, frame.topic)) {
        return;
      }

      const rawPayload = frame.payloadString ?? '';
      const receivedDate = new Date(frame.receivedAt || Date.now());

      // Never discard invalid JSON — parse safely and fall back to plain text
      let isJson = false;
      let parsedJson: any = null;
      let formattedJson: string | null = null;
      let deviceTimestamp: string | null = null;

      try {
        const parsed = JSON.parse(rawPayload);
        if (parsed !== null && typeof parsed === 'object') {
          isJson = true;
          parsedJson = parsed;
          formattedJson = JSON.stringify(parsed, null, 2);
          if (parsed.time !== undefined && parsed.time !== null) {
            deviceTimestamp = String(parsed.time);
          } else if (parsed.timestamp !== undefined && parsed.timestamp !== null) {
            deviceTimestamp = String(parsed.timestamp);
          }
        }
      } catch {
        isJson = false;
      }

      seqRef.current += 1;
      const entry: SerialMessage = {
        id: frame.id || `serial-${receivedDate.getTime()}-${seqRef.current}`,
        seq: seqRef.current,
        topic: frame.topic,
        qos: frame.qos ?? 0,
        payloadSize: frame.payloadSize || rawPayload.length,
        receivedAt: receivedDate.getTime(),
        receivedTimeShort: formatLocalTimeMs(receivedDate),
        receivedAtFormatted: frame.receivedAtFormatted || receivedDate.toISOString(),
        deviceTimestamp,
        rawPayload,
        isJson,
        parsedJson,
        formattedJson,
      };

      setTotalMessagesCount((prev) => prev + 1);

      // Pause stops rendering ONLY — keep receiving & buffering in background!
      if (isPausedRef.current) {
        pendingBufferRef.current.push(entry);
        if (pendingBufferRef.current.length > maxBufferRef.current) {
          pendingBufferRef.current = pendingBufferRef.current.slice(-maxBufferRef.current);
        }
        setQueuedWhilePaused(pendingBufferRef.current.length);
        return;
      }

      setMessages((prev) => {
        const limit = maxBufferRef.current;
        const next = [...prev, entry];
        return next.length > limit ? next.slice(next.length - limit) : next;
      });
    });

    return () => unsubscribe();
  }, []);

  // Auto-scroll smoothly to latest entry
  useEffect(() => {
    if (autoScroll && !isPaused && terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [messages, autoScroll, isPaused]);

  // Trim displayed messages if buffer limit is reduced
  useEffect(() => {
    setMessages((prev) => (prev.length > maxBuffer ? prev.slice(prev.length - maxBuffer) : prev));
  }, [maxBuffer]);

  const handleSubscribe = useCallback(
    (overrideTopic?: string) => {
      const target = (overrideTopic ?? topicInput).trim();
      if (!target) return;

      const previous = activeTopicRef.current.trim();
      if (previous && previous !== target) {
        mqttService.unsubscribeTopic(previous);
        setMessages([]);
        pendingBufferRef.current = [];
        setQueuedWhilePaused(0);
        setSelectedId(null);
      }

      if (!target.endsWith('/#')) {
        mqttService.unsubscribeTopic(`${target}/#`);
      }
      mqttService.subscribeTopic(target, qosInput);
      setActiveTopic(target);
      activeTopicRef.current = target;
      setIsSubscribed(true);
      isSubscribedRef.current = true;

      if (typeof window !== 'undefined') {
        localStorage.setItem('panorama_mqtt_selected_device', target);
        localStorage.setItem('panorama_mqtt_target_topic', target);
      }
      showToast(`Subscribed: ${target} (QoS ${qosInput})`);
    },
    [topicInput, qosInput, showToast]
  );

  const handleUnsubscribe = useCallback(() => {
    const current = activeTopicRef.current.trim();
    if (!current) return;
    mqttService.unsubscribeTopic(current);
    setIsSubscribed(false);
    isSubscribedRef.current = false;
    showToast(`Unsubscribed: ${current}`);
  }, [showToast]);

  const handleTogglePause = useCallback(() => {
    setIsPaused((prev) => {
      const nextPaused = !prev;
      isPausedRef.current = nextPaused;
      if (!nextPaused && pendingBufferRef.current.length > 0) {
        const flushed = pendingBufferRef.current;
        pendingBufferRef.current = [];
        setQueuedWhilePaused(0);
        setMessages((existing) => {
          const combined = [...existing, ...flushed];
          const limit = maxBufferRef.current;
          return combined.length > limit ? combined.slice(combined.length - limit) : combined;
        });
      }
      return nextPaused;
    });
  }, []);

  // Clear console does NOT unsubscribe or disconnect MQTT
  const handleClearConsole = useCallback(() => {
    setMessages([]);
    pendingBufferRef.current = [];
    setQueuedWhilePaused(0);
    setSelectedId(null);
    showToast('Console cleared');
  }, [showToast]);

  const handleToggleAutoScroll = useCallback(() => {
    setAutoScroll((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') localStorage.setItem('panorama_mqtt_autoscroll', String(next));
      return next;
    });
  }, []);

  const handleToggleTimestamps = useCallback(() => {
    setShowTimestamps((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') localStorage.setItem('panorama_mqtt_show_timestamps', String(next));
      return next;
    });
  }, []);

  const handleSetViewMode = useCallback((mode: 'json' | 'raw') => {
    setViewMode(mode);
    if (typeof window !== 'undefined') localStorage.setItem('panorama_mqtt_view_mode', mode);
  }, []);

  const copyEntryText = useCallback(
    (entry: SerialMessage) => {
      const text = viewMode === 'json' && entry.formattedJson ? entry.formattedJson : entry.rawPayload;
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => showToast(`Copied #${entry.seq}`));
      }
    },
    [viewMode, showToast]
  );

  const handleToolbarCopy = useCallback(() => {
    if (messages.length === 0) return;
    const target = (selectedId && messages.find((m) => m.id === selectedId)) || messages[messages.length - 1];
    copyEntryText(target);
  }, [messages, selectedId, copyEntryText]);

  const handleDownloadLogs = useCallback(() => {
    if (typeof window === 'undefined' || messages.length === 0) return;
    const payload = {
      exportedAt: new Date().toISOString(),
      topic: activeTopic,
      totalReceived: totalMessagesCount,
      exportedCount: messages.length,
      messages: messages.map((m) => ({
        seq: m.seq,
        topic: m.topic,
        qos: m.qos,
        receivedAt: m.receivedAtFormatted,
        deviceTimestamp: m.deviceTimestamp,
        isJson: m.isJson,
        payload: m.isJson ? m.parsedJson : m.rawPayload,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mqtt-serial-log-${activeTopic.replace(/[^a-zA-Z0-9_-]/g, '_')}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Downloaded ${messages.length} log(s)`);
  }, [activeTopic, messages, totalMessagesCount, showToast]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        width: '100%',
        height: 'calc(100vh - 134px)',
        minHeight: '540px',
        fontFamily: typography.fontFamily,
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      {/* Clean dark terminal scrollbar styling */}
      <style>{`
        .mqtt-serial-stream::-webkit-scrollbar { width: 8px; height: 8px; }
        .mqtt-serial-stream::-webkit-scrollbar-track { background: #0D1117; }
        .mqtt-serial-stream::-webkit-scrollbar-thumb { background: #30363D; border-radius: 4px; }
        .mqtt-serial-stream::-webkit-scrollbar-thumb:hover { background: #484F58; }
      `}</style>

      {/* A. COMPACT MQTT HEADER */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '6px',
          padding: '8px 12px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '26px',
              height: '26px',
              borderRadius: '5px',
              backgroundColor: '#0F172A',
              color: '#38BDF8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Terminal size={15} />
          </div>
          <h1 style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A', margin: 0, letterSpacing: '0.2px' }}>
            RAW MQTT SERIAL MONITOR
          </h1>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' }}>
          {/* Connection Status */}
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '3px 8px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 700,
              backgroundColor: isBrokerConnected ? '#F0FDF4' : '#FEF2F2',
              border: `1px solid ${isBrokerConnected ? '#BBF7D0' : '#FECACA'}`,
              color: isBrokerConnected ? '#15803D' : '#B91C1C',
            }}
          >
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                backgroundColor: isBrokerConnected ? '#16A34A' : '#DC2626',
              }}
            />
            {isBrokerConnected ? 'CONNECTED' : 'DISCONNECTED'}
          </span>

          {/* Live / Paused Indicator */}
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '3px 8px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 700,
              backgroundColor: isPaused ? '#FFFBEB' : '#F0FDF4',
              border: `1px solid ${isPaused ? '#FDE68A' : '#BBF7D0'}`,
              color: isPaused ? '#B45309' : '#15803D',
            }}
          >
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                backgroundColor: isPaused ? '#D97706' : '#16A34A',
              }}
            />
            {isPaused ? `PAUSED${queuedWhilePaused > 0 ? ` (+${queuedWhilePaused})` : ''}` : 'LIVE'}
          </span>

          {/* Selected Topic */}
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 8px',
              borderRadius: '4px',
              fontSize: '11px',
              backgroundColor: '#F8FAFC',
              border: '1px solid #E2E8F0',
              color: '#475569',
            }}
          >
            Topic: <strong style={{ fontFamily: 'monospace', color: '#0F172A' }}>{activeTopic}</strong>
          </span>

          {/* Subscription Status */}
          <span
            style={{
              padding: '3px 8px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 700,
              backgroundColor: isSubscribed ? '#EFF6FF' : '#F8FAFC',
              border: `1px solid ${isSubscribed ? '#BFDBFE' : '#CBD5E1'}`,
              color: isSubscribed ? '#1D4ED8' : '#64748B',
            }}
          >
            {isSubscribed ? 'SUBSCRIBED' : 'UNSUBSCRIBED'}
          </span>

          {/* Total Messages Received */}
          <span
            style={{
              padding: '3px 8px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 700,
              backgroundColor: '#F8FAFC',
              border: '1px solid #E2E8F0',
              color: '#0F172A',
            }}
          >
            Messages: <span style={{ fontFamily: 'monospace', color: '#2563EB' }}>{totalMessagesCount}</span>
          </span>
        </div>
      </div>

      {/* B. MQTT TOPIC CONTROLS */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '6px',
          padding: '6px 12px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '6px',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>Topic:</span>
        <input
          type="text"
          value={topicInput}
          onChange={(e) => setTopicInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubscribe();
          }}
          placeholder="Enter MQTT topic..."
          style={{
            width: '230px',
            maxWidth: '100%',
            padding: '5px 8px',
            fontFamily: 'monospace',
            fontSize: '11.5px',
            fontWeight: 700,
            color: '#0F172A',
            backgroundColor: '#F8FAFC',
            border: '1px solid #CBD5E1',
            borderRadius: '4px',
            outline: 'none',
          }}
        />

        <select
          value={availableDevices.some((d) => d.uid === topicInput) ? topicInput : ''}
          onChange={(e) => {
            if (e.target.value) {
              setTopicInput(e.target.value);
              handleSubscribe(e.target.value);
            }
          }}
          title="Select registered device topic"
          style={{
            padding: '5px 7px',
            fontSize: '11px',
            color: '#334155',
            backgroundColor: '#F1F5F9',
            border: '1px solid #CBD5E1',
            borderRadius: '4px',
            cursor: 'pointer',
            maxWidth: '210px',
          }}
        >
          <option value="" disabled>
            Saved Topics...
          </option>
          {availableDevices.map((d) => (
            <option key={d.uid} value={d.uid}>
              {d.label}
            </option>
          ))}
        </select>

        <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569', marginLeft: '4px' }}>QoS:</span>
        <select
          value={qosInput}
          onChange={(e) => setQosInput(Number(e.target.value))}
          style={{
            padding: '5px 7px',
            fontSize: '11px',
            fontWeight: 700,
            color: '#0F172A',
            backgroundColor: '#F8FAFC',
            border: '1px solid #CBD5E1',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          <option value={0}>0</option>
          <option value={1}>1</option>
          <option value={2}>2</option>
        </select>

        <button
          type="button"
          onClick={() => handleSubscribe()}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '5px 11px',
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
          SUBSCRIBE
        </button>

        <button
          type="button"
          onClick={handleUnsubscribe}
          disabled={!isSubscribed}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '5px 11px',
            backgroundColor: '#FFFFFF',
            color: isSubscribed ? '#DC2626' : '#94A3B8',
            border: `1px solid ${isSubscribed ? '#FECACA' : '#E2E8F0'}`,
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: 700,
            cursor: isSubscribed ? 'pointer' : 'not-allowed',
          }}
        >
          <WifiOff size={12} />
          UNSUBSCRIBE
        </button>

        {feedback && (
          <span
            style={{
              marginLeft: 'auto',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 8px',
              borderRadius: '4px',
              fontSize: '10px',
              fontWeight: 700,
              color: '#15803D',
              backgroundColor: '#DCFCE7',
              border: '1px solid #86EFAC',
            }}
          >
            <Check size={11} /> {feedback}
          </span>
        )}
      </div>

      {/* C. TERMINAL CONTROLS TOOLBAR */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '6px',
          padding: '6px 12px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '6px',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '5px' }}>
          <button
            type="button"
            onClick={handleTogglePause}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 9px',
              backgroundColor: isPaused ? '#ECFDF5' : '#FFFBEB',
              color: isPaused ? '#059669' : '#B45309',
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

          <button
            type="button"
            onClick={handleClearConsole}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 9px',
              backgroundColor: '#FFFFFF',
              color: '#475569',
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

          <button
            type="button"
            onClick={handleToggleAutoScroll}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 9px',
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
            Auto Scroll
          </button>

          <button
            type="button"
            onClick={handleToggleTimestamps}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 9px',
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
            Timestamps
          </button>

          <button
            type="button"
            onClick={() => handleSetViewMode('json')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 9px',
              backgroundColor: viewMode === 'json' ? '#0F172A' : '#F8FAFC',
              color: viewMode === 'json' ? '#FFFFFF' : '#475569',
              border: `1px solid ${viewMode === 'json' ? '#0F172A' : '#CBD5E1'}`,
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <Code2 size={11} />
            JSON View
          </button>

          <button
            type="button"
            onClick={() => handleSetViewMode('raw')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 9px',
              backgroundColor: viewMode === 'raw' ? '#0F172A' : '#F8FAFC',
              color: viewMode === 'raw' ? '#FFFFFF' : '#475569',
              border: `1px solid ${viewMode === 'raw' ? '#0F172A' : '#CBD5E1'}`,
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <AlignLeft size={11} />
            Raw View
          </button>

          <button
            type="button"
            onClick={handleToolbarCopy}
            disabled={messages.length === 0}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 9px',
              backgroundColor: '#FFFFFF',
              color: messages.length > 0 ? '#334155' : '#94A3B8',
              border: '1px solid #CBD5E1',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: messages.length > 0 ? 'pointer' : 'not-allowed',
            }}
          >
            <Copy size={11} />
            Copy
          </button>

          <button
            type="button"
            onClick={handleDownloadLogs}
            disabled={messages.length === 0}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 9px',
              backgroundColor: '#FFFFFF',
              color: messages.length > 0 ? '#1D4ED8' : '#94A3B8',
              border: `1px solid ${messages.length > 0 ? '#BFDBFE' : '#E2E8F0'}`,
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 700,
              cursor: messages.length > 0 ? 'pointer' : 'not-allowed',
            }}
          >
            <Download size={11} />
            Download Logs
          </button>
        </div>

        {/* Buffer limit selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#64748B' }}>
          <span>Buffer:</span>
          <select
            value={maxBuffer}
            onChange={(e) => setMaxBuffer(Number(e.target.value))}
            title="Maximum displayed messages"
            style={{
              padding: '3px 6px',
              fontSize: '11px',
              fontFamily: 'monospace',
              fontWeight: 700,
              color: '#0F172A',
              backgroundColor: '#F8FAFC',
              border: '1px solid #CBD5E1',
              borderRadius: '4px',
            }}
          >
            {BUFFER_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <span style={{ fontFamily: 'monospace', color: '#475569' }}>
            ({messages.length}/{maxBuffer})
          </span>
        </div>
      </div>

      {/* D. MAIN SERIAL MONITOR TERMINAL (75–85% OF PAGE HEIGHT) */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          backgroundColor: '#0D1117',
          border: '1px solid #30363D',
          borderRadius: '6px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 4px 12px rgba(15, 23, 42, 0.14)',
        }}
      >
        {/* Minimal Terminal Status Bar */}
        <div
          style={{
            backgroundColor: '#161B22',
            borderBottom: '1px solid #30363D',
            padding: '5px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            fontSize: '11px',
            color: '#8B949E',
            flexShrink: 0,
          }}
        >
          <span style={{ color: '#C9D1D9', fontWeight: 600 }}>
            LIVE MQTT TERMINAL &mdash; {activeTopic}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ color: '#58A6FF' }}>{viewMode === 'json' ? 'JSON VIEW' : 'RAW VIEW'}</span>
            <span style={{ color: isPaused ? '#F59E0B' : '#3FB950', fontWeight: 700 }}>
              {isPaused ? 'PAUSED' : '● STREAMING'}
            </span>
          </div>
        </div>

        {/* Scrollable Terminal Stream */}
        <div
          ref={terminalRef}
          className="mqtt-serial-stream"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            overflowX: 'auto',
            padding: '10px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          {messages.length === 0 ? (
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#8B949E',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                fontSize: '12px',
                gap: '6px',
                textAlign: 'center',
              }}
            >
              <div style={{ color: '#C9D1D9', fontWeight: 700 }}>
                {isSubscribed
                  ? `Listening on MQTT topic: ${activeTopic}`
                  : `Unsubscribed from topic: ${activeTopic}`}
              </div>
              <div>
                {isBrokerConnected
                  ? 'Waiting for incoming MQTT messages...'
                  : 'Connecting to MQTT broker...'}
              </div>
            </div>
          ) : (
            messages.map((entry, idx) => (
              <SerialLogEntry
                key={entry.id}
                entry={entry}
                viewMode={viewMode}
                showTimestamps={showTimestamps}
                isSelected={entry.id === selectedId}
                isFirst={idx === 0}
                onSelect={setSelectedId}
                onCopy={copyEntryText}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
};
