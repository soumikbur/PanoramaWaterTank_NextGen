import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { typography } from '../theme';
import { useApp } from '../state/AppContext';
import {
  mqttService,
  RawMqttFrame,
  MqttPayloadType,
  MqttBrokerDiagnostics,
  classifyMqttPayload,
  getMqttStatusDisplay,
} from '../services/mqttService';
import { deviceRegistry } from '../services/deviceRegistry';
import { ApiClient } from '../api/client';
import { localMqttStore } from '../services/localMqttStore';
import { MqttLatestTopicRecord, MqttConnectionStatus } from '../types/telemetry';
import {
  Terminal,
  Play,
  Pause,
  Trash2,
  Copy,
  Check,
  Radio,
  Clock,
  Wifi,
  WifiOff,
  ArrowDown,
  Code2,
  AlignLeft,
  Download,
  Search,
  X,
  Sliders,
  Activity,
  Zap,
  RefreshCw,
  AlertTriangle,
  ShieldCheck,
} from 'lucide-react';

export const DEFAULT_HARDWARE_UID = '0023004D4B42501120353332';
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
  'press',
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
  press: number | null;
  chno: string | null;
  trno: string | null;
}

/** Retained for compatibility with existing imports/tests. */
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
    wlv1: typeof raw.wlv1 === 'boolean' ? raw.wlv1 : typeof raw.wlvl === 'boolean' ? raw.wlvl : null,
    wlv2: typeof raw.wlv2 === 'boolean' ? raw.wlv2 : null,
    bat: toNum(raw.bat ?? raw.battery_voltage),
    temp: toNum(raw.temp ?? raw.temperature),
    press: toNum(raw.press ?? raw.pressure),
    chno: raw.chno != null ? String(raw.chno) : null,
    trno: raw.trno != null ? String(raw.trno) : null,
  };
}

/** Retained for compatibility with existing imports/tests. */
export function formatTelemetryJson(t: CleanDeviceTelemetry): string {
  return JSON.stringify(t, null, 2);
}

interface SerialMessage {
  id: string;
  seq: number;
  topic: string;
  qos: number;
  payloadSize: number;
  payloadType: MqttPayloadType; // JSON | TEXT | BINARY | INVALID
  isEmpty: boolean;
  parseError?: string;
  receivedAt: number;
  receivedTimeShort: string; // HH:mm:ss.SSS (local reception time)
  receivedAtFormatted: string; // YYYY-MM-DD HH:mm:ss.SSS
  deviceTimestamp: string | null; // Extracted from payload if present
  rawPayload: string; // Verbatim original MQTT payload
  isJson: boolean;
  parsedJson: any;
  formattedJson: string | null; // Pretty-printed JSON if valid
  statusBadge?: string | null; // Extracted or inferred status: NORMAL, WARNING, CRITICAL
  isRetained?: boolean;
}

function convertRecordToSerialMessage(rec: MqttLatestTopicRecord, seq: number): SerialMessage {
  const rawPayload =
    typeof rec.payload === 'object' && rec.payload !== null
      ? JSON.stringify(rec.payload)
      : String(rec.payload ?? '');

  const classified = classifyMqttPayload(rawPayload);
  const formattedJson =
    classified.payloadType === 'JSON' && classified.parsedJson !== null && classified.parsedJson !== undefined
      ? JSON.stringify(classified.parsedJson, null, 2)
      : null;

  const receivedDate = rec.received_at ? new Date(rec.received_at) : new Date();
  const nowMs = receivedDate.getTime();

  return {
    id: rec.id || `retained-${rec.topic}-${nowMs}`,
    seq,
    topic: rec.topic,
    qos: rec.qos ?? 0,
    payloadSize: rawPayload.length,
    payloadType: classified.payloadType,
    isEmpty: classified.isEmpty,
    parseError: classified.error,
    receivedAt: nowMs,
    receivedTimeShort: formatLocalTimeMs(receivedDate),
    receivedAtFormatted: receivedDate.toISOString(),
    deviceTimestamp: null,
    rawPayload,
    isJson: classified.isJson,
    parsedJson: classified.parsedJson,
    formattedJson,
    statusBadge: 'RETAINED',
    isRetained: true,
  };
}

const PAYLOAD_BADGE_STYLES: Record<MqttPayloadType, { color: string; bg: string; border: string }> = {
  JSON: { color: '#3FB950', bg: '#0F2918', border: '#1F512D' },
  TEXT: { color: '#F59E0B', bg: '#2D2006', border: '#5C3D0C' },
  BINARY: { color: '#C084FC', bg: '#261438', border: '#4C2473' },
  INVALID: { color: '#F87171', bg: '#2F1114', border: '#661E24' },
};

function getStatusBadgeStyle(status: string): { color: string; bg: string; border: string } {
  const s = status.toUpperCase();
  if (s.includes('CRIT') || s.includes('ALERT') || s.includes('ERR') || s.includes('FAULT')) {
    return { color: '#F87171', bg: '#2F1114', border: '#661E24' };
  }
  if (s.includes('WARN') || s.includes('LOW') || s.includes('HIGH')) {
    return { color: '#F59E0B', bg: '#2D2006', border: '#5C3D0C' };
  }
  return { color: '#3FB950', bg: '#0F2918', border: '#1F512D' };
}

/** Standard MQTT wildcard matcher (+ and #) */
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

