import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { typography } from '../theme';
import { useApp } from '../state/AppContext';
import {
  mqttService,
  RawMqttFrame,
  formatMqttTimestamp,
} from '../services/mqttService';
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
  Plus,
  Layers,
  ArrowDownLeft,
} from 'lucide-react';

export const TARGET_MQTT_TOPIC = '002F00654B42501320353332';
const MAX_MESSAGE_BUFFER = 500;

interface JsonSyntaxViewerProps {
  data: any;
  onCopyValue?: (key: string, val: any) => void;
}

const JsonSyntaxViewer: React.FC<JsonSyntaxViewerProps> = ({ data, onCopyValue }) => {
  if (data === null || data === undefined) {
    return <span style={{ color: '#8B949E' }}>null</span>;
  }

  const renderValue = (val: any, path: string = ''): React.ReactNode => {
    if (typeof val === 'string') {
      return (
        <span
          title="Click to copy string value"
          onClick={() => onCopyValue?.(path, val)}
          style={{ color: '#7EE787', cursor: 'pointer' }}
        >
          &quot;{val}&quot;
        </span>
      );
    }
    if (typeof val === 'number') {
      return (
        <span
          title="Click to copy number"
          onClick={() => onCopyValue?.(path, val)}
          style={{ color: '#FFA657', cursor: 'pointer', fontWeight: 600 }}
        >
          {val}
        </span>
      );
    }
    if (typeof val === 'boolean') {
      return (
        <span
          title="Click to copy boolean"
          onClick={() => onCopyValue?.(path, val)}
          style={{ color: '#FF7B72', cursor: 'pointer', fontWeight: 700 }}
        >
          {String(val)}
        </span>
      );
    }
    if (val === null) {
      return <span style={{ color: '#8B949E' }}>null</span>;
    }
    if (Array.isArray(val)) {
      if (val.length === 0) return <span>[]</span>;
      return (
        <span>
          [
          <div style={{ paddingLeft: '18px' }}>
            {val.map((item, idx) => (
              <div key={idx} style={{ lineHeight: '18px' }}>
                {renderValue(item, `${path}[${idx}]`)}
                {idx < val.length - 1 ? <span style={{ color: '#8B949E' }}>,</span> : ''}
              </div>
            ))}
          </div>
          ]
        </span>
      );
    }
    if (typeof val === 'object') {
      const keys = Object.keys(val);
      if (keys.length === 0) return <span>{'{}'}</span>;
      return (
        <span>
          {'{'}
          <div style={{ paddingLeft: '18px' }}>
            {keys.map((k, idx) => (
              <div key={k} style={{ lineHeight: '18px' }}>
                <span
                  title="Click to copy key name"
                  onClick={() => onCopyValue?.(k, k)}
                  style={{ color: '#79C0FF', cursor: 'pointer' }}
                >
                  &quot;{k}&quot;
                </span>
                <span style={{ color: '#C9D1D9' }}>: </span>
                {renderValue(val[k], path ? `${path}.${k}` : k)}
                {idx < keys.length - 1 ? <span style={{ color: '#8B949E' }}>,</span> : ''}
              </div>
            ))}
          </div>
          {'}'}
        </span>
      );
    }
    return <span>{String(val)}</span>;
  };

  return (
    <pre
      style={{
        margin: 0,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        fontSize: '12px',
        lineHeight: '18px',
        color: '#C9D1D9',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      {renderValue(data)}
    </pre>
  );
};

export const MqttMonitorScreen: React.FC = () => {
  const { mqttBrokerStatus } = useApp();

  // Local component states
  const [messages, setMessages] = useState<RawMqttFrame[]>(() => {
    const existing = mqttService.getRawMessages();
    return existing.slice(-MAX_MESSAGE_BUFFER);
  });
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

  const [topicInput, setTopicInput] = useState<string>(() => {
    if (typeof window === 'undefined') return TARGET_MQTT_TOPIC;
    const saved = localStorage.getItem('panorama_mqtt_target_topic');
    if (saved && !saved.includes('33332') && !saved.includes('0023004D')) {
      return saved;
    }
    return TARGET_MQTT_TOPIC;
  });
  const [qosInput, setQosInput] = useState<number>(0);
  const [subscribedTopics, setSubscribedTopics] = useState<string[]>(() => {
    const list = mqttService.getSubscribedTopics().filter((t) => !t.includes('33332'));
    if (!list.includes(TARGET_MQTT_TOPIC)) {
      list.unshift(TARGET_MQTT_TOPIC);
    }
    return list;
  });

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [totalBytesReceived, setTotalBytesReceived] = useState<number>(0);
  const [totalMessagesCount, setTotalMessagesCount] = useState<number>(() => messages.length);

  const terminalStreamRef = useRef<HTMLDivElement | null>(null);
  const isPausedRef = useRef<boolean>(isPaused);
  isPausedRef.current = isPaused;
  const autoScrollRef = useRef<boolean>(autoScroll);
  autoScrollRef.current = autoScroll;

  const brokerInfo = mqttService.getBrokerInfo();
  const isBrokerConnected = mqttBrokerStatus === 'CONNECTED' || brokerInfo.status === 'CONNECTED';

  // Ensure default target topic is subscribed upon mounting
  useEffect(() => {
    mqttService.subscribeTopic(TARGET_MQTT_TOPIC, 0);
    mqttService.subscribeTopic(`${TARGET_MQTT_TOPIC}/#`, 0);
    setSubscribedTopics(mqttService.getSubscribedTopics());
  }, []);

  // Listen directly to incoming MQTT message frames from Paho client
  useEffect(() => {
    const unsubscribe = mqttService.onRawMessage((frame: RawMqttFrame) => {
      setTotalBytesReceived((prev) => prev + frame.payloadSize);
      setTotalMessagesCount((prev) => prev + 1);

      if (isPausedRef.current) {
        return;
      }

      setMessages((prev) => {
        const next = [...prev, frame];
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

  // Topic subscription handlers
  const handleSubscribe = useCallback(() => {
    const clean = topicInput.trim();
    if (!clean) return;
    mqttService.subscribeTopic(clean, qosInput);
    if (typeof window !== 'undefined') {
      localStorage.setItem('panorama_mqtt_target_topic', clean);
    }
    setSubscribedTopics(mqttService.getSubscribedTopics());
  }, [topicInput, qosInput]);

  const handleUnsubscribe = useCallback((topicToUnsub?: string) => {
    const target = (topicToUnsub || topicInput).trim();
    if (!target) return;
    mqttService.unsubscribeTopic(target);
    setSubscribedTopics(mqttService.getSubscribedTopics());
  }, [topicInput]);

  const handleClearConsole = useCallback(() => {
    mqttService.clearRawMessages();
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

  const handleSetFormatMode = useCallback((mode: 'pretty' | 'raw') => {
    setFormatMode(mode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('panorama_mqtt_format_mode', mode);
    }
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

  const toggleMessageCollapse = useCallback((id: string) => {
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

  const lastMessageTime = useMemo(() => {
    if (messages.length === 0) return 'None yet';
    const last = messages[messages.length - 1];
    return last.receivedAtFormatted;
  }, [messages]);

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
                MQTT.fx Engine
              </span>
            </div>
            <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
              Direct HiveMQ WebSocket Stream • Zero-Backend Real-Time Telemetry
            </div>
          </div>
        </div>

        {/* Status Metrics Badges */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
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

          {/* Subscribed Topic */}
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
            <Radio size={13} color="#2563EB" />
            <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>Topic:</span>
            <span
              style={{
                fontSize: '11px',
                fontFamily: 'monospace',
                fontWeight: 700,
                color: '#0F172A',
              }}
            >
              {TARGET_MQTT_TOPIC}
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
              {totalMessagesCount}
            </span>
            <span style={{ fontSize: '10px', color: '#94A3B8' }}>({messages.length}/{MAX_MESSAGE_BUFFER})</span>
          </div>

          {/* Last Seen Timestamp */}
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
            <Clock size={13} color="#64748B" />
            <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>Last:</span>
            <span style={{ fontSize: '11px', fontFamily: 'monospace', fontWeight: 700, color: '#334155' }}>
              {lastMessageTime.split(' ').pop() || 'None'}
            </span>
          </div>
        </div>
      </div>

      {/* 2. TOPIC SUBSCRIPTION CONTROLS TOOLBAR */}
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
        {/* Topic Input + Subscribe / Unsubscribe */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', flex: '1 1 450px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1, minWidth: '260px' }}>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: '#475569',
                textTransform: 'uppercase',
                letterSpacing: '0.4px',
                whiteSpace: 'nowrap',
              }}
            >
              Topic:
            </span>
            <input
              type="text"
              value={topicInput}
              onChange={(e) => setTopicInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSubscribe();
              }}
              placeholder="e.g. 002F00654B42501320353332 or 002F00654B42501320353332/#"
              style={{
                flex: 1,
                padding: '7px 10px',
                fontFamily: 'monospace',
                fontSize: '12px',
                fontWeight: 600,
                color: '#0F172A',
                backgroundColor: '#F8FAFC',
                border: '1px solid #CBD5E1',
                borderRadius: '6px',
                outline: 'none',
              }}
            />
          </div>

          {/* QoS Selection */}
          <select
            value={qosInput}
            onChange={(e) => setQosInput(Number(e.target.value))}
            style={{
              padding: '6px 8px',
              fontSize: '12px',
              fontWeight: 600,
              color: '#334155',
              backgroundColor: '#F8FAFC',
              border: '1px solid #CBD5E1',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            <option value={0}>QoS 0</option>
            <option value={1}>QoS 1</option>
          </select>

          {/* Subscribe Button */}
          <button
            onClick={handleSubscribe}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              backgroundColor: '#2563EB',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'background-color 0.15s ease',
            }}
          >
            <Plus size={14} />
            Subscribe
          </button>

          {/* Unsubscribe Button */}
          <button
            onClick={() => handleUnsubscribe()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 12px',
              backgroundColor: '#FFFFFF',
              color: '#DC2626',
              border: '1px solid #FECACA',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <X size={14} />
            Unsubscribe
          </button>
        </div>

        {/* Terminal Controls: Pause, Clear, Timestamps, Autoscroll, Format */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
          {/* Pause / Resume */}
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

          {/* Clear Console */}
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

          {/* Timestamps Toggle */}
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
            }}
          >
            <input
              type="checkbox"
              checked={showTimestamps}
              onChange={handleToggleTimestamps}
              style={{ cursor: 'pointer' }}
            />
            Show Timestamps
          </label>

          {/* Auto Scroll Toggle */}
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

          {/* Pretty / Raw Toggle */}
          <div
            style={{
              display: 'flex',
              border: '1px solid #CBD5E1',
              borderRadius: '6px',
              overflow: 'hidden',
            }}
          >
            <button
              onClick={() => handleSetFormatMode('pretty')}
              style={{
                padding: '5px 10px',
                fontSize: '11px',
                fontWeight: 700,
                border: 'none',
                backgroundColor: formatMode === 'pretty' ? '#0F172A' : '#F8FAFC',
                color: formatMode === 'pretty' ? '#FFFFFF' : '#64748B',
                cursor: 'pointer',
              }}
            >
              Pretty JSON
            </button>
            <button
              onClick={() => handleSetFormatMode('raw')}
              style={{
                padding: '5px 10px',
                fontSize: '11px',
                fontWeight: 700,
                border: 'none',
                backgroundColor: formatMode === 'raw' ? '#0F172A' : '#F8FAFC',
                color: formatMode === 'raw' ? '#FFFFFF' : '#64748B',
                cursor: 'pointer',
              }}
            >
              Raw String
            </button>
          </div>
        </div>
      </div>

      {/* 3. ACTIVE SUBSCRIPTIONS PILL CHIPS */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '8px',
          padding: '0 4px',
        }}
      >
        <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748B' }}>
          Active Subscriptions ({subscribedTopics.length}):
        </span>
        {subscribedTopics.map((top) => (
          <span
            key={top}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '3px 8px',
              borderRadius: '12px',
              backgroundColor: '#EFF6FF',
              color: '#1D4ED8',
              border: '1px solid #BFDBFE',
              fontSize: '11px',
              fontFamily: 'monospace',
              fontWeight: 600,
            }}
          >
            <Radio size={10} color="#2563EB" />
            {top}
            {top !== TARGET_MQTT_TOPIC && (
              <X
                size={12}
                onClick={() => handleUnsubscribe(top)}
                style={{ cursor: 'pointer', color: '#64748B' }}
              />
            )}
          </span>
        ))}

        {copyFeedback && (
          <span
            style={{
              marginLeft: 'auto',
              fontSize: '11px',
              fontWeight: 700,
              color: '#16A34A',
              backgroundColor: '#DCFCE7',
              padding: '3px 10px',
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

      {/* 4. LIVE MQTT TERMINAL VIEW (MQTT.fx Terminal Appearance) */}
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
              terminal@panorama: mqtt://broker.hivemq.com:8884
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <span>Buffer: {messages.length}/{MAX_MESSAGE_BUFFER}</span>
            <span>Total Data: {(totalBytesReceived / 1024).toFixed(1)} KB</span>
          </div>
        </div>

        {/* Message Stream Scroll Area */}
        <div
          ref={terminalStreamRef}
          style={{
            height: 'calc(100vh - 310px)',
            minHeight: '440px',
            maxHeight: '750px',
            overflowY: 'auto',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
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
                minHeight: '300px',
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
                  animation: 'pulse 2s infinite',
                }}
              >
                <Radio size={22} />
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 600, color: '#C9D1D9' }}>
                Waiting for live MQTT telemetry on topic: {TARGET_MQTT_TOPIC}
              </div>
              <div style={{ fontSize: '12px', maxWidth: '480px', lineHeight: 1.5 }}>
                Directly connected to HiveMQ broker over WebSocket TLS. When the hardware device broadcasts data, the full raw JSON payload will stream here instantaneously.
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
                    borderRadius: '6px',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  {/* Message Frame Header Bar */}
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      backgroundColor: '#21262D',
                      borderBottom: isCollapsed ? 'none' : '1px solid #30363D',
                      fontFamily: 'monospace',
                      fontSize: '11px',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ color: '#58A6FF', fontWeight: 800 }}>#{index + 1}</span>
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
                      <span style={{ color: '#8B949E' }}>QoS: {frame.qos}</span>
                      <span style={{ color: '#8B949E' }}>{frame.payloadSize} B</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {/* Copy Raw Payload */}
                      <button
                        onClick={() => handleCopy(frame.payloadString, `Payload #${index + 1} copied`)}
                        title="Copy raw payload string"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '3px 8px',
                          backgroundColor: '#30363D',
                          color: '#C9D1D9',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        <Copy size={11} />
                        Copy Raw
                      </button>

                      {/* Copy JSON */}
                      {frame.isJson && (
                        <button
                          onClick={() => {
                            const pretty = JSON.stringify(frame.parsedJson, null, 2);
                            handleCopy(pretty, `JSON #${index + 1} copied`);
                          }}
                          title="Copy formatted JSON"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '3px 8px',
                            backgroundColor: '#238636',
                            color: '#FFFFFF',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          <Code2 size={11} />
                          Copy JSON
                        </button>
                      )}

                      {/* Collapse / Expand Toggle */}
                      <button
                        onClick={() => toggleMessageCollapse(frame.id)}
                        title={isCollapsed ? 'Expand payload' : 'Collapse payload'}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '3px 6px',
                          backgroundColor: 'transparent',
                          color: '#8B949E',
                          border: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        {isCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                      </button>
                    </div>
                  </div>

                  {/* Message Frame Body (Payload) */}
                  {!isCollapsed && (
                    <div style={{ padding: '12px 14px', overflowX: 'auto' }}>
                      {/* Mode 1: Timestamp Mode ON (Display prominent timestamp header banner) */}
                      {showTimestamps && (
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '2px',
                            marginBottom: '10px',
                            paddingBottom: '8px',
                            borderBottom: '1px dashed #30363D',
                            fontFamily: 'monospace',
                            fontSize: '11px',
                          }}
                        >
                          <div style={{ color: '#58A6FF', fontWeight: 800 }}>
                            [{frame.receivedAtFormatted}] MQTT MESSAGE RECEIVED
                          </div>
                          <div style={{ color: '#8B949E', fontSize: '10px' }}>
                            TOPIC: {frame.topic} | QoS: {frame.qos} | SIZE: {frame.payloadSize} bytes | CLIENT RX: {frame.receivedAtFormatted}
                          </div>
                        </div>
                      )}

                      {/* Payload rendering */}
                      {frame.error ? (
                        <div>
                          <div
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              backgroundColor: '#451A1A',
                              color: '#FF7B72',
                              fontSize: '10px',
                              fontWeight: 700,
                              marginBottom: '6px',
                            }}
                          >
                            <AlertTriangle size={11} />
                            MALFORMED JSON: {frame.error}
                          </div>
                          <pre
                            style={{
                              margin: 0,
                              fontFamily: 'monospace',
                              fontSize: '12px',
                              color: '#FF7B72',
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                            }}
                          >
                            {frame.payloadString}
                          </pre>
                        </div>
                      ) : formatMode === 'pretty' && frame.isJson && frame.parsedJson ? (
                        <JsonSyntaxViewer
                          data={frame.parsedJson}
                          onCopyValue={(key, val) => handleCopy(String(val), `Copied ${key}`)}
                        />
                      ) : (
                        <pre
                          style={{
                            margin: 0,
                            fontFamily: 'monospace',
                            fontSize: '12px',
                            lineHeight: '18px',
                            color: '#7EE787',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                          }}
                        >
                          {frame.payloadString}
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
