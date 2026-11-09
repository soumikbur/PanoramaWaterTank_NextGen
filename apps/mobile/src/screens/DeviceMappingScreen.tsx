import React, { useState, useMemo } from 'react';
import { useApp } from '../state/AppContext';
import { deviceRegistry, ManagedDevice, DeviceOperationalStatus } from '../services/deviceRegistry';
import {
  Cpu,
  Plus,
  Search,
  CheckCircle2,
  AlertTriangle,
  Battery,
  BatteryCharging,
  BatteryWarning,
  Link2,
  Unlink,
  X,
  Radio,
  Clock,
  Train,
  Layers,
  Copy,
  Check,
  RefreshCw,
  Trash2,
  Sliders,
  ExternalLink,
} from 'lucide-react';

type FilterTab = 'ALL' | 'DISCOVERED' | 'REGISTERED' | 'ENGAGED' | 'AVAILABLE' | 'OFFLINE';

export const DeviceMappingScreen: React.FC = () => {
  const {
    managedDevices,
    liveTelemetry,
    mqttBrokerStatus,
    setActiveScreen,
    setSelectedTrainNumber,
    setSelectedCoachNumber,
    telemetryTimeoutSeconds,
    setTelemetryTimeoutSeconds,
    consistMetrics,
  } = useApp();

  const [activeTab, setActiveTab] = useState<FilterTab>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedUid, setCopiedUid] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  // Modals state
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [targetDevice, setTargetDevice] = useState<ManagedDevice | null>(null);

  // Form states for Map Modal
  const [trainNumberInput, setTrainNumberInput] = useState('');
  const [coachNumberInput, setCoachNumberInput] = useState('');
  const [deviceNameInput, setDeviceNameInput] = useState('');
  const [hardwareModelInput, setHardwareModelInput] = useState('WLI EC200U-CN');

  // Form states for Manual Register Modal
  const [manualUid, setManualUid] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualTrain, setManualTrain] = useState('');
  const [manualCoach, setManualCoach] = useState('');
  const [manualModel, setManualModel] = useState('WLI EC200U-CN');

  const now = Date.now();
  const timeoutMs = (telemetryTimeoutSeconds || 120) * 1000;
  const isDevOnline = (dev: ManagedDevice) =>
    Boolean(dev.lastSeenTimestamp && now - dev.lastSeenTimestamp <= timeoutMs);

  // Metrics calculation
  const totalCount = managedDevices.length;
  const discoveredCount = managedDevices.filter((d) => d.registrationStatus === 'DISCOVERED').length;
  const registeredCount = managedDevices.filter((d) => d.registrationStatus === 'REGISTERED').length;
  const engagedCount = managedDevices.filter((d) => d.assignmentStatus === 'ENGAGED').length;
  const availableCount = managedDevices.filter((d) => d.assignmentStatus === 'AVAILABLE' && d.registrationStatus === 'REGISTERED').length;
  const offlineCount = managedDevices.filter((d) => !isDevOnline(d)).length;

  // Filtered devices list
  const filteredDevices = useMemo(() => {
    return managedDevices.filter((dev) => {
      // Tab filter
      if (activeTab === 'DISCOVERED' && dev.registrationStatus !== 'DISCOVERED') return false;
      if (activeTab === 'REGISTERED' && dev.registrationStatus !== 'REGISTERED') return false;
      if (activeTab === 'ENGAGED' && dev.assignmentStatus !== 'ENGAGED') return false;
      if (activeTab === 'AVAILABLE' && (dev.assignmentStatus !== 'AVAILABLE' || dev.registrationStatus !== 'REGISTERED')) return false;
      if (activeTab === 'OFFLINE' && isDevOnline(dev)) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchUid = dev.uid.toLowerCase().includes(q);
        const matchName = dev.name.toLowerCase().includes(q);
        const matchTrain = dev.trainNumber ? dev.trainNumber.toLowerCase().includes(q) : false;
        const matchCoach = dev.coachNumber ? dev.coachNumber.toLowerCase().includes(q) : false;
        const matchModel = dev.hardwareModel.toLowerCase().includes(q);
        if (!matchUid && !matchName && !matchTrain && !matchCoach && !matchModel) return false;
      }
      return true;
    });
  }, [managedDevices, activeTab, searchQuery]);

  const handleCopyUid = (uid: string) => {
    navigator.clipboard.writeText(uid);
    setCopiedUid(uid);
    setTimeout(() => setCopiedUid(null), 2000);
  };

  const handleOpenMapModal = (dev: ManagedDevice) => {
    setTargetDevice(dev);
    setTrainNumberInput(dev.trainNumber || dev.payloadTrno || '225256');
    setCoachNumberInput(dev.coachNumber || dev.payloadChno || 'CR123456');
    setDeviceNameInput(dev.name || `Coach ${dev.payloadChno || 'CR123456'} Sensor`);
    setHardwareModelInput(dev.hardwareModel || 'WLI EC200U-CN');
    setIsMapModalOpen(true);
  };

  const handleApplyDetectedConsist = () => {
    if (targetDevice?.payloadTrno) setTrainNumberInput(targetDevice.payloadTrno);
    if (targetDevice?.payloadChno) setCoachNumberInput(targetDevice.payloadChno);
  };

  const handleConfirmMapping = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetDevice) return;

    const tr = trainNumberInput.trim();
    const ch = coachNumberInput.trim();

    if (!tr || !ch) {
      alert('Please specify both Train Number and Coach Number to complete consist mapping.');
      return;
    }

    deviceRegistry.registerDevice(targetDevice.uid, {
      name: deviceNameInput.trim() || `Coach ${ch} Sensor`,
      trainNumber: tr,
      coachNumber: ch,
      hardwareModel: hardwareModelInput,
    });

    setIsMapModalOpen(false);
    setActionFeedback(`Device ${targetDevice.uid.slice(-6)} mapped to Train ${tr}, Coach ${ch}.`);
    setTimeout(() => setActionFeedback(null), 4000);
  };

  const handleUnmapDevice = (dev: ManagedDevice) => {
    if (!window.confirm(`Unassign device ${dev.uid} from Train ${dev.trainNumber}, Coach ${dev.coachNumber}? It will be returned to the Available Pool.`)) {
      return;
    }
    deviceRegistry.unassignDevice(dev.uid);
    setActionFeedback(`Device ${dev.uid.slice(-6)} unmapped and returned to Free Available Pool.`);
    setTimeout(() => setActionFeedback(null), 4000);
  };

  const handleDeleteDevice = (dev: ManagedDevice) => {
    if (!window.confirm(`Delete device ${dev.uid} from the system registry?`)) {
      return;
    }
    deviceRegistry.deleteDevice(dev.uid);
    setActionFeedback(`Device ${dev.uid.slice(-6)} removed from registry.`);
    setTimeout(() => setActionFeedback(null), 4000);
  };

  const handleManualRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualUid.trim()) {
      alert('Please enter a valid Device UID.');
      return;
    }

    deviceRegistry.registerDevice(manualUid.trim(), {
      name: manualName.trim() || `Node (${manualUid.trim().slice(-6)})`,
      trainNumber: manualTrain.trim() || null,
      coachNumber: manualCoach.trim() || null,
      hardwareModel: manualModel,
    });

    setIsRegisterModalOpen(false);
    setManualUid('');
    setManualName('');
    setManualTrain('');
    setManualCoach('');
    setActionFeedback(`Device ${manualUid.trim()} registered successfully.`);
    setTimeout(() => setActionFeedback(null), 4000);
  };

  const getOperationalStatus = (dev: ManagedDevice): DeviceOperationalStatus => {
    if (!dev.isOnline) return 'OFFLINE';
    if (dev.registrationStatus === 'DISCOVERED') return 'DISCOVERED';
    if (dev.assignmentStatus === 'ENGAGED') return 'ENGAGED';
    return 'AVAILABLE';
  };

  const renderStatusBadge = (status: DeviceOperationalStatus) => {
    switch (status) {
      case 'DISCOVERED':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '3px 8px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 700,
              backgroundColor: '#FAF5FF',
              color: '#7E22CE',
              border: '1px solid #E9D5FF',
            }}
          >
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#9333EA' }} />
            Discovered
          </span>
        );
      case 'ENGAGED':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '3px 8px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 700,
              backgroundColor: '#F0FDF4',
              color: '#15803D',
              border: '1px solid #BBF7D0',
            }}
          >
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#16A34A' }} />
            Engaged
          </span>
        );
      case 'AVAILABLE':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '3px 8px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 700,
              backgroundColor: '#F0FDFA',
              color: '#0F766E',
              border: '1px solid #99F6E4',
            }}
          >
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#0D9488' }} />
            Available
          </span>
        );
      case 'REGISTERED':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '3px 8px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 700,
              backgroundColor: '#EFF6FF',
              color: '#1D4ED8',
              border: '1px solid #BFDBFE',
            }}
          >
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#2563EB' }} />
            Registered
          </span>
        );
      case 'OFFLINE':
      default:
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '3px 8px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 700,
              backgroundColor: '#FEF2F2',
              color: '#B91C1C',
              border: '1px solid #FECACA',
            }}
          >
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#DC2626' }} />
            Offline
          </span>
        );
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        width: '100%',
        minWidth: 0,
        boxSizing: 'border-box',
      }}
    >
      {/* 1. Breadcrumbs and Title Header */}
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
          <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>Train Management</span>
            <span>&rsaquo;</span>
            <span style={{ color: '#0F172A' }}>Devices</span>
          </div>
          <h1 style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A', margin: '4px 0 2px 0' }}>
            Device Management & MQTT Auto-Discovery
          </h1>
          <div style={{ fontSize: '12px', color: '#64748B' }}>
            Industrial SCADA Node Registry & Telemetry Mapping
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              backgroundColor: '#FFFFFF',
              borderRadius: '6px',
              border: '1px solid #E2E8F0',
              fontSize: '12px',
              color: '#334155',
            }}
          >
            <Clock size={14} color="#2563EB" />
            <span>Timeout:</span>
            <select
              value={telemetryTimeoutSeconds}
              onChange={(e) => setTelemetryTimeoutSeconds(Number(e.target.value))}
              style={{
                fontSize: '12px',
                fontWeight: 700,
                color: '#2563EB',
                border: 'none',
                backgroundColor: 'transparent',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value={30}>30s</option>
              <option value={60}>60s</option>
              <option value={120}>120s (Default)</option>
              <option value={180}>180s</option>
              <option value={300}>300s (5m)</option>
            </select>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 12px',
              backgroundColor: '#FFFFFF',
              borderRadius: '6px',
              border: '1px solid #E2E8F0',
              fontSize: '12px',
              color: '#334155',
            }}
          >
            <Radio size={14} color={mqttBrokerStatus === 'CONNECTED' ? '#16A34A' : '#DC2626'} />
            <span>Broker: <strong>{mqttBrokerStatus === 'CONNECTED' ? 'Online' : 'Reconnecting'}</strong></span>
          </div>

          <button
            onClick={() => setIsRegisterModalOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              backgroundColor: '#2563EB',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Plus size={16} />
            <span>Register New Device</span>
          </button>
        </div>
      </div>

      {/* 2. Action Feedback Alert */}
      {actionFeedback && (
        <div
          style={{
            backgroundColor: '#F0FDF4',
            border: '1px solid #86EFAC',
            color: '#166534',
            borderRadius: '6px',
            padding: '10px 14px',
            fontSize: '12px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>{actionFeedback}</span>
          <button
            onClick={() => setActionFeedback(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#166534' }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* 3. Summary Statistics Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '12px',
        }}
      >
        <div style={{ backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '14px 16px' }}>
          <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>Total Devices</div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>{totalCount}</div>
          <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>Discovered + Registered</div>
        </div>

        <div style={{ backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '14px 16px' }}>
          <div style={{ fontSize: '11px', color: '#7E22CE', fontWeight: 600, textTransform: 'uppercase' }}>Discovered</div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#7E22CE', marginTop: '4px' }}>{discoveredCount}</div>
          <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>Awaiting formal mapping</div>
        </div>

        <div style={{ backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '14px 16px' }}>
          <div style={{ fontSize: '11px', color: '#2563EB', fontWeight: 600, textTransform: 'uppercase' }}>Registered</div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#2563EB', marginTop: '4px' }}>{registeredCount}</div>
          <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>Administrator authorized</div>
        </div>

        <div style={{ backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '14px 16px' }}>
          <div style={{ fontSize: '11px', color: '#16A34A', fontWeight: 600, textTransform: 'uppercase' }}>Engaged</div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#16A34A', marginTop: '4px' }}>{engagedCount}</div>
          <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>Mapped to Train & Coach</div>
        </div>

        <div style={{ backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '14px 16px' }}>
          <div style={{ fontSize: '11px', color: '#0D9488', fontWeight: 600, textTransform: 'uppercase' }}>Available</div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#0D9488', marginTop: '4px' }}>{availableCount}</div>
          <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>Ready for consist assignment</div>
        </div>

        <div style={{ backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '14px 16px' }}>
          <div style={{ fontSize: '11px', color: '#DC2626', fontWeight: 600, textTransform: 'uppercase' }}>Offline Nodes</div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#DC2626', marginTop: '4px' }}>{offlineCount}</div>
          <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>No telemetry {'>'} {telemetryTimeoutSeconds}s</div>
        </div>

        <div style={{ backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '14px 16px' }}>
          <div style={{ fontSize: '11px', color: '#2563EB', fontWeight: 600, textTransform: 'uppercase' }}>Consist Tanks</div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: consistMetrics.onlineTanks > 0 ? '#16A34A' : '#0F172A', marginTop: '4px' }}>
            {consistMetrics.onlineTanks} / {consistMetrics.totalTanks}
          </div>
          <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>{consistMetrics.offlineTanks} offline ({consistMetrics.unmappedTanks} unmapped)</div>
        </div>
      </div>

      {/* 4. Filter Tabs and Search Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          backgroundColor: '#FFFFFF',
          borderRadius: '8px',
          border: '1px solid #E2E8F0',
          padding: '8px 12px',
        }}
      >
        {/* 6 Filter Tabs */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          <button
            onClick={() => setActiveTab('ALL')}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
              backgroundColor: activeTab === 'ALL' ? '#2563EB' : '#F1F5F9',
              color: activeTab === 'ALL' ? '#FFFFFF' : '#475569',
            }}
          >
            All Devices ({totalCount})
          </button>

          <button
            onClick={() => setActiveTab('DISCOVERED')}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
              backgroundColor: activeTab === 'DISCOVERED' ? '#7E22CE' : '#F1F5F9',
              color: activeTab === 'DISCOVERED' ? '#FFFFFF' : '#475569',
            }}
          >
            Discovered ({discoveredCount})
          </button>

          <button
            onClick={() => setActiveTab('REGISTERED')}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
              backgroundColor: activeTab === 'REGISTERED' ? '#2563EB' : '#F1F5F9',
              color: activeTab === 'REGISTERED' ? '#FFFFFF' : '#475569',
            }}
          >
            Registered ({registeredCount})
          </button>

          <button
            onClick={() => setActiveTab('ENGAGED')}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
              backgroundColor: activeTab === 'ENGAGED' ? '#16A34A' : '#F1F5F9',
              color: activeTab === 'ENGAGED' ? '#FFFFFF' : '#475569',
            }}
          >
            Engaged ({engagedCount})
          </button>

          <button
            onClick={() => setActiveTab('AVAILABLE')}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
              backgroundColor: activeTab === 'AVAILABLE' ? '#0D9488' : '#F1F5F9',
              color: activeTab === 'AVAILABLE' ? '#FFFFFF' : '#475569',
            }}
          >
            Available ({availableCount})
          </button>

          <button
            onClick={() => setActiveTab('OFFLINE')}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
              backgroundColor: activeTab === 'OFFLINE' ? '#DC2626' : '#F1F5F9',
              color: activeTab === 'OFFLINE' ? '#FFFFFF' : '#475569',
            }}
          >
            Offline ({offlineCount})
          </button>
        </div>

        {/* Search Input */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: '#F8FAFC',
            borderRadius: '6px',
            border: '1px solid #CBD5E1',
            padding: '5px 10px',
            minWidth: '240px',
          }}
        >
          <Search size={14} color="#64748B" />
          <input
            type="text"
            placeholder="Search by UID, Train, Coach..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              border: 'none',
              outline: 'none',
              backgroundColor: 'transparent',
              fontSize: '12px',
              width: '100%',
              color: '#0F172A',
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8' }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* 5. 8-Column SCADA Table */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '8px',
          border: '1px solid #E2E8F0',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '950px' }}>
            <thead>
              <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                <th style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  UID
                </th>
                <th style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Train
                </th>
                <th style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Coach
                </th>
                <th style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Battery
                </th>
                <th style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Tank 1
                </th>
                <th style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Tank 2
                </th>
                <th style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Status
                </th>
                <th style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Last Seen
                </th>
                <th style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'right' }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredDevices.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: '40px 16px', textAlign: 'center', color: '#64748B' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                      <Radio size={28} color="#94A3B8" />
                      <div style={{ fontSize: '14px', fontWeight: 600, color: '#334155' }}>
                        No devices found matching filter "{activeTab}"
                      </div>
                      <div style={{ fontSize: '12px', color: '#94A3B8', maxWidth: '400px' }}>
                        Devices broadcasting on MQTT topic <code>0023004D4B42501120353332</code> will appear automatically under Discovered.
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredDevices.map((dev) => {
                  const status = getOperationalStatus(dev);
                  const isCopied = copiedUid === dev.uid;

                  return (
                    <tr
                      key={dev.uid}
                      style={{
                        borderBottom: '1px solid #F1F5F9',
                        transition: 'background-color 0.15s ease',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F8FAFC')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      {/* Column 1: UID */}
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span
                            style={{
                              fontFamily: 'SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                              fontSize: '12px',
                              fontWeight: 700,
                              color: '#0F172A',
                              backgroundColor: '#F1F5F9',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              border: '1px solid #E2E8F0',
                            }}
                          >
                            {dev.uid}
                          </span>
                          <button
                            onClick={() => handleCopyUid(dev.uid)}
                            title="Copy UID"
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              padding: '2px',
                              color: isCopied ? '#16A34A' : '#94A3B8',
                            }}
                          >
                            {isCopied ? <Check size={14} /> : <Copy size={14} />}
                          </button>
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
                          {dev.name} &bull; {dev.hardwareModel}
                        </div>
                      </td>

                      {/* Column 2: Train */}
                      <td style={{ padding: '12px 14px' }}>
                        {dev.trainNumber ? (
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              backgroundColor: '#EFF6FF',
                              border: '1px solid #BFDBFE',
                              color: '#1E40AF',
                              fontWeight: 700,
                              fontSize: '12px',
                            }}
                          >
                            {dev.trainNumber}
                          </span>
                        ) : (
                          <span style={{ color: '#94A3B8', fontStyle: 'italic', fontSize: '12px' }}>
                            &mdash; Unassigned &mdash;
                          </span>
                        )}
                      </td>

                      {/* Column 3: Coach */}
                      <td style={{ padding: '12px 14px' }}>
                        {dev.coachNumber ? (
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              backgroundColor: '#F8FAFC',
                              border: '1px solid #CBD5E1',
                              color: '#0F172A',
                              fontWeight: 700,
                              fontSize: '12px',
                            }}
                          >
                            {dev.coachNumber}
                          </span>
                        ) : (
                          <span style={{ color: '#94A3B8', fontStyle: 'italic', fontSize: '12px' }}>
                            &mdash; Unassigned &mdash;
                          </span>
                        )}
                      </td>

                      {/* Column 4: Battery */}
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Battery
                            size={16}
                            color={
                              dev.batteryPercent > 50
                                ? '#16A34A'
                                : dev.batteryPercent > 20
                                ? '#D97706'
                                : '#DC2626'
                            }
                          />
                          <span style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A' }}>
                            {dev.batteryPercent.toFixed(1)}%
                          </span>
                        </div>
                        <div
                          style={{
                            width: '60px',
                            height: '4px',
                            backgroundColor: '#E2E8F0',
                            borderRadius: '2px',
                            marginTop: '4px',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: `${Math.min(100, Math.max(0, dev.batteryPercent))}%`,
                              height: '100%',
                              backgroundColor:
                                dev.batteryPercent > 50
                                  ? '#16A34A'
                                  : dev.batteryPercent > 20
                                  ? '#D97706'
                                  : '#DC2626',
                            }}
                          />
                        </div>
                      </td>

                      {/* Column 5: Tank 1 */}
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A' }}>
                          {dev.tank1Level != null ? `${dev.tank1Level.toFixed(1)}%` : '—'}
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748B' }}>
                          {dev.tank1HeightCm != null ? `${dev.tank1HeightCm.toFixed(1)} cm` : '—'}
                          {dev.valve1Normal ? (
                            <span style={{ color: '#16A34A', marginLeft: '4px' }}>&bull; Valve OK</span>
                          ) : (
                            <span style={{ color: '#DC2626', marginLeft: '4px' }}>&bull; Valve Alert</span>
                          )}
                        </div>
                      </td>

                      {/* Column 6: Tank 2 */}
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A' }}>
                          {dev.tank2Level != null ? `${dev.tank2Level.toFixed(1)}%` : '—'}
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748B' }}>
                          {dev.tank2HeightCm != null ? `${dev.tank2HeightCm.toFixed(1)} cm` : '—'}
                          {dev.valve2Normal ? (
                            <span style={{ color: '#16A34A', marginLeft: '4px' }}>&bull; Valve OK</span>
                          ) : (
                            <span style={{ color: '#DC2626', marginLeft: '4px' }}>&bull; Valve Alert</span>
                          )}
                        </div>
                      </td>

                      {/* Column 7: Status */}
                      <td style={{ padding: '12px 14px' }}>
                        {renderStatusBadge(status)}
                      </td>

                      {/* Column 8: Last Seen */}
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {isDevOnline(dev) && (
                            <span
                              style={{
                                width: '6px',
                                height: '6px',
                                borderRadius: '50%',
                                backgroundColor: '#16A34A',
                              }}
                            />
                          )}
                          <span style={{ fontSize: '12px', color: '#334155', fontWeight: 600 }}>
                            {dev.lastSeen || 'Awaiting stream'}
                          </span>
                        </div>
                        <div style={{ fontSize: '10px', color: '#94A3B8' }}>
                          {dev.speedKmh != null ? `${dev.speedKmh.toFixed(1)} km/h` : 'Stationary'}
                        </div>
                      </td>

                      {/* Column 9: Actions */}
                      <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                          {dev.registrationStatus === 'DISCOVERED' ? (
                            <button
                              onClick={() => handleOpenMapModal(dev)}
                              style={{
                                padding: '5px 10px',
                                backgroundColor: '#2563EB',
                                color: '#FFFFFF',
                                border: 'none',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              Register & Map
                            </button>
                          ) : dev.assignmentStatus === 'AVAILABLE' ? (
                            <button
                              onClick={() => handleOpenMapModal(dev)}
                              style={{
                                padding: '5px 10px',
                                backgroundColor: '#0D9488',
                                color: '#FFFFFF',
                                border: 'none',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              Assign Consist
                            </button>
                          ) : (
                            <>
                              <button
                                onClick={() => handleOpenMapModal(dev)}
                                title="Edit Train/Coach Mapping"
                                style={{
                                  padding: '5px 8px',
                                  backgroundColor: '#F1F5F9',
                                  color: '#334155',
                                  border: '1px solid #CBD5E1',
                                  borderRadius: '4px',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                }}
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleUnmapDevice(dev)}
                                title="Unassign from Consist"
                                style={{
                                  padding: '5px 8px',
                                  backgroundColor: '#FEF2F2',
                                  color: '#DC2626',
                                  border: '1px solid #FECACA',
                                  borderRadius: '4px',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                }}
                              >
                                Unmap
                              </button>
                            </>
                          )}

                          <button
                            onClick={() => handleDeleteDevice(dev)}
                            title="Delete Device"
                            style={{
                              padding: '5px',
                              backgroundColor: 'transparent',
                              border: 'none',
                              color: '#94A3B8',
                              cursor: 'pointer',
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL 1: Map / Register Device to Consist */}
      {isMapModalOpen && targetDevice && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.55)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px',
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '8px',
              border: '1px solid #E2E8F0',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              width: '100%',
              maxWidth: '480px',
              padding: '24px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  Map Device to Railway Consist
                </h2>
                <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
                  Assign hardware node to operational train & coach
                </div>
              </div>
              <button
                onClick={() => setIsMapModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Detected Telemetry Suggestion Banner */}
            {(targetDevice.payloadTrno || targetDevice.payloadChno) && (
              <div
                style={{
                  backgroundColor: '#EFF6FF',
                  border: '1px solid #BFDBFE',
                  borderRadius: '6px',
                  padding: '10px 12px',
                  marginBottom: '16px',
                }}
              >
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#1E40AF', textTransform: 'uppercase' }}>
                  Telemetry Stream Association
                </div>
                <div style={{ fontSize: '12px', color: '#1E3A8A', margin: '4px 0 8px 0' }}>
                  Detected from MQTT frames: <strong>Train {targetDevice.payloadTrno || '—'}</strong>, <strong>Coach {targetDevice.payloadChno || '—'}</strong>
                </div>
                <button
                  type="button"
                  onClick={handleApplyDetectedConsist}
                  style={{
                    padding: '4px 8px',
                    backgroundColor: '#2563EB',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Use Detected Consist ({targetDevice.payloadTrno} / {targetDevice.payloadChno})
                </button>
              </div>
            )}

            <form onSubmit={handleConfirmMapping} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '4px' }}>
                  Hardware UID (Read-only)
                </label>
                <input
                  type="text"
                  value={targetDevice.uid}
                  disabled
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid #E2E8F0',
                    backgroundColor: '#F8FAFC',
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    color: '#0F172A',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '4px' }}>
                    Train Number *
                  </label>
                  <input
                    type="text"
                    required
                    value={trainNumberInput}
                    onChange={(e) => setTrainNumberInput(e.target.value)}
                    placeholder="e.g. 225256"
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      border: '1px solid #CBD5E1',
                      fontSize: '12px',
                      color: '#0F172A',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '4px' }}>
                    Coach Number *
                  </label>
                  <input
                    type="text"
                    required
                    value={coachNumberInput}
                    onChange={(e) => setCoachNumberInput(e.target.value)}
                    placeholder="e.g. CR123456"
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      border: '1px solid #CBD5E1',
                      fontSize: '12px',
                      color: '#0F172A',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '4px' }}>
                  Device Name
                </label>
                <input
                  type="text"
                  value={deviceNameInput}
                  onChange={(e) => setDeviceNameInput(e.target.value)}
                  placeholder="e.g. Coach CR123456 Primary WLI"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    fontSize: '12px',
                    color: '#0F172A',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '4px' }}>
                  Hardware Model
                </label>
                <input
                  type="text"
                  value={hardwareModelInput}
                  onChange={(e) => setHardwareModelInput(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    fontSize: '12px',
                    color: '#0F172A',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setIsMapModalOpen(false)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '6px',
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
                  type="submit"
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: '#2563EB',
                    color: '#FFFFFF',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Confirm & Engage
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Manual Device Registration */}
      {isRegisterModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.55)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px',
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '8px',
              border: '1px solid #E2E8F0',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              width: '100%',
              maxWidth: '480px',
              padding: '24px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  Register New Hardware Device
                </h2>
                <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
                  Add a provisioned WLI telemetry node to the registry
                </div>
              </div>
              <button
                onClick={() => setIsRegisterModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleManualRegisterSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '4px' }}>
                  Hardware UID *
                </label>
                <input
                  type="text"
                  required
                  value={manualUid}
                  onChange={(e) => setManualUid(e.target.value)}
                  placeholder="e.g. 0023004D4B42501120353332"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    color: '#0F172A',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '4px' }}>
                  Device Name
                </label>
                <input
                  type="text"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder="e.g. Express WLI Gateway"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    fontSize: '12px',
                    color: '#0F172A',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '4px' }}>
                    Train Number (Optional)
                  </label>
                  <input
                    type="text"
                    value={manualTrain}
                    onChange={(e) => setManualTrain(e.target.value)}
                    placeholder="e.g. 225256"
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      border: '1px solid #CBD5E1',
                      fontSize: '12px',
                      color: '#0F172A',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '4px' }}>
                    Coach Number (Optional)
                  </label>
                  <input
                    type="text"
                    value={manualCoach}
                    onChange={(e) => setManualCoach(e.target.value)}
                    placeholder="e.g. CR123456"
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      border: '1px solid #CBD5E1',
                      fontSize: '12px',
                      color: '#0F172A',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '4px' }}>
                  Hardware Model
                </label>
                <input
                  type="text"
                  value={manualModel}
                  onChange={(e) => setManualModel(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    fontSize: '12px',
                    color: '#0F172A',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setIsRegisterModalOpen(false)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '6px',
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
                  type="submit"
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: '#2563EB',
                    color: '#FFFFFF',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Register Device
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