/** Lightweight syntax-highlighted JSON renderer matching professional SCADA styling on light background */
const HighlightedJson: React.FC<{ text: string }> = React.memo(({ text }) => {
  const tokens = useMemo(() => {
    const regex = /("(?:\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(?:\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|[{}\[\],])/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let key = 0;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(
          <span key={key++} style={{ color: '#0F172A' }}>
            {text.slice(lastIndex, match.index)}
          </span>
        );
      }
      const token = match[0];
      let color = '#EA580C'; // Numbers: orange

      if (/^"/.test(token)) {
        if (/:$/.test(token)) {
          const keyName = token.slice(0, -1);
          parts.push(
            <span key={key++} style={{ color: '#2563EB', fontWeight: 600 }}>
              {keyName}
            </span>
          );
          parts.push(
            <span key={key++} style={{ color: '#0F172A' }}>
              :
            </span>
          );
          lastIndex = regex.lastIndex;
          continue;
        } else {
          color = '#16A34A'; // Strings: green
        }
      } else if (/^(true|false)$/.test(token)) {
        color = '#9333EA'; // Booleans: purple
      } else if (token === 'null') {
        color = '#64748B'; // Null: muted
      } else if (/^[{}[\],]$/.test(token)) {
        color = '#0F172A'; // Brackets and punctuation: dark navy
      }

      parts.push(
        <span key={key++} style={{ color }}>
          {token}
        </span>
      );
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < text.length) {
      parts.push(
        <span key={key++} style={{ color: '#0F172A' }}>
          {text.slice(lastIndex)}
        </span>
      );
    }
    return parts;
  }, [text]);

  return (
    <pre
      style={{
        margin: 0,
        fontFamily: '"JetBrains Mono", Consolas, "Courier New", monospace',
        fontSize: '12px',
        lineHeight: '19px',
        color: '#0F172A',
        whiteSpace: 'pre',
        tabSize: 2,
      }}
    >
      {tokens}
    </pre>
  );
});

/** Single memoized hardware terminal entry - Clean White SCADA Card */
const SerialLogEntry: React.FC<{
  entry: SerialMessage;
  viewMode: 'raw' | 'json';
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
        padding: '10px 12px',
        borderRadius: '8px',
        backgroundColor: '#FFFFFF',
        border: isSelected ? '1px solid #2563EB' : '1px solid #E2E8F0',
        boxShadow: isSelected ? '0 0 0 1px #2563EB' : '0 1px 2px rgba(0,0,0,0.03)',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
      }}
    >
      {/* Header Line: Timestamp, Retained indicator, Copy button */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '11px',
          marginBottom: '6px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {showTimestamps && (
            <span style={{ color: '#475569', fontWeight: 600, fontFamily: 'monospace' }}>
              {entry.receivedTimeShort}
            </span>
          )}
          {entry.isRetained && (
            <span
              style={{
                color: '#2563EB',
                backgroundColor: '#EFF6FF',
                border: '1px solid #BFDBFE',
                padding: '1px 5px',
                borderRadius: '3px',
                fontSize: '9.5px',
                fontWeight: 700,
                letterSpacing: '0.3px',
              }}
            >
              RETAINED
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onCopy(entry);
          }}
          title="Copy payload"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '3px',
            padding: '2px 8px',
            backgroundColor: '#F8FAFC',
            color: '#475569',
            border: '1px solid #CBD5E1',
            borderRadius: '4px',
            fontSize: '10.5px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'background-color 0.15s ease',
          }}
        >
          <Copy size={11} />
          <span>Copy</span>
        </button>
      </div>

      {/* Entry Body: Pure JSON or Raw Text */}
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {viewMode === 'json' && entry.isJson && entry.formattedJson ? (
          <HighlightedJson text={entry.formattedJson} />
        ) : (
          <pre
            style={{
              margin: 0,
              fontFamily: '"JetBrains Mono", Consolas, "Courier New", monospace',
              fontSize: '12px',
              lineHeight: '19px',
              color: entry.isEmpty
                ? '#94A3B8'
                : entry.payloadType === 'INVALID'
                  ? '#DC2626'
                  : '#0F172A',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {entry.isEmpty ? '(empty payload)' : entry.rawPayload}
          </pre>
        )}
      </div>
    </div>
  );
});

