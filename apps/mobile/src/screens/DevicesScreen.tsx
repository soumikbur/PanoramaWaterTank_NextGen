import React, { useState, useMemo, useEffect } from 'react';
import { colors, metrics, typography } from '../theme';
import { useApp } from '../state/AppContext';
import { ApiClient } from '../api/client';
import { BaseCard } from '../components/common/BaseCard';
import { InfoRow } from '../components/common/InfoRow';
import { RefreshCw, X, Plus, Edit3, Trash2, CheckCircle2, AlertCircle } from 'lucide-react';

export interface DeviceTelemetry {
  dbId: string;
  name: string;
  id: string;
  trainNumber: string;
  coachNumber: string;
  serialNumber: string;
  location: string;
  status: 'Online' | 'Offline' | 'Warning';
  connectionType: string;
  modemModel: string;
  signalQuality: string;
  ipAddress: string;
  waterLevel: number | null;
  waterHeightCm: number | null;
  tankHeightCm: number;
  volumeLiters: number | null;
  capacityLiters: number;
  sensorStatus: string;
  sensorType: string;
  gain: string;
  temperature: number | null;
  pressure: number | null;
  humidity: number | null;
  firmwareVersion: string;
  runtime: string;
  calibrationStatus: string;
  airBaseline: number;
  deadband: string;
  alarmState: string;
  lastUpdate: string;
  uploadInterval: string;
  isPrimary: boolean;
}

