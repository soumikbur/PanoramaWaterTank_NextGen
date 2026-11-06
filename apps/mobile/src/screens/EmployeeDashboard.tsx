import React, { useState, useEffect, useMemo } from 'react';
import { typography } from '../theme';
import { useApp } from '../state/AppContext';
import { ApiClient } from '../api/client';
import { TrainOverviewItem } from '../types';
import { DEMO_TRAIN, DEMO_ARRIVAL_TANK, DEMO_DEPARTURE_TANK, DemoTrain } from '../data/demonstrationData';
import { TankVisualization } from '../components/tank/TankVisualization';
import {
  Train,
  Plus,
  Search,
  MapPin,
  Clock,
  Layers,
  Gauge,
  Activity,
  Edit3,
  X,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Shield,
  Radio,
  ExternalLink,
} from 'lucide-react';

export const EmployeeDashboard: React.FC = () => {
  const {
    setActiveScreen,
    setSelectedTrainNumber,
    regions,
    refreshRegions,
    currentUser,
    liveTank,
    tanks,
    devices,
  } = useApp();

  const [selectedRegion, setSelectedRegion] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [backendTrains, setBackendTrains] = useState<TrainOverviewItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [selectedTrainForEdit, setSelectedTrainForEdit] = useState<any>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Dual Tank Quick Modal for Demo / Coach Inspection
  const [dualTankModalTrain, setDualTankModalTrain] = useState<string | null>(null);

  // Add Train Form
  const [newTrainNumber, setNewTrainNumber] = useState('');
  const [newTrainName, setNewTrainName] = useState('');
  const [newTrainSource, setNewTrainSource] = useState('');
  const [newTrainDestination, setNewTrainDestination] = useState('');
  const [newTrainRegion, setNewTrainRegion] = useState('South East');
  const [newInitialCoach, setNewInitialCoach] = useState('C1');

  // Edit Train Form
  const [editTrainNumber, setEditTrainNumber] = useState('');
  const [editTrainName, setEditTrainName] = useState('');
  const [editTrainSource, setEditTrainSource] = useState('');
  const [editTrainDestination, setEditTrainDestination] = useState('');
  const [editTrainRegion, setEditTrainRegion] = useState('South East');
  const [editTrainStatus, setEditTrainStatus] = useState('Running');

  // Load backend trains
  const loadTrains = async () => {
    try {
      setLoading(true);
      const res = await ApiClient.fetchTrains(
        selectedRegion === 'ALL' ? undefined : selectedRegion,
        searchQuery || undefined
      );
      setBackendTrains(Array.isArray(res) ? res : []);
    } catch (e) {
      console.warn('[EmployeeDashboard] Error loading trains:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTrains();
  }, [selectedRegion, searchQuery]);

  // Combined and filtered trains list
  const availableRegions = [
    'ALL',
    'South East',
    'Northern',
    'Western',
    'Central',
    'Southern',
    'Eastern',
  ];

  // Demo train matches filter?
  const showDemoTrain = useMemo(() => {
    const matchRegion = selectedRegion === 'ALL' || selectedRegion === DEMO_TRAIN.region;
    const matchQuery =
      !searchQuery.trim() ||
      DEMO_TRAIN.trainNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      DEMO_TRAIN.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      DEMO_TRAIN.source.toLowerCase().includes(searchQuery.toLowerCase()) ||
      DEMO_TRAIN.destination.toLowerCase().includes(searchQuery.toLowerCase());
    return matchRegion && matchQuery;
  }, [selectedRegion, searchQuery]);

  const handleOpenAddModal = () => {
    setNewTrainNumber('');
    setNewTrainName('');
    setNewTrainSource('');
    setNewTrainDestination('');
    setNewTrainRegion('South East');
    setNewInitialCoach('C1');
    setFormError(null);
    setIsAddModalOpen(true);
  };

  const handleCreateTrainSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTrainNumber.trim() || !newTrainName.trim()) {
      setFormError('Train number and train name are required.');
      return;
    }

    try {
      setLoading(true);
      await ApiClient.createTrain({
        train_number: newTrainNumber.trim(),
        name: newTrainName.trim(),
        region: newTrainRegion,
        coach_number: newInitialCoach.trim() || 'C1',
        tank_capacity: 20.0,
      });

      setIsAddModalOpen(false);
      setActionFeedback(`Train ${newTrainNumber} successfully added to operational fleet.`);
      setTimeout(() => setActionFeedback(null), 4000);
      await loadTrains();
      await refreshRegions();
    } catch (err: any) {
      setFormError(err.message || 'Failed to add train');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenEditModal = (train: any) => {
    setSelectedTrainForEdit(train);
    setEditTrainNumber(train.train_number || train.trainNumber);
    setEditTrainName(train.name);
    setEditTrainSource(train.source || 'Station A');
    setEditTrainDestination(train.destination || 'Station B');
    setEditTrainRegion(train.region || 'South East');
    setEditTrainStatus(train.operationalStatus || train.type || 'Running');
    setFormError(null);
    setIsEditModalOpen(true);
  };

  const handleUpdateTrainSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTrainName.trim()) {
      setFormError('Train name is required.');
      return;
    }

    try {
      setLoading(true);
      await ApiClient.updateTrain(editTrainNumber, {
        name: editTrainName.trim(),
        region: editTrainRegion,
        type: editTrainStatus,
      });

      setIsEditModalOpen(false);
      setActionFeedback(`Train ${editTrainNumber} configuration updated successfully.`);
      setTimeout(() => setActionFeedback(null), 4000);
      await loadTrains();
    } catch (err: any) {
      setFormError(err.message || 'Failed to update train');
    } finally {
      setLoading(false);
    }
  };

  const handleManageCoaches = (trainNumber: string) => {
    setSelectedTrainNumber(trainNumber);
    setActiveScreen('coaches');
  };

  const handleTrackGps = (trainNumber: string) => {
    setSelectedTrainNumber(trainNumber);
    setActiveScreen('location');
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
      {/* Top SCADA Metrics Header */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: '12px',
        }}
      >
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '8px',
            border: '1px solid #E2E8F0',
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '8px',
              backgroundColor: '#EFF6FF',
              border: '1px solid #BFDBFE',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#2563EB',
            }}
          >
            <Train size={22} />
          </div>
          <div>
            <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>
              Active Trains
            </div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>
              {(backendTrains.length || 0) + (showDemoTrain ? 1 : 0)}
            </div>
          </div>
        </div>

        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '8px',
            border: '1px solid #E2E8F0',
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '8px',
              backgroundColor: '#F0FDF4',
              border: '1px solid #BBF7D0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#16A34A',
            }}
          >
            <Layers size={22} />
          </div>
          <div>
            <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>
              Coaches Monitored
            </div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>
              {devices.length > 0 ? devices.length : 1}
            </div>
          </div>
        </div>

        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '8px',
            border: '1px solid #E2E8F0',
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '8px',
              backgroundColor: '#EFF6FF',
              border: '1px solid #BFDBFE',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#0284C7',
            }}
          >
            <Gauge size={22} />
          </div>
          <div>
            <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>
              Reservoir Tanks
            </div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>
              {tanks.length > 0 ? tanks.length : 2}
            </div>
          </div>
        </div>

        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '8px',
            border: '1px solid #E2E8F0',
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '8px',
              backgroundColor: '#ECFDF5',
              border: '1px solid #A7F3D0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#059669',
            }}
          >
            <Radio size={22} />
          </div>
          <div>
            <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>
              Devices Engaged
            </div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>
              {devices.filter((d) => d.isOnline).length > 0
                ? `${devices.filter((d) => d.isOnline).length} Active`
                : '1 Engaged'}
            </div>
          </div>
        </div>
      </div>

      {/* Action Feedback Banner */}
      {actionFeedback && (
        <div
          style={{
            backgroundColor: '#ECFDF5',
            border: '1px solid #A7F3D0',
            borderRadius: '6px',
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            color: '#065F46',
            fontSize: '12px',
            fontWeight: 600,
          }}
        >
          <CheckCircle2 size={16} />
          <span>{actionFeedback}</span>
        </div>
      )}

      {/* Filter & Search Bar */}
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
          {/* Region Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Region:</span>
            <select
              value={selectedRegion}
              onChange={(e) => setSelectedRegion(e.target.value)}
              style={{
                height: '34px',
                padding: '0 10px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                backgroundColor: '#F8FAFC',
                color: '#0F172A',
                fontSize: '12px',
                fontWeight: 600,
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              {availableRegions.map((reg) => (
                <option key={reg} value={reg}>
                  {reg === 'ALL' ? 'All Railway Regions' : reg}
                </option>
              ))}
            </select>
          </div>

          {/* Search Input */}
          <div style={{ position: 'relative', width: '280px' }}>
            <span
              style={{
                position: 'absolute',
                left: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#94A3B8',
                display: 'flex',
              }}
            >
              <Search size={14} />
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search train number or name..."
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

        {/* Add Train Button */}
        <button
          onClick={handleOpenAddModal}
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
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
          }}
        >
          <Plus size={15} />
          <span>Add Train</span>
        </button>
      </div>

      {/* Train Cards List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {/* 1. Demonstration Train Card */}
        {showDemoTrain && (
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '8px',
              border: '1px solid #BFDBFE',
              boxShadow: '0 1px 3px rgba(37, 99, 235, 0.08)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Demo Header Banner */}
            <div
              style={{
                backgroundColor: '#EFF6FF',
                borderBottom: '1px solid #DBEAFE',
                padding: '8px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    backgroundColor: '#2563EB',
                    color: '#FFFFFF',
                    fontSize: '9px',
                    fontWeight: 700,
                    letterSpacing: '0.6px',
                    padding: '2px 7px',
                    borderRadius: '4px',
                    textTransform: 'uppercase',
                  }}
                >
                  Demonstration Record
                </span>
                <span style={{ fontSize: '11px', color: '#1E40AF', fontWeight: 600 }}>
                  Isolated initial demo structure (1 Region &bull; 1 Train &bull; 1 Coach &bull; 1 Device &bull; 2 Water Tanks)
                </span>
              </div>
              <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 500 }}>
                Region: <strong>{DEMO_TRAIN.region}</strong>
              </span>
            </div>

            {/* Train Information Body */}
            <div
              style={{
                padding: '16px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: '16px',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '8px',
                      backgroundColor: '#EFF6FF',
                      border: '1px solid #BFDBFE',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#2563EB',
                      fontWeight: 800,
                      fontSize: '13px',
                    }}
                  >
                    12841
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>
                      {DEMO_TRAIN.name}
                    </h3>
                    <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                      {DEMO_TRAIN.source} &rarr; {DEMO_TRAIN.destination}
                    </div>
                  </div>
                </div>
              </div>

              {/* Status & Telemetry Grid */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', fontSize: '12px' }}>
                <div>
                  <div style={{ color: '#64748B', fontSize: '10px', textTransform: 'uppercase', fontWeight: 600 }}>
                    Operational Status
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '3px' }}>
                    <div style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#16A34A' }} />
                    <strong style={{ color: '#16A34A' }}>{DEMO_TRAIN.operationalStatus}</strong>
                  </div>
                </div>

                <div>
                  <div style={{ color: '#64748B', fontSize: '10px', textTransform: 'uppercase', fontWeight: 600 }}>
                    GPS Telemetry
                  </div>
                  <div style={{ color: '#0F172A', fontWeight: 600, marginTop: '3px' }}>
                    {DEMO_TRAIN.latitude.toFixed(4)}°, {DEMO_TRAIN.longitude.toFixed(4)}°
                  </div>
                  <div style={{ fontSize: '10px', color: '#64748B' }}>
                    {DEMO_TRAIN.speedKmh} km/h • Near {DEMO_TRAIN.nearestStation}
                  </div>
                </div>

                <div>
                  <div style={{ color: '#64748B', fontSize: '10px', textTransform: 'uppercase', fontWeight: 600 }}>
                    Assigned Equipment
                  </div>
                  <div style={{ color: '#0F172A', fontWeight: 600, marginTop: '3px' }}>
                    Coach {DEMO_TRAIN.coaches[0].coachNumber} &bull; {DEMO_TRAIN.coaches[0].deviceId}
                  </div>
                  <div style={{ fontSize: '10px', color: '#2563EB' }}>
                    2 Tanks (Arrival: 75%, Departure: 68%)
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => handleManageCoaches(DEMO_TRAIN.trainNumber)}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: '#EFF6FF',
                    border: '1px solid #BFDBFE',
                    borderRadius: '6px',
                    color: '#2563EB',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                  }}
                >
                  <Layers size={13} />
                  <span>Coach Consist</span>
                </button>

                <button
                  onClick={() => setDualTankModalTrain(DEMO_TRAIN.trainNumber)}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: '#EFF6FF',
                    border: '1px solid #BFDBFE',
                    borderRadius: '6px',
                    color: '#0284C7',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                  }}
                >
                  <Gauge size={13} />
                  <span>Dual Tank Monitor</span>
                </button>

                <button
                  onClick={() => handleTrackGps(DEMO_TRAIN.trainNumber)}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: '#F8FAFC',
                    border: '1px solid #CBD5E1',
                    borderRadius: '6px',
                    color: '#475569',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                  }}
                >
                  <MapPin size={13} />
                  <span>Track GPS</span>
                </button>

                <button
                  onClick={() => handleOpenEditModal(DEMO_TRAIN)}
                  style={{
                    padding: '6px 10px',
                    backgroundColor: '#F8FAFC',
                    border: '1px solid #CBD5E1',
                    borderRadius: '6px',
                    color: '#475569',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                  title="Edit Train Configuration"
                >
                  <Edit3 size={13} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 2. Registered Backend Trains */}
        {backendTrains.map((train) => (
          <div
            key={train.train_number}
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '8px',
              border: '1px solid #E2E8F0',
              padding: '16px',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '16px',
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '8px',
                    backgroundColor: '#F1F5F9',
                    border: '1px solid #CBD5E1',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#334155',
                    fontWeight: 800,
                    fontSize: '13px',
                  }}
                >
                  {train.train_number}
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>
                    {train.name}
                  </h3>
                  <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                    Region: <strong>{train.region || 'Northern'}</strong> &bull;{' '}
                    {train.type || 'Superfast Express'}
                  </div>
                </div>
              </div>
            </div>

            {/* Operational Details */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', fontSize: '12px' }}>
              <div>
                <div style={{ color: '#64748B', fontSize: '10px', textTransform: 'uppercase', fontWeight: 600 }}>
                  Fleet Status
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '3px' }}>
                  <div
                    style={{
                      width: '7px',
                      height: '7px',
                      borderRadius: '50%',
                      backgroundColor: train.has_active_alarms ? '#DC2626' : '#16A34A',
                    }}
                  />
                  <strong style={{ color: train.has_active_alarms ? '#DC2626' : '#16A34A' }}>
                    {train.has_active_alarms ? 'Active Warning' : 'Operational'}
                  </strong>
                </div>
              </div>

              <div>
                <div style={{ color: '#64748B', fontSize: '10px', textTransform: 'uppercase', fontWeight: 600 }}>
                  Consist Size
                </div>
                <div style={{ color: '#0F172A', fontWeight: 600, marginTop: '3px' }}>
                  {train.coaches_count || 1} Registered Coaches
                </div>
                <div style={{ fontSize: '10px', color: '#64748B' }}>
                  {train.devices_count || 1} Active IoT Devices
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => handleManageCoaches(train.train_number)}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#EFF6FF',
                  border: '1px solid #BFDBFE',
                  borderRadius: '6px',
                  color: '#2563EB',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <Layers size={13} />
                <span>Coach Consist</span>
              </button>

              <button
                onClick={() => handleTrackGps(train.train_number)}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #CBD5E1',
                  borderRadius: '6px',
                  color: '#475569',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <MapPin size={13} />
                <span>Track GPS</span>
              </button>

              <button
                onClick={() => handleOpenEditModal(train)}
                style={{
                  padding: '6px 10px',
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #CBD5E1',
                  borderRadius: '6px',
                  color: '#475569',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
                title="Edit Train"
              >
                <Edit3 size={13} />
              </button>
            </div>
          </div>
        ))}

        {!showDemoTrain && backendTrains.length === 0 && !loading && (
          <div
            style={{
              padding: '40px',
              textAlign: 'center',
              backgroundColor: '#FFFFFF',
              borderRadius: '8px',
              border: '1px solid #E2E8F0',
              color: '#64748B',
            }}
          >
            <Train size={36} color="#94A3B8" style={{ marginBottom: '8px' }} />
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#1E293B' }}>
              No trains match your filter
            </div>
            <div style={{ fontSize: '12px', marginTop: '4px' }}>
              Try selecting "All Railway Regions" or clear your search query.
            </div>
          </div>
        )}
      </div>

      {/* MODAL 1: Add Train Modal */}
      {isAddModalOpen && (
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
              maxWidth: '480px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '14px 18px',
                borderBottom: '1px solid #E2E8F0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: '#F8FAFC',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>
                Add New Train to Operational Fleet
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateTrainSubmit} style={{ padding: '18px' }}>
              {formError && (
                <div
                  style={{
                    backgroundColor: '#FEE2E2',
                    color: '#DC2626',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    marginBottom: '14px',
                  }}
                >
                  {formError}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                    Train Number *
                  </label>
                  <input
                    type="text"
                    value={newTrainNumber}
                    onChange={(e) => setNewTrainNumber(e.target.value)}
                    placeholder="e.g. 12841"
                    required
                    style={{
                      width: '100%',
                      height: '34px',
                      padding: '0 10px',
                      borderRadius: '6px',
                      border: '1px solid #CBD5E1',
                      fontSize: '12px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                    Region *
                  </label>
                  <select
                    value={newTrainRegion}
                    onChange={(e) => setNewTrainRegion(e.target.value)}
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
                    <option value="South East">South East</option>
                    <option value="Northern">Northern</option>
                    <option value="Western">Western</option>
                    <option value="Central">Central</option>
                    <option value="Southern">Southern</option>
                    <option value="Eastern">Eastern</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  Train Name *
                </label>
                <input
                  type="text"
                  value={newTrainName}
                  onChange={(e) => setNewTrainName(e.target.value)}
                  placeholder="e.g. Coromandel Express"
                  required
                  style={{
                    width: '100%',
                    height: '34px',
                    padding: '0 10px',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    fontSize: '12px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                    Source Station
                  </label>
                  <input
                    type="text"
                    value={newTrainSource}
                    onChange={(e) => setNewTrainSource(e.target.value)}
                    placeholder="e.g. Chennai Central"
                    style={{
                      width: '100%',
                      height: '34px',
                      padding: '0 10px',
                      borderRadius: '6px',
                      border: '1px solid #CBD5E1',
                      fontSize: '12px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                    Destination Station
                  </label>
                  <input
                    type="text"
                    value={newTrainDestination}
                    onChange={(e) => setNewTrainDestination(e.target.value)}
                    placeholder="e.g. Howrah Junction"
                    style={{
                      width: '100%',
                      height: '34px',
                      padding: '0 10px',
                      borderRadius: '6px',
                      border: '1px solid #CBD5E1',
                      fontSize: '12px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  Initial Coach Label
                </label>
                <input
                  type="text"
                  value={newInitialCoach}
                  onChange={(e) => setNewInitialCoach(e.target.value)}
                  placeholder="e.g. C1 or B1"
                  style={{
                    width: '100%',
                    height: '34px',
                    padding: '0 10px',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    fontSize: '12px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#FFFFFF',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: '#2563EB',
                    color: '#FFFFFF',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {loading ? 'Adding...' : 'Add Train'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Edit Train Modal */}
      {isEditModalOpen && (
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
              maxWidth: '460px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '14px 18px',
                borderBottom: '1px solid #E2E8F0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: '#F8FAFC',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>
                Edit Train: {editTrainNumber}
              </h3>
              <button
                onClick={() => setIsEditModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleUpdateTrainSubmit} style={{ padding: '18px' }}>
              {formError && (
                <div
                  style={{
                    backgroundColor: '#FEE2E2',
                    color: '#DC2626',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    marginBottom: '14px',
                  }}
                >
                  {formError}
                </div>
              )}

              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  Train Name *
                </label>
                <input
                  type="text"
                  value={editTrainName}
                  onChange={(e) => setEditTrainName(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    height: '34px',
                    padding: '0 10px',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    fontSize: '12px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                    Region
                  </label>
                  <select
                    value={editTrainRegion}
                    onChange={(e) => setEditTrainRegion(e.target.value)}
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
                    <option value="South East">South East</option>
                    <option value="Northern">Northern</option>
                    <option value="Western">Western</option>
                    <option value="Central">Central</option>
                    <option value="Southern">Southern</option>
                    <option value="Eastern">Eastern</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                    Status
                  </label>
                  <select
                    value={editTrainStatus}
                    onChange={(e) => setEditTrainStatus(e.target.value)}
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
                    <option value="Running">Running</option>
                    <option value="Scheduled">Scheduled</option>
                    <option value="Depot">Depot Maintenance</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#FFFFFF',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: '#2563EB',
                    color: '#FFFFFF',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {loading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Dual Tank Quick Inspector Modal */}
      {dualTankModalTrain && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
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
              borderRadius: '12px',
              width: '100%',
              maxWidth: '920px',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            }}
          >
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid #E2E8F0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: '#F8FAFC',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0F172A' }}>
                  Coach C4 &bull; Dual Water Tank Monitoring ({dualTankModalTrain})
                </h3>
                <span style={{ fontSize: '11px', color: '#64748B' }}>
                  Device: Device-1 (Battery: 88%) &bull; Sensor 1 = Arrival Tank, Sensor 2 = Departure Tank
                </span>
              </div>
              <button
                onClick={() => setDualTankModalTrain(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
              <div>
                <div style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ backgroundColor: '#EFF6FF', color: '#2563EB', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>
                    Sensor 1
                  </span>
                  <strong style={{ fontSize: '14px', color: '#0F172A' }}>Arrival Tank</strong>
                </div>
                <TankVisualization tank={DEMO_ARRIVAL_TANK} />
              </div>

              <div>
                <div style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ backgroundColor: '#EFF6FF', color: '#2563EB', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>
                    Sensor 2
                  </span>
                  <strong style={{ fontSize: '14px', color: '#0F172A' }}>Departure Tank</strong>
                </div>
                <TankVisualization tank={DEMO_DEPARTURE_TANK} />
              </div>
            </div>

            <div style={{ padding: '12px 20px', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'flex-end', backgroundColor: '#F8FAFC' }}>
              <button
                onClick={() => setDualTankModalTrain(null)}
                style={{
                  padding: '8px 18px',
                  backgroundColor: '#2563EB',
                  color: '#FFFFFF',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

