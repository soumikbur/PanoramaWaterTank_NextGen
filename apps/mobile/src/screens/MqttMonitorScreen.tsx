import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { typography } from '../theme';
import { useApp } from '../state/AppContext';
import {
  mqttService,
  RawMqttFrame,
  formatMqttTimestamp,
  formatMqttMessageBlock,
} from '../services/mqttService';
import { deviceRegistry, ManagedDevice } from '../services/deviceRegistry';
import {
  Terminal,
  Play,
  Pause,
  Trash2,
  Download,
  Search,
  Filter,
  Copy,
  Check,
  Radio,
  Clock,
  Cpu,
  Layers,
  ArrowDownLeft,
  ChevronDown,
  ChevronUp,
  X,
  Code2,
  FileText,
  AlertTriangle,
  RefreshCw,
  MapPin,
  Battery,
  ShieldCheck,
  Wifi,
  WifiOff,
  ExternalLink,
} from 'lucide-react';

export const TARGET_HARDWARE_UID = '002F00654B42501203203533332';
export const TARGET_HARDWARE_ALT_UID = '002F00654B425012032053332';

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
                {idx < val.length - 1 ? ',' : ''}
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
                {idx < keys.length - 1 ? <span style={{ color: '#C9D1D9' }}>,</span> : ''}
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
  const { managedDevices, devices, mqttBrokerStatus, setActiveScreen } = useApp();

  const [messages, setMessages] = useState<RawMqttFrame[]>(() => mqttService.getRawMessages());
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [selectedDeviceUid, setSelectedDeviceUid] = useState<string>('ALL');
  const [deviceSearchFilter, setDeviceSearchFilter] = useState<string>('');
  const [customTopic, setCustomTopic] = useState<string>(TARGET_HARDWARE_UID);
  const [maxBufferSize, setMaxBufferSize] = useState<number>(500);
  const [activeTopics, setActiveTopics] = useState<string[]>(() => {
    const list = mqttService.getSubscribedTopics();
    if (!list.includes(TARGET_HARDWARE_UID)) {
      list.push(TARGET_HARDWARE_UID);
    }
    return list;
  });
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [viewModes, setViewModes] = useState<Record<string, 'pretty' | 'raw'>>({});
  const [totalBytesReceived, setTotalBytesReceived] = useState<number>(0);

  const terminalStreamRef = useRef<HTMLDivElement | null>(null);
  const isPausedRef = useRef<boolean>(isPaused);
  isPausedRef.current = isPaused;

  const autoScrollRef = useRef<boolean>(autoScroll);
  autoScrollRef.current = autoScroll;

  const maxBufferRef = useRef<number>(maxBufferSize);
  maxBufferRef.current = maxBufferSize;

  const brokerInfo = mqttService.getBrokerInfo();

  // Combine devices from state and registry for complete device coverage
  const allDevicesList = useMemo(() => {
    const map = new Map<string, any>();
    managedDevices.forEach((d) => {
      map.set(d.uid, {
        uid: d.uid,
        name: d.name || 'WLI Node Sensor',
        trainNumber: d.trainNumber || null,
        coachId: d.coachId || null,
        status: d.status || (d.isOnline ? 'ONLINE' : 'OFFLINE'),
        isOnline: Boolean(d.isOnline),
        lastSeen: d.lastSeen || null,
      });
    });

    devices.forEach((d) => {
      const uid = d.uid || (d as any).device_uid;
      if (uid && !map.has(uid)) {
        map.set(uid, {
          uid,
          name: (d as any).device_name || (d as any).name || 'Standard WLI Node',
          trainNumber: (d as any).train_number || (d as any).trainNumber || null,
          coachId: (d as any).coach_id || (d as any).coachId || (d as any).coach_number || null,
          status: (d as any).is_online || (d as any).isOnline ? 'ONLINE' : 'OFFLINE',
          isOnline: Boolean((d as any).is_online || (d as any).isOnline),
          lastSeen: (d as any).last_seen_at || (d as any).lastSeen || null,
        });
      }
    });

    // Ensure target hardware devices exist in list
    if (!map.has(TARGET_HARDWARE_UID)) {
      map.set(TARGET_HARDWARE_UID, {
        uid: TARGET_HARDWARE_UID,
        name: 'Target Hardware WLI Node (Live Telemetry)',
        trainNumber: '13009',
        coachId: 'SLRD',
        status: 'ONLINE',
        isOnline: true,
        lastSeen: 'Live HiveMQ Stream',
      });
    }
    if (!map.has(TARGET_HARDWARE_ALT_UID)) {
      map.set(TARGET_HARDWARE_ALT_UID, {
        uid: TARGET_HARDWARE_ALT_UID,
        name: 'Target Hardware WLI Node (Variant)',
        trainNumber: '13009',
        coachId: 'SLRD',
        status: 'ONLINE',
        isOnline: true,
        lastSeen: 'Live HiveMQ Stream',
      });
    }

    return Array.from(map.values());
  }, [managedDevices, devices]);

  // Filtered devices list for the device selector dropdown
  const filteredDeviceList = useMemo(() => {
    if (!deviceSearchFilter.trim()) return allDevicesList;
    const q = deviceSearchFilter.toLowerCase().trim();
    return allDevicesList.filter(
      (d) =>
        d.uid.toLowerCase().includes(q) ||
        (d.name && d.name.toLowerCase().includes(q)) ||
        (d.trainNumber && d.trainNumber.toLowerCase().includes(q)) ||
        (d.coachId && d.coachId.toLowerCase().includes(q))
    );
  }, [allDevicesList, deviceSearchFilter]);

  // Selected device object
  const currentSelectedDevice = useMemo(() => {
    if (selectedDeviceUid === 'ALL') return null;
    return allDevicesList.find((d) => d.uid === selectedDeviceUid) || null;
  }, [allDevicesList, selectedDeviceUid]);

  // Subscribe initially to target hardware device and wildcards
  useEffect(() => {
    mqttService.subscribeTopic(TARGET_HARDWARE_UID, 0);
    mqttService.subscribeTopic(`${TARGET_HARDWARE_UID}/#`, 0);
    mqttService.subscribeTopic(TARGET_HARDWARE_ALT_UID, 0);
    mqttService.subscribeTopic(`${TARGET_HARDWARE_ALT_UID}/#`, 0);
    mqttService.subscribeTopic(`panorama/telemetry/${TARGET_HARDWARE_UID}`, 0);
    mqttService.subscribeTopic(`panorama/telemetry/#`, 0);
    setActiveTopics(mqttService.getSubscribedTopics());
  }, []);

  // Listen to incoming real-time MQTT frames
  useEffect(() => {
    const unsubscribe = mqttService.onRawMessage((frame: RawMqttFrame) => {
      setTotalBytesReceived((prev) => prev + frame.payloadSize);
      if (isPausedRef.current) {
        return;
      }
      setMessages((prev) => {
        const limit = maxBufferRef.current || 500;
        const next = [...prev, frame];
        if (next.length > limit) {
          return next.slice(next.length - limit);
        }
        return next;
      });
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Auto-scroll effect scoped strictly to the terminal container
  useEffect(() => {
    if (autoScroll && !isPaused && terminalStreamRef.current) {
      terminalStreamRef.current.scrollTop = terminalStreamRef.current.scrollHeight;
    }
  }, [messages, autoScroll, isPaused]);

  // Toggle Pause/Resume
  const handleTogglePause = () => {
    if (isPaused) {
      setIsPaused(false);
      const limit = maxBufferSize || 500;
      const history = mqttService.getRawMessages();
      setMessages(history.slice(-limit));
    } else {
      setIsPaused(true);
    }
  };

  const handleClearConsole = () => {
    mqttService.clearRawMessages();
    setMessages([]);
    setTotalBytesReceived(0);
  };

  const handleDeviceSelect = (val: string) => {
    setSelectedDeviceUid(val);
    if (val !== 'ALL') {
      mqttService.subscribeTopic(val, 0);
      mqttService.subscribeTopic(`${val}/#`, 0);
      mqttService.subscribeTopic(`panorama/telemetry/${val}`, 0);
      setActiveTopics(mqttService.getSubscribedTopics());
    }
  };

  const handleSubscribe = () => {
    const top = customTopic.trim();
    if (!top) return;
    mqttService.subscribeTopic(top, 0);
    if (top !== '#' && !top.includes('/')) {
      mqttService.subscribeTopic(`${top}/#`, 0);
    }
    setActiveTopics(mqttService.getSubscribedTopics());
  };

  const handleUnsubscribe = (topicToRemove: string) => {
    mqttService.unsubscribeTopic(topicToRemove);
    if (topicToRemove !== '#' && !topicToRemove.includes('/')) {
      mqttService.unsubscribeTopic(`${topicToRemove}/#`);
    }
    setActiveTopics(mqttService.getSubscribedTopics());
  };

  const handleCopy = (text: string, label: string) => {
    try {
      if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopyFeedback(label);
      setTimeout(() => {
        setCopyFeedback((curr) => (curr === label ? null : curr));
      }, 1500);
    } catch (err) {
      console.warn('Copy failed:', err);
    }
  };

  const handleExportJson = () => {
    try {
      const dataStr = JSON.stringify(messages, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `panorama_raw_mqtt_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export JSON failed:', err);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleViewMode = (id: string) => {
    setViewModes((prev) => ({
      ...prev,
      [id]: prev[id] === 'raw' ? 'pretty' : 'raw',
    }));
  };

  // Filter messages based on search query and selected device filter
  const filteredMessages = useMemo(() => {
    let list = messages;
    if (selectedDeviceUid !== 'ALL') {
      list = list.filter((m) => {
        if (m.uid && m.uid.includes(selectedDeviceUid)) return true;
        if (m.topic && m.topic.includes(selectedDeviceUid)) return true;
        return false;
      });
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      list = list.filter((m) => {
        if (m.topic.toLowerCase().includes(query)) return true;
        if (m.uid && m.uid.toLowerCase().includes(query)) return true;
        if (m.payloadString.toLowerCase().includes(query)) return true;
        if (m.receivedAtFormatted.toLowerCase().includes(query)) return true;
        if (m.deviceTimestamp && m.deviceTimestamp.toLowerCase().includes(query)) return true;
        return false;
      });
    }

    return list;
  }, [messages, selectedDeviceUid, searchQuery]);

  // Find latest message for currently selected device
  const latestSelectedMessage = useMemo(() => {
    if (selectedDeviceUid === 'ALL' || filteredMessages.length === 0) return null;
    return filteredMessages[filteredMessages.length - 1];
  }, [selectedDeviceUid, filteredMessages]);

  const isConnected = brokerInfo.status === 'CONNECTED' || mqttBrokerStatus === 'CONNECTED';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        width: '100%',
        minWidth: 0,
        boxSizing: 'border-box',
        fontFamily: typography.fontFamily,
      }}
    >
      {/* 1. Header & Breadcrumbs */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <div
            style={{
              fontSize: '12px',
              color: '#64748B',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>Train Management</span>
            <span>&rsaquo;</span>
            <span
              onClick={() => setActiveScreen('devices')}
              style={{ cursor: 'pointer', color: '#2563EB' }}
            >
              Devices
            </span>
            <span>&rsaquo;</span>
            <span style={{ color: '#0F172A', fontWeight: 700 }}>Raw Data</span>
          </div>

          <h1
            style={{
              fontSize: '20px',
              fontWeight: 800,
              color: '#0F172A',
              margin: '4px 0 2px 0',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              letterSpacing: '0.2px',
            }}
          >
            <Terminal size={22} color="#2563EB" />
            RAW MQTT DATA MONITOR
          </h1>
          <div style={{ fontSize: '12px', color: '#64748B' }}>
            Real-time WLI telemetry payload inspection, topic frame stream & hardware packet decoder
          </div>
        </div>

        {/* Global Connection & Telemetry Stats Pill Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Connection Status Pill */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 700,
              backgroundColor: isConnected ? '#ECFDF5' : '#FEF2F2',
              border: `1px solid ${isConnected ? '#A7F3D0' : '#FECACA'}`,
              color: isConnected ? '#059669' : '#DC2626',
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: isConnected ? '#10B981' : '#EF4444',
                boxShadow: isConnected ? '0 0 8px #10B981' : 'none',
              }}
            />
            {isConnected ? 'Broker Online' : 'Broker Disconnected'}
          </div>

          {/* Live / Paused Stream Indicator */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 10px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 700,
              backgroundColor: isPaused ? '#FEF3C7' : '#EFF6FF',
              border: `1px solid ${isPaused ? '#FDE68A' : '#BFDBFE'}`,
              color: isPaused ? '#B45309' : '#1D4ED8',
            }}
          >
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                backgroundColor: isPaused ? '#F59E0B' : '#3B82F6',
              }}
            />
            {isPaused ? 'STREAM PAUSED' : 'LIVE STREAMING'}
          </div>

          {/* Broker Host Indicator */}
          <div
            title={`Host: ${brokerInfo.host}:${brokerInfo.port}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 10px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 600,
              backgroundColor: '#F1F5F9',
              border: '1px solid #CBD5E1',
              color: '#334155',
            }}
          >
            <Radio size={13} color="#2563EB" />
            <span>{brokerInfo.host}:{brokerInfo.port}</span>
          </div>

          {/* Message Count Badge */}
          <div
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 700,
              backgroundColor: '#EFF6FF',
              border: '1px solid #BFDBFE',
              color: '#1D4ED8',
            }}
          >
            Messages: {messages.length} ({totalBytesReceived > 1024 ? `${(totalBytesReceived / 1024).toFixed(1)} KB` : `${totalBytesReceived} B`})
          </div>
        </div>
      </div>

      {/* 2. Top Interactive Toolbar */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '8px',
          border: '1px solid #E2E8F0',
          padding: '12px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        }}
      >
        {/* Device Selection & Action Controls Row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px',
          }}
        >
          {/* Device Selection & Filter Box */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', flex: 1, minWidth: '320px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Cpu size={15} color="#2563EB" />
              Target Device:
            </span>

            {/* Searchable / Selectable Dropdown */}
            <select
              value={selectedDeviceUid}
              onChange={(e) => handleDeviceSelect(e.target.value)}
              style={{
                fontSize: '12px',
                padding: '6px 12px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFFFFF',
                color: '#0F172A',
                fontWeight: 600,
                outline: 'none',
                cursor: 'pointer',
                maxWidth: '440px',
                flex: 1,
              }}
            >
              <option value="ALL">ALL DEVICES (Show messages from every device & topic)</option>
              <option value={TARGET_HARDWARE_UID}>
                ⭐ {TARGET_HARDWARE_UID} — Target Hardware WLI Node (Live Telemetry)
              </option>
              <option value={TARGET_HARDWARE_ALT_UID}>
                ⭐ {TARGET_HARDWARE_ALT_UID} — Target Hardware WLI Node (Variant)
              </option>
              {filteredDeviceList
                .filter((d) => d.uid !== TARGET_HARDWARE_UID && d.uid !== TARGET_HARDWARE_ALT_UID)
                .map((d) => (
                  <option key={d.uid} value={d.uid}>
                    UID: {d.uid} | {d.name} | Train {d.trainNumber || 'Unassigned'} | Coach {d.coachId || 'Unassigned'} [{d.status}]
                  </option>
                ))}
            </select>

            {/* Device Quick Search Filter */}
            <input
              type="text"
              value={deviceSearchFilter}
              onChange={(e) => setDeviceSearchFilter(e.target.value)}
              placeholder="Filter device list..."
              style={{
                fontSize: '11px',
                padding: '5px 8px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                width: '130px',
                outline: 'none',
              }}
            />
          </div>

          {/* Control Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            {/* Pause / Resume Button */}
            <button
              onClick={handleTogglePause}
              title={isPaused ? 'Resume live message stream' : 'Pause incoming message stream'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                border: '1px solid #CBD5E1',
                backgroundColor: isPaused ? '#FEF3C7' : '#F8FAFC',
                color: isPaused ? '#92400E' : '#334155',
              }}
            >
              {isPaused ? <Play size={13} color="#D97706" /> : <Pause size={13} color="#64748B" />}
              <span>{isPaused ? 'Resume Stream' : 'Pause Stream'}</span>
            </button>

            {/* Auto-Scroll Toggle */}
            <button
              onClick={() => setAutoScroll((prev) => !prev)}
              title="Toggle auto-scrolling to newest incoming message"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                border: `1px solid ${autoScroll ? '#BFDBFE' : '#CBD5E1'}`,
                backgroundColor: autoScroll ? '#EFF6FF' : '#F8FAFC',
                color: autoScroll ? '#1D4ED8' : '#64748B',
              }}
            >
              <span>Auto-Scroll: {autoScroll ? 'ON' : 'OFF'}</span>
            </button>

            {/* Clear Console */}
            <button
              onClick={handleClearConsole}
              title="Clear all displayed messages from terminal view"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                border: '1px solid #CBD5E1',
                backgroundColor: '#F8FAFC',
                color: '#475569',
              }}
            >
              <Trash2 size={13} />
              <span>Clear Console</span>
            </button>

            {/* Export JSON */}
            <button
              onClick={handleExportJson}
              title="Export captured messages to JSON file"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                border: '1px solid #A7F3D0',
                backgroundColor: '#ECFDF5',
                color: '#065F46',
              }}
            >
              <Download size={13} />
              <span>Export JSON</span>
            </button>

            {/* Max Buffer Size Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>Buffer:</span>
              <select
                value={maxBufferSize}
                onChange={(e) => setMaxBufferSize(parseInt(e.target.value, 10))}
                style={{
                  fontSize: '11px',
                  padding: '5px 6px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#FFFFFF',
                  color: '#334155',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value={100}>100 msgs</option>
                <option value={250}>250 msgs</option>
                <option value={500}>500 msgs</option>
                <option value={1000}>1000 msgs</option>
              </select>
            </div>
          </div>
        </div>

        {/* Selected Device Context Card (When specific device is selected) */}
        {currentSelectedDevice && (
          <div
            style={{
              backgroundColor: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '6px',
              padding: '8px 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '10px',
              fontSize: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, color: '#0F172A' }}>Selected Device:</span>
              <code style={{ color: '#2563EB', fontWeight: 700, backgroundColor: '#EFF6FF', padding: '2px 6px', borderRadius: '4px' }}>
                {currentSelectedDevice.uid}
              </code>
              <span style={{ color: '#64748B' }}>{currentSelectedDevice.name}</span>
              <span style={{ color: '#475569', fontWeight: 600 }}>
                Train: {currentSelectedDevice.trainNumber || 'Unassigned'} / Coach: {currentSelectedDevice.coachId || 'Unassigned'}
              </span>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '10px',
                  backgroundColor: currentSelectedDevice.isOnline ? '#DCFCE7' : '#F1F5F9',
                  color: currentSelectedDevice.isOnline ? '#16A34A' : '#64748B',
                }}
              >
                {currentSelectedDevice.status}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748B', fontSize: '11px' }}>
              <span>Latest Frame Received:</span>
              <strong style={{ color: latestSelectedMessage ? '#059669' : '#94A3B8' }}>
                {latestSelectedMessage ? latestSelectedMessage.receivedAtFormatted : 'Awaiting Telemetry'}
              </strong>
            </div>
          </div>
        )}

        {/* Custom Topic Input & Subscriptions Row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '8px',
            paddingTop: '4px',
            borderTop: '1px solid #F1F5F9',
          }}
        >
          {/* Custom Topic Subscription Bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: '280px' }}>
            <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>Topic Subscribe:</span>
            <input
              type="text"
              value={customTopic}
              onChange={(e) => setCustomTopic(e.target.value)}
              placeholder="e.g. 002F... or panorama/telemetry/#"
              style={{
                fontSize: '11px',
                padding: '5px 8px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                flex: 1,
                maxWidth: '300px',
                outline: 'none',
                fontFamily: 'monospace',
              }}
            />
            <button
              onClick={handleSubscribe}
              style={{
                padding: '5px 12px',
                backgroundColor: '#2563EB',
                color: '#FFFFFF',
                borderRadius: '6px',
                border: 'none',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Subscribe
            </button>
          </div>

          {/* Active Subscriptions Badges */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>Active Subscriptions:</span>
            {activeTopics.slice(0, 3).map((top) => (
              <span
                key={top}
                style={{
                  backgroundColor: '#EFF6FF',
                  color: '#1D4ED8',
                  border: '1px solid #BFDBFE',
                  borderRadius: '4px',
                  padding: '2px 6px',
                  fontSize: '10px',
                  fontFamily: 'monospace',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                {top}
                <X
                  size={11}
                  style={{ cursor: 'pointer', opacity: 0.7 }}
                  onClick={() => handleUnsubscribe(top)}
                  title={`Unsubscribe from ${top}`}
                />
              </span>
            ))}
          </div>

          {/* Search / Filter Input */}
          <div style={{ position: 'relative', width: '260px' }}>
            <Search
              size={13}
              color="#94A3B8"
              style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search topic, UID, payload..."
              style={{
                fontSize: '11px',
                padding: '5px 26px 5px 28px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                width: '100%',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            {searchQuery && (
              <X
                size={13}
                color="#94A3B8"
                onClick={() => setSearchQuery('')}
                style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', cursor: 'pointer' }}
              />
            )}
          </div>
        </div>
      </div>

      {/* 3. Dark Terminal Console Frame */}
      <div
        style={{
          backgroundColor: '#0D1117',
          borderRadius: '8px',
          border: '1px solid #30363D',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          height: 'calc(100vh - 280px)',
          minHeight: '480px',
        }}
      >
        {/* Terminal Titlebar */}
        <div
          style={{
            backgroundColor: '#161B22',
            borderBottom: '1px solid #30363D',
            padding: '8px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            userSelect: 'none',
          }}
        >
          {/* Terminal Dots & Title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '11px', height: '11px', borderRadius: '50%', backgroundColor: '#FF5F56' }} />
              <div style={{ width: '11px', height: '11px', borderRadius: '50%', backgroundColor: '#FFBD2E' }} />
              <div style={{ width: '11px', height: '11px', borderRadius: '50%', backgroundColor: '#27C93F' }} />
            </div>
            <span
              style={{
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                fontSize: '12px',
                fontWeight: 600,
                color: '#8B949E',
              }}
            >
              wli-raw-data-monitor — {brokerInfo.host}:{brokerInfo.port}
            </span>
          </div>

          {/* Status Indicators */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {isPaused && (
              <span
                style={{
                  backgroundColor: '#78350F',
                  color: '#FDE68A',
                  fontSize: '10px',
                  fontWeight: 800,
                  padding: '2px 6px',
                  borderRadius: '4px',
                  letterSpacing: '0.5px',
                }}
              >
                PAUSED
              </span>
            )}
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: '11px',
                color: '#8B949E',
              }}
            >
              Showing {filteredMessages.length} / {messages.length} frames
            </span>
          </div>
        </div>

        {/* Terminal Message Stream Body */}
        <div
          ref={terminalStreamRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          {filteredMessages.length === 0 ? (
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#8B949E',
                gap: '12px',
                textAlign: 'center',
                padding: '40px 20px',
              }}
            >
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  backgroundColor: '#161B22',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid #30363D',
                }}
              >
                <Radio size={24} color="#58A6FF" />
              </div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#C9D1D9' }}>
                Awaiting Incoming MQTT Telemetry...
              </div>
              <div style={{ fontSize: '12px', color: '#8B949E', maxWidth: '480px', lineHeight: '18px' }}>
                Subscribed to topic <code style={{ color: '#58A6FF' }}>{selectedDeviceUid === 'ALL' ? '#' : selectedDeviceUid}</code> on{' '}
                <code style={{ color: '#58A6FF' }}>{brokerInfo.host}:{brokerInfo.port}</code>.
                <br />
                Transmit a packet from WLI Node hardware or MQTT.fx to view live decoded frames with ms precision.
              </div>
            </div>
          ) : (
            filteredMessages.map((msg, index) => {
              const isExpanded = expandedIds.has(msg.id) || index === filteredMessages.length - 1;
              const viewMode = viewModes[msg.id] || 'pretty';
              const p = msg.parsedJson || {};
              const fullFormattedLog = formatMqttMessageBlock(msg);

              return (
                <div
                  key={msg.id}
                  style={{
                    backgroundColor: '#161B22',
                    borderRadius: '6px',
                    border: '1px solid #30363D',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    transition: 'border-color 0.15s ease',
                  }}
                >
                  {/* Message Frame Header Bar */}
                  <div
                    style={{
                      backgroundColor: '#21262D',
                      padding: '8px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '8px',
                      borderBottom: isExpanded ? '1px solid #30363D' : 'none',
                    }}
                  >
                    {/* Left: Standard Header Line matching specification */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span
                        style={{
                          color: '#3FB950',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                        title="Incoming MQTT Frame"
                      >
                        <ArrowDownLeft size={15} />
                      </span>

                      {/* Header matching exact requested pattern: [YYYY-MM-DD HH:mm:ss.SSS] MQTT MESSAGE RECEIVED */}
                      <span
                        style={{
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                          fontSize: '12px',
                          fontWeight: 700,
                          color: '#58A6FF',
                        }}
                      >
                        [{msg.receivedAtFormatted}] MQTT MESSAGE RECEIVED
                      </span>

                      {/* QoS Badge */}
                      <span
                        style={{
                          backgroundColor: '#161B22',
                          color: '#8B949E',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          fontSize: '10px',
                          border: '1px solid #30363D',
                        }}
                      >
                        QoS {msg.qos}
                      </span>

                      {/* Size in Bytes */}
                      <span
                        style={{
                          color: '#8B949E',
                          fontSize: '11px',
                          fontFamily: 'monospace',
                        }}
                      >
                        {msg.payloadSize} B
                      </span>
                    </div>

                    {/* Right: Copy & Toggle Actions */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {/* Copy Complete Log */}
                      <button
                        onClick={() => handleCopy(fullFormattedLog, `log-${msg.id}`)}
                        title="Copy complete formatted MQTT block"
                        style={{
                          backgroundColor: '#30363D',
                          color: copyFeedback === `log-${msg.id}` ? '#3FB950' : '#C9D1D9',
                          border: 'none',
                          borderRadius: '4px',
                          padding: '3px 8px',
                          fontSize: '11px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        {copyFeedback === `log-${msg.id}` ? <Check size={12} /> : <Copy size={12} />}
                        {copyFeedback === `log-${msg.id}` ? 'Copied Log' : 'Copy Log'}
                      </button>

                      {/* View Format Toggle (Pretty / Raw) */}
                      <button
                        onClick={() => toggleViewMode(msg.id)}
                        title="Toggle Pretty JSON / Raw text"
                        style={{
                          backgroundColor: '#30363D',
                          color: '#C9D1D9',
                          border: 'none',
                          borderRadius: '4px',
                          padding: '3px 8px',
                          fontSize: '11px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        {viewMode === 'raw' ? <Code2 size={12} /> : <FileText size={12} />}
                        {viewMode === 'raw' ? 'Raw' : 'Pretty'}
                      </button>

                      {/* Copy JSON */}
                      <button
                        onClick={() => handleCopy(msg.payloadString, `json-${msg.id}`)}
                        title="Copy raw JSON payload"
                        style={{
                          backgroundColor: '#30363D',
                          color: copyFeedback === `json-${msg.id}` ? '#3FB950' : '#C9D1D9',
                          border: 'none',
                          borderRadius: '4px',
                          padding: '3px 8px',
                          fontSize: '11px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        {copyFeedback === `json-${msg.id}` ? <Check size={12} /> : <Copy size={12} />}
                        {copyFeedback === `json-${msg.id}` ? 'Copied JSON' : 'Copy JSON'}
                      </button>

                      {/* Copy Topic */}
                      <button
                        onClick={() => handleCopy(msg.topic, `top-${msg.id}`)}
                        title="Copy MQTT topic"
                        style={{
                          backgroundColor: '#30363D',
                          color: copyFeedback === `top-${msg.id}` ? '#3FB950' : '#8B949E',
                          border: 'none',
                          borderRadius: '4px',
                          padding: '3px 6px',
                          fontSize: '11px',
                          cursor: 'pointer',
                        }}
                      >
                        {copyFeedback === `top-${msg.id}` ? '✓' : 'Topic'}
                      </button>

                      {/* Expand / Collapse Button */}
                      <button
                        onClick={() => toggleExpand(msg.id)}
                        title={isExpanded ? 'Collapse message' : 'Expand message'}
                        style={{
                          backgroundColor: 'transparent',
                          color: '#8B949E',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '2px 4px',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* Body (Expanded View) */}
                  {isExpanded && (
                    <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {/* TOPIC SECTION */}
                      <div>
                        <div
                          style={{
                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                            fontSize: '11px',
                            fontWeight: 700,
                            color: '#8B949E',
                            letterSpacing: '0.8px',
                            marginBottom: '4px',
                          }}
                        >
                          TOPIC:
                        </div>
                        <div
                          style={{
                            backgroundColor: '#0D1117',
                            border: '1px solid #30363D',
                            borderRadius: '4px',
                            padding: '6px 10px',
                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                            fontSize: '12px',
                            color: '#A5B4FC',
                            fontWeight: 600,
                          }}
                        >
                          {msg.topic}
                        </div>
                      </div>

                      {/* Telemetry Highlights (Pill Summary Bar) */}
                      {msg.isJson && p && (p.bat !== undefined || p.lat !== undefined || p.cm1 !== undefined || p.wlp1 !== undefined) && (
                        <div
                          style={{
                            backgroundColor: '#0D1117',
                            border: '1px solid #21262D',
                            borderRadius: '6px',
                            padding: '6px 10px',
                            display: 'flex',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '8px',
                          }}
                        >
                          {p.bat !== undefined && (
                            <span
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '11px',
                                color: p.bat > 20 ? '#3FB950' : '#F85149',
                                fontFamily: 'monospace',
                              }}
                            >
                              <Battery size={13} />
                              Battery: {p.bat}%
                            </span>
                          )}

                          {p.temp !== undefined && (
                            <span style={{ fontSize: '11px', color: '#E3B341', fontFamily: 'monospace' }}>
                              Temp: {p.temp}°C
                            </span>
                          )}

                          {p.lat !== undefined && p.long !== undefined && (
                            <span
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '11px',
                                color: '#58A6FF',
                                fontFamily: 'monospace',
                              }}
                            >
                              <MapPin size={12} />
                              GPS: {p.lat}, {p.long}
                            </span>
                          )}

                          {p.speed !== undefined && (
                            <span style={{ fontSize: '11px', color: '#D2A8FF', fontFamily: 'monospace' }}>
                              Speed: {p.speed} km/h
                            </span>
                          )}

                          {(p.cm1 !== undefined || p.wlp1 !== undefined) && (
                            <span style={{ fontSize: '11px', color: '#79C0FF', fontFamily: 'monospace' }}>
                              Tank 1: {p.cm1 ?? 0} cm ({p.wlp1 ?? 0}%)
                            </span>
                          )}

                          {(p.cm2 !== undefined || p.wlp2 !== undefined) && (
                            <span style={{ fontSize: '11px', color: '#7EE787', fontFamily: 'monospace' }}>
                              Tank 2: {p.cm2 ?? 0} cm ({p.wlp2 ?? 0}%)
                            </span>
                          )}

                          {(p.trno || p.chno) && (
                            <span style={{ fontSize: '11px', color: '#FFA657', fontFamily: 'monospace' }}>
                              Train: {p.trno || '—'} / Coach: {p.chno || '—'}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Malformed JSON Indicator if applicable */}
                      {!msg.isJson && (
                        <div
                          style={{
                            backgroundColor: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid #EF4444',
                            borderRadius: '6px',
                            padding: '6px 10px',
                            fontSize: '11px',
                            color: '#F87171',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                          }}
                        >
                          <AlertTriangle size={14} color="#EF4444" />
                          <span>WARNING: Payload is not valid JSON ({msg.error || 'Parsing failed'}). Displaying raw string stream.</span>
                        </div>
                      )}

                      {/* PAYLOAD SECTION */}
                      <div>
                        <div
                          style={{
                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                            fontSize: '11px',
                            fontWeight: 700,
                            color: '#8B949E',
                            letterSpacing: '0.8px',
                            marginBottom: '4px',
                          }}
                        >
                          PAYLOAD:
                        </div>
                        <div
                          style={{
                            backgroundColor: '#0D1117',
                            border: '1px solid #30363D',
                            borderRadius: '6px',
                            padding: '10px 12px',
                            overflowX: 'auto',
                          }}
                        >
                          {viewMode === 'pretty' && msg.isJson && msg.parsedJson ? (
                            <JsonSyntaxViewer
                              data={msg.parsedJson}
                              onCopyValue={(key, val) => handleCopy(String(val), `val-${key}`)}
                            />
                          ) : (
                            <pre
                              style={{
                                margin: 0,
                                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                                fontSize: '12px',
                                lineHeight: '18px',
                                color: '#7EE787',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-all',
                              }}
                            >
                              {msg.payloadString}
                            </pre>
                          )}
                        </div>
                      </div>
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

export const RawDataScreen = MqttMonitorScreen;