export const DevicesScreen: React.FC = () => {
  const { liveTank, devices, connectionStatus, currentTime, refreshData, currentUser, selectedDeviceId } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [connFilter, setConnFilter] = useState('All');
  const [selectedDevice, setSelectedDevice] = useState<DeviceTelemetry | null>(null);

  // Add / Edit Modal States
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [deviceToEdit, setDeviceToEdit] = useState<DeviceTelemetry | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  // Add Device Form (11 fields)
  const [addName, setAddName] = useState('Coach Water Monitor');
  const [addUid, setAddUid] = useState('');
  const [addDeviceType, setAddDeviceType] = useState('Quectel EC200U 4G LTE');
  const [addProtocol, setAddProtocol] = useState('MQTT over TLS/WSS (Port 8884)');
  const [addMqttClientId, setAddMqttClientId] = useState('');
  const [addMqttTopic, setAddMqttTopic] = useState('');
  const [addTrainNumber, setAddTrainNumber] = useState('12002');
  const [addCoachNumber, setAddCoachNumber] = useState('B1');
  const [addTankAssignment, setAddTankAssignment] = useState<'BOTH' | 'Tank 1' | 'Tank 2'>('BOTH');
  const [addDescription, setAddDescription] = useState('');
  const [addStatus, setAddStatus] = useState('AVAILABLE');

  // Edit Device Form
  const [editName, setEditName] = useState('');
  const [editTrainNumber, setEditTrainNumber] = useState('');
  const [editCoachNumber, setEditCoachNumber] = useState('');
  const [editDeviceType, setEditDeviceType] = useState('Quectel EC200U 4G LTE');
  const [editProtocol, setEditProtocol] = useState('MQTT over TLS/WSS (Port 8884)');
  const [editMqttClientId, setEditMqttClientId] = useState('');
  const [editMqttTopic, setEditMqttTopic] = useState('');
  const [editTankAssignment, setEditTankAssignment] = useState('BOTH');
  const [editDescription, setEditDescription] = useState('');
  const [editStatus, setEditStatus] = useState('AVAILABLE');
  const [editFirmwareVersion, setEditFirmwareVersion] = useState('2.0.0');

  // Live devices mapped strictly from registered backend database devices
  const allDevices: DeviceTelemetry[] = useMemo(() => {
    return devices.map((d, index) => {
      const isPrimary = index === 0;
      const liveLevel = isPrimary ? (liveTank?.levelPercent ?? d.primaryLevel ?? null) : (d.primaryLevel ?? null);
      const liveHeight = isPrimary ? (liveTank?.heightCm ?? null) : null;
      const liveMaxHeight = isPrimary ? (liveTank?.maxHeightCm ?? 50.0) : 50.0;
      const liveVol = isPrimary ? (liveTank?.volumeLiters ?? null) : null;
      const liveCap = isPrimary ? (liveTank?.capacityLiters ?? 20.0) : 20.0;
      const status: 'Online' | 'Offline' | 'Warning' = !d.isOnline
        ? 'Offline'
        : d.hasActiveAlarm || (liveLevel != null && (liveLevel < 20.0 || liveLevel >= 100.0))
        ? 'Warning'
        : 'Online';

      return {
        dbId: d.id,
        name: d.name || `Water Monitor (${d.trainNumber}/${d.coachNumber})`,
        id: d.uid,
        trainNumber: d.trainNumber || '12002',
        coachNumber: d.coachNumber || 'B4',
        serialNumber: d.uid,
        location: `Coach ${d.coachNumber} (Train ${d.trainNumber})`,
        status,
        connectionType: 'Cellular / MQTT',
        modemModel: 'Wireless Link / MQTT',
        signalQuality: d.isOnline ? 'Active Link' : 'No Signal',
        ipAddress: 'MQTT / Cellular',
        waterLevel: liveLevel,
        waterHeightCm: liveHeight,
        tankHeightCm: liveMaxHeight,
        volumeLiters: liveVol,
        capacityLiters: liveCap,
        sensorStatus: d.isOnline ? 'Operational' : 'Offline',
        sensorType: 'Hydrostatic Pressure (4-20mA)',
        gain: 'Standard Operating Range',
        temperature: liveTank?.temperature ?? null,
        pressure: liveTank?.pressure ?? null,
        humidity: null,
        firmwareVersion: d.firmwareVersion || '2.0.0',
        runtime: 'FreeRTOS / CMSIS',
        calibrationStatus: 'Calibrated',
        airBaseline: 0,
        deadband: '0.5 cm',
        alarmState: d.hasActiveAlarm ? 'ALERT_ACTIVE' : 'NORMAL',
        lastUpdate: d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleTimeString() : 'Awaiting Data',
        uploadInterval: '3 seconds',
        isPrimary,
      };
    });
  }, [devices, liveTank, connectionStatus]);

  useEffect(() => {
    if (selectedDeviceId && allDevices.length > 0) {
      const target = allDevices.find((d) => d.id === selectedDeviceId || d.dbId === selectedDeviceId || d.serialNumber === selectedDeviceId);
      if (target) {
        setSelectedDevice(target);
      }
    }
  }, [selectedDeviceId, allDevices]);

  const handleOpenAddModal = (presetTrain?: string, presetCoach?: string) => {
    const randomHex = Math.random().toString(16).substring(2, 8).toUpperCase();
    const newUid = `DEV-WLI-${randomHex}`;
    const tr = presetTrain || selectedTrainNumber || '12002';
    const ch = presetCoach || selectedCoachNumber || 'B1';
    setAddUid(newUid);
    setAddName(`Coach ${ch} Water Monitor`);
    setAddDeviceType('Quectel EC200U 4G LTE');
    setAddProtocol('MQTT over TLS/WSS (Port 8884)');
    setAddMqttClientId(`panorama-wli-${newUid.toLowerCase()}`);
    setAddMqttTopic(`panorama/telemetry/${newUid}`);
    setAddTrainNumber(tr);
    setAddCoachNumber(ch);
    setAddTankAssignment('BOTH');
    setAddDescription('Standard hydrostatic pressure telemetry node');
    setAddStatus('AVAILABLE');
    setFormError(null);
    setIsAddModalOpen(true);
  };

  const handleCreateDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addUid.trim() || !addName.trim() || !addTrainNumber.trim() || !addCoachNumber.trim()) {
      setFormError('Device Name, UID, Train Number, and Coach Number are mandatory.');
      return;
    }
    const cleanUid = addUid.trim();
    if (devices.some((d) => d.uid.toLowerCase() === cleanUid.toLowerCase())) {
      setFormError(`Device with UID '${cleanUid}' already exists.`);
      return;
    }
    try {
      await ApiClient.createDevice({
        uid: cleanUid,
        name: addName.trim(),
        train_number: addTrainNumber.trim(),
        coach_number: addCoachNumber.trim().toUpperCase(),
        device_type: addDeviceType,
        protocol: addProtocol,
        mqtt_client_id: addMqttClientId.trim() || `panorama-wli-${cleanUid.toLowerCase()}`,
        mqtt_topic: addMqttTopic.trim() || `panorama/telemetry/${cleanUid}`,
        tank_assignment: addTankAssignment,
        description: addDescription.trim(),
        status: addStatus,
        hardware_version: addDeviceType,
        firmware_version: '2.0.0',
      });
      setIsAddModalOpen(false);
      setActionFeedback(`Device ${cleanUid} registered successfully.`);
      setTimeout(() => setActionFeedback(null), 4000);
      await refreshData();
    } catch (err: any) {
      setFormError(err.message || 'Failed to create device');
    }
  };

  const handleOpenEditModal = (dev: DeviceTelemetry) => {
    setDeviceToEdit(dev);
    setEditName(dev.name);
    setEditTrainNumber(dev.trainNumber);
    setEditCoachNumber(dev.coachNumber);
    setEditDeviceType(dev.sensorType || 'Quectel EC200U 4G LTE');
    setEditProtocol(dev.connectionType || 'MQTT over TLS/WSS (Port 8884)');
    setEditMqttClientId(`panorama-wli-${dev.id.toLowerCase()}`);
    setEditMqttTopic(`panorama/telemetry/${dev.id}`);
    setEditTankAssignment('BOTH');
    setEditDescription('');
    setEditStatus(dev.status === 'Online' ? 'IN_USE' : 'AVAILABLE');
    setEditFirmwareVersion(dev.firmwareVersion || '2.0.0');
    setFormError(null);
    setIsEditModalOpen(true);
  };

  const handleUpdateDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deviceToEdit) return;
    try {
      await ApiClient.updateDevice(deviceToEdit.dbId, {
        name: editName.trim(),
        trainNumber: editTrainNumber.trim(),
        coachNumber: editCoachNumber.trim().toUpperCase(),
        deviceType: editDeviceType,
        protocol: editProtocol,
        mqttClientId: editMqttClientId.trim(),
        mqttTopic: editMqttTopic.trim(),
        tankAssignment: editTankAssignment,
        description: editDescription.trim(),
        status: editStatus,
        firmwareVersion: editFirmwareVersion.trim(),
      });
      setIsEditModalOpen(false);
      setActionFeedback(`Device ${deviceToEdit.id} metadata updated successfully.`);
      setTimeout(() => setActionFeedback(null), 4000);
      await refreshData();
    } catch (err: any) {
      setFormError(err.message || 'Failed to update device');
    }
  };

  const handleDeleteDevice = async (dev: DeviceTelemetry) => {
    if (currentUser?.role !== 'ADMIN') {
      alert('Administrator privileges required to delete monitoring hardware.');
      return;
    }
    if (!window.confirm(`Are you sure you want to delete device ${dev.name} (${dev.id})? This will also remove its configured tank entities.`)) {
      return;
    }
    try {
      await ApiClient.deleteDevice(dev.dbId);
      setActionFeedback(`Device ${dev.id} removed from fleet.`);
      setTimeout(() => setActionFeedback(null), 4000);
      if (selectedDevice?.id === dev.id) setSelectedDevice(null);
      await refreshData();
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  // Filtering
  const filteredDevices = useMemo(() => {
    return allDevices.filter((dev) => {
      if (searchQuery.trim().length > 0) {
        const q = searchQuery.toLowerCase();
        const matchName = dev.name.toLowerCase().includes(q);
        const matchId = dev.id.toLowerCase().includes(q);
        const matchLoc = dev.location.toLowerCase().includes(q);
        if (!matchName && !matchId && !matchLoc) return false;
      }
      if (statusFilter !== 'All' && dev.status !== statusFilter) return false;
      if (connFilter !== 'All' && !dev.connectionType.includes(connFilter)) return false;
      return true;
    });
  }, [allDevices, searchQuery, statusFilter, connFilter]);

  const totalCount = allDevices.length;
  const onlineCount = allDevices.filter((d) => d.status === 'Online').length;
  const offlineCount = allDevices.filter((d) => d.status === 'Offline').length;
  const warningCount = allDevices.filter((d) => d.status === 'Warning').length;

  return (
    <div style={{ position: 'relative', width: '100%', display: 'flex', flexDirection: 'column', gap: metrics.space16 }}>
      {/* Main Devices Container */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: metrics.space16,
        }}
      >
        {/* 1. Page Header with Title & Action Controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold', color: '#0F172A', fontFamily: typography.fontFamily }}>
              Devices
            </h1>
            <p style={{ margin: '2px 0 0 0', fontSize: '14px', color: '#64748B', fontFamily: typography.fontFamily }}>
              Manage and monitor connected water-level monitoring devices
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={handleOpenAddModal}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: '#2563EB',
                color: '#FFFFFF',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: typography.fontFamily,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 1px 2px rgba(37, 99, 235, 0.2)',
              }}
            >
              <Plus size={14} />
              <span>Add Device</span>
            </button>

            <button
              onClick={() => refreshData()}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFFFFF',
                color: '#334155',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: typography.fontFamily,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <RefreshCw size={13} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {actionFeedback && (
          <div
            style={{
              backgroundColor: '#ECFDF5',
              border: '1px solid #A7F3D0',
              color: '#065F46',
              borderRadius: '6px',
              padding: '10px 14px',
              fontSize: '13px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <CheckCircle2 size={16} />
            <span>{actionFeedback}</span>
          </div>
        )}

        {/* 2. Search & Filter Bar */}
        <BaseCard style={{ padding: '12px', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Search devices by name, ID, or location..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                flex: 1,
                minWidth: '220px',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                fontSize: '13px',
                fontFamily: typography.fontFamily,
                outline: 'none',
              }}
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '13px', color: '#64748B', fontFamily: typography.fontFamily }}>Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  fontSize: '12px',
                  fontFamily: typography.fontFamily,
                  backgroundColor: '#FFFFFF',
                }}
              >
                <option value="All">All</option>
                <option value="Online">Online</option>
                <option value="Offline">Offline</option>
                <option value="Warning">Warning</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '13px', color: '#64748B', fontFamily: typography.fontFamily }}>Connection:</span>
              <select
                value={connFilter}
                onChange={(e) => setConnFilter(e.target.value)}
                style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  fontSize: '12px',
                  fontFamily: typography.fontFamily,
                  backgroundColor: '#FFFFFF',
                }}
              >
                <option value="All">All</option>
                <option value="LTE">LTE</option>
                <option value="BLE">BLE</option>
                <option value="RS485">RS485</option>
              </select>
            </div>

            {(searchQuery.length > 0 || statusFilter !== 'All' || connFilter !== 'All') && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('All');
                  setConnFilter('All');
                }}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#FFFFFF',
                  color: '#64748B',
                  fontSize: '12px',
                  cursor: 'pointer',
                  fontFamily: typography.fontFamily,
                }}
              >
                Reset
              </button>
            )}
          </div>
        </BaseCard>

        {/* 3. Device Overview Metric Cards (4 Tiles) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: metrics.space12, width: '100%' }}>
          {/* Total Devices */}
          <BaseCard style={{ height: '100px', padding: '14px', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748B', fontFamily: typography.fontFamily }}>
                TOTAL DEVICES
              </span>
              <span style={{ fontSize: '26px', fontWeight: 'bold', color: '#0F172A', fontFamily: typography.fontFamily }}>
                {totalCount}
              </span>
              <span style={{ fontSize: '11px', color: '#94A3B8', fontFamily: typography.fontFamily }}>
                Registered Monitoring Nodes
              </span>
            </div>
          </BaseCard>

          {/* Online Devices */}
          <BaseCard style={{ height: '100px', padding: '14px', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748B', fontFamily: typography.fontFamily }}>
                  ONLINE
                </span>
                <div style={{ width: '8px', height: '8px', borderRadius: '4px', backgroundColor: '#10B981' }} />
              </div>
              <span style={{ fontSize: '26px', fontWeight: 'bold', color: '#059669', fontFamily: typography.fontFamily }}>
                {onlineCount}
              </span>
              <span style={{ fontSize: '11px', color: '#94A3B8', fontFamily: typography.fontFamily }}>
                Active Telemetry Uplink
              </span>
            </div>
          </BaseCard>

          {/* Offline Devices */}
          <BaseCard style={{ height: '100px', padding: '14px', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748B', fontFamily: typography.fontFamily }}>
                  OFFLINE
                </span>
                <div style={{ width: '8px', height: '8px', borderRadius: '4px', backgroundColor: '#EF4444' }} />
              </div>
              <span style={{ fontSize: '26px', fontWeight: 'bold', color: offlineCount > 0 ? '#DC2626' : '#64748B', fontFamily: typography.fontFamily }}>
                {offlineCount}
              </span>
              <span style={{ fontSize: '11px', color: '#94A3B8', fontFamily: typography.fontFamily }}>
                No Signal / Link Timeout
              </span>
            </div>
          </BaseCard>

          {/* Warnings */}
          <BaseCard style={{ height: '100px', padding: '14px', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748B', fontFamily: typography.fontFamily }}>
                  WARNINGS
                </span>
                <div style={{ width: '8px', height: '8px', borderRadius: '4px', backgroundColor: '#F59E0B' }} />
              </div>
              <span style={{ fontSize: '26px', fontWeight: 'bold', color: warningCount > 0 ? '#D97706' : '#64748B', fontFamily: typography.fontFamily }}>
                {warningCount}
              </span>
              <span style={{ fontSize: '11px', color: '#94A3B8', fontFamily: typography.fontFamily }}>
                Subsystem / Level Alarms
              </span>
            </div>
          </BaseCard>
        </div>

        {/* 4. Device Management Table */}
        <BaseCard style={{ padding: '16px', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Table Header Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#0F172A', fontFamily: typography.fontFamily }}>
                Registered Water Monitoring Devices ({filteredDevices.length})
              </span>
              <span style={{ fontSize: '12px', color: '#94A3B8', fontFamily: typography.fontFamily }}>
                Click any device row to view operational telemetry and diagnostics
              </span>
            </div>

            <div style={{ width: '100%', height: '1px', backgroundColor: '#E2E8F0' }} />

            {/* Table Column Headers */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '200px 90px 130px 140px 110px 80px 1fr 130px',
                gap: '12px',
                padding: '0 12px',
                fontSize: '11px',
                fontWeight: 'bold',
                color: '#64748B',
                fontFamily: typography.fontFamily,
              }}
            >
              <div>DEVICE NAME / ID</div>
              <div>STATUS</div>
              <div>CONNECTION</div>
              <div>WATER LEVEL</div>
              <div>SENSOR HEALTH</div>
              <div>FIRMWARE</div>
              <div>LAST UPDATE</div>
              <div>ACTIONS</div>
            </div>

            <div style={{ width: '100%', height: '1px', backgroundColor: '#F1F5F9' }} />

            {/* Table Rows */}
            {filteredDevices.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '36px 0' }}>
                <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#0F172A', fontFamily: typography.fontFamily }}>
                  No Devices Found Matching Query
                </div>
                <div style={{ fontSize: '13px', color: '#64748B', fontFamily: typography.fontFamily, marginTop: '4px' }}>
                  Try adjusting your search query or reset the filter dropdowns.
                </div>
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('All');
                    setConnFilter('All');
                  }}
                  style={{
                    marginTop: '12px',
                    padding: '6px 14px',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#FFFFFF',
                    color: '#334155',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  Reset All Filters
                </button>
              </div>
            ) : (
              filteredDevices.map((dev, index) => {
                const isSelected = selectedDevice?.id === dev.id;
                return (
                  <div
                    key={dev.id}
                    onClick={() => setSelectedDevice(dev)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '200px 90px 130px 140px 110px 80px 1fr 130px',
                      gap: '12px',
                      alignItems: 'center',
                      height: '64px',
                      padding: '0 12px',
                      borderRadius: '8px',
                      backgroundColor: isSelected ? '#EFF6FF' : index % 2 === 1 ? '#FAFAFA' : '#FFFFFF',
                      border: `1px solid ${isSelected ? '#3B82F6' : '#F1F5F9'}`,
                      cursor: 'pointer',
                      transition: 'background-color 120ms ease, border-color 120ms ease',
                      boxSizing: 'border-box',
                    }}
                  >
                    {/* Device Name & ID */}
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#0F172A', fontFamily: typography.fontFamily, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {dev.name}
                      </span>
                      <span style={{ fontSize: '11px', color: '#64748B', fontFamily: typography.fontFamily }}>
                        {dev.location}
                      </span>
                    </div>

                    {/* Status Badge */}
                    <div>
                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          height: '24px',
                          padding: '0 10px',
                          borderRadius: '12px',
                          backgroundColor: dev.status === 'Online' ? '#ECFDF5' : dev.status === 'Warning' ? '#FFFBEB' : '#FEF2F2',
                          border: `1px solid ${dev.status === 'Online' ? '#A7F3D0' : dev.status === 'Warning' ? '#FDE68A' : '#FECACA'}`,
                        }}
                      >
                        <div
                          style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '3px',
                            backgroundColor: dev.status === 'Online' ? '#10B981' : dev.status === 'Warning' ? '#F59E0B' : '#EF4444',
                          }}
                        />
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 'bold',
                            color: dev.status === 'Online' ? '#065F46' : dev.status === 'Warning' ? '#92400E' : '#991B1B',
                            fontFamily: typography.fontFamily,
                          }}
                        >
                          {dev.status}
                        </span>
                      </div>
                    </div>

                    {/* Connection Type */}
                    <span style={{ fontSize: '12px', color: '#334155', fontFamily: typography.fontFamily }}>
                      {dev.connectionType}
                    </span>

                    {/* Water Level with Mini Progress Bar */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 'bold', color: colors.primary, fontFamily: typography.fontFamily }}>
                          {dev.waterLevel != null ? `${dev.waterLevel.toFixed(1)}%` : 'N/A'}
                        </span>
                        <span style={{ fontSize: '11px', color: '#64748B', fontFamily: typography.fontFamily }}>
                          {dev.waterHeightCm != null ? `(${dev.waterHeightCm.toFixed(1)} cm)` : '(-- cm)'}
                        </span>
                      </div>
                      <div style={{ width: '100%', height: '5px', borderRadius: '2.5px', backgroundColor: '#E2E8F0', overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${dev.waterLevel != null ? Math.max(0, Math.min(100, dev.waterLevel)) : 0}%`,
                            height: '100%',
                            backgroundColor: (dev.waterLevel ?? 0) >= 100.0 ? '#EF4444' : (dev.waterLevel ?? 0) < 20.0 ? '#F59E0B' : '#0878E8',
                          }}
                        />
                      </div>
                    </div>

                    {/* Sensor Health */}
                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: 500,
                        color: dev.sensorStatus === 'Healthy' || dev.sensorStatus === 'Operational' ? '#059669' : '#D97706',
                        fontFamily: typography.fontFamily,
                      }}
                    >
                      {dev.sensorStatus}
                    </span>

                    {/* Firmware Version */}
                    <span style={{ fontSize: '12px', color: '#64748B', fontFamily: typography.fontFamily }}>
                      {dev.firmwareVersion || 'Unknown'}
                    </span>

                    {/* Last Update */}
                    <span style={{ fontSize: '12px', color: '#64748B', fontFamily: typography.fontFamily, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {dev.lastUpdate}
                    </span>

                    {/* Action Buttons: Inspect, Edit, Delete */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedDevice(dev);
                        }}
                        title="View Telemetry Diagnostics"
                        style={{
                          padding: '5px 8px',
                          borderRadius: '4px',
                          border: '1px solid #CBD5E1',
                          backgroundColor: '#FFFFFF',
                          color: '#2563EB',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Inspect
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenEditModal(dev);
                        }}
                        title="Edit Device Configuration"
                        style={{
                          padding: '5px',
                          borderRadius: '4px',
                          border: '1px solid #CBD5E1',
                          backgroundColor: '#FFFFFF',
                          color: '#475569',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Edit3 size={13} />
                      </button>

                      {currentUser?.role === 'ADMIN' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteDevice(dev);
                          }}
                          title="Delete Device"
                          style={{
                            padding: '5px',
                            borderRadius: '4px',
                            border: '1px solid #FECACA',
                            backgroundColor: '#FEF2F2',
                            color: '#DC2626',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </BaseCard>
      </div>

      {/* Backdrop overlay for Device Drawer */}
      {selectedDevice && (
        <div
          onClick={() => setSelectedDevice(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(2px)',
            zIndex: 999,
          }}
        />
      )}

      {/* 5. Slide-in Device Detail Drawer (Right Side Sheet, 440px) */}
      {selectedDevice && (
        <div
          className="drawer-slide-in"
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            width: '440px',
            maxWidth: '100vw',
            backgroundColor: '#FFFFFF',
            borderLeft: '1px solid #CBD5E1',
            boxShadow: '-6px 0 28px rgba(0,0,0,0.20)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            boxSizing: 'border-box',
          }}
        >
          {/* Scrollable Content inside Drawer */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Drawer Header Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#0F172A', fontFamily: typography.fontFamily }}>
                  {selectedDevice.name}
                </div>
                <div style={{ fontSize: '12px', color: '#64748B', fontFamily: typography.fontFamily, marginTop: '2px' }}>
                  Device ID: {selectedDevice.id}
                </div>
              </div>

              <button
                onClick={() => setSelectedDevice(null)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#FFFFFF',
                  color: '#334155',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: typography.fontFamily,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <X size={14} />
                <span>Close</span>
              </button>
            </div>

            <div style={{ width: '100%', height: '1px', backgroundColor: '#E2E8F0' }} />

            {/* Section 1: Live Water Level & Geometry */}
            <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569', fontFamily: typography.fontFamily }}>
              LIVE TELEMETRY & TANK LEVEL
            </span>

            <div
              style={{
                height: '80px',
                borderRadius: '8px',
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                padding: '12px',
                boxSizing: 'border-box',
              }}
            >
              <div>
                <div style={{ fontSize: '11px', color: '#64748B', fontFamily: typography.fontFamily }}>Water Level</div>
                <div style={{ fontSize: '22px', fontWeight: 'bold', color: colors.primary, fontFamily: typography.fontFamily }}>
                  {selectedDevice.waterLevel != null ? `${selectedDevice.waterLevel.toFixed(2)}%` : 'N/A'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: '#64748B', fontFamily: typography.fontFamily }}>Water Height</div>
                <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#0F172A', fontFamily: typography.fontFamily }}>
                  {selectedDevice.waterHeightCm != null ? `${selectedDevice.waterHeightCm.toFixed(1)} cm` : 'N/A'}
                </div>
              </div>
            </div>

            <InfoRow label="Configured Tank Height" value={`${selectedDevice.tankHeightCm.toFixed(1)} cm`} />
            <InfoRow label="Liquid Volume" value={selectedDevice.volumeLiters != null ? `${selectedDevice.volumeLiters.toFixed(1)} L` : 'N/A'} />
            <InfoRow label="Sensor Health Status" value={selectedDevice.sensorStatus} />

            <div style={{ width: '100%', height: '1px', backgroundColor: '#F1F5F9' }} />

            {/* Section 2: Environmental Telemetry */}
            <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569', fontFamily: typography.fontFamily }}>
              ENVIRONMENTAL TELEMETRY
            </span>

            <InfoRow label="Atmospheric Pressure" value={selectedDevice.pressure != null ? `${selectedDevice.pressure.toFixed(1)} hPa` : 'N/A'} />
            <InfoRow label="Ambient Temperature" value={selectedDevice.temperature != null ? `${selectedDevice.temperature.toFixed(1)} °C` : 'N/A'} />
            <InfoRow label="Relative Humidity" value={selectedDevice.humidity != null ? `${selectedDevice.humidity.toFixed(1)} % RH` : 'N/A'} />
            <InfoRow label="Environmental Sensor Status" value="Operational" />

            <div style={{ width: '100%', height: '1px', backgroundColor: '#F1F5F9' }} />

            {/* Section 3: Communication & System Status */}
            <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569', fontFamily: typography.fontFamily }}>
              COMMUNICATION & SYSTEM STATUS
            </span>

            <InfoRow label="Communication Status" value={selectedDevice.status === 'Online' ? 'Active Uplink' : 'Offline'} />
            <InfoRow label="Uplink Protocol" value={selectedDevice.connectionType} />
            <InfoRow label="Signal Quality" value={selectedDevice.signalQuality} />
            <InfoRow label="Firmware Version" value={selectedDevice.firmwareVersion} />
            <InfoRow label="System Architecture" value="STM32 Processing Architecture" />
            <InfoRow label="Telemetry Refresh Interval" value={selectedDevice.uploadInterval} />
            <InfoRow label="Last Reported Telemetry" value={selectedDevice.lastUpdate} />

            <div style={{ height: '12px' }} />

            <button
              onClick={() => setSelectedDevice(null)}
              style={{
                width: '100%',
                padding: '10px 0',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                backgroundColor: '#F8FAFC',
                color: '#334155',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: typography.fontFamily,
              }}
            >
              Close Device Drawer
            </button>
          </div>
        </div>
      )}

      {/* Add Device Modal (11-Field Complete Form) */}
      {isAddModalOpen && (
        <div
          className="modal-backdrop"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '16px',
          }}
        >
          <div
            className="modal-dialog"
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '8px',
              width: '560px',
              maxWidth: '100%',
              maxHeight: '90vh',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
              overflowY: 'auto',
            }}
          >
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, backgroundColor: '#FFFFFF', zIndex: 10 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0F172A' }}>Register Monitoring Device</h3>
                <span style={{ fontSize: '11px', color: '#64748B' }}>11-Field Hardware Specification & Consist Provisioning</span>
              </div>
              <button onClick={() => setIsAddModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateDevice} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {formError && (
                <div style={{ padding: '10px 14px', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '6px', color: '#DC2626', fontSize: '13px' }}>
                  {formError}
                </div>
              )}

              {/* 1. Name & 2. UID */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>1. Device Display Name *</label>
                  <input
                    type="text"
                    value={addName}
                    onChange={(e) => setAddName(e.target.value)}
                    placeholder="e.g. Coach B1 Water Monitor"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px', boxSizing: 'border-box' }}
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>2. Hardware UID *</label>
                  <input
                    type="text"
                    value={addUid}
                    onChange={(e) => setAddUid(e.target.value)}
                    placeholder="e.g. DEV-WLI-A9F3"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px', boxSizing: 'border-box', fontFamily: 'monospace' }}
                    required
                  />
                </div>
              </div>

              {/* 3. Device Type & 4. Protocol */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>3. Hardware Type</label>
                  <select
                    value={addDeviceType}
                    onChange={(e) => setAddDeviceType(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px', boxSizing: 'border-box', backgroundColor: '#FFFFFF' }}
                  >
                    <option value="Quectel EC200U 4G LTE">Quectel EC200U 4G LTE</option>
                    <option value="ESP32-S3 WLI Edge Node">ESP32-S3 WLI Edge Node</option>
                    <option value="Standard WLI Telemetry Node">Standard WLI Telemetry Node</option>
                    <option value="Hydrostatic Pressure Sensor Node">Hydrostatic Pressure Sensor Node</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>4. Protocol</label>
                  <select
                    value={addProtocol}
                    onChange={(e) => setAddProtocol(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px', boxSizing: 'border-box', backgroundColor: '#FFFFFF' }}
                  >
                    <option value="MQTT over TLS/WSS (Port 8884)">MQTT over TLS/WSS (Port 8884)</option>
                    <option value="MQTT Standard (Port 1883)">MQTT Standard (Port 1883)</option>
                    <option value="HTTP REST Gateway (/api/status)">HTTP REST Gateway (/api/status)</option>
                    <option value="Modbus RTU / RS485 Industrial Loop">Modbus RTU / RS485 Industrial Loop</option>
                  </select>
                </div>
              </div>

              {/* 5. MQTT Client ID & 6. MQTT Topic */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>5. MQTT Client ID</label>
                  <input
                    type="text"
                    value={addMqttClientId}
                    onChange={(e) => setAddMqttClientId(e.target.value)}
                    placeholder="e.g. panorama-wli-a9f3"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px', boxSizing: 'border-box', fontFamily: 'monospace' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>6. Telemetry Topic</label>
                  <input
                    type="text"
                    value={addMqttTopic}
                    onChange={(e) => setAddMqttTopic(e.target.value)}
                    placeholder="e.g. panorama/telemetry/DEV-WLI-A9F3"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px', boxSizing: 'border-box', fontFamily: 'monospace' }}
                  />
                </div>
              </div>

              {/* 7. Train # & 8. Coach # */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>7. Train Number *</label>
                  <input
                    type="text"
                    value={addTrainNumber}
                    onChange={(e) => setAddTrainNumber(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px', boxSizing: 'border-box' }}
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>8. Coach Number *</label>
                  <input
                    type="text"
                    value={addCoachNumber}
                    onChange={(e) => setAddCoachNumber(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px', boxSizing: 'border-box' }}
                    required
                  />
                </div>
              </div>

              {/* 9. Tank Assignment & 11. Status */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>9. Tank Assignment</label>
                  <select
                    value={addTankAssignment}
                    onChange={(e) => setAddTankAssignment(e.target.value as any)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px', boxSizing: 'border-box', backgroundColor: '#FFFFFF' }}
                  >
                    <option value="BOTH">BOTH (Arrival & Departure)</option>
                    <option value="Tank 1">Tank 1 Only (Arrival Side)</option>
                    <option value="Tank 2">Tank 2 Only (Departure Side)</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>11. Status</label>
                  <select
                    value={addStatus}
                    onChange={(e) => setAddStatus(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px', boxSizing: 'border-box', backgroundColor: '#FFFFFF' }}
                  >
                    <option value="AVAILABLE">AVAILABLE (In Pool)</option>
                    <option value="IN_USE">IN_USE (Active Telemetry)</option>
                    <option value="MAINTENANCE">MAINTENANCE (Workshop)</option>
                    <option value="DECOMMISSIONED">DECOMMISSIONED</option>
                  </select>
                </div>
              </div>

              {/* 10. Description */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>10. Hardware Description & Notes</label>
                <textarea
                  value={addDescription}
                  onChange={(e) => setAddDescription(e.target.value)}
                  placeholder="e.g. Hydrostatic pressure sensor node mounted on underframe junction box"
                  rows={2}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px', boxSizing: 'border-box', fontFamily: 'inherit' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px', paddingTop: '10px', borderTop: '1px solid #E2E8F0' }}>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', color: '#475569', fontSize: '13px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ padding: '8px 20px', borderRadius: '6px', border: 'none', backgroundColor: '#2563EB', color: '#FFFFFF', fontSize: '13px', fontWeight: 600, cursor: 'pointer', boxShadow: '0 1px 2px rgba(37,99,235,0.2)' }}
                >
                  Register Device
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Device Modal */}
      {isEditModalOpen && deviceToEdit && (
        <div
          className="modal-backdrop"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '16px',
          }}
        >
          <div
            className="modal-dialog"
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '8px',
              width: '560px',
              maxWidth: '100%',
              maxHeight: '90vh',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
              overflowY: 'auto',
            }}
          >
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, backgroundColor: '#FFFFFF', zIndex: 10 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0F172A' }}>Edit Device Assignment</h3>
                <span style={{ fontSize: '11px', color: '#64748B' }}>UID: {deviceToEdit.id}</span>
              </div>
              <button onClick={() => setIsEditModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleUpdateDevice} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {formError && (
                <div style={{ padding: '10px 14px', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '6px', color: '#DC2626', fontSize: '13px' }}>
                  {formError}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Device Name *</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px', boxSizing: 'border-box' }}
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Hardware UID</label>
                  <input
                    type="text"
                    value={deviceToEdit.id}
                    disabled
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', fontSize: '13px', boxSizing: 'border-box', color: '#64748B', fontFamily: 'monospace' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Train Assignment *</label>
                  <input
                    type="text"
                    value={editTrainNumber}
                    onChange={(e) => setEditTrainNumber(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px', boxSizing: 'border-box' }}
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Coach Assignment *</label>
                  <input
                    type="text"
                    value={editCoachNumber}
                    onChange={(e) => setEditCoachNumber(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px', boxSizing: 'border-box' }}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Device Model / Type</label>
                  <select
                    value={editDeviceType}
                    onChange={(e) => setEditDeviceType(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px', boxSizing: 'border-box', backgroundColor: '#FFFFFF' }}
                  >
                    <option value="Quectel EC200U 4G LTE">Quectel EC200U 4G LTE</option>
                    <option value="ESP32-S3 WLI Edge Node">ESP32-S3 WLI Edge Node</option>
                    <option value="Standard WLI Telemetry Node">Standard WLI Telemetry Node</option>
                    <option value="Hydrostatic Pressure Sensor Node">Hydrostatic Pressure Sensor Node</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Protocol</label>
                  <select
                    value={editProtocol}
                    onChange={(e) => setEditProtocol(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px', boxSizing: 'border-box', backgroundColor: '#FFFFFF' }}
                  >
                    <option value="MQTT over TLS/WSS (Port 8884)">MQTT over TLS/WSS (Port 8884)</option>
                    <option value="MQTT Standard (Port 1883)">MQTT Standard (Port 1883)</option>
                    <option value="HTTP REST Gateway (/api/status)">HTTP REST Gateway (/api/status)</option>
                    <option value="Modbus RTU / RS485 Industrial Loop">Modbus RTU / RS485 Industrial Loop</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Tank Assignment</label>
                  <select
                    value={editTankAssignment}
                    onChange={(e) => setEditTankAssignment(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px', boxSizing: 'border-box', backgroundColor: '#FFFFFF' }}
                  >
                    <option value="BOTH">BOTH (Arrival & Departure)</option>
                    <option value="Tank 1">Tank 1 Only (Arrival Side)</option>
                    <option value="Tank 2">Tank 2 Only (Departure Side)</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Status</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px', boxSizing: 'border-box', backgroundColor: '#FFFFFF' }}
                  >
                    <option value="AVAILABLE">AVAILABLE (In Pool)</option>
                    <option value="IN_USE">IN_USE (Active Telemetry)</option>
                    <option value="MAINTENANCE">MAINTENANCE (Workshop)</option>
                    <option value="DECOMMISSIONED">DECOMMISSIONED</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px', paddingTop: '10px', borderTop: '1px solid #E2E8F0' }}>
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', color: '#475569', fontSize: '13px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ padding: '8px 20px', borderRadius: '6px', border: 'none', backgroundColor: '#2563EB', color: '#FFFFFF', fontSize: '13px', fontWeight: 600, cursor: 'pointer', boxShadow: '0 1px 2px rgba(37,99,235,0.2)' }}
                >
                  Update Device
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
