import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { typography } from '../theme';
import { useApp } from '../state/AppContext';
import {
  mqttService,
  RawMqttFrame,
  MqttBrokerDiagnostics,
} from '../services/mqttService';
import { deviceRegistry, ManagedDevice } from '../services/deviceRegistry';
import {
  buildDeviceMetadata,
  loadLocalHardwareOverrides,
  saveLocalHardwareOverrides,
  fetchBackendDeviceMetadata,
  persistBackendDeviceMetadata,
  DeviceHardwareOverrides,
} from '../services/deviceMetadata';
import {
  DeviceHealthSummaryBar,
  DeviceIdentityCard,
  HardwareAndCommsRow,
  SensorsAndFirmwareRow,
  DeviceMetadataModal,
  extractLiveTelemetryMetrics,
  StatusPill,
  SpecRow,
} from '../components/diagnostics/HardwareDiagnosticsPanels';
import {
  MqttBrokerDetailsRow,
  CommunicationArchitecturePanel,
} from '../components/diagnostics/BrokerAndArchitecturePanels';
import {
  Terminal,
  Play,
  Pause,
  Trash2,
  Copy,
  Check,
  Radio,
  Clock,
  ChevronDown,
  ChevronUp,
  Code2,
  WifiOff,
  ArrowDown,
  AlignLeft,
  Search,
  Download,
  Table2,
  Activity,
  SlidersHorizontal,
} from 'lucide-react';

export const DEFAULT_HARDWARE_UID = '002F00654B42501320353332';
export const TARGET_MQTT_TOPIC = DEFAULT_HARDWARE_UID;
const MAX_MESSAGE_BUFFER = 500;

/**
 * Canonical 15 telemetry fields for legacy SCADA parity.
 * Unknown/extra fields are preserved in rawParsedJson so Raw JSON view shows exact broker payloads.
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
  receivedAtFormatted: string;
  deviceTimestamp: string | null;
  payload: CleanDeviceTelemetry;
  rawParsedJson: Record<string, any>; // Exact incoming JSON object with ALL fields preserved
  rawJsonString: string;              // Formatted exact incoming JSON
  rawPayloadString: string;           // Verbatim raw payload string from broker
  qos: number;
  payloadSize: number;
}

/**
 * Validate incoming MQTT payload is a device telemetry object (rejecting fleet sync / config packets).
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

  const rawUid =
    raw.uid !== undefined
      ? String(raw.uid).trim()
      : raw.device_uid !== undefined
      ? String(raw.device_uid).trim()
      : raw.deviceId !== undefined
      ? String(raw.deviceId).trim()
      : raw.device_id !== undefined
      ? String(raw.device_id).trim()
      : null;

  if (!rawUid) {
    return null;
  }

  if (expectedUid && rawUid !== expectedUid.trim()) {
    return null;
  }

  const toNum = (v: any): number | null =>
    v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null;

  return {
    uid: rawUid,
    lat: toNum(raw.lat ?? raw.latitude),
    long: toNum(raw.long ?? raw.lon ?? raw.longitude),
    speed: toNum(raw.speed ?? raw.speed_kmh),
    time: raw.time !== undefined && raw.time !== null ? String(raw.time) : (raw.timestamp !== undefined && raw.timestamp !== null ? String(raw.timestamp) : null),
    cm1: toNum(raw.cm1 ?? raw.water_level_cm),
    cm2: toNum(raw.cm2),
    wlp1: toNum(raw.wlp1 ?? raw.water_level_percentage),
    wlp2: toNum(raw.wlp2),
    wlv1: raw.wlv1 !== undefined ? Boolean(raw.wlv1) : raw.wlvl !== undefined ? Boolean(raw.wlvl) : null,
    wlv2: raw.wlv2 !== undefined ? Boolean(raw.wlv2) : null,
    bat: toNum(raw.bat ?? raw.battery_voltage ?? raw.battery_v),
    temp: toNum(raw.temp ?? raw.temperature ?? raw.temperature_c),
    chno: raw.chno !== undefined && raw.chno !== null ? String(raw.chno) : null,
    trno: raw.trno !== undefined && raw.trno !== null ? String(raw.trno) : null,
  };
}

/**
 * Format canonical telemetry object with 2-space indentation.
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
      renderedVal =
        ['cm1', 'cm2', 'wlp1', 'wlp2', 'bat', 'temp', 'speed'].includes(k) && val % 1 === 0
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

/** Metadata descriptors for Parsed Telemetry view (only rendered when key is actually present). */
const PARSED_FIELD_META: Record<string, { label: string; unit?: string }> = {
  uid: { label: 'Device UID' },
  device_uid: { label: 'Device UID' },
  device_id: { label: 'Device ID' },
  cm1: { label: 'Water Level (Tank 1)', unit: 'cm' },
  cm2: { label: 'Water Level (Tank 2)', unit: 'cm' },
  water_level_cm: { label: 'Water Level', unit: 'cm' },
  wlp1: { label: 'Fill Percentage (Tank 1)', unit: '%' },
  wlp2: { label: 'Fill Percentage (Tank 2)', unit: '%' },
  water_level_percentage: { label: 'Fill Percentage', unit: '%' },
  wlv1: { label: 'Valve 1 State' },
  wlv2: { label: 'Valve 2 State' },
  rawVoltage: { label: 'Raw Voltage', unit: 'V' },
  raw_voltage: { label: 'Raw Voltage', unit: 'V' },
  v1: { label: 'Sensor Voltage', unit: 'V' },
  adcRaw: { label: 'ADC Raw Value' },
  adc_raw: { label: 'ADC Raw Value' },
  pressure_bar: { label: 'Water Pressure', unit: 'bar' },
  waterPressure: { label: 'Water Pressure', unit: 'bar' },
  temp: { label: 'Temperature', unit: '°C' },
  temperature: { label: 'Temperature', unit: '°C' },
  bmePressure: { label: 'Atmospheric Pressure', unit: 'hPa' },
  bme_pressure: { label: 'Atmospheric Pressure', unit: 'hPa' },
  humidity: { label: 'Humidity', unit: '%' },
  sensorStatus: { label: 'Sensor Status' },
  sensor_status: { label: 'Sensor Status' },
  bat: { label: 'Battery', unit: '% / V' },
  battery_voltage: { label: 'Battery Voltage', unit: 'V' },
  csq: { label: 'Signal Strength (CSQ)' },
  signal_csq: { label: 'Signal Strength (CSQ)' },
  rssi: { label: 'RSSI', unit: 'dBm' },
  lat: { label: 'Latitude', unit: '°' },
  long: { label: 'Longitude', unit: '°' },
  lon: { label: 'Longitude', unit: '°' },
  speed: { label: 'Speed', unit: 'km/h' },
  time: { label: 'Device Timestamp' },
  timestamp: { label: 'Device Timestamp' },
  trno: { label: 'Train Number' },
  chno: { label: 'Coach Number' },
};