export const MqttMonitorScreen: React.FC = () => {
  const { mqttBrokerStatus, devices } = useApp();

  // Topic selection & localStorage keys
  const [topicInput, setTopicInput] = useState<string>(() => {
    if (typeof window === 'undefined') return DEFAULT_HARDWARE_UID;
    const saved =
      localStorage.getItem('panorama_mqtt_selected_device') ||
      localStorage.getItem('panorama_mqtt_target_topic');
    if (saved && !saved.startsWith('panorama/')) {
      return saved.split('/')[0].trim();
    }
    return DEFAULT_HARDWARE_UID;
  });

  const [activeTopic, setActiveTopic] = useState<string>(() => {
    if (typeof window === 'undefined') return DEFAULT_HARDWARE_UID;
    const saved =
      localStorage.getItem('panorama_mqtt_selected_device') ||
      localStorage.getItem('panorama_mqtt_target_topic');
    if (saved && !saved.startsWith('panorama/')) {
      return saved.split('/')[0].trim();
    }
    return DEFAULT_HARDWARE_UID;
  });

  const [qosInput, setQosInput] = useState<number>(0);
  const [isSubscribed, setIsSubscribed] = useState<boolean>(true);

  // Persistent Topic Registry: authoritative latest message per topic
  const [topicRegistry, setTopicRegistry] = useState<Record<string, MqttLatestTopicRecord>>(() => {
    const list = localMqttStore.getAll();
    const map: Record<string, MqttLatestTopicRecord> = {};
    for (const item of list) {
      if (item && item.topic) map[item.topic] = item;
    }
    return map;
  });

  const frameToSerial = useCallback((frame: RawMqttFrame, seq: number): SerialMessage => {
    const rawPayload = frame.payloadString ?? '';
    const receivedDate = new Date(frame.receivedAt || Date.now());
    const formattedJson =
      frame.payloadType === 'JSON' && frame.parsedJson !== null && frame.parsedJson !== undefined
        ? JSON.stringify(frame.parsedJson, null, 2)
        : null;
    let statusBadge: string | null = null;
    if (frame.parsedJson && typeof frame.parsedJson === 'object' && !Array.isArray(frame.parsedJson)) {
      const pj = frame.parsedJson;
      if (pj.status != null) statusBadge = String(pj.status);
      else if (pj.wlp1 != null && Number.isFinite(Number(pj.wlp1))) {
        const p = Number(pj.wlp1);
        statusBadge = p < 25 ? 'CRITICAL' : p < 50 ? 'WARNING' : 'NORMAL';
      }
    }
    return {
      id: frame.id || `serial-${receivedDate.getTime()}-${seq}`,
      seq,
      topic: frame.topic,
      qos: frame.qos ?? 0,
      payloadSize: typeof frame.payloadSize === 'number' ? frame.payloadSize : rawPayload.length,
      payloadType: frame.payloadType,
      isEmpty: Boolean(frame.isEmpty),
      parseError: frame.error,
      receivedAt: receivedDate.getTime(),
      receivedTimeShort: formatLocalTimeMs(receivedDate),
      receivedAtFormatted: frame.receivedAtFormatted || receivedDate.toISOString(),
      deviceTimestamp: frame.deviceTimestamp ?? null,
      rawPayload,
      isJson: Boolean(frame.isJson),
      parsedJson: frame.parsedJson,
      formattedJson,
      statusBadge,
    };
  }, []);

  const [messages, setMessages] = useState<SerialMessage[]>(() => {
    const initTopic =
      (typeof window !== 'undefined' &&
        (localStorage.getItem('panorama_mqtt_selected_device') ||
          localStorage.getItem('panorama_mqtt_target_topic'))) ||
      DEFAULT_HARDWARE_UID;
    const clean = initTopic.startsWith('panorama/') ? DEFAULT_HARDWARE_UID : initTopic.split('/')[0].trim();
    const history = mqttService
      .getRawMessages()
      .filter((f) => mqttTopicMatches(clean, f.topic));
    if (history.length > 0) {
      return history.map((f, idx) => {
        const receivedDate = new Date(f.receivedAt || Date.now());
        const formattedJson =
          f.payloadType === 'JSON' && f.parsedJson != null ? JSON.stringify(f.parsedJson, null, 2) : null;
        return {
          id: f.id || `serial-${receivedDate.getTime()}-${idx + 1}`,
          seq: idx + 1,
          topic: f.topic,
          qos: f.qos ?? 0,
          payloadSize: typeof f.payloadSize === 'number' ? f.payloadSize : (f.payloadString || '').length,
          payloadType: f.payloadType,
          isEmpty: Boolean(f.isEmpty),
          parseError: f.error,
          receivedAt: receivedDate.getTime(),
          receivedTimeShort: formatLocalTimeMs(receivedDate),
          receivedAtFormatted: f.receivedAtFormatted || receivedDate.toISOString(),
          deviceTimestamp: f.deviceTimestamp ?? null,
          rawPayload: f.payloadString ?? '',
          isJson: Boolean(f.isJson),
          parsedJson: f.parsedJson,
          formattedJson,
          statusBadge: null,
        };
      });
    }
    const cached = localMqttStore.getLatest(clean);
    if (cached) {
      return [convertRecordToSerialMessage(cached, 1)];
    }
    return [];
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [totalMessagesCount, setTotalMessagesCount] = useState<number>(() => mqttService.getRawMessages().length);
  const [queuedWhilePaused, setQueuedWhilePaused] = useState<number>(0);

  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [autoScroll, setAutoScroll] = useState<boolean>(() =>
    typeof window === 'undefined' ? true : localStorage.getItem('panorama_mqtt_autoscroll') !== 'false'
  );
  const [showTimestamps, setShowTimestamps] = useState<boolean>(() =>
    typeof window === 'undefined' ? true : localStorage.getItem('panorama_mqtt_show_timestamps') !== 'false'
  );
  const [viewMode, setViewMode] = useState<'raw' | 'json'>(() => {
    if (typeof window === 'undefined') return 'json';
    const saved = localStorage.getItem('panorama_mqtt_view_mode');
    if (saved === 'raw' || saved === 'json') return saved;
    return 'json';
  });
  const [maxBuffer, setMaxBuffer] = useState<number>(DEFAULT_MAX_BUFFER);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<MqttConnectionStatus>(() => mqttService.getStatus());
  const [filterText, setFilterText] = useState<string>('');

  // Broker details & configuration modal state
  const [brokerInfo, setBrokerInfo] = useState(() => mqttService.getBrokerInfo());
  const [diagnostics, setDiagnostics] = useState<MqttBrokerDiagnostics>(() => mqttService.getBrokerDiagnostics());
  const [isConfigModalOpen, setIsConfigModalOpen] = useState<boolean>(false);
  const [configHost, setConfigHost] = useState<string>(() => brokerInfo.host);
  const [configPort, setConfigPort] = useState<number>(() => brokerInfo.port);
  const [configPath, setConfigPath] = useState<string>(() => brokerInfo.path);
  const [configSsl, setConfigSsl] = useState<boolean>(() => brokerInfo.useSSL);

  // Dynamic Statistics
  const [messagesPerMinute, setMessagesPerMinute] = useState<number>(0);
  const [lastMessageTimeShort, setLastMessageTimeShort] = useState<string | null>(null);
  const [lastMessageTimestamp, setLastMessageTimestamp] = useState<number | null>(null);
  const [lastMessageTimeDiff, setLastMessageTimeDiff] = useState<string>('Awaiting telemetry');

  // Refs to avoid re-subscribing or recreating listeners
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
  const recentTimestampsRef = useRef<number[]>([]);

  const showToast = useCallback((msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 2000);
  }, []);

  // Update live broker connection status, brokerInfo, and diagnostics
  useEffect(() => {
    setDiagnostics(mqttService.getBrokerDiagnostics());
    const unsub = mqttService.onStatusChange((st) => {
      setLiveStatus(st);
      setBrokerInfo(mqttService.getBrokerInfo());
      setDiagnostics(mqttService.getBrokerDiagnostics());
    });
    return () => unsub();
  }, []);

  const isBrokerConnected =
    liveStatus === 'CONNECTED' ||
    brokerInfo.status === 'CONNECTED' ||
    mqttBrokerStatus === 'CONNECTED';

  // Dynamic rate, diagnostics refresh, and last message elapsed calculation timer
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      recentTimestampsRef.current = recentTimestampsRef.current.filter((t) => t > now - 60000);
      setMessagesPerMinute(recentTimestampsRef.current.length);
      setDiagnostics(mqttService.getBrokerDiagnostics());

      if (lastMessageTimestamp) {
        const sec = Math.max(0, Math.round((now - lastMessageTimestamp) / 1000));
        if (sec < 5) {
          setLastMessageTimeDiff('Just now');
        } else if (sec < 60) {
          setLastMessageTimeDiff(`${sec}s ago`);
        } else {
          const min = Math.floor(sec / 60);
          setLastMessageTimeDiff(`${min}m ago`);
        }
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [lastMessageTimestamp]);

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

  // Combined available topics from registered devices and retained topics registry
  const availableTopics = useMemo(() => {
    const list: Array<{ topic: string; label: string }> = [];
    const seen = new Set<string>();

    availableDevices.forEach((d) => {
      seen.add(d.uid);
      const hasRetained = Boolean(topicRegistry[d.uid]);
      list.push({
        topic: d.uid,
        label: `${d.label}${hasRetained ? ' [Retained]' : ''}`,
      });
    });

    Object.keys(topicRegistry).forEach((t) => {
      if (!seen.has(t)) {
        seen.add(t);
        list.push({
          topic: t,
          label: `${t} [Retained]`,
        });
      }
    });

    return list;
  }, [availableDevices, topicRegistry]);

  // Fetch authoritative retained messages for all topics from backend
  useEffect(() => {
    let isMounted = true;

    // 1. Fetch from backend API
    ApiClient.getLatestMqttTopics().then((res) => {
      if (!isMounted || !res || !Array.isArray(res.topics)) return;
      setTopicRegistry((prev) => {
        const next = { ...prev };
        for (const t of res.topics) {
          if (t && t.topic) next[t.topic] = t;
        }
        return next;
      });

      // If messages list is currently empty, check if activeTopic has a retained record
      const curTopic = activeTopicRef.current.trim();
      const rec = res.topics.find((t) => t.topic === curTopic) || localMqttStore.getLatest(curTopic);
      if (rec) {
        setMessages((prevMsgs) => {
          if (prevMsgs.length === 0) {
            seqRef.current += 1;
            const msg = convertRecordToSerialMessage(rec, seqRef.current);
            return [msg];
          }
          return prevMsgs;
        });
        const d = rec.received_at ? new Date(rec.received_at) : new Date();
        setLastMessageTimeShort(formatLocalTimeMs(d));
        setLastMessageTimestamp(d.getTime());
      }
    });

    // 2. Subscribe to localMqttStore updates (which also receives WebSocket MQTT_TOPIC_UPDATE broadcasts)
    const unsubStore = localMqttStore.subscribe((topic, record) => {
      if (!isMounted) return;
      setTopicRegistry((prev) => ({ ...prev, [topic]: record }));
    });

    return () => {
      isMounted = false;
      unsubStore();
    };
  }, []);

  // Subscribe once on mount
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

  // Listen directly to MQTT messages
  useEffect(() => {
    const unsubscribe = mqttService.onRawMessage((frame: RawMqttFrame) => {
      if (!isSubscribedRef.current) return;

      const subscribedTopic = activeTopicRef.current.trim();
      if (!subscribedTopic) return;

      if (!mqttTopicMatches(subscribedTopic, frame.topic)) {
        return;
      }

      const rawPayload = frame.payloadString ?? '';
      const receivedDate = new Date(frame.receivedAt || Date.now());
      const nowMs = receivedDate.getTime();

      const classified = frame.payloadType
        ? {
            payloadType: frame.payloadType,
            isJson: Boolean(frame.isJson),
            parsedJson: frame.parsedJson,
            isEmpty: Boolean(frame.isEmpty ?? rawPayload.trim().length === 0),
            error: frame.error,
          }
        : classifyMqttPayload(rawPayload);

      const formattedJson =
        classified.payloadType === 'JSON' && classified.parsedJson !== null && classified.parsedJson !== undefined
          ? JSON.stringify(classified.parsedJson, null, 2)
          : null;

      let deviceTimestamp: string | null = frame.deviceTimestamp ?? null;
      let statusBadge: string | null = null;

      if (
        classified.payloadType === 'JSON' &&
        classified.parsedJson &&
        typeof classified.parsedJson === 'object' &&
        !Array.isArray(classified.parsedJson)
      ) {
        const pj = classified.parsedJson;
        if (!deviceTimestamp) {
          if (pj.time !== undefined && pj.time !== null) {
            deviceTimestamp = String(pj.time);
          } else if (pj.timestamp !== undefined && pj.timestamp !== null) {
            deviceTimestamp = String(pj.timestamp);
          }
        }
        if (pj.status !== undefined && pj.status !== null) {
          statusBadge = String(pj.status);
        } else if (pj.wlp1 !== undefined && Number.isFinite(Number(pj.wlp1))) {
          const p = Number(pj.wlp1);
          statusBadge = p < 25 ? 'CRITICAL' : p < 50 ? 'WARNING' : 'NORMAL';
        }
      }

      seqRef.current += 1;
      const entry: SerialMessage = {
        id: frame.id || `serial-${nowMs}-${seqRef.current}`,
        seq: seqRef.current,
        topic: frame.topic,
        qos: frame.qos ?? 0,
        payloadSize: typeof frame.payloadSize === 'number' ? frame.payloadSize : rawPayload.length,
        payloadType: classified.payloadType,
        isEmpty: classified.isEmpty,
        parseError: classified.error,
        receivedAt: nowMs,
        receivedTimeShort: formatLocalTimeMs(receivedDate),
        receivedAtFormatted: frame.receivedAtFormatted || receivedDate.toISOString(),
        deviceTimestamp,
        rawPayload,
        isJson: classified.isJson,
        parsedJson: classified.parsedJson,
        formattedJson,
        statusBadge,
      };

      setTotalMessagesCount((prev) => prev + 1);
      recentTimestampsRef.current.push(nowMs);
      setLastMessageTimeShort(formatLocalTimeMs(receivedDate));
      setLastMessageTimestamp(nowMs);
      setLastMessageTimeDiff('Just now');
      setDiagnostics(mqttService.getBrokerDiagnostics());

      // Persist to local store for per-topic retention
      localMqttStore.saveRecord({
        topic: frame.topic,
        payload: classified.isJson ? classified.parsedJson : rawPayload,
        payload_type: classified.payloadType === 'JSON' ? 'JSON' : 'TEXT',
        qos: frame.qos ?? 0,
        retained: true,
        received_at: receivedDate.toISOString(),
        updated_at: receivedDate.toISOString(),
        message_sequence: seqRef.current,
      });

      // Pause stops rendering only — keep receiving in background
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
        let next: SerialMessage[];
        if (prev.length === 1 && prev[0].isRetained && prev[0].topic === entry.topic) {
          next = [entry];
        } else {
          next = [...prev, entry];
        }
        return next.length > limit ? next.slice(next.length - limit) : next;
      });
    });

    return () => unsubscribe();
  }, []);

  // Auto-scroll to latest entry
  useEffect(() => {
    if (autoScroll && !isPaused && terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [messages, autoScroll, isPaused]);

  // Trim messages if buffer limit is reduced
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
        pendingBufferRef.current = [];
        setQueuedWhilePaused(0);
        setSelectedId(null);

        // Immediately seed from live session buffer or persistent retained record
        const liveMatches = mqttService.getRawMessages().filter((f) => mqttTopicMatches(target, f.topic));
        if (liveMatches.length > 0) {
          const seeded = liveMatches.map((f) => {
            seqRef.current += 1;
            return frameToSerial(f, seqRef.current);
          });
          setMessages(seeded);
          const latest = liveMatches[liveMatches.length - 1];
          const d = new Date(latest.receivedAt || Date.now());
          setLastMessageTimeShort(formatLocalTimeMs(d));
          setLastMessageTimestamp(d.getTime());
        } else {
          const retained = topicRegistry[target] || localMqttStore.getLatest(target);
          if (retained) {
            seqRef.current += 1;
            const initialMsg = convertRecordToSerialMessage(retained, seqRef.current);
            setMessages([initialMsg]);
            const d = retained.received_at ? new Date(retained.received_at) : new Date();
            setLastMessageTimeShort(formatLocalTimeMs(d));
            setLastMessageTimestamp(d.getTime());
          } else {
            setMessages([]);
          }
        }
      }

      mqttService.subscribeTopic(target, qosInput);
      setDiagnostics(mqttService.getBrokerDiagnostics());
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
    [topicInput, qosInput, showToast, topicRegistry, frameToSerial]
  );

  const handleUnsubscribe = useCallback(() => {
    const current = activeTopicRef.current.trim();
    if (!current) return;
    mqttService.unsubscribeTopic(current, true);
    setDiagnostics(mqttService.getBrokerDiagnostics());
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

  const handleClearConsole = useCallback(() => {
    // Only clears visible session stream, preserves backend and local retained latest-topic records
    setMessages([]);
    pendingBufferRef.current = [];
    setQueuedWhilePaused(0);
    setSelectedId(null);
    showToast('Console cleared (session only)');
  }, [showToast]);

  const handleToggleAutoScroll = useCallback(() => {
    setAutoScroll((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') localStorage.setItem('panorama_mqtt_autoscroll', String(next));
      return next;
    });
  }, []);

  const handleSetViewMode = useCallback((mode: 'raw' | 'json') => {
    setViewMode(mode);
    if (typeof window !== 'undefined') localStorage.setItem('panorama_mqtt_view_mode', mode);
  }, []);

  const copyEntryText = useCallback(
    (entry: SerialMessage) => {
      const text =
        viewMode === 'json' && entry.formattedJson
          ? entry.formattedJson
          : entry.rawPayload;
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
        payloadType: m.payloadType,
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

  // Apply reconfigured broker settings
  const handleApplyBrokerConfig = useCallback(() => {
    mqttService.reconfigureBroker(configHost.trim(), configPort, configPath.trim(), configSsl);
    setIsConfigModalOpen(false);
    setBrokerInfo(mqttService.getBrokerInfo());
    showToast(`Reconnecting to ${configHost}:${configPort}...`);
  }, [configHost, configPort, configPath, configSsl, showToast]);

  // Filtered messages list
  const filteredMessages = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) return messages;
    return messages.filter(
      (m) =>
        m.topic.toLowerCase().includes(q) ||
        m.rawPayload.toLowerCase().includes(q) ||
        (m.deviceTimestamp && m.deviceTimestamp.toLowerCase().includes(q))
    );
  }, [messages, filterText]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        width: '100%',
        maxWidth: '100%',
        fontFamily: typography.fontFamily,
        boxSizing: 'border-box',
        padding: '12px 14px 24px 14px',
        backgroundColor: '#F8FAFC',
        minHeight: '100%',
      }}
    >
      {/* Scrollbar styling */}
      <style>{`
        .mqtt-serial-stream::-webkit-scrollbar { width: 5px; height: 5px; }
        .mqtt-serial-stream::-webkit-scrollbar-track { background: #F1F5F9; }
        .mqtt-serial-stream::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 4px; }
        .mqtt-serial-stream::-webkit-scrollbar-thumb:hover { background: #94A3B8; }
      `}</style>

      {/* SECTION 1: PAGE HEADING */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          padding: '2px 0',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              backgroundColor: '#EFF6FF',
              border: '1px solid #BFDBFE',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#2563EB',
              flexShrink: 0,
            }}
          >
            <Radio size={22} />
          </div>
          <div>
            <h1
              style={{
                fontSize: '18px',
                fontWeight: 800,
                color: '#0F172A',
                margin: 0,
                letterSpacing: '-0.2px',
                lineHeight: '22px',
              }}
            >
              Raw Data Monitor
            </h1>
            <p
              style={{
                fontSize: '12px',
                color: '#64748B',
                margin: '2px 0 0 0',
                lineHeight: '16px',
              }}
            >
              Live MQTT WebSocket telemetry &amp; protocol diagnostics
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span
            id="mqtt-monitor-status-badge"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 10px',
              borderRadius: '999px',
              fontSize: '11px',
              fontWeight: 700,
              backgroundColor:
                liveStatus === 'CONNECTED'
                  ? '#DCFCE7'
                  : liveStatus === 'STALE'
                  ? '#FEF3C7'
                  : liveStatus === 'CONNECTING' || liveStatus === 'RECONNECTING'
                  ? '#EFF6FF'
                  : '#FEE2E2',
              color:
                liveStatus === 'CONNECTED'
                  ? '#15803D'
                  : liveStatus === 'STALE'
                  ? '#B45309'
                  : liveStatus === 'CONNECTING' || liveStatus === 'RECONNECTING'
                  ? '#1D4ED8'
                  : '#DC2626',
              border: `1px solid ${
                liveStatus === 'CONNECTED'
                  ? '#86EFAC'
                  : liveStatus === 'STALE'
                  ? '#FDE68A'
                  : liveStatus === 'CONNECTING' || liveStatus === 'RECONNECTING'
                  ? '#BFDBFE'
                  : '#FCA5A5'
              }`,
            }}
          >
            {isBrokerConnected ? <Wifi size={13} /> : <WifiOff size={13} />}
            {getMqttStatusDisplay(liveStatus)}
          </span>
          <button
            type="button"
            id="mqtt-monitor-reconnect-btn"
            onClick={() => mqttService.connect()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '6px 10px',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              backgroundColor: '#FFFFFF',
              color: '#0F172A',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <RefreshCw size={12} />
            Reconnect
          </button>
          <button
            type="button"
            id="mqtt-monitor-config-btn"
            onClick={() => setIsConfigModalOpen(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '6px 10px',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              backgroundColor: '#FFFFFF',
              color: '#0F172A',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <Sliders size={12} />
            Broker Config
          </button>
        </div>
      </div>

      {feedback && (
        <div
          style={{
            padding: '8px 12px',
            borderRadius: '8px',
            backgroundColor: '#EFF6FF',
            border: '1px solid #BFDBFE',
            color: '#1D4ED8',
            fontSize: '12px',
            fontWeight: 600,
          }}
        >
          {feedback}
        </div>
      )}

      {/* SECTION 1.5: TOPIC SUBSCRIPTION & CONNECTION DIAGNOSTICS */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '12px',
          padding: '12px 14px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
          <select
            aria-label="Registered device topic preset"
            value={availableDevices.some((d) => d.uid === topicInput) ? topicInput : '__custom__'}
            onChange={(e) => {
              const v = e.target.value;
              if (v !== '__custom__') {
                setTopicInput(v);
                handleSubscribe(v);
              }
            }}
            style={{
              padding: '6px 10px',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              backgroundColor: '#F8FAFC',
              color: '#0F172A',
              fontSize: '12px',
              fontWeight: 600,
              minWidth: '210px',
            }}
          >
            {availableDevices.map((d) => (
              <option key={d.uid} value={d.uid}>
                {d.label}
              </option>
            ))}
            {!availableDevices.some((d) => d.uid === topicInput) && (
              <option value="__custom__">Custom Topic</option>
            )}
          </select>

          <input
            type="text"
            aria-label="MQTT topic input"
            value={topicInput}
            onChange={(e) => setTopicInput(e.target.value)}
            placeholder="e.g. 0023004D4B42501120353332"
            style={{
              flex: '1 1 200px',
              padding: '6px 10px',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              fontFamily: 'monospace',
              fontSize: '12px',
              color: '#0F172A',
            }}
          />

          <select
            aria-label="MQTT QoS"
            value={qosInput}
            onChange={(e) => setQosInput(Number(e.target.value))}
            style={{
              padding: '6px 8px',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              backgroundColor: '#F8FAFC',
              color: '#0F172A',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            <option value={0}>QoS 0</option>
            <option value={1}>QoS 1</option>
            <option value={2}>QoS 2</option>
          </select>

          <button
            type="button"
            onClick={() => handleSubscribe()}
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: '#2563EB',
              color: '#FFFFFF',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Subscribe
          </button>
          <button
            type="button"
            onClick={handleUnsubscribe}
            disabled={!isSubscribed}
            style={{
              padding: '6px 10px',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              backgroundColor: isSubscribed ? '#FFFFFF' : '#F1F5F9',
              color: isSubscribed ? '#DC2626' : '#94A3B8',
              fontSize: '12px',
              fontWeight: 600,
              cursor: isSubscribed ? 'pointer' : 'default',
            }}
          >
            Unsubscribe
          </button>
        </div>

        {/* Diagnostics Strip */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))',
            gap: '8px',
            paddingTop: '4px',
          }}
        >
          <div style={{ padding: '8px 10px', borderRadius: '8px', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <ShieldCheck size={12} color={brokerInfo.useSSL ? '#16A34A' : '#D97706'} />
              BROKER ENDPOINT
            </div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#0F172A', fontFamily: 'monospace', marginTop: '3px', wordBreak: 'break-all' }}>
              {brokerInfo.useSSL ? 'wss' : 'ws'}://{brokerInfo.host}:{brokerInfo.port}{brokerInfo.path}
            </div>
          </div>

          <div style={{ padding: '8px 10px', borderRadius: '8px', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Activity size={12} color={diagnostics.subscriptionAck ? '#16A34A' : '#D97706'} />
              TOPIC / SUBACK
            </div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#0F172A', fontFamily: 'monospace', marginTop: '3px', wordBreak: 'break-all' }}>
              {activeTopic} &bull; {diagnostics.subscriptionAck ? 'SUBACK OK' : diagnostics.subscriptionError ? 'SUB ERROR' : 'PENDING'}
            </div>
          </div>

          <div style={{ padding: '8px 10px', borderRadius: '8px', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Zap size={12} color="#2563EB" />
              THROUGHPUT / RECONNECTS
            </div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#0F172A', marginTop: '3px' }}>
              {totalMessagesCount} rx ({messagesPerMinute}/min) &bull; Reconnects: {diagnostics.reconnectCount ?? 0}
            </div>
          </div>

          <div style={{ padding: '8px 10px', borderRadius: '8px', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Clock size={12} color="#475569" />
              LAST MESSAGE
            </div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#0F172A', marginTop: '3px' }}>
              {lastMessageTimeShort ? `${lastMessageTimeShort} (${lastMessageTimeDiff})` : lastMessageTimeDiff}
            </div>
          </div>
        </div>

        {(diagnostics.lastError || diagnostics.subscriptionError || diagnostics.lastParsingError || diagnostics.lastUidMismatch) && (
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px',
              padding: '8px 10px',
              borderRadius: '8px',
              backgroundColor: '#FEF2F2',
              border: '1px solid #FECACA',
              color: '#991B1B',
              fontSize: '11px',
              fontWeight: 600,
            }}
          >
            <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {diagnostics.subscriptionError && <div>Subscription Error: {diagnostics.subscriptionError}</div>}
              {diagnostics.lastError && <div>Connection Detail: {diagnostics.lastError}</div>}
              {diagnostics.lastParsingError && <div>Parse Warning ({diagnostics.parseErrorCount}): {diagnostics.lastParsingError}</div>}
              {diagnostics.lastUidMismatch && <div>UID Mismatch Warning: {diagnostics.lastUidMismatch}</div>}
            </div>
          </div>
        )}
      </div>

      {/* SECTION 2: DATA VIEW CARD */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '12px',
          padding: '12px 14px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          flexShrink: 0,
        }}
      >
        {/* View Selector: Two equal-width tabs */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '8px',
            width: '100%',
          }}
        >
          <button
            type="button"
            onClick={() => handleSetViewMode('raw')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '8px 12px',
              borderRadius: '8px',
              border: 'none',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              backgroundColor: viewMode === 'raw' ? '#2563EB' : '#F1F5F9',
              color: viewMode === 'raw' ? '#FFFFFF' : '#0F172A',
              boxShadow: viewMode === 'raw' ? '0 1px 3px rgba(37,99,235,0.25)' : 'none',
            }}
          >
            <AlignLeft size={14} color={viewMode === 'raw' ? '#FFFFFF' : '#475569'} />
            Raw View
          </button>
          <button
            type="button"
            onClick={() => handleSetViewMode('json')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '8px 12px',
              borderRadius: '8px',
              border: 'none',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              backgroundColor: viewMode === 'json' ? '#2563EB' : '#F1F5F9',
              color: viewMode === 'json' ? '#FFFFFF' : '#0F172A',
              boxShadow: viewMode === 'json' ? '0 1px 3px rgba(37,99,235,0.25)' : 'none',
            }}
          >
            <Code2 size={14} color={viewMode === 'json' ? '#FFFFFF' : '#475569'} />
            JSON View
          </button>
        </div>

        {/* Controls Toolbar */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          {/* Auto Scroll */}
          <button
            type="button"
            onClick={handleToggleAutoScroll}
            title="Toggle autoscroll to latest frame"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '5px 9px',
              backgroundColor: autoScroll ? '#EFF6FF' : '#FFFFFF',
              color: autoScroll ? '#2563EB' : '#475569',
              border: `1px solid ${autoScroll ? '#BFDBFE' : '#CBD5E1'}`,
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <ArrowDown size={12} />
            Auto Scroll
          </button>

          {/* Pause */}
          <button
            type="button"
            onClick={handleTogglePause}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '5px 9px',
              backgroundColor: isPaused ? '#ECFDF5' : '#FFFBEB',
              color: isPaused ? '#059669' : '#B45309',
              border: `1px solid ${isPaused ? '#A7F3D0' : '#FDE68A'}`,
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {isPaused ? <Play size={12} /> : <Pause size={12} />}
            {isPaused ? `Resume${queuedWhilePaused > 0 ? ` (+${queuedWhilePaused})` : ''}` : 'Pause'}
          </button>

          {/* Clear */}
          <button
            type="button"
            onClick={handleClearConsole}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '5px 9px',
              backgroundColor: '#FFFFFF',
              color: '#475569',
              border: '1px solid #CBD5E1',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Trash2 size={12} />
            Clear
          </button>

          {/* Download */}
          <button
            type="button"
            onClick={handleDownloadLogs}
            disabled={messages.length === 0}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '5px 9px',
              backgroundColor: '#FFFFFF',
              color: messages.length > 0 ? '#2563EB' : '#94A3B8',
              border: `1px solid ${messages.length > 0 ? '#BFDBFE' : '#E2E8F0'}`,
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: messages.length > 0 ? 'pointer' : 'not-allowed',
            }}
          >
            <Download size={12} />
            Download
          </button>

          {/* Copy */}
          <button
            type="button"
            onClick={handleToolbarCopy}
            disabled={messages.length === 0}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '5px 9px',
              backgroundColor: '#FFFFFF',
              color: messages.length > 0 ? '#475569' : '#94A3B8',
              border: '1px solid #CBD5E1',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: messages.length > 0 ? 'pointer' : 'not-allowed',
            }}
          >
            <Copy size={12} />
            Copy
          </button>

          {/* Buffer Limit Selector */}
          <div
            style={{
              marginLeft: 'auto',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '11px',
              color: '#64748B',
            }}
          >
            <span>Buffer:</span>
            <select
              value={maxBuffer}
              onChange={(e) => setMaxBuffer(Number(e.target.value))}
              style={{
                padding: '4px 6px',
                fontSize: '11px',
                fontFamily: 'monospace',
                fontWeight: 700,
                color: '#0F172A',
                backgroundColor: '#F8FAFC',
                border: '1px solid #CBD5E1',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              {BUFFER_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* SECTION 3: LIVE MESSAGES CARD */}
      <div
        className="live-message-monitor"
        style={{
          width: '100%',
          minHeight: 'clamp(380px, 60dvh, 760px)',
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '12px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          flex: '1 1 auto',
          minWidth: 0,
        }}
      >
        {/* Terminal Header */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderBottom: '1px solid #E2E8F0',
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            flexShrink: 0,
          }}
        >
          {/* Left: Green Live Dot + Live Messages Title + Count Badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: isPaused ? '#F59E0B' : '#22C55E',
                boxShadow: isPaused ? '0 0 6px #F59E0B' : '0 0 6px rgba(34, 197, 94, 0.4)',
              }}
            />
            <span style={{ color: '#0F172A', fontWeight: 700, fontSize: '13px' }}>
              Live Messages
            </span>
            <span
              style={{
                backgroundColor: '#EFF6FF',
                color: '#2563EB',
                border: '1px solid #DBEAFE',
                padding: '2px 8px',
                borderRadius: '12px',
                fontSize: '11px',
                fontFamily: 'monospace',
                fontWeight: 700,
              }}
            >
              {filteredMessages.length}
              {filteredMessages.length !== messages.length ? ` / ${messages.length}` : ''}
            </span>
          </div>

          {/* Right: Search / Filter input */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search
              size={12}
              style={{
                color: '#94A3B8',
                position: 'absolute',
                left: '8px',
                pointerEvents: 'none',
              }}
            />
            <input
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Filter messages..."
              style={{
                padding: '5px 22px 5px 24px',
                fontSize: '11.5px',
                color: '#0F172A',
                backgroundColor: '#F8FAFC',
                border: '1px solid #CBD5E1',
                borderRadius: '6px',
                width: '135px',
                outline: 'none',
              }}
            />
            {filterText && (
              <button
                type="button"
                onClick={() => setFilterText('')}
                style={{
                  position: 'absolute',
                  right: '5px',
                  background: 'transparent',
                  border: 'none',
                  color: '#94A3B8',
                  cursor: 'pointer',
                  padding: 0,
                  display: 'flex',
                }}
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Scrollable Message Container: light background */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            padding: '10px 12px',
            backgroundColor: '#F8FAFC',
          }}
        >
          <div
            ref={terminalRef}
            className="mqtt-serial-stream live-message-content"
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              overflowX: 'auto',
              overscrollBehavior: 'contain',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            {filteredMessages.length === 0 ? (
              <div
                style={{
                  flex: 1,
                  minHeight: '220px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#64748B',
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  gap: '8px',
                  textAlign: 'center',
                  padding: '24px',
                }}
              >
                <Terminal size={32} color="#94A3B8" />
                <div style={{ color: '#0F172A', fontWeight: 700 }}>
                  {filterText
                    ? `No messages matching "${filterText}"`
                    : 'Listening for incoming device telemetry...'}
                </div>
                <div style={{ fontSize: '11px', color: '#64748B' }}>
                  {filterText
                    ? 'Try clearing the search filter.'
                    : isBrokerConnected
                      ? 'Connected to broker. Waiting for live telemetry packets...'
                      : 'Connecting to MQTT broker...'}
                </div>
              </div>
            ) : (
              filteredMessages.map((entry, idx) => (
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

      {/* Broker Configuration Modal */}
      {isConfigModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '420px',
              backgroundColor: '#FFFFFF',
              borderRadius: '12px',
              border: '1px solid #E2E8F0',
              padding: '16px',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>
                MQTT WebSocket Broker Settings
              </h3>
              <button
                type="button"
                onClick={() => setIsConfigModalOpen(false)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748B' }}
              >
                <X size={16} />
              </button>
            </div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', fontWeight: 700, color: '#475569' }}>
              Broker Hostname
              <input
                type="text"
                value={configHost}
                onChange={(e) => setConfigHost(e.target.value)}
                style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '12px' }}
              />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', fontWeight: 700, color: '#475569' }}>
                WebSocket Port
                <input
                  type="number"
                  value={configPort}
                  onChange={(e) => setConfigPort(Number(e.target.value) || 8884)}
                  style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '12px' }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', fontWeight: 700, color: '#475569' }}>
                WebSocket Path
                <input
                  type="text"
                  value={configPath}
                  onChange={(e) => setConfigPath(e.target.value)}
                  style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '12px' }}
                />
              </label>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 600, color: '#0F172A' }}>
              <input
                type="checkbox"
                checked={configSsl}
                onChange={(e) => setConfigSsl(e.target.checked)}
              />
              Use Secure TLS WebSocket (WSS)
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
              <button
                type="button"
                onClick={() => setIsConfigModalOpen(false)}
                style={{
                  padding: '7px 12px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#FFFFFF',
                  color: '#475569',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplyBrokerConfig}
                style={{
                  padding: '7px 14px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: '#2563EB',
                  color: '#FFFFFF',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Apply &amp; Connect
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 4: FOOTER */}
      <div
        style={{
          textAlign: 'center',
          padding: '16px 8px 8px 8px',
          fontSize: '11px',
          color: '#94A3B8',
          letterSpacing: '0.2px',
          flexShrink: 0,
        }}
      >
        &copy; 2026 Panorama Water Tank Monitoring System
      </div>
    </div>
  );
};
