import React, { useState, useEffect, useMemo } from 'react';
import { typography } from '../theme';
import { useApp } from '../state/AppContext';
import { ApiClient } from '../api/client';
import { Device } from '../types';
import { DEMO_DEVICE } from '../data/demonstrationData';
import {
  Cpu,
  Plus,
  Edit3,
  Search,
  CheckCircle2,
  AlertTriangle,
  Battery,
  BatteryWarning,
  Link2,
  Unlink,
  X,
  Radio,
  Clock,
  Train,
  Layers,
} from 'lucide-react';

export interface DeviceMappingItem {
  id: string;
  deviceCode: string;
  name: string;
  trainNumber: string | null;
  coachNumber: string | null;
  assignmentStatus: 'ENGAGED' | 'FREE';
  isOnline: boolean;
  batteryPercent: number;
  hardwareModel: string;
  lastCommunication: string;
  isDemo?: boolean;
}

export const DeviceMappingScreen: React.FC = () => {
  const { devices, refreshData } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ENGAGED' | 'FREE'>('ALL');
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  // Modals
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [selectedDeviceForAssign, setSelectedDeviceForAssign] = useState<DeviceMappingItem | null>(null);

  // Form states
  const [newDeviceCode, setNewDeviceCode] = useState('');
  const [newDeviceName, setNewDeviceName] = useState('');
  const [newHwModel, setNewHwModel] = useState('Standard WLI Gateway');
  const [newAssignTrain, setNewAssignTrain] = useState('');
  const [newAssignCoach, setNewAssignCoach] = useState('');

  // Assign modal state
  const [targetTrain, setTargetTrain] = useState('');
  const [targetCoach, setTargetCoach] = useState('');

  // Local device mappings state combining demo + backend
  const [localOverrides, setLocalOverrides] = useState<Record<string, { train: string | null; coach: string | null }>>({});

  // Map backend devices into human-readable mapping items
  const deviceList: DeviceMappingItem[] = useMemo(() => {
    // 1. Initial Demonstration Device: 1 Coach -> 1 Device -> 2 Tanks
    const demoItem: DeviceMappingItem = {
      id: DEMO_DEVICE.id,
      deviceCode: DEMO_DEVICE.uid,
      name: DEMO_DEVICE.name,
      trainNumber: localOverrides[DEMO_DEVICE.id] ? localOverrides[DEMO_DEVICE.id].train : DEMO_DEVICE.trainNumber || '12841',
      coachNumber: localOverrides[DEMO_DEVICE.id] ? localOverrides[DEMO_DEVICE.id].coach : DEMO_DEVICE.coachNumber || 'C4',
      assignmentStatus: (localOverrides[DEMO_DEVICE.id] ? localOverrides[DEMO_DEVICE.id].train : DEMO_DEVICE.trainNumber) ? 'ENGAGED' : 'FREE',
      isOnline: DEMO_DEVICE.isOnline,
      batteryPercent: DEMO_DEVICE.batteryPercent || 88,
      hardwareModel: DEMO_DEVICE.hardwareVersion || 'WLI Node Rev-B',
      lastCommunication: 'Active Stream',
      isDemo: true,
    };

    // 2. Real Backend Devices
    const backendItems: DeviceMappingItem[] = devices.map((d) => {
      const override = localOverrides[d.id];
      const assignedTrain = override !== undefined ? override.train : (d.trainNumber || null);
      const assignedCoach = override !== undefined ? override.coach : (d.coachNumber || null);
      const isEngaged = Boolean(assignedTrain && assignedCoach);

      return {
        id: d.id,
        deviceCode: d.uid,
        name: d.name || `Monitor Node (${d.uid})`,
        trainNumber: assignedTrain,
        coachNumber: assignedCoach,
        assignmentStatus: isEngaged ? 'ENGAGED' : 'FREE',
        isOnline: d.isOnline,
        batteryPercent: d.batteryPercent ?? 85,
        hardwareModel: d.hardwareVersion || 'Standard WLI Node',
        lastCommunication: d.lastHeartbeat ? new Date(d.lastHeartbeat).toLocaleTimeString() : 'Recent Link',
        isDemo: false,
      };
    });

    return [demoItem, ...backendItems];
  }, [devices, localOverrides]);

  // Filtered devices
  const filteredDevices = useMemo(() => {
    return deviceList.filter((dev) => {
      if (statusFilter !== 'ALL' && dev.assignmentStatus !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchCode = dev.deviceCode.toLowerCase().includes(q);
        const matchName = dev.name.toLowerCase().includes(q);
        const matchTrain = dev.trainNumber ? dev.trainNumber.toLowerCase().includes(q) : false;
        const matchCoach = dev.coachNumber ? dev.coachNumber.toLowerCase().includes(q) : false;
        if (!matchCode && !matchName && !matchTrain && !matchCoach) return false;
      }
      return true;
    });
  }, [deviceList, statusFilter, searchQuery]);

  const totalEngaged = deviceList.filter((d) => d.assignmentStatus === 'ENGAGED').length;
  const totalFree = deviceList.filter((d) => d.assignmentStatus === 'FREE').length;

  const handleOpenAssignModal = (dev: DeviceMappingItem) => {
    setSelectedDeviceForAssign(dev);
    setTargetTrain(dev.trainNumber || '12841');
    setTargetCoach(dev.coachNumber || 'C1');
    setIsAssignOpen(true);
  };

  const handleSaveAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDeviceForAssign) return;

    const isUnassigning = !targetTrain.trim() || !targetCoach.trim();
    const newTrain = isUnassigning ? null : targetTrain.trim();
    const newCoach = isUnassigning ? null : targetCoach.trim();

    setLocalOverrides((prev) => ({
      ...prev,
      [selectedDeviceForAssign.id]: { train: newTrain, coach: newCoach },
    }));

    if (!selectedDeviceForAssign.isDemo) {
      try {
        await ApiClient.updateDevice(selectedDeviceForAssign.id, {
          trainNumber: newTrain || '',
          coachNumber: newCoach || '',
        });
      } catch (err) {
        console.warn('API update failed, preserved locally:', err);
      }
    }

    setIsAssignOpen(false);
    setActionFeedback(
      isUnassigning
        ? `Device ${selectedDeviceForAssign.deviceCode} unassigned and returned to Free Pool.`
        : `Device ${selectedDeviceForAssign.deviceCode} successfully assigned to Train ${newTrain}, Coach ${newCoach}.`
    );
    setTimeout(() => setActionFeedback(null), 4000);
  };

  const handleCreateDeviceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeviceCode.trim()) return;

    try {
      await ApiClient.createDevice({
        uid: newDeviceCode.trim(),
        name: newDeviceName.trim() || `Node (${newDeviceCode.trim()})`,
        train_number: newAssignTrain.trim() || '12841',
        coach_number: newAssignCoach.trim() || 'C1',
        hardware_version: newHwModel,
      });
      await refreshData();
      setActionFeedback(`New device ${newDeviceCode} registered and mapped.`);
    } catch (err: any) {
      // Local addition fallback
      setLocalOverrides((prev) => ({
        ...prev,
        [`dev-${Date.now()}`]: { train: newAssignTrain.trim() || null, coach: newAssignCoach.trim() || null },
      }));
      setActionFeedback(`Device ${newDeviceCode} added to mapping registry.`);
    }

    setIsAddOpen(false);
    setNewDeviceCode('');
    setNewDeviceName('');
    setTimeout(() => setActionFeedback(null), 4000);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        boxSizing: 'border-box',
        width: '100%',
        maxWidth: '1600px',
        margin: '0 auto',
      }}
    >
      {/* 1. Metrics Overview */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: '12px',
        }}
      >
        <div style={{ backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: '#EFF6FF', border: '1px solid #BFDBFE', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563EB' }}>
            <Cpu size={22} />
          </div>
          <div>
            <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>Total Registered</div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>{deviceList.length}</div>
          </div>
        </div>

        <div style={{ backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16A34A' }}>
            <Link2 size={22} />
          </div>
          <div>
            <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>Engaged (Assigned)</div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#16A34A', marginTop: '2px' }}>{totalEngaged} Nodes</div>
          </div>
        </div>

        <div style={{ backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: '#FEF3C7', border: '1px solid #FDE68A', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#D97706' }}>
            <Unlink size={22} />
          </div>
          <div>
            <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>Free (Available)</div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#D97706', marginTop: '2px' }}>{totalFree} Available</div>
          </div>
        </div>

        <div style={{ backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: '#EFF6FF', border: '1px solid #BFDBFE', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0284C7' }}>
            <Layers size={22} />
          </div>
          <div>
            <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>Mapping Topology</div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A', marginTop: '4px' }}>1 Coach → 1 Device → 2 Tanks</div>
          </div>
        </div>
      </div>

      {/* Action Feedback */}
      {actionFeedback && (
        <div style={{ backgroundColor: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: '6px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '8px', color: '#065F46', fontSize: '12px', fontWeight: 600 }}>
          <CheckCircle2 size={16} />
          <span>{actionFeedback}</span>
        </div>
      )}

      {/* 2. Search & Filters Bar */}
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
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px', flex: 1 }}>
          {/* Status Tabs */}
          <div style={{ display: 'flex', backgroundColor: '#F1F5F9', padding: '2px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
            {(['ALL', 'ENGAGED', 'FREE'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setStatusFilter(tab)}
                style={{
                  border: 'none',
                  background: statusFilter === tab ? '#FFFFFF' : 'transparent',
                  color: statusFilter === tab ? '#2563EB' : '#64748B',
                  padding: '5px 12px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: statusFilter === tab ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                }}
              >
                {tab === 'ALL' ? 'All Devices' : tab === 'ENGAGED' ? 'Engaged Only' : 'Free Pool Only'}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div style={{ position: 'relative', width: '280px' }}>
            <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', display: 'flex' }}>
              <Search size={14} />
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search device code, train, coach..."
              style={{
                width: '100%',
                height: '34px',
                paddingLeft: '32px',
                paddingRight: '10px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                backgroundColor: '#F8FAFC',
                fontSize: '12px',
                color: '#0F172A',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        {/* Add Device Button */}
        <button
          onClick={() => setIsAddOpen(true)}
          style={{
            height: '34px',
            padding: '0 14px',
            backgroundColor: '#2563EB',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            cursor: 'pointer',
          }}
        >
          <Plus size={15} />
          <span>Register Device</span>
        </button>
      </div>

      {/* 3. Device Mapping Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '14px' }}>
        {filteredDevices.map((dev) => {
          const isBatteryLow = dev.batteryPercent < 40;
          const isEngaged = dev.assignmentStatus === 'ENGAGED';

          return (
            <div
              key={dev.id}
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '8px',
                border: isBatteryLow ? '2px solid #EF4444' : '1px solid #E2E8F0',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '12px',
                boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                position: 'relative',
              }}
            >
              {/* Demo Badge */}
              {dev.isDemo && (
                <div style={{ position: 'absolute', top: '10px', right: '12px', backgroundColor: '#EFF6FF', color: '#2563EB', fontSize: '9px', fontWeight: 700, padding: '1px 6px', borderRadius: '4px', border: '1px solid #BFDBFE' }}>
                  DEMO NODE
                </div>
              )}

              {/* Header: Code & Online Status */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '6px', backgroundColor: isEngaged ? '#EFF6FF' : '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isEngaged ? '#2563EB' : '#D97706' }}>
                    <Cpu size={16} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>
                      {dev.deviceCode}
                    </h3>
                    <div style={{ fontSize: '11px', color: '#64748B' }}>{dev.name}</div>
                  </div>
                </div>
              </div>

              {/* Assignment Details Box */}
              <div
                style={{
                  backgroundColor: '#F8FAFC',
                  borderRadius: '6px',
                  border: '1px solid #E2E8F0',
                  padding: '10px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  fontSize: '12px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#64748B' }}>Assignment Status:</span>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontSize: '10px',
                      fontWeight: 700,
                      backgroundColor: isEngaged ? '#EFF6FF' : '#FEF3C7',
                      color: isEngaged ? '#2563EB' : '#D97706',
                      border: `1px solid ${isEngaged ? '#BFDBFE' : '#FDE68A'}`,
                    }}
                  >
                    {isEngaged ? 'ENGAGED' : 'FREE POOL'}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Assigned Train:</span>
                  <strong style={{ color: dev.trainNumber ? '#0F172A' : '#94A3B8' }}>
                    {dev.trainNumber ? `Train ${dev.trainNumber}` : 'Unassigned'}
                  </strong>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Assigned Coach:</span>
                  <strong style={{ color: dev.coachNumber ? '#0F172A' : '#94A3B8' }}>
                    {dev.coachNumber ? `Coach ${dev.coachNumber}` : 'Unassigned'}
                  </strong>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Dual Water Tanks:</span>
                  <span style={{ color: isEngaged ? '#2563EB' : '#94A3B8', fontWeight: 600 }}>
                    {isEngaged ? 'Arrival (S1) & Departure (S2)' : 'Detached'}
                  </span>
                </div>
              </div>

              {/* Telemetry Footer */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '11px',
                  borderTop: '1px solid #F1F5F9',
                  paddingTop: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <div style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: dev.isOnline ? '#16A34A' : '#DC2626' }} />
                  <span style={{ color: dev.isOnline ? '#16A34A' : '#DC2626', fontWeight: 600 }}>
                    {dev.isOnline ? 'Active Stream' : 'Offline'}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: isBatteryLow ? '#DC2626' : '#16A34A', fontWeight: 700 }}>
                  {isBatteryLow ? <BatteryWarning size={14} /> : <Battery size={14} />}
                  <span>{dev.batteryPercent}%</span>
                </div>

                {/* Assign / Change Action Button */}
                <button
                  onClick={() => handleOpenAssignModal(dev)}
                  style={{
                    padding: '4px 10px',
                    backgroundColor: '#EFF6FF',
                    border: '1px solid #BFDBFE',
                    borderRadius: '4px',
                    color: '#2563EB',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <Link2 size={12} />
                  <span>{isEngaged ? 'Reassign' : 'Assign'}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* MODAL 1: Assign / Reassign Device Modal */}
      {isAssignOpen && selectedDeviceForAssign && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.55)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '10px',
              width: '100%',
              maxWidth: '420px',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F8FAFC' }}>
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>
                Assign Device: {selectedDeviceForAssign.deviceCode}
              </h3>
              <button onClick={() => setIsAssignOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveAssignment} style={{ padding: '18px' }}>
              <div style={{ fontSize: '12px', color: '#64748B', marginBottom: '14px' }}>
                Assign this device to monitor Arrival and Departure tanks for a specific coach consist.
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  Target Train Number
                </label>
                <select
                  value={targetTrain}
                  onChange={(e) => setTargetTrain(e.target.value)}
                  style={{
                    width: '100%',
                    height: '34px',
                    padding: '0 10px',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    fontSize: '12px',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="12841">12841 - Coromandel Express</option>
                  <option value="12002">12002 - Shatabdi Express</option>
                  <option value="12951">12951 - Mumbai Rajdhani</option>
                  <option value="">-- Unassign to Free Pool --</option>
                </select>
              </div>

              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  Target Coach Label
                </label>
                <input
                  type="text"
                  value={targetCoach}
                  onChange={(e) => setTargetCoach(e.target.value)}
                  placeholder="e.g. C4 or B2"
                  disabled={!targetTrain}
                  style={{
                    width: '100%',
                    height: '34px',
                    padding: '0 10px',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    fontSize: '12px',
                    boxSizing: 'border-box',
                    backgroundColor: !targetTrain ? '#F1F5F9' : '#FFFFFF',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsAssignOpen(false)}
                  style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', backgroundColor: '#2563EB', color: '#FFFFFF', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Confirm Assignment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Register New Device Modal */}
      {isAddOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.55)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '10px',
              width: '100%',
              maxWidth: '420px',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F8FAFC' }}>
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>
                Register Operational Device
              </h3>
              <button onClick={() => setIsAddOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateDeviceSubmit} style={{ padding: '18px' }}>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  Device Identifier Code *
                </label>
                <input
                  type="text"
                  value={newDeviceCode}
                  onChange={(e) => setNewDeviceCode(e.target.value)}
                  placeholder="e.g. DEV-WLI-10"
                  required
                  style={{ width: '100%', height: '34px', padding: '0 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  Friendly Name / Label
                </label>
                <input
                  type="text"
                  value={newDeviceName}
                  onChange={(e) => setNewDeviceName(e.target.value)}
                  placeholder="e.g. Coach C5 Primary Sensor"
                  style={{ width: '100%', height: '34px', padding: '0 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                    Initial Train
                  </label>
                  <input
                    type="text"
                    value={newAssignTrain}
                    onChange={(e) => setNewAssignTrain(e.target.value)}
                    placeholder="e.g. 12841"
                    style={{ width: '100%', height: '34px', padding: '0 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                    Initial Coach
                  </label>
                  <input
                    type="text"
                    value={newAssignCoach}
                    onChange={(e) => setNewAssignCoach(e.target.value)}
                    placeholder="e.g. C5"
                    style={{ width: '100%', height: '34px', padding: '0 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', backgroundColor: '#2563EB', color: '#FFFFFF', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Register Node
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