interface JsonSyntaxViewerProps {
  data: Record<string, any>;
  onCopyValue?: (key: string, val: any) => void;
}

/** Syntax-highlighted JSON viewer preserving ALL keys received from the broker. */
const JsonSyntaxViewer: React.FC<JsonSyntaxViewerProps> = ({ data, onCopyValue }) => {
  if (!data || typeof data !== 'object') {
    return <span style={{ color: '#8B949E' }}>null</span>;
  }

  const keys = Object.keys(data);

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
      const formattedNum =
        ['cm1', 'cm2', 'wlp1', 'wlp2', 'bat', 'temp', 'speed'].includes(keyName) && val % 1 === 0
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
    if (val === null || val === undefined) {
      return (
        <span title={`${keyName} is null`} style={{ color: '#8B949E', fontStyle: 'italic' }}>
          null
        </span>
      );
    }
    return (
      <span style={{ color: '#D2A8FF' }}>
        {JSON.stringify(val)}
      </span>
    );
  };

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
        const val = data[k];
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

/** Mode B: Parsed Telemetry renderer showing ONLY fields actually present in the message. */
const ParsedTelemetryView: React.FC<{
  data: Record<string, any>;
  onCopyValue?: (key: string, val: any) => void;
}> = ({ data, onCopyValue }) => {
  const entries = Object.entries(data || {}).filter(([, v]) => v !== undefined);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))', gap: '6px' }}>
      {entries.map(([key, value]) => {
        const meta = PARSED_FIELD_META[key];
        const displayVal =
          value === null
            ? 'null'
            : typeof value === 'boolean'
            ? value ? 'TRUE' : 'FALSE'
            : typeof value === 'object'
            ? JSON.stringify(value)
            : `${value}${meta?.unit ? ` ${meta.unit}` : ''}`;

        return (
          <div
            key={key}
            onClick={() => onCopyValue?.(key, value)}
            title={`Field "${key}" — click to copy`}
            style={{
              padding: '6px 8px',
              backgroundColor: '#161B22',
              border: '1px solid #30363D',
              borderRadius: '4px',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '10px', color: '#8B949E', fontWeight: 600 }}>
                {meta ? meta.label : key}
              </span>
              <span style={{ fontSize: '9px', fontFamily: 'monospace', color: '#58A6FF' }}>{key}</span>
            </div>
            <div
              style={{
                fontFamily: 'monospace',
                fontSize: '12px',
                fontWeight: 700,
                color:
                  value === null
                    ? '#8B949E'
                    : typeof value === 'boolean'
                    ? value ? '#3FB950' : '#F85149'
                    : typeof value === 'number'
                    ? '#FFA657'
                    : '#7EE787',
                wordBreak: 'break-all',
              }}
            >
              {displayVal}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const MqttMonitorScreen: React.FC = () => {
  const { mqttBrokerStatus, devices } = useApp();

  // Active topic & input state (preserves existing localStorage keys)
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
  const activeTopicRef = useRef<string>(activeTopic);
  activeTopicRef.current = activeTopic;

  // Live MQTT diagnostics ticker (updates connection duration & confirmed sub status every 1s)
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  const [brokerDiag, setBrokerDiag] = useState<MqttBrokerDiagnostics>(() => mqttService.getDiagnostics());

  useEffect(() => {
    const refreshDiag = () => {
      setNowTick(Date.now());
      setBrokerDiag(mqttService.getDiagnostics());
    };
    const timer = setInterval(refreshDiag, 1000);
    const unsubStatus = mqttService.onStatusChange(() => refreshDiag());
    return () => {
      clearInterval(timer);
      unsubStatus();
    };
  }, []);

  // Static hardware metadata overrides per UID (separate from live telemetry)
  const [metadataOverrides, setMetadataOverrides] = useState<DeviceHardwareOverrides>(() =>
    loadLocalHardwareOverrides(activeTopic)
  );
  const [showMetadataModal, setShowMetadataModal] = useState<boolean>(false);

  // Fetch static hardware metadata only when selected device UID changes (never per MQTT message!)
  useEffect(() => {
    let cancelled = false;
    const local = loadLocalHardwareOverrides(activeTopic);
    setMetadataOverrides(local);
    fetchBackendDeviceMetadata(activeTopic).then((remote) => {
      if (!cancelled && remote) {
        const merged = { ...local, ...remote };
        setMetadataOverrides(merged);
        saveLocalHardwareOverrides(activeTopic, merged);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [activeTopic]);

  // Raw telemetry message buffer
  const [messages, setMessages] = useState<CleanTelemetryFrame[]>([]);
  const [seqCounter, setSeqCounter] = useState<number>(0);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [autoScroll, setAutoScroll] = useState<boolean>(() =>
    typeof window === 'undefined' ? true : localStorage.getItem('panorama_mqtt_autoscroll') !== 'false'
  );
  const [showTimestamps, setShowTimestamps] = useState<boolean>(() =>
    typeof window === 'undefined' ? true : localStorage.getItem('panorama_mqtt_show_timestamps') !== 'false'
  );
  const [inspectorMode, setInspectorMode] = useState<'raw' | 'parsed'>('raw');
  const [formatMode, setFormatMode] = useState<'pretty' | 'raw'>(() =>
    typeof window === 'undefined'
      ? 'pretty'
      : ((localStorage.getItem('panorama_mqtt_format_mode') as 'pretty' | 'raw') || 'pretty')
  );
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [totalMessagesCount, setTotalMessagesCount] = useState<number>(0);
  const [lastReceivedTimestamp, setLastReceivedTimestamp] = useState<string | null>(null);
  const [lastReceivedAtMs, setLastReceivedAtMs] = useState<number | null>(null);
  const [latestRawPayload, setLatestRawPayload] = useState<Record<string, any> | null>(null);

  const terminalStreamRef = useRef<HTMLDivElement | null>(null);
  const isPausedRef = useRef<boolean>(isPaused);
  isPausedRef.current = isPaused;

  // Resolve registered device record from existing AppContext & deviceRegistry
  const managedDevice: ManagedDevice | null = useMemo(() => {
    const reg = deviceRegistry.getDevices();
    return reg.find((d) => d.uid === activeTopic.trim()) || null;
  }, [activeTopic, devices]);

  const apiDevice: any | null = useMemo(() => {
    return (devices || []).find((d: any) => d?.uid === activeTopic.trim()) || null;
  }, [devices, activeTopic]);

  const availableDevices = useMemo(() => {
    const list: Array<{ uid: string; label: string }> = [];
    const seenUids = new Set<string>();

    list.push({
      uid: DEFAULT_HARDWARE_UID,
      label: `${DEFAULT_HARDWARE_UID} (Hardware Node)`,
    });
    seenUids.add(DEFAULT_HARDWARE_UID);

    const all = [...(devices || []), ...deviceRegistry.getDevices()];
    all.forEach((d: any) => {
      if (!d || !d.uid || seenUids.has(d.uid) || String(d.uid).startsWith('PANORAMA-')) return;
      seenUids.add(d.uid);
      const assignment = d.trainNumber && d.coachNumber ? ` (${d.trainNumber}/${d.coachNumber})` : '';
      list.push({ uid: d.uid, label: `${d.uid}${assignment}` });
    });

    return list;
  }, [devices]);

  const deviceMetadata = useMemo(
    () => buildDeviceMetadata(activeTopic, managedDevice, apiDevice, metadataOverrides, brokerDiag, activeTopic),
    [activeTopic, managedDevice, apiDevice, metadataOverrides, brokerDiag]
  );

  const liveMetrics = useMemo(
    () => extractLiveTelemetryMetrics(latestRawPayload, lastReceivedAtMs, lastReceivedTimestamp),
    [latestRawPayload, lastReceivedAtMs, lastReceivedTimestamp]
  );

  const isTopicConfirmed = useMemo(() => {
    if (!isSubscribed) return false;
    return mqttService.isTopicConfirmedSubscribed(activeTopic);
  }, [isSubscribed, activeTopic, brokerDiag]);

  // Subscribe on mount (preserving existing behavior)
  useEffect(() => {
    const topic = activeTopicRef.current;
    mqttService.subscribeTopic(topic, qosInput);
    setIsSubscribed(true);
    mqttService.unsubscribeTopic(`${topic}/#`);
    mqttService.unsubscribeTopic(`${DEFAULT_HARDWARE_UID}/#`);
  }, []);

  // Listen directly to incoming MQTT message frames from Paho client
  useEffect(() => {
    const unsubscribe = mqttService.onRawMessage((frame: RawMqttFrame) => {
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

      if (frame.topic !== currentTopic && topicBase !== currentTopic) {
        return;
      }

      if (!frame.isJson || !frame.parsedJson) {
        return;
      }

      const filtered = filterDeviceTelemetry(frame.parsedJson, currentTopic);
      if (!filtered) {
        return;
      }

      setTotalMessagesCount((prev) => prev + 1);
      setLastReceivedTimestamp(frame.receivedAtFormatted);
      setLastReceivedAtMs(frame.receivedAt);
      setLatestRawPayload(frame.parsedJson);

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
          rawParsedJson: frame.parsedJson!,
          rawJsonString: JSON.stringify(frame.parsedJson, null, 2),
          rawPayloadString: frame.payloadString || JSON.stringify(frame.parsedJson),
          qos: frame.qos,
          payloadSize: frame.payloadSize || frame.payloadString?.length || 0,
        };

        setMessages((prev) => {
          const next = [...prev, cleanFrame];
          return next.length > MAX_MESSAGE_BUFFER ? next.slice(next.length - MAX_MESSAGE_BUFFER) : next;
        });

        return nextSeq;
      });
    });

    return () => unsubscribe();
  }, []);

  // Auto-scroll stream to bottom
  useEffect(() => {
    if (autoScroll && !isPaused && terminalStreamRef.current) {
      terminalStreamRef.current.scrollTop = terminalStreamRef.current.scrollHeight;
    }
  }, [messages, autoScroll, isPaused]);

  const showToast = useCallback((msg: string) => {
    setCopyFeedback(msg);
    setTimeout(() => setCopyFeedback(null), 2000);
  }, []);

  const handleSubscribe = useCallback(
    (overrideTopic?: string) => {
      const target = (overrideTopic || topicInput).trim();
      if (!target) return;

      if (activeTopic && activeTopic !== target) {
        mqttService.unsubscribeTopic(activeTopic);
        mqttService.unsubscribeTopic(`${activeTopic}/#`);
        setMessages([]);
        setLatestRawPayload(null);
        setLastReceivedTimestamp(null);
        setLastReceivedAtMs(null);
        setTotalMessagesCount(0);
      }

      mqttService.subscribeTopic(target, qosInput);
      setActiveTopic(target);
      activeTopicRef.current = target;
      setIsSubscribed(true);
      setBrokerDiag(mqttService.getDiagnostics());

      if (typeof window !== 'undefined') {
        localStorage.setItem('panorama_mqtt_selected_device', target);
        localStorage.setItem('panorama_mqtt_target_topic', target);
      }

      showToast(`Subscribed: ${target}`);
    },
    [topicInput, qosInput, activeTopic, showToast]
  );

  const handleUnsubscribe = useCallback(() => {
    if (!activeTopic) return;
    mqttService.unsubscribeTopic(activeTopic);
    mqttService.unsubscribeTopic(`${activeTopic}/#`);
    setIsSubscribed(false);
    setBrokerDiag(mqttService.getDiagnostics());
    showToast(`Unsubscribed: ${activeTopic}`);
  }, [activeTopic, showToast]);

  const handleQuickSelectChange = useCallback(
    (newUid: string) => {
      const cleanUid = newUid.trim();
      if (!cleanUid) return;
      setTopicInput(cleanUid);
      handleSubscribe(cleanUid);
    },
    [handleSubscribe]
  );

  const handleClearConsole = useCallback(() => {
    setMessages([]);
    showToast('Console cleared');
  }, [showToast]);

  const handleTogglePause = useCallback(() => setIsPaused((prev) => !prev), []);

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

  const handleToggleFormatMode = useCallback(() => {
    setFormatMode((prev) => {
      const next = prev === 'pretty' ? 'raw' : 'pretty';
      if (typeof window !== 'undefined') localStorage.setItem('panorama_mqtt_format_mode', next);
      return next;
    });
  }, []);

  const toggleCollapse = useCallback((id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleCopy = useCallback(
    (text: string, label: string) => {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => showToast(label));
      }
    },
    [showToast]
  );

  const handleDownloadLogs = useCallback(() => {
    if (typeof window === 'undefined') return;
    const exportObj = {
      exportedAt: new Date().toISOString(),
      deviceUid: activeTopic,
      broker: {
        host: brokerDiag.host,
        port: brokerDiag.port,
        protocol: brokerDiag.protocol,
        mqttVersion: brokerDiag.mqttVersion,
      },
      messageCount: messages.length,
      messages: messages.map((m) => ({
        seq: m.seq,
        topic: m.topic,
        receivedAt: m.receivedAtFormatted,
        qos: m.qos,
        payloadBytes: m.payloadSize,
        payload: m.rawParsedJson,
      })),
    };
    const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `panorama-raw-telemetry-${activeTopic}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${messages.length} frame(s)`);
  }, [activeTopic, brokerDiag, messages, showToast]);

  const handleSaveMetadata = useCallback(
    async (overrides: DeviceHardwareOverrides) => {
      const saved = saveLocalHardwareOverrides(activeTopic, overrides);
      setMetadataOverrides(saved);
      setShowMetadataModal(false);
      const synced = await persistBackendDeviceMetadata(activeTopic, saved, brokerDiag, activeTopic);
      showToast(synced ? 'Metadata saved & synced to backend' : 'Metadata saved locally');
    },
    [activeTopic, brokerDiag, showToast]
  );

  // Filter displayed messages by search query (non-destructive)
  const filteredMessages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return messages;
    return messages.filter(
      (m) =>
        m.rawJsonString.toLowerCase().includes(q) ||
        m.topic.toLowerCase().includes(q) ||
        m.receivedAtFormatted.toLowerCase().includes(q) ||
        String(m.seq).includes(q)
    );
  }, [messages, searchQuery]);

  const isBrokerConnected = brokerDiag.mqttSessionConnected || mqttBrokerStatus === 'CONNECTED';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        width: '100%',
        maxWidth: '100%',
        fontFamily: typography.fontFamily,
        boxSizing: 'border-box',
        paddingBottom: '16px',
      }}
    >
      {/* TOP SCADA CONSOLE HEADER */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '6px',
          border: '1px solid #E2E8F0',
          padding: '10px 14px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
          boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '6px',
              backgroundColor: '#0F172A',
              color: '#38BDF8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Terminal size={17} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A', letterSpacing: '0.2px', margin: 0 }}>
                PANORAMA HARDWARE &amp; COMMUNICATION DIAGNOSTICS CONSOLE
              </h1>
              <StatusPill label="SCADA Diagnostics" tone="info" />
            </div>
            <div style={{ fontSize: '11px', color: '#64748B' }}>
              Broker:{' '}
              <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#334155' }}>
                {brokerDiag.host}:{brokerDiag.port}
              </span>{' '}
              ({brokerDiag.useSSL ? 'WSS / TLS' : 'WS'}) &bull; Topic:{' '}
              <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#0284C7' }}>{activeTopic}</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <StatusPill
            label={isBrokerConnected ? 'MQTT CONNECTED' : 'MQTT DISCONNECTED'}
            tone={isBrokerConnected ? 'success' : 'danger'}
          />
          <StatusPill
            label={isTopicConfirmed ? 'SUBSCRIBED' : 'UNSUBSCRIBED'}
            tone={isTopicConfirmed ? 'info' : 'warning'}
          />
          <StatusPill
            label={isPaused ? 'STREAM PAUSED' : 'STREAM LIVE'}
            tone={isPaused ? 'warning' : 'success'}
          />
          {copyFeedback && (
            <span
              style={{
                fontSize: '10px',
                fontWeight: 700,
                color: '#15803D',
                backgroundColor: '#DCFCE7',
                padding: '3px 8px',
                borderRadius: '4px',
                border: '1px solid #86EFAC',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <Check size={11} /> {copyFeedback}
            </span>
          )}
        </div>
      </div>

      {/* SECTION 9: DEVICE HEALTH SUMMARY STRIP */}
      <DeviceHealthSummaryBar
        brokerDiag={brokerDiag}
        isTopicConfirmed={isTopicConfirmed}
        liveMetrics={liveMetrics}
        deviceOnline={managedDevice ? managedDevice.isOnline : apiDevice ? Boolean(apiDevice.isOnline) : null}
      />

      {/* ROW 1: DEVICE IDENTITY | MQTT CONNECTION & SUBSCRIPTION CONTROLS | LIVE TELEMETRY STATUS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: '10px' }}>
        <DeviceIdentityCard
          metadata={deviceMetadata}
          managedDevice={managedDevice}
          apiDevice={apiDevice}
          liveMetrics={liveMetrics}
          activeTopic={activeTopic}
          onCopyUid={() => handleCopy(activeTopic, `UID copied: ${activeTopic}`)}
          onEditMetadata={() => setShowMetadataModal(true)}
        />

        {/* MQTT Subscription & Topic Controls Card */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '6px',
            padding: '10px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            boxShadow: '0 1px 2px rgba(15,23,42,0.03)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <SlidersHorizontal size={14} color="#0284C7" />
              <span style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase' }}>
                MQTT Subscription Control
              </span>
            </div>
            <StatusPill
              label={brokerDiag.websocketConnected ? 'WS UP' : 'WS DOWN'}
              tone={brokerDiag.websocketConnected ? 'success' : 'danger'}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: '#475569', marginBottom: '3px' }}>
                Select Registered Device / UID
              </label>
              <select
                value={availableDevices.some((d) => d.uid === topicInput) ? topicInput : ''}
                onChange={(e) => {
                  if (e.target.value) handleQuickSelectChange(e.target.value);
                }}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  fontSize: '11px',
                  color: '#0F172A',
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #CBD5E1',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                <option value="" disabled>
                  Select device preset...
                </option>
                {availableDevices.map((d) => (
                  <option key={d.uid} value={d.uid}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 160px' }}>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: '#475569', marginBottom: '3px' }}>
                  MQTT Topic
                </label>
                <input
                  type="text"
                  value={topicInput}
                  onChange={(e) => setTopicInput(e.target.value)}
                  placeholder="Device UID / Topic..."
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    fontFamily: 'monospace',
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#0F172A',
                    backgroundColor: '#F8FAFC',
                    border: '1px solid #CBD5E1',
                    borderRadius: '4px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div style={{ width: '82px' }}>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: '#475569', marginBottom: '3px' }}>
                  QoS
                </label>
                <select
                  value={qosInput}
                  onChange={(e) => setQosInput(Number(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '6px 6px',
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#0F172A',
                    backgroundColor: '#F8FAFC',
                    border: '1px solid #CBD5E1',
                    borderRadius: '4px',
                  }}
                >
                  <option value={0}>QoS 0</option>
                  <option value={1}>QoS 1</option>
                  <option value={2}>QoS 2</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '2px' }}>
              <button
                type="button"
                onClick={() => handleSubscribe()}
                style={{
                  flex: 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '5px',
                  padding: '6px 10px',
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
              <button
                type="button"
                onClick={handleUnsubscribe}
                disabled={!isSubscribed}
                style={{
                  flex: 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '5px',
                  padding: '6px 10px',
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
                Unsubscribe
              </button>
            </div>
          </div>

          <div style={{ marginTop: 'auto', paddingTop: '4px' }}>
            <SpecRow label="Active Broker" value={`${brokerDiag.host}:${brokerDiag.port}`} mono />
            <SpecRow label="Protocol / Security" value={brokerDiag.transportSecurity} />
            <SpecRow
              label="Latency"
              value={brokerDiag.connectionLatencyMs !== null ? `${brokerDiag.connectionLatencyMs} ms` : 'Not Measured'}
              mono
            />
          </div>
        </div>

        {/* Live Telemetry Summary Card */}
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Activity size={14} color="#0284C7" />
              <span style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase' }}>
                Telemetry Status
              </span>
            </div>
            <StatusPill
              label={liveMetrics.hasData ? 'RECEIVING' : 'NO DATA'}
              tone={liveMetrics.hasData ? 'success' : 'neutral'}
            />
          </div>

          <SpecRow label="Topic Messages Received" value={String(totalMessagesCount)} mono />
          <SpecRow label="Buffered Frames" value={`${messages.length} / ${MAX_MESSAGE_BUFFER}`} mono />
          <SpecRow label="Last Message Time" value={lastReceivedTimestamp || 'Waiting...'} mono />
          <SpecRow label="Device Timestamp" value={liveMetrics.deviceTimestamp || 'No Data'} mono />
          <SpecRow
            label="Tank 1 Level"
            value={
              liveMetrics.waterLevelCm !== null
                ? `${liveMetrics.waterLevelCm.toFixed(1)} cm (${liveMetrics.waterLevelPercent !== null ? liveMetrics.waterLevelPercent.toFixed(1) + '%' : '—'})`
                : 'No Data'
            }
            mono
          />
          <SpecRow
            label="Battery"
            value={liveMetrics.battery !== null ? `${liveMetrics.battery.toFixed(1)}` : 'No Data'}
            mono
          />
          <SpecRow
            label="Temperature"
            value={liveMetrics.temperature !== null ? `${liveMetrics.temperature.toFixed(1)} °C` : 'No Data'}
            mono
          />
          <SpecRow
            label="Payload Fields Count"
            value={liveMetrics.rawPayload ? `${Object.keys(liveMetrics.rawPayload).length} keys` : '0'}
            mono
          />
        </div>
      </div>

      {/* ROW 2: HARDWARE OVERVIEW & PERIPHERALS | COMMUNICATION INTERFACES */}
      <HardwareAndCommsRow metadata={deviceMetadata} liveMetrics={liveMetrics} />

      {/* ROW 3: SENSOR DIAGNOSTICS | FIRMWARE CONFIGURATION */}
      <SensorsAndFirmwareRow metadata={deviceMetadata} liveMetrics={liveMetrics} />

      {/* ROW 4: MQTT BROKER DETAILS | CONNECTION DIAGNOSTICS */}
      <MqttBrokerDetailsRow
        brokerDiag={brokerDiag}
        activeTopic={activeTopic}
        activeQos={qosInput}
        isTopicConfirmed={isTopicConfirmed}
        topicMessagesCount={totalMessagesCount}
        lastReceivedFormatted={lastReceivedTimestamp}
        nowTick={nowTick}
      />

      {/* ROW 5: COMMUNICATION ARCHITECTURE */}
      <CommunicationArchitecturePanel brokerDiag={brokerDiag} activeTopic={activeTopic} />

      {/* ROW 6: LIVE TELEMETRY INSPECTOR (SECTION 6) */}
      <div
        style={{
          backgroundColor: '#0D1117',
          borderRadius: '6px',
          border: '1px solid #30363D',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          minHeight: '440px',
          maxHeight: '640px',
          boxShadow: '0 4px 14px rgba(0,0,0,0.16)',
        }}
      >
        {/* Terminal Header & Mode/Action Toolbar */}
        <div
          style={{
            backgroundColor: '#161B22',
            borderBottom: '1px solid #30363D',
            padding: '8px 12px',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            flexShrink: 0,
          }}
        >
          {/* Left: Prompt + Mode Toggle (Raw JSON vs Parsed Telemetry) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '5px', flexShrink: 0 }}>
              <span style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: '#FF5F56', display: 'inline-block' }} />
              <span style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: '#FFBD2E', display: 'inline-block' }} />
              <span style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: '#27C93F', display: 'inline-block' }} />
            </div>
            <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#C9D1D9', fontWeight: 700 }}>
              LIVE TELEMETRY INSPECTOR &bull; {activeTopic}
            </span>

            {/* Mode A / Mode B Switcher */}
            <div style={{ display: 'inline-flex', borderRadius: '4px', overflow: 'hidden', border: '1px solid #30363D' }}>
              <button
                type="button"
                onClick={() => setInspectorMode('raw')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '3px 8px',
                  fontSize: '10px',
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer',
                  backgroundColor: inspectorMode === 'raw' ? '#2563EB' : '#21262D',
                  color: inspectorMode === 'raw' ? '#FFFFFF' : '#8B949E',
                }}
              >
                <Code2 size={11} />
                Raw JSON
              </button>
              <button
                type="button"
                onClick={() => setInspectorMode('parsed')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '3px 8px',
                  fontSize: '10px',
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer',
                  backgroundColor: inspectorMode === 'parsed' ? '#2563EB' : '#21262D',
                  color: inspectorMode === 'parsed' ? '#FFFFFF' : '#8B949E',
                }}
              >
                <Table2 size={11} />
                Parsed Telemetry
              </button>
            </div>
          </div>

          {/* Right: Search + Controls */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' }}>
            {/* Search within messages */}
            <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
              <Search size={11} color="#8B949E" style={{ position: 'absolute', left: '7px', pointerEvents: 'none' }} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search messages..."
                style={{
                  padding: '3px 8px 3px 23px',
                  fontSize: '10px',
                  fontFamily: 'monospace',
                  backgroundColor: '#0D1117',
                  color: '#C9D1D9',
                  border: '1px solid #30363D',
                  borderRadius: '4px',
                  width: '145px',
                  outline: 'none',
                }}
              />
            </div>

            {/* Pretty / Compact Format Toggle (for Raw JSON mode) */}
            {inspectorMode === 'raw' && (
              <button
                type="button"
                onClick={handleToggleFormatMode}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '3px 8px',
                  backgroundColor: '#21262D',
                  color: formatMode === 'pretty' ? '#7EE787' : '#C9D1D9',
                  border: '1px solid #30363D',
                  borderRadius: '4px',
                  fontSize: '10px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {formatMode === 'pretty' ? <Code2 size={11} /> : <AlignLeft size={11} />}
                {formatMode === 'pretty' ? 'Pretty' : 'Compact'}
              </button>
            )}

            <button
              type="button"
              onClick={handleTogglePause}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 8px',
                backgroundColor: isPaused ? '#064E3B' : '#451A03',
                color: isPaused ? '#6EE7B7' : '#FCD34D',
                border: `1px solid ${isPaused ? '#059669' : '#B45309'}`,
                borderRadius: '4px',
                fontSize: '10px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {isPaused ? <Play size={10} /> : <Pause size={10} />}
              {isPaused ? 'Resume' : 'Pause'}
            </button>

            <button
              type="button"
              onClick={handleToggleAutoScroll}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 8px',
                backgroundColor: autoScroll ? '#1E3A5F' : '#21262D',
                color: autoScroll ? '#79C0FF' : '#8B949E',
                border: '1px solid #30363D',
                borderRadius: '4px',
                fontSize: '10px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <ArrowDown size={10} />
              {autoScroll ? 'Auto Scroll' : 'Manual'}
            </button>

            <button
              type="button"
              onClick={handleToggleTimestamps}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 8px',
                backgroundColor: showTimestamps ? '#1E3A5F' : '#21262D',
                color: showTimestamps ? '#79C0FF' : '#8B949E',
                border: '1px solid #30363D',
                borderRadius: '4px',
                fontSize: '10px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <Clock size={10} />
              Timestamps
            </button>

            <button
              type="button"
              onClick={handleDownloadLogs}
              disabled={messages.length === 0}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 8px',
                backgroundColor: '#21262D',
                color: messages.length > 0 ? '#C9D1D9' : '#484F58',
                border: '1px solid #30363D',
                borderRadius: '4px',
                fontSize: '10px',
                fontWeight: 700,
                cursor: messages.length > 0 ? 'pointer' : 'not-allowed',
              }}
            >
              <Download size={10} />
              Download
            </button>

            <button
              type="button"
              onClick={handleClearConsole}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 8px',
                backgroundColor: '#21262D',
                color: '#F85149',
                border: '1px solid #30363D',
                borderRadius: '4px',
                fontSize: '10px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <Trash2 size={10} />
              Clear
            </button>

            <span style={{ fontFamily: 'monospace', fontSize: '10px', color: '#8B949E' }}>
              {filteredMessages.length}/{messages.length}
            </span>
          </div>
        </div>

        {/* Stream Body */}
        <div
          ref={terminalStreamRef}
          style={{
            flex: 1,
            minHeight: '360px',
            overflowY: 'auto',
            padding: '10px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            backgroundColor: '#0D1117',
          }}
        >
          {filteredMessages.length === 0 ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                minHeight: '320px',
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
                {messages.length > 0 && searchQuery
                  ? `No frames match search "${searchQuery}"`
                  : `Waiting for live MQTT telemetry on topic: ${activeTopic}`}
              </div>
              <div style={{ fontSize: '11px', maxWidth: '520px', lineHeight: 1.5, color: '#8B949E' }}>
                {isBrokerConnected
                  ? `MQTT session active on ${brokerDiag.host}:${brokerDiag.port}. Incoming JSON frames published to topic "${activeTopic}" will appear here verbatim in Raw JSON and Parsed Telemetry views.`
                  : `MQTT broker is currently disconnected. Automatic reconnection is active; live telemetry will stream once connected.`}
              </div>
            </div>
          ) : (
            filteredMessages.map((frame) => {
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
                  }}
                >
                  {/* Frame Header */}
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
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' }}>
                      <span style={{ backgroundColor: '#1F2937', color: '#58A6FF', padding: '1px 6px', borderRadius: '3px', fontWeight: 800, fontSize: '10px', border: '1px solid #374151' }}>
                        #{frame.seq}
                      </span>
                      <span style={{ backgroundColor: '#0F172A', color: '#79C0FF', padding: '1px 7px', borderRadius: '3px', border: '1px solid #1E293B', fontWeight: 700, fontSize: '10px' }}>
                        {frame.topic}
                      </span>
                      <span style={{ color: '#8B949E', fontSize: '10px', backgroundColor: '#21262D', padding: '1px 5px', borderRadius: '3px' }}>
                        QoS {frame.qos}
                      </span>
                      <span style={{ color: '#8B949E', fontSize: '10px', backgroundColor: '#21262D', padding: '1px 5px', borderRadius: '3px' }}>
                        {frame.payloadSize} B
                      </span>
                      {showTimestamps && (
                        <span style={{ color: '#58A6FF', fontWeight: 700, fontSize: '10px', backgroundColor: '#1E293B', padding: '1px 6px', borderRadius: '3px', border: '1px solid #334155' }}>
                          [{frame.receivedAtFormatted}]
                        </span>
                      )}
                      {frame.deviceTimestamp && (
                        <span style={{ color: '#8B949E', fontSize: '10px' }}>
                          Dev Time: &quot;{frame.deviceTimestamp}&quot;
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button
                        type="button"
                        onClick={() => handleCopy(frame.rawJsonString, `JSON #${frame.seq} copied`)}
                        style={{
                          display: 'inline-flex',
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
                      <button
                        type="button"
                        onClick={() => handleCopy(frame.rawPayloadString, `Raw #${frame.seq} copied`)}
                        style={{
                          display: 'inline-flex',
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
                      <button
                        type="button"
                        onClick={() => toggleCollapse(frame.id)}
                        style={{
                          display: 'inline-flex',
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

                  {/* Frame Body */}
                  {!isCollapsed && (
                    <div style={{ padding: '10px 14px', overflowX: 'auto', backgroundColor: '#0D1117' }}>
                      {inspectorMode === 'parsed' ? (
                        <ParsedTelemetryView
                          data={frame.rawParsedJson}
                          onCopyValue={(key, val) => handleCopy(String(val), `Copied ${key}`)}
                        />
                      ) : formatMode === 'pretty' ? (
                        <JsonSyntaxViewer
                          data={frame.rawParsedJson}
                          onCopyValue={(key, val) => handleCopy(String(val), `Copied ${key}`)}
                        />
                      ) : (
                        <pre
                          style={{
                            margin: 0,
                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
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

      {/* ADMIN HARDWARE METADATA MODAL */}
      {showMetadataModal && (
        <DeviceMetadataModal
          uid={activeTopic}
          initial={metadataOverrides}
          deviceName={deviceMetadata.deviceName}
          onSave={handleSaveMetadata}
          onClose={() => setShowMetadataModal(false)}
        />
      )}
    </div>
  );
};
