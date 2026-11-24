import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { metrics, typography } from '../theme';
import { useApp } from '../state/AppContext';
import { ApiClient } from '../api/client';
import { BaseCard } from '../components/common/BaseCard';
import { InfoRow } from '../components/common/InfoRow';
import { TelemetryTableRow, TelemetryTableFilterParams } from '../types';
import { isGenuineHardwareUid, getCanonicalUid } from '../services/deviceRegistry';
import {
  RefreshCw,
  X,
  Plus,
  Edit3,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Download,
  Search,
  Table as TableIcon,
  Server,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';

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
  const {
    liveTank,
    devices,
    connectionStatus,
    currentTime,
    refreshData,
    currentUser,
    selectedDeviceId,
    selectedTrainNumber,
    selectedCoachNumber,
  } = useApp();

  // Top view switcher: 'telemetry' (default historical table) or 'fleet' (device management)
  const [viewMode, setViewMode] = useState<'telemetry' | 'fleet'>('telemetry');

  // ----------------------------------------------------
  // HISTORICAL TELEMETRY TABLE STATE
  // ----------------------------------------------------
  const [telemetryRecords, setTelemetryRecords] = useState<TelemetryTableRow[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [isLoadingTelemetry, setIsLoadingTelemetry] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [tableFeedback, setTableFeedback] = useState<string | null>(null);

  // Table State & Filters
  const [selectedHistoryUid, setSelectedHistoryUid] = useState<string | null>(null);
  const [searchDeviceId, setSearchDeviceId] = useState('');
  const [totalGenuineDevices, setTotalGenuineDevices] = useState<number>(4);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [ai1ValidFilter, setAi1ValidFilter] = useState('All');
  const [gpsValidFilter, setGpsValidFilter] = useState('All');
  const [altitudeValidFilter, setAltitudeValidFilter] = useState('All');
  const [sortBy, setSortBy] = useState('recordedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // ----------------------------------------------------
  // FLEET MANAGEMENT STATE (Preserved)
  // ----------------------------------------------------
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

  // Add Device Form
  const [addName, setAddName] = useState('Coach Water Monitor');
  const [addUid, setAddUid] = useState('');
  const [addDeviceType, setAddDeviceType] = useState('Quectel EC200U 4G LTE');
  const [addProtocol, setAddProtocol] = useState('MQTT over TLS/WSS (Port 8884)');
  const [addMqttClientId, setAddMqttClientId] = useState('');
  const [addMqttTopic, setAddMqttTopic] = useState('');
  const [addTrainNumber, setAddTrainNumber] = useState('');
  const [addCoachNumber, setAddCoachNumber] = useState('');
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

  // List of unique device IDs for filter dropdown - strictly genuine hardware identities
  const uniqueDeviceIds = useMemo(() => {
    const set = new Set<string>();
    devices.forEach((d) => {
      if (d.uid && isGenuineHardwareUid(d.uid)) {
        set.add(getCanonicalUid(d.uid));
      }
    });
    telemetryRecords.forEach((r) => {
      if (r.deviceId && isGenuineHardwareUid(r.deviceId)) {
        set.add(getCanonicalUid(r.deviceId));
      }
    });
    return Array.from(set).sort();
  }, [devices, telemetryRecords]);

  // Load telemetry data from backend (with local seed fallback)
  const loadTelemetryData = useCallback(async () => {
    setIsLoadingTelemetry(true);
    try {
      if (!selectedHistoryUid) {
        // Main Devices Table: Exactly 1 row per unique physical hardware device
        const res = await ApiClient.fetchDevicesOverviewTable({
          search: searchDeviceId.trim() || undefined,
          sortBy,
          sortOrder,
          page: currentPage,
          limit: pageSize,
        });
        setTelemetryRecords(res.items);
        setTotalRecords(res.total);
        setTotalPages(res.totalPages);
        setTotalGenuineDevices(res.total);
      } else {
        // Device History Table: All historical readings for the selected device
        const params: TelemetryTableFilterParams = {
          search: searchDeviceId.trim() || undefined,
          deviceId: selectedHistoryUid,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          ai1Valid: ai1ValidFilter !== 'All' ? ai1ValidFilter : undefined,
          gpsValid: gpsValidFilter !== 'All' ? gpsValidFilter : undefined,
          altitudeValid: altitudeValidFilter !== 'All' ? altitudeValidFilter : undefined,
          sortBy,
          sortOrder,
          page: currentPage,
          limit: pageSize,
        };
        const res = await ApiClient.fetchTelemetryHistoryTable(params);
        setTelemetryRecords(res.items);
        setTotalRecords(res.total);
        setTotalPages(res.totalPages);
      }
    } catch (err: any) {
      console.error('Failed to load telemetry table', err);
    } finally {
      setIsLoadingTelemetry(false);
    }
  }, [
    selectedHistoryUid,
    searchDeviceId,
    startDate,
    endDate,
    ai1ValidFilter,
    gpsValidFilter,
    altitudeValidFilter,
    sortBy,
    sortOrder,
    currentPage,
    pageSize,
  ]);

  useEffect(() => {
    loadTelemetryData();
  }, [loadTelemetryData]);

  // Handle CSV Export
  const handleExportCsv = async () => {
    setIsExporting(true);
    setTableFeedback('Preparing CSV export (13 columns)...');
    try {
      if (!selectedHistoryUid) {
        await ApiClient.exportTelemetryCsv({
          search: searchDeviceId.trim() || undefined,
          latestOnly: true,
          sortBy,
          sortOrder,
        });
      } else {
        await ApiClient.exportTelemetryCsv({
          search: searchDeviceId.trim() || undefined,
          deviceId: selectedHistoryUid,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          ai1Valid: ai1ValidFilter !== 'All' ? ai1ValidFilter : undefined,
          gpsValid: gpsValidFilter !== 'All' ? gpsValidFilter : undefined,
          altitudeValid: altitudeValidFilter !== 'All' ? altitudeValidFilter : undefined,
          sortBy,
          sortOrder,
        });
      }
      setTableFeedback('CSV export downloaded successfully.');
    } catch (err: any) {
      setTableFeedback(`Export failed: ${err.message || 'Error exporting CSV'}`);
    } finally {
      setIsExporting(false);
      setTimeout(() => setTableFeedback(null), 4000);
    }
  };

  // Reset telemetry filters
  const handleResetTelemetryFilters = () => {
    setSearchDeviceId('');
    setStartDate('');
    setEndDate('');
    setAi1ValidFilter('All');
    setGpsValidFilter('All');
    setAltitudeValidFilter('All');
    setSortBy(selectedHistoryUid ? 'receivedUtc' : 'recordedAt');
    setSortOrder('desc');
    setCurrentPage(1);
  };

  // Toggle column sort
  const handleHeaderSort = (columnKey: string) => {
    if (sortBy === columnKey) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(columnKey);
      setSortOrder('desc');
    }
    setCurrentPage(1);
  };

  // Helper to render sort indicator
  const renderSortIndicator = (columnKey: string) => {
    if (sortBy !== columnKey) {
      return <ArrowUpDown size={12} style={{ opacity: 0.4, marginLeft: '4px' }} />;
    }
    return sortOrder === 'asc' ? (
      <ArrowUp size={12} style={{ color: '#38BDF8', marginLeft: '4px' }} />
    ) : (
      <ArrowDown size={12} style={{ color: '#38BDF8', marginLeft: '4px' }} />
    );
  };

  // Render Validity Badge (Valid: green, Invalid: red, --: grey)
  const renderValidityBadge = (status: string) => {
    if (status === 'Valid') {
      return (
        <span
          style={{
            display: 'inline-block',
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: 600,
            backgroundColor: '#DCFCE7',
            color: '#15803D',
            border: '1px solid #BBF7D0',
            textAlign: 'center',
            minWidth: '46px',
          }}
        >
          Valid
        </span>
      );
    }
    if (status === 'Invalid') {
      return (
        <span
          style={{
            display: 'inline-block',
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: 600,
            backgroundColor: '#FEE2E2',
            color: '#B91C1C',
            border: '1px solid #FECACA',
            textAlign: 'center',
            minWidth: '46px',
          }}
        >
          Invalid
        </span>
      );
    }
    return (
      <span
        style={{
          display: 'inline-block',
          padding: '2px 8px',
          borderRadius: '4px',
          fontSize: '11px',
          fontWeight: 600,
          backgroundColor: '#F1F5F9',
          color: '#64748B',
          border: '1px solid #E2E8F0',
          textAlign: 'center',
          minWidth: '46px',
        }}
      >
        --
      </span>
    );
  };

  // Live devices mapped strictly from registered backend database devices (for Fleet tab)
  const allDevices: DeviceTelemetry[] = useMemo(() => {
    const seen = new Set<string>();
    return devices
      .filter((d) => d.uid && isGenuineHardwareUid(d.uid))
      .filter((d) => {
        const canonical = getCanonicalUid(d.uid);
        if (seen.has(canonical)) return false;
        seen.add(canonical);
        return true;
      })
      .map((d, index) => {
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

        const canonicalUid = getCanonicalUid(d.uid);
        return {
          dbId: d.id,
          name: d.name || `Water Monitor (${d.trainNumber}/${d.coachNumber})`,
          id: canonicalUid,
          trainNumber: d.trainNumber || 'UNASSIGNED',
          coachNumber: d.coachNumber || 'UNASSIGNED',
          serialNumber: canonicalUid,
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
      const target = allDevices.find(
        (d) => d.id === selectedDeviceId || d.dbId === selectedDeviceId || d.serialNumber === selectedDeviceId
      );
      if (target) {
        setSelectedDevice(target);
      }
    }
  }, [selectedDeviceId, allDevices]);

  const handleOpenAddModal = (presetTrain?: string, presetCoach?: string) => {
    const hexChars = '0123456789ABCDEF';
    const randomHex = Array.from({ length: 20 }, () => hexChars[Math.floor(Math.random() * 16)]).join('');
    const newUid = `0026${randomHex}`;
    const tr = presetTrain || selectedTrainNumber || '';
    const ch = presetCoach || selectedCoachNumber || '';
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
    if (!addUid.trim() || !addName.trim()) {
      setFormError('Device UID and Name are mandatory.');
      return;
    }
    try {
      await ApiClient.createDevice({
        uid: addUid.trim(),
        name: addName.trim(),
        deviceType: addDeviceType,
        protocol: addProtocol,
        mqttClientId: addMqttClientId.trim(),
        mqttTopic: addMqttTopic.trim(),
        trainNumber: addTrainNumber.trim(),
        coachNumber: addCoachNumber.trim().toUpperCase(),
        tankAssignment: addTankAssignment,
        description: addDescription.trim(),
        status: addStatus,
      });
      setIsAddModalOpen(false);
      setActionFeedback(`Device ${addUid.trim()} successfully registered.`);
      setTimeout(() => setActionFeedback(null), 4000);
      await refreshData();
      await loadTelemetryData();
    } catch (err: any) {
      setFormError(err.message || 'Failed to register device');
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
    if (
      !window.confirm(
        `Are you sure you want to delete device ${dev.name} (${dev.id})? This will also remove its configured tank entities.`
      )
    ) {
      return;
    }
    try {
      await ApiClient.deleteDevice(dev.dbId);
      setActionFeedback(`Device ${dev.id} deleted successfully.`);
      setTimeout(() => setActionFeedback(null), 4000);
      if (selectedDevice?.dbId === dev.dbId) {
        setSelectedDevice(null);
      }
      await refreshData();
    } catch (err: any) {
      alert(err.message || 'Failed to delete device');
    }
  };

  // Filtered devices for Fleet Management tab
  const filteredFleetDevices = useMemo(() => {
    return allDevices.filter((d) => {
      const matchSearch =
        searchQuery === '' ||
        d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.location.toLowerCase().includes(searchQuery.toLowerCase());
      const matchStatus = statusFilter === 'All' || d.status === statusFilter;
      const matchConn =
        connFilter === 'All' ||
        (connFilter === 'LTE' && d.connectionType.includes('Cellular')) ||
        (connFilter === 'BLE' && d.connectionType.includes('BLE')) ||
        (connFilter === 'RS485' && d.connectionType.includes('RS485'));
      return matchSearch && matchStatus && matchConn;
    });
  }, [allDevices, searchQuery, statusFilter, connFilter]);

  const totalCount = allDevices.length;
  const onlineCount = allDevices.filter((d) => d.status === 'Online').length;
  const offlineCount = allDevices.filter((d) => d.status === 'Offline').length;
  const warningCount = allDevices.filter((d) => d.status === 'Warning').length;

  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalRecords);

  const hasActiveFilters =
    searchDeviceId.trim() !== '' ||
    (selectedHistoryUid !== null && (
      startDate !== '' ||
      endDate !== '' ||
      ai1ValidFilter !== 'All' ||
      gpsValidFilter !== 'All' ||
      altitudeValidFilter !== 'All'
    ));

  return (
    <div style={{ position: 'relative', width: '100%', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* 1. Header Bar with Title, View Tabs & Global Actions */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          paddingBottom: '4px',
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: '22px',
              fontWeight: 700,
              color: '#0F172A',
              fontFamily: typography.fontFamily,
              letterSpacing: '-0.3px',
            }}
          >
            Devices
          </h1>
          <p style={{ margin: '2px 0 0 0', fontSize: '13px', color: '#64748B', fontFamily: typography.fontFamily }}>
            Historical Telemetry Data & Node Fleet Management
          </p>
        </div>

        {/* View Switcher Tabs (Historical Telemetry Data vs Device Fleet) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: '#F1F5F9',
            padding: '3px',
            borderRadius: '8px',
            border: '1px solid #E2E8F0',
          }}
        >
          <button
            onClick={() => setViewMode('telemetry')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: viewMode === 'telemetry' ? 600 : 500,
              backgroundColor: viewMode === 'telemetry' ? '#FFFFFF' : 'transparent',
              color: viewMode === 'telemetry' ? '#0F172A' : '#64748B',
              boxShadow: viewMode === 'telemetry' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            <TableIcon size={14} color={viewMode === 'telemetry' ? '#2563EB' : '#64748B'} />
            <span>Telemetry Data Table</span>
          </button>

          <button
            onClick={() => setViewMode('fleet')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: viewMode === 'fleet' ? 600 : 500,
              backgroundColor: viewMode === 'fleet' ? '#FFFFFF' : 'transparent',
              color: viewMode === 'fleet' ? '#0F172A' : '#64748B',
              boxShadow: viewMode === 'fleet' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            <Server size={14} color={viewMode === 'fleet' ? '#2563EB' : '#64748B'} />
            <span>Fleet & Device Management</span>
          </button>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {viewMode === 'telemetry' ? (
            <>
              <button
                onClick={handleExportCsv}
                disabled={isExporting}
                title="Export strictly 13 columns as RFC 4180 CSV"
                style={{
                  padding: '7px 14px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#FFFFFF',
                  color: '#0F172A',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: isExporting ? 'wait' : 'pointer',
                  fontFamily: typography.fontFamily,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                }}
              >
                <Download size={14} color="#2563EB" />
                <span>{isExporting ? 'Exporting...' : (selectedHistoryUid ? 'Export Device CSV' : 'Export CSV')}</span>
              </button>

              <button
                onClick={() => loadTelemetryData()}
                disabled={isLoadingTelemetry}
                style={{
                  padding: '7px 14px',
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
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                }}
              >
                <RefreshCw size={13} className={isLoadingTelemetry ? 'animate-spin' : ''} />
                <span>Refresh</span>
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => handleOpenAddModal()}
                style={{
                  padding: '7px 14px',
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
                  padding: '7px 14px',
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
            </>
          )}
        </div>
      </div>

      {/* Action / Table Feedback Banner */}
      {(tableFeedback || actionFeedback) && (
        <div
          style={{
            backgroundColor: '#ECFDF5',
            border: '1px solid #A7F3D0',
            color: '#065F46',
            borderRadius: '6px',
            padding: '9px 14px',
            fontSize: '13px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <CheckCircle2 size={16} />
          <span>{tableFeedback || actionFeedback}</span>
        </div>
      )}

      {/* ==================================================== */}
      {/* VIEW MODE 1: HISTORICAL TELEMETRY DATA TABLE        */}
      {/* ==================================================== */}
      {viewMode === 'telemetry' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Top Banner / Bar: Differs if in Main Table vs Single Device History */}
          {!selectedHistoryUid ? (
            /* Genuine Hardware Fleet Summary Bar (Main 1-Row-Per-Device View) */
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
                backgroundColor: '#FFFFFF',
                borderRadius: '8px',
                padding: '12px 16px',
                border: '1px solid #E2E8F0',
                boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '18px', flexWrap: 'wrap' }}>
                <div>
                  <span style={{ fontSize: '12px', color: '#64748B' }}>Registered Physical Devices: </span>
                  <strong style={{ fontSize: '14px', color: '#0F172A' }}>{totalGenuineDevices}</strong>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span
                    style={{
                      display: 'inline-block',
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: '#10B981',
                    }}
                  />
                  <span style={{ fontSize: '12px', color: '#059669', fontWeight: 600 }}>2 Online</span>
                  <span style={{ color: '#CBD5E1' }}>|</span>
                  <span
                    style={{
                      display: 'inline-block',
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: '#94A3B8',
                    }}
                  />
                  <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>2 Offline</span>
                </div>
                <div style={{ color: '#CBD5E1' }}>|</div>
                <div>
                  <span style={{ fontSize: '12px', color: '#64748B' }}>Displaying: </span>
                  <strong style={{ fontSize: '13px', color: '#2563EB' }}>
                    1 Row Per Unique Physical Device
                  </strong>
                  <span style={{ fontSize: '12px', color: '#64748B', marginLeft: '6px' }}>
                    ({totalRecords} devices)
                  </span>
                </div>
              </div>

              {/* Quick Filter Device Pills */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 500 }}>Device History:</span>
                {uniqueDeviceIds.map((did) => (
                  <button
                    key={did}
                    onClick={() => {
                      setSelectedHistoryUid(did);
                      setCurrentPage(1);
                    }}
                    title={`Inspect complete historical telemetry for ${did}`}
                    style={{
                      padding: '3px 8px',
                      borderRadius: '4px',
                      border: '1px solid #E2E8F0',
                      backgroundColor: '#F8FAFC',
                      color: '#475569',
                      fontSize: '11px',
                      fontFamily: 'monospace',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {did.slice(0, 4)}...{did.slice(-4)} →
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Dedicated Device History Navigation Banner */
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
                backgroundColor: '#EFF6FF',
                borderRadius: '8px',
                padding: '12px 16px',
                border: '1px solid #BFDBFE',
                boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => {
                    setSelectedHistoryUid(null);
                    setCurrentPage(1);
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: '1px solid #3B82F6',
                    backgroundColor: '#FFFFFF',
                    color: '#1D4ED8',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <span>← Back to Devices Table</span>
                </button>
                <div>
                  <span style={{ fontSize: '12px', color: '#1E40AF' }}>Detailed Telemetry History for: </span>
                  <strong style={{ fontSize: '13.5px', color: '#0F172A', fontFamily: 'monospace' }}>
                    {selectedHistoryUid}
                  </strong>
                  <span style={{ fontSize: '12px', color: '#1E40AF', marginLeft: '8px', fontWeight: 600 }}>
                    ({totalRecords} records)
                  </span>
                </div>
              </div>

              {/* Quick switch to another device's history */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11.5px', color: '#1E40AF', fontWeight: 500 }}>Switch Device:</span>
                {uniqueDeviceIds.map((did) => {
                  const isSel = selectedHistoryUid === did;
                  return (
                    <button
                      key={did}
                      onClick={() => {
                        setSelectedHistoryUid(did);
                        setCurrentPage(1);
                      }}
                      style={{
                        padding: '3px 8px',
                        borderRadius: '4px',
                        border: isSel ? '1px solid #1D4ED8' : '1px solid #CBD5E1',
                        backgroundColor: isSel ? '#1D4ED8' : '#FFFFFF',
                        color: isSel ? '#FFFFFF' : '#1E293B',
                        fontSize: '11px',
                        fontFamily: 'monospace',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {did.slice(0, 4)}...{did.slice(-4)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Controls & Filters Card */}
          <BaseCard style={{ padding: '14px', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Row 1: Search & Date Filters */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                {/* Search */}
                <div style={{ position: 'relative', flex: '1 1 200px', minWidth: '180px' }}>
                  <Search
                    size={14}
                    color="#94A3B8"
                    style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }}
                  />
                  <input
                    type="text"
                    placeholder={!selectedHistoryUid ? "Search Device ID, train, coach..." : "Search within history..."}
                    value={searchDeviceId}
                    onChange={(e) => {
                      setSearchDeviceId(e.target.value);
                      setCurrentPage(1);
                    }}
                    style={{
                      width: '100%',
                      padding: '7px 28px 7px 32px',
                      borderRadius: '6px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13px',
                      fontFamily: typography.fontFamily,
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                  {searchDeviceId && (
                    <X
                      size={13}
                      color="#94A3B8"
                      onClick={() => setSearchDeviceId('')}
                      style={{
                        position: 'absolute',
                        right: '10px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        cursor: 'pointer',
                      }}
                    />
                  )}
                </div>

                {/* Date range filters (only relevant for detailed telemetry history) */}
                {selectedHistoryUid && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>From:</span>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => {
                          setStartDate(e.target.value);
                          setCurrentPage(1);
                        }}
                        style={{
                          padding: '5px 8px',
                          borderRadius: '6px',
                          border: '1px solid #CBD5E1',
                          fontSize: '12px',
                          fontFamily: typography.fontFamily,
                          backgroundColor: '#FFFFFF',
                          color: '#0F172A',
                        }}
                      />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>To:</span>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => {
                          setEndDate(e.target.value);
                          setCurrentPage(1);
                        }}
                        style={{
                          padding: '5px 8px',
                          borderRadius: '6px',
                          border: '1px solid #CBD5E1',
                          fontSize: '12px',
                          fontFamily: typography.fontFamily,
                          backgroundColor: '#FFFFFF',
                          color: '#0F172A',
                        }}
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Row 2: Validity Filters (if in history) & Sort Selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                {selectedHistoryUid && (
                  <>
                    {/* AI1 Valid Filter */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>AI1 Valid:</span>
                      <select
                        value={ai1ValidFilter}
                        onChange={(e) => {
                          setAi1ValidFilter(e.target.value);
                          setCurrentPage(1);
                        }}
                        style={{
                          padding: '5px 8px',
                          borderRadius: '6px',
                          border: '1px solid #CBD5E1',
                          fontSize: '12px',
                          backgroundColor: '#FFFFFF',
                          color: '#0F172A',
                        }}
                      >
                        <option value="All">All</option>
                        <option value="Valid">Valid</option>
                        <option value="Invalid">Invalid</option>
                      </select>
                    </div>

                    {/* GPS Valid Filter */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>GPS Valid:</span>
                      <select
                        value={gpsValidFilter}
                        onChange={(e) => {
                          setGpsValidFilter(e.target.value);
                          setCurrentPage(1);
                        }}
                        style={{
                          padding: '5px 8px',
                          borderRadius: '6px',
                          border: '1px solid #CBD5E1',
                          fontSize: '12px',
                          backgroundColor: '#FFFFFF',
                          color: '#0F172A',
                        }}
                      >
                        <option value="All">All</option>
                        <option value="Valid">Valid</option>
                        <option value="Invalid">Invalid</option>
                      </select>
                    </div>

                    {/* Altitude Valid Filter */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Alt Valid:</span>
                      <select
                        value={altitudeValidFilter}
                        onChange={(e) => {
                          setAltitudeValidFilter(e.target.value);
                          setCurrentPage(1);
                        }}
                        style={{
                          padding: '5px 8px',
                          borderRadius: '6px',
                          border: '1px solid #CBD5E1',
                          fontSize: '12px',
                          backgroundColor: '#FFFFFF',
                          color: '#0F172A',
                        }}
                      >
                        <option value="All">All</option>
                        <option value="Valid">Valid</option>
                        <option value="Invalid">Invalid</option>
                      </select>
                    </div>
                  </>
                )}

                {/* Sort Option */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Sort:</span>
                  <select
                    value={`${sortBy}_${sortOrder}`}
                    onChange={(e) => {
                      const [col, ord] = e.target.value.split('_');
                      setSortBy(col);
                      setSortOrder(ord as 'asc' | 'desc');
                      setCurrentPage(1);
                    }}
                    style={{
                      padding: '5px 8px',
                      borderRadius: '6px',
                      border: '1px solid #CBD5E1',
                      fontSize: '12px',
                      backgroundColor: '#FFFFFF',
                      color: '#0F172A',
                    }}
                  >
                    <option value="recordedAt_desc">Recorded At (Newest First)</option>
                    <option value="recordedAt_asc">Recorded At (Oldest First)</option>
                    <option value="receivedUtc_desc">Received UTC (Newest First)</option>
                    <option value="receivedUtc_asc">Received UTC (Oldest First)</option>
                    <option value="deviceId_asc">Device ID (A to Z)</option>
                    <option value="deviceId_desc">Device ID (Z to A)</option>
                    <option value="level1Percent_desc">Level 1 % (High to Low)</option>
                    <option value="level1Percent_asc">Level 1 % (Low to High)</option>
                    <option value="batteryPercent_desc">Battery % (High to Low)</option>
                    <option value="batteryPercent_asc">Battery % (Low to High)</option>
                  </select>
                </div>

                {/* Reset Filters Button */}
                {hasActiveFilters && (
                  <button
                    onClick={handleResetTelemetryFilters}
                    style={{
                      padding: '5px 10px',
                      borderRadius: '6px',
                      border: '1px solid #CBD5E1',
                      backgroundColor: '#F8FAFC',
                      color: '#64748B',
                      fontSize: '12px',
                      cursor: 'pointer',
                      fontWeight: 500,
                    }}
                  >
                    Reset Filters
                  </button>
                )}
              </div>
            </div>
          </BaseCard>

          {/* 13-Column SCADA Historical Telemetry Table */}
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '8px',
              border: '1px solid #E2E8F0',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              overflow: 'hidden',
            }}
          >
            <div style={{ overflowX: 'auto', width: '100%', WebkitOverflowScrolling: 'touch' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '12.5px',
                  fontFamily: typography.fontFamily,
                  textAlign: 'left',
                  whiteSpace: 'nowrap',
                }}
              >
                {/* Dark Navy Table Header */}
                <thead>
                  <tr
                    style={{
                      backgroundColor: '#0F172A',
                      color: '#F8FAFC',
                      fontWeight: 600,
                      userSelect: 'none',
                    }}
                  >
                    {/* 1. Device ID */}
                    <th
                      onClick={() => handleHeaderSort('deviceId')}
                      style={{
                        padding: '11px 14px',
                        cursor: 'pointer',
                        borderRight: '1px solid #1E293B',
                      }}
                    >
                      <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                        <span>Device ID</span>
                        {renderSortIndicator('deviceId')}
                      </div>
                    </th>

                    {/* 2. Recorded At */}
                    <th
                      onClick={() => handleHeaderSort('recordedAt')}
                      style={{
                        padding: '11px 14px',
                        cursor: 'pointer',
                        borderRight: '1px solid #1E293B',
                      }}
                    >
                      <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                        <span>Recorded At</span>
                        {renderSortIndicator('recordedAt')}
                      </div>
                    </th>

                    {/* 3. AI1 mA */}
                    <th
                      onClick={() => handleHeaderSort('ai1Ma')}
                      style={{
                        padding: '11px 14px',
                        cursor: 'pointer',
                        borderRight: '1px solid #1E293B',
                      }}
                    >
                      <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                        <span>AI1 mA</span>
                        {renderSortIndicator('ai1Ma')}
                      </div>
                    </th>

                    {/* 4. Level 1 % */}
                    <th
                      onClick={() => handleHeaderSort('level1Percent')}
                      style={{
                        padding: '11px 14px',
                        cursor: 'pointer',
                        borderRight: '1px solid #1E293B',
                      }}
                    >
                      <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                        <span>Level 1 %</span>
                        {renderSortIndicator('level1Percent')}
                      </div>
                    </th>

                    {/* 5. AI1 Valid */}
                    <th style={{ padding: '11px 14px', borderRight: '1px solid #1E293B' }}>
                      <span>AI1 Valid</span>
                    </th>

                    {/* 6. Battery V */}
                    <th
                      onClick={() => handleHeaderSort('batteryV')}
                      style={{
                        padding: '11px 14px',
                        cursor: 'pointer',
                        borderRight: '1px solid #1E293B',
                      }}
                    >
                      <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                        <span>Battery V</span>
                        {renderSortIndicator('batteryV')}
                      </div>
                    </th>

                    {/* 7. Battery % */}
                    <th
                      onClick={() => handleHeaderSort('batteryPercent')}
                      style={{
                        padding: '11px 14px',
                        cursor: 'pointer',
                        borderRight: '1px solid #1E293B',
                      }}
                    >
                      <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                        <span>Battery %</span>
                        {renderSortIndicator('batteryPercent')}
                      </div>
                    </th>

                    {/* 8. Latitude */}
                    <th style={{ padding: '11px 14px', borderRight: '1px solid #1E293B' }}>
                      <span>Latitude</span>
                    </th>

                    {/* 9. Longitude */}
                    <th style={{ padding: '11px 14px', borderRight: '1px solid #1E293B' }}>
                      <span>Longitude</span>
                    </th>

                    {/* 10. Altitude m */}
                    <th style={{ padding: '11px 14px', borderRight: '1px solid #1E293B' }}>
                      <span>Altitude m</span>
                    </th>

                    {/* 11. GPS Valid */}
                    <th style={{ padding: '11px 14px', borderRight: '1px solid #1E293B' }}>
                      <span>GPS Valid</span>
                    </th>

                    {/* 12. Altitude Valid */}
                    <th style={{ padding: '11px 14px', borderRight: '1px solid #1E293B' }}>
                      <span>Altitude Valid</span>
                    </th>

                    {/* 13. Received UTC */}
                    <th
                      onClick={() => handleHeaderSort('receivedUtc')}
                      style={{
                        padding: '11px 14px',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                        <span>Received UTC</span>
                        {renderSortIndicator('receivedUtc')}
                      </div>
                    </th>
                  </tr>
                </thead>

                {/* Table Body with Alternating Rows */}
                <tbody>
                  {isLoadingTelemetry ? (
                    <tr>
                      <td colSpan={13} style={{ padding: '36px', textAlign: 'center', color: '#64748B' }}>
                        <RefreshCw size={20} className="animate-spin" style={{ margin: '0 auto 8px auto' }} />
                        <div>Loading historical telemetry readings...</div>
                      </td>
                    </tr>
                  ) : telemetryRecords.length === 0 ? (
                    <tr>
                      <td colSpan={13} style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>
                        <AlertCircle size={24} style={{ margin: '0 auto 8px auto', color: '#94A3B8' }} />
                        <div style={{ fontSize: '14px', fontWeight: 600, color: '#334155' }}>
                          No Telemetry Records Found
                        </div>
                        <div style={{ fontSize: '12px', marginTop: '4px' }}>
                          Try adjusting your search criteria or resetting filters.
                        </div>
                        {hasActiveFilters && (
                          <button
                            onClick={handleResetTelemetryFilters}
                            style={{
                              marginTop: '12px',
                              padding: '6px 14px',
                              borderRadius: '6px',
                              border: '1px solid #CBD5E1',
                              backgroundColor: '#FFFFFF',
                              color: '#2563EB',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            Reset Filters
                          </button>
                        )}
                      </td>
                    </tr>
                  ) : (
                    telemetryRecords.map((row, idx) => {
                      // Alternating background: Row 1 White (#FFFFFF), Row 2 Very light blue (#F0F7FF)
                      const isAlternate = idx % 2 === 1;
                      const rowBg = isAlternate ? '#F0F7FF' : '#FFFFFF';

                      return (
                        <tr
                          key={row.id || `${row.deviceId}-${idx}`}
                          style={{
                            backgroundColor: rowBg,
                            borderBottom: '1px solid #E2E8F0',
                            transition: 'background-color 0.1s ease',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#E0F2FE';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = rowBg;
                          }}
                        >
                          {/* 1. Device ID */}
                          <td
                            onClick={() => {
                              setSelectedHistoryUid(row.deviceId);
                              setCurrentPage(1);
                            }}
                            title="Click to inspect complete historical telemetry for this device"
                            style={{
                              padding: '8px 14px',
                              fontWeight: 600,
                              color: '#2563EB',
                              fontFamily: 'monospace',
                              fontSize: '12px',
                              cursor: 'pointer',
                            }}
                          >
                            <span style={{ textDecoration: 'underline', textUnderlineOffset: '2px' }}>
                              {row.deviceId || '--'}
                            </span>
                            {!selectedHistoryUid && (
                              <span
                                style={{
                                  marginLeft: '8px',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  fontSize: '10px',
                                  fontWeight: 600,
                                  backgroundColor: '#EFF6FF',
                                  color: '#1D4ED8',
                                  border: '1px solid #BFDBFE',
                                }}
                              >
                                History →
                              </span>
                            )}
                          </td>

                          {/* 2. Recorded At */}
                          <td style={{ padding: '8px 14px', color: '#334155', fontVariantNumeric: 'tabular-nums' }}>
                            {row.recordedAt || '--'}
                          </td>

                          {/* 3. AI1 mA */}
                          <td
                            style={{
                              padding: '8px 14px',
                              fontWeight: 600,
                              color: '#0F172A',
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {row.ai1Ma != null ? row.ai1Ma.toFixed(2) : '--'}
                          </td>

                          {/* 4. Level 1 % */}
                          <td
                            style={{
                              padding: '8px 14px',
                              fontWeight: 700,
                              color: '#2563EB',
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {row.level1Percent || '--'}
                          </td>

                          {/* 5. AI1 Valid */}
                          <td style={{ padding: '8px 14px' }}>{renderValidityBadge(row.ai1Valid)}</td>

                          {/* 6. Battery V */}
                          <td style={{ padding: '8px 14px', color: '#334155', fontVariantNumeric: 'tabular-nums' }}>
                            {row.batteryV != null ? row.batteryV.toFixed(3) : '--'}
                          </td>

                          {/* 7. Battery % */}
                          <td style={{ padding: '8px 14px', color: '#334155', fontVariantNumeric: 'tabular-nums' }}>
                            {row.batteryPercent || '--'}
                          </td>

                          {/* 8. Latitude */}
                          <td
                            style={{
                              padding: '8px 14px',
                              color: '#334155',
                              fontFamily: 'monospace',
                              fontSize: '11.5px',
                            }}
                          >
                            {row.latitude != null ? row.latitude.toFixed(7) : '--'}
                          </td>

                          {/* 9. Longitude */}
                          <td
                            style={{
                              padding: '8px 14px',
                              color: '#334155',
                              fontFamily: 'monospace',
                              fontSize: '11.5px',
                            }}
                          >
                            {row.longitude != null ? row.longitude.toFixed(7) : '--'}
                          </td>

                          {/* 10. Altitude m */}
                          <td style={{ padding: '8px 14px', color: '#334155', fontVariantNumeric: 'tabular-nums' }}>
                            {row.altitudeM != null ? row.altitudeM.toFixed(2) : '--'}
                          </td>

                          {/* 11. GPS Valid */}
                          <td style={{ padding: '8px 14px' }}>{renderValidityBadge(row.gpsValid)}</td>

                          {/* 12. Altitude Valid */}
                          <td style={{ padding: '8px 14px' }}>{renderValidityBadge(row.altitudeValid)}</td>

                          {/* 13. Received UTC (strictly in UTC format: DD-MM-YYYY HH:mm:ss) */}
                          <td
                            style={{
                              padding: '8px 14px',
                              color: '#0F172A',
                              fontWeight: 500,
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {row.receivedUtc || '--'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls Footer */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 16px',
                backgroundColor: '#F8FAFC',
                borderTop: '1px solid #E2E8F0',
                flexWrap: 'wrap',
                gap: '10px',
              }}
            >
              {/* Record Summary */}
              <div style={{ fontSize: '13px', color: '#64748B' }}>
                Showing{' '}
                <strong style={{ color: '#0F172A' }}>
                  {totalRecords > 0 ? startIndex + 1 : 0} - {endIndex}
                </strong>{' '}
                of <strong style={{ color: '#0F172A' }}>{totalRecords}</strong> {!selectedHistoryUid ? 'devices' : 'records'}
              </div>

              {/* Rows Per Page Selector & Page Navigation */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '12px', color: '#64748B' }}>Rows per page:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '5px',
                      border: '1px solid #CBD5E1',
                      fontSize: '12px',
                      backgroundColor: '#FFFFFF',
                      color: '#0F172A',
                    }}
                  >
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>

                {/* Page Navigation Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {/* First */}
                  <button
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage <= 1 || isLoadingTelemetry}
                    title="First page"
                    style={{
                      padding: '5px 8px',
                      borderRadius: '5px',
                      border: '1px solid #CBD5E1',
                      backgroundColor: currentPage <= 1 ? '#F1F5F9' : '#FFFFFF',
                      color: currentPage <= 1 ? '#94A3B8' : '#334155',
                      cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <ChevronsLeft size={14} />
                  </button>

                  {/* Previous */}
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage <= 1 || isLoadingTelemetry}
                    title="Previous page"
                    style={{
                      padding: '5px 8px',
                      borderRadius: '5px',
                      border: '1px solid #CBD5E1',
                      backgroundColor: currentPage <= 1 ? '#F1F5F9' : '#FFFFFF',
                      color: currentPage <= 1 ? '#94A3B8' : '#334155',
                      cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <ChevronLeft size={14} />
                  </button>

                  {/* Current Page Pill */}
                  <span
                    style={{
                      padding: '5px 12px',
                      fontSize: '12px',
                      fontWeight: 600,
                      backgroundColor: '#2563EB',
                      color: '#FFFFFF',
                      borderRadius: '5px',
                    }}
                  >
                    {currentPage} / {totalPages || 1}
                  </span>

                  {/* Next */}
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages || isLoadingTelemetry}
                    title="Next page"
                    style={{
                      padding: '5px 8px',
                      borderRadius: '5px',
                      border: '1px solid #CBD5E1',
                      backgroundColor: currentPage >= totalPages ? '#F1F5F9' : '#FFFFFF',
                      color: currentPage >= totalPages ? '#94A3B8' : '#334155',
                      cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <ChevronRight size={14} />
                  </button>

                  {/* Last */}
                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage >= totalPages || isLoadingTelemetry}
                    title="Last page"
                    style={{
                      padding: '5px 8px',
                      borderRadius: '5px',
                      border: '1px solid #CBD5E1',
                      backgroundColor: currentPage >= totalPages ? '#F1F5F9' : '#FFFFFF',
                      color: currentPage >= totalPages ? '#94A3B8' : '#334155',
                      cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <ChevronsRight size={14} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* VIEW MODE 2: FLEET & DEVICE MANAGEMENT              */}
      {/* ==================================================== */}
      {viewMode === 'fleet' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: metrics.space16 }}>
          {/* Search & Filter Bar for Fleet */}
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
                <span style={{ fontSize: '13px', color: '#64748B', fontFamily: typography.fontFamily }}>
                  Connection:
                </span>
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

          {/* Device Overview Metric Cards (4 Tiles) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 155px), 1fr))',
              gap: metrics.space12,
              width: '100%',
            }}
          >
            {/* Total Devices */}
            <BaseCard style={{ height: '90px', padding: '12px', boxSizing: 'border-box' }}>
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748B' }}>TOTAL DEVICES</span>
                <span style={{ fontSize: '24px', fontWeight: 'bold', color: '#0F172A' }}>{totalCount}</span>
                <span style={{ fontSize: '11px', color: '#94A3B8' }}>Registered Monitoring Nodes</span>
              </div>
            </BaseCard>

            {/* Online Devices */}
            <BaseCard style={{ height: '90px', padding: '12px', boxSizing: 'border-box' }}>
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748B' }}>ONLINE</span>
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: '#10B981',
                      boxShadow: '0 0 6px rgba(16, 185, 129, 0.6)',
                    }}
                  />
                </div>
                <span style={{ fontSize: '24px', fontWeight: 'bold', color: '#10B981' }}>{onlineCount}</span>
                <span style={{ fontSize: '11px', color: '#94A3B8' }}>Active Telemetry Stream</span>
              </div>
            </BaseCard>

            {/* Warning Devices */}
            <BaseCard style={{ height: '90px', padding: '12px', boxSizing: 'border-box' }}>
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748B' }}>WARNING</span>
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: '#F59E0B',
                      boxShadow: '0 0 6px rgba(245, 158, 11, 0.6)',
                    }}
                  />
                </div>
                <span style={{ fontSize: '24px', fontWeight: 'bold', color: '#F59E0B' }}>{warningCount}</span>
                <span style={{ fontSize: '11px', color: '#94A3B8' }}>Low Level / Signal Drop</span>
              </div>
            </BaseCard>

            {/* Offline Devices */}
            <BaseCard style={{ height: '90px', padding: '12px', boxSizing: 'border-box' }}>
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748B' }}>OFFLINE</span>
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: '#EF4444',
                      boxShadow: '0 0 6px rgba(239, 68, 68, 0.6)',
                    }}
                  />
                </div>
                <span style={{ fontSize: '24px', fontWeight: 'bold', color: '#EF4444' }}>{offlineCount}</span>
                <span style={{ fontSize: '11px', color: '#94A3B8' }}>Awaiting Modem Ping</span>
              </div>
            </BaseCard>
          </div>

          {/* Device Cards Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))',
              gap: metrics.space16,
            }}
          >
            {filteredFleetDevices.map((dev) => {
              const statusColor = dev.status === 'Online' ? '#10B981' : dev.status === 'Warning' ? '#F59E0B' : '#EF4444';
              const statusBg = dev.status === 'Online' ? '#ECFDF5' : dev.status === 'Warning' ? '#FFFBEB' : '#FEF2F2';

              return (
                <BaseCard key={dev.dbId} style={{ padding: '16px', boxSizing: 'border-box' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: statusColor }} />
                        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>{dev.name}</h3>
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px', fontFamily: 'monospace' }}>
                        UID: {dev.id}
                      </div>
                    </div>
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 600,
                        backgroundColor: statusBg,
                        color: statusColor,
                      }}
                    >
                      {dev.status}
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px', marginBottom: '14px' }}>
                    <div>
                      <span style={{ color: '#64748B' }}>Train/Coach:</span>{' '}
                      <strong>
                        {dev.trainNumber}/{dev.coachNumber}
                      </strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748B' }}>Water Level:</span>{' '}
                      <strong style={{ color: '#2563EB' }}>
                        {dev.waterLevel != null ? `${dev.waterLevel.toFixed(1)}%` : '--'}
                      </strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748B' }}>Signal:</span> <span>{dev.signalQuality}</span>
                    </div>
                    <div>
                      <span style={{ color: '#64748B' }}>Last Seen:</span> <span>{dev.lastUpdate}</span>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'flex-end',
                      gap: '8px',
                      paddingTop: '10px',
                      borderTop: '1px solid #F1F5F9',
                    }}
                  >
                    <button
                      onClick={() => setSelectedDevice(dev)}
                      style={{
                        padding: '5px 10px',
                        borderRadius: '4px',
                        border: '1px solid #CBD5E1',
                        backgroundColor: '#FFFFFF',
                        color: '#334155',
                        fontSize: '12px',
                        fontWeight: 500,
                        cursor: 'pointer',
                      }}
                    >
                      Diagnostics
                    </button>
                    <button
                      onClick={() => handleOpenEditModal(dev)}
                      style={{
                        padding: '5px 10px',
                        borderRadius: '4px',
                        border: '1px solid #CBD5E1',
                        backgroundColor: '#FFFFFF',
                        color: '#334155',
                        fontSize: '12px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <Edit3 size={12} />
                      <span>Edit</span>
                    </button>
                    {currentUser?.role === 'ADMIN' && (
                      <button
                        onClick={() => handleDeleteDevice(dev)}
                        style={{
                          padding: '5px 10px',
                          borderRadius: '4px',
                          border: '1px solid #FECACA',
                          backgroundColor: '#FEF2F2',
                          color: '#DC2626',
                          fontSize: '12px',
                          fontWeight: 500,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <Trash2 size={12} />
                        <span>Delete</span>
                      </button>
                    )}
                  </div>
                </BaseCard>
              );
            })}
          </div>
        </div>
      )}

      {/* Diagnostics Drawer / Modal */}
      {selectedDevice && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000,
            padding: '16px',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '10px',
              maxWidth: '560px',
              width: '100%',
              padding: '20px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
              boxSizing: 'border-box',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0F172A' }}>
                  Diagnostics: {selectedDevice.name}
                </h3>
                <span style={{ fontSize: '12px', color: '#64748B', fontFamily: 'monospace' }}>
                  Hardware UID: {selectedDevice.id}
                </span>
              </div>
              <button
                onClick={() => setSelectedDevice(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#64748B',
                  padding: '4px',
                }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
              <InfoRow label="Assigned Location" value={selectedDevice.location} />
              <InfoRow label="Modem Model" value={selectedDevice.modemModel} />
              <InfoRow label="Connection Protocol" value={selectedDevice.connectionType} />
              <InfoRow label="Signal Quality" value={selectedDevice.signalQuality} />
              <InfoRow label="Firmware Version" value={selectedDevice.firmwareVersion} />
              <InfoRow label="Sensor Type" value={selectedDevice.sensorType} />
              <InfoRow label="Sensor Operating Status" value={selectedDevice.sensorStatus} />
              <InfoRow
                label="Water Level"
                value={
                  selectedDevice.waterLevel != null
                    ? `${selectedDevice.waterLevel.toFixed(1)}% (${selectedDevice.waterHeightCm ?? '--'} cm)`
                    : '--'
                }
              />
              <InfoRow label="Operating State" value={selectedDevice.alarmState} />
              <InfoRow label="Last Uplink Timestamp" value={selectedDevice.lastUpdate} />
            </div>

            <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setSelectedDevice(null)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: '#2563EB',
                  color: '#FFFFFF',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Close Diagnostics
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Device Modal */}
      {isAddModalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000,
            padding: '16px',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '10px',
              maxWidth: '540px',
              width: '100%',
              padding: '20px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              boxSizing: 'border-box',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0F172A' }}>Register New Monitoring Device</h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateDevice} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {formError && (
                <div style={{ padding: '8px 12px', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '6px', color: '#DC2626', fontSize: '12px' }}>
                  {formError}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Device Name *</label>
                  <input
                    type="text"
                    value={addName}
                    onChange={(e) => setAddName(e.target.value)}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px', boxSizing: 'border-box' }}
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Hardware UID *</label>
                  <input
                    type="text"
                    value={addUid}
                    onChange={(e) => setAddUid(e.target.value)}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px', boxSizing: 'border-box', fontFamily: 'monospace' }}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Train Number</label>
                  <input
                    type="text"
                    value={addTrainNumber}
                    onChange={(e) => setAddTrainNumber(e.target.value)}
                    placeholder="e.g. 12002"
                    style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Coach Number</label>
                  <input
                    type="text"
                    value={addCoachNumber}
                    onChange={(e) => setAddCoachNumber(e.target.value)}
                    placeholder="e.g. B4"
                    style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', color: '#475569', fontSize: '13px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ padding: '8px 18px', borderRadius: '6px', border: 'none', backgroundColor: '#2563EB', color: '#FFFFFF', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
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
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000,
            padding: '16px',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '10px',
              maxWidth: '540px',
              width: '100%',
              padding: '20px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              boxSizing: 'border-box',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0F172A' }}>Edit Device: {deviceToEdit.name}</h3>
              <button
                onClick={() => setIsEditModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleUpdateDevice} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {formError && (
                <div style={{ padding: '8px 12px', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '6px', color: '#DC2626', fontSize: '12px' }}>
                  {formError}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Device Name *</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px', boxSizing: 'border-box' }}
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Hardware UID</label>
                  <input
                    type="text"
                    value={deviceToEdit.id}
                    disabled
                    style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', fontSize: '13px', boxSizing: 'border-box', color: '#64748B', fontFamily: 'monospace' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Train Assignment</label>
                  <input
                    type="text"
                    value={editTrainNumber}
                    onChange={(e) => setEditTrainNumber(e.target.value)}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Coach Assignment</label>
                  <input
                    type="text"
                    value={editCoachNumber}
                    onChange={(e) => setEditCoachNumber(e.target.value)}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', color: '#475569', fontSize: '13px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ padding: '8px 18px', borderRadius: '6px', border: 'none', backgroundColor: '#2563EB', color: '#FFFFFF', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
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
