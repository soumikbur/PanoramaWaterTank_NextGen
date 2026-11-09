import React, { useState, useEffect } from 'react';
import { colors, typography, metrics } from '../theme';
import { useApp } from '../state/AppContext';
import { ApiClient } from '../api/client';
import { RegionSummary, TrainOverviewItem, TrainConsist } from '../types';
import { Train, Plus, Trash2, X, ChevronRight, MapPin, ArrowLeft, ArrowRight, CheckCircle2, Edit3 } from 'lucide-react';

export const TrainManagementScreen: React.FC = () => {
  const {
    regions,
    refreshRegions,
    setActiveScreen,
    setSelectedTrainNumber,
    currentUser,
    searchQuery,
  } = useApp();

  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [selectedTrain, setSelectedTrain] = useState<TrainConsist | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);

  // Add Train Form State
  const [newTrainNumber, setNewTrainNumber] = useState('');
  const [newTrainName, setNewTrainName] = useState('');
  const [newTrainRegion, setNewTrainRegion] = useState('NORTH');
  const [newCoachNumber, setNewCoachNumber] = useState('B1');
  const [newCapacity, setNewCapacity] = useState('20.0');

  // Edit Train Form State
  const [editTrainNumber, setEditTrainNumber] = useState('');
  const [editTrainName, setEditTrainName] = useState('');
  const [editTrainRegion, setEditTrainRegion] = useState('NORTH');
  const [editTrainType, setEditTrainType] = useState('Express');

  const [formError, setFormError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  useEffect(() => {
    refreshRegions();
  }, []);

  const handleSelectRegion = (regionKey: string) => {
    setSelectedRegion(regionKey);
    setSelectedTrain(null);
  };

  const handleResetToRegions = () => {
    setSelectedRegion(null);
    setSelectedTrain(null);
  };

  const handleInspectTrain = async (trainNumber: string) => {
    try {
      setLoading(true);
      const consist = await ApiClient.fetchTrainConsist(trainNumber);
      setSelectedTrain(consist);
      setSelectedTrainNumber(trainNumber);
    } catch (e: any) {
      console.error('Failed to load consist:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTrain = async (trainNumber: string) => {
    if (currentUser?.role !== 'ADMIN') {
      alert('Only administrators can remove trains from the fleet.');
      return;
    }
    if (!window.confirm(`Are you sure you want to delete Train ${trainNumber}?`)) {
      return;
    }
    try {
      await ApiClient.deleteTrain(trainNumber);
      setActionMessage(`Train ${trainNumber} deleted successfully.`);
      setTimeout(() => setActionMessage(null), 3500);
      await refreshRegions();
      if (selectedTrain?.train_number === trainNumber) {
        setSelectedTrain(null);
      }
    } catch (e: any) {
      alert(`Delete failed: ${e.message}`);
    }
  };

  const handleCreateTrainSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTrainNumber || !newTrainName) {
      setFormError('Please enter train number and name.');
      return;
    }

    try {
      setLoading(true);
      await ApiClient.createTrain({
        train_number: newTrainNumber.trim(),
        name: newTrainName.trim(),
        region: newTrainRegion,
        coach_number: newCoachNumber.trim() || 'B1',
        tank_capacity: parseFloat(newCapacity) || 20.0,
      });

      setIsAddModalOpen(false);
      setNewTrainNumber('');
      setNewTrainName('');
      setFormError(null);
      setActionMessage(`Train ${newTrainNumber} registered successfully.`);
      setTimeout(() => setActionMessage(null), 4000);
      await refreshRegions();
    } catch (err: any) {
      setFormError(err.message || 'Failed to register train');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenEditTrainModal = (train: TrainOverviewItem) => {
    setEditTrainNumber(train.train_number);
    setEditTrainName(train.name);
    setEditTrainRegion(selectedRegion || 'NORTH');
    setEditTrainType(train.type || 'Express');
    setFormError(null);
    setIsEditModalOpen(true);
  };

  const handleUpdateTrainSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTrainName.trim()) {
      setFormError('Please enter train name.');
      return;
    }

    try {
      setLoading(true);
      await ApiClient.updateTrain(editTrainNumber, {
        name: editTrainName.trim(),
        region: editTrainRegion,
        type: editTrainType.trim(),
      });

      setIsEditModalOpen(false);
      setFormError(null);
      setActionMessage(`Train ${editTrainNumber} configuration updated successfully.`);
      setTimeout(() => setActionMessage(null), 4000);
      await refreshRegions();
    } catch (err: any) {
      setFormError(err.message || 'Failed to update train');
    } finally {
      setLoading(false);
    }
  };

  // Filter regions or trains if global search is active
  const safeRegions = Array.isArray(regions) ? regions : [];
  const filteredRegions = safeRegions.map((r) => {
    if (!searchQuery) return r;
    const q = searchQuery.toLowerCase();
    const matchingTrains = r.trains.filter(
      (t) =>
        t.train_number.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q)
    );
    return {
      ...r,
      trains: matchingTrains,
    };
  });

  const activeRegionObj = regions.find((r) => r.region === selectedRegion);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        backgroundColor: colors.background,
        boxSizing: 'border-box',
        minHeight: '100%',
      }}
    >
      {/* 1. Top Breadcrumb & Action Header (Height ~46px, Surface #FFFFFF, Border #E2E8F0) */}
      <div
        style={{
          height: '48px',
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '8px',
          padding: '0 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxSizing: 'border-box',
        }}
      >
        {/* Interactive Breadcrumb Hierarchy */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
          <span
            onClick={handleResetToRegions}
            style={{
              fontWeight: 700,
              color: '#0F172A',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Train size={14} />
            <span>Train Management</span>
          </span>

          {selectedRegion && (
            <>
              <span style={{ color: '#94A3B8' }}>/</span>
              <span
                onClick={() => setSelectedTrain(null)}
                style={{
                  fontWeight: selectedTrain ? 500 : 700,
                  color: selectedTrain ? '#2563EB' : '#0F172A',
                  cursor: 'pointer',
                }}
              >
                {activeRegionObj?.name || selectedRegion}
              </span>
            </>
          )}

          {selectedTrain && (
            <>
              <span style={{ color: '#94A3B8' }}>/</span>
              <span style={{ fontWeight: 700, color: '#0F172A' }}>
                Train {selectedTrain.train_number} ({selectedTrain.name})
              </span>
            </>
          )}
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={handleResetToRegions}
            style={{
              backgroundColor: selectedRegion ? '#EFF6FF' : '#F1F5F9',
              border: `1px solid ${selectedRegion ? '#BFDBFE' : '#CBD5E1'}`,
              color: selectedRegion ? '#2563EB' : '#475569',
              borderRadius: '6px',
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            REGIONS
          </button>

          <button
            onClick={() => setIsAddModalOpen(true)}
            style={{
              backgroundColor: '#2563EB',
              border: 'none',
              color: '#FFFFFF',
              borderRadius: '6px',
              padding: '6px 16px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 1px 2px rgba(37, 99, 235, 0.2)',
            }}
          >
            <span>+</span>
            <span>Add Train</span>
          </button>
        </div>
      </div>

      {actionMessage && (
        <div
          style={{
            backgroundColor: '#ECFDF5',
            border: '1px solid #A7F3D0',
            color: '#065F46',
            borderRadius: '6px',
            padding: '10px 16px',
            fontSize: '13px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <CheckCircle2 size={16} />
          <span>{actionMessage}</span>
        </div>
      )}

      {/* 2. LEVEL 1: 4 RAILWAY REGIONS CARDS OVERVIEW */}
      {!selectedRegion && (
        <div>
          <div style={{ marginBottom: '14px' }}>
            <h2
              style={{
                fontSize: '18px',
                fontWeight: 700,
                color: '#0F172A',
                margin: '0 0 4px 0',
                fontFamily: typography.fontFamily,
              }}
            >
              RAILWAY REGIONS
            </h2>
            <p
              style={{
                fontSize: '12px',
                color: '#64748B',
                margin: 0,
                fontFamily: typography.fontFamily,
              }}
            >
              Select a railway region to inspect and configure its assigned train consists
            </p>
          </div>

          {/* Region Cards Grid (Responsive auto-fit) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
              gap: '14px',
              alignItems: 'stretch',
            }}
          >
            {filteredRegions.map((r) => {
              const isNormal = r.status === 'All Normal';
              const isCrit = Boolean(r.status && r.status.includes('Critical'));

              return (
                <div
                  key={r.region}
                  style={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    borderRadius: '10px',
                    padding: '18px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '14px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {/* Card Top: Pin + Title + Count */}
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '6px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '6px',
                            backgroundColor: '#EFF6FF',
                            border: '1px solid #BFDBFE',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <MapPin size={16} color="#2563EB" />
                        </div>
                        <div>
                          <span
                            style={{
                              fontSize: '15px',
                              fontWeight: 700,
                              color: '#0F172A',
                              display: 'block',
                            }}
                          >
                            {r.region}
                          </span>
                          <span style={{ fontSize: '11px', color: '#64748B' }}>
                            {r.name} ({r.code})
                          </span>
                        </div>
                      </div>

                      {/* Status Badge */}
                      <span
                        style={{
                          backgroundColor: isNormal ? '#ECFDF5' : isCrit ? '#FEE2E2' : '#FEF3C7',
                          border: `1px solid ${isNormal ? '#DCFCE7' : isCrit ? '#FCA5A5' : '#FDE68A'}`,
                          color: isNormal ? '#16A34A' : isCrit ? '#DC2626' : '#D97706',
                          borderRadius: '12px',
                          padding: '3px 9px',
                          fontSize: '10px',
                          fontWeight: 700,
                          letterSpacing: '0.3px',
                        }}
                      >
                        {r.status}
                      </span>
                    </div>

                    <div
                      style={{
                        fontSize: '12px',
                        color: '#64748B',
                        marginBottom: '10px',
                        fontWeight: 500,
                      }}
                    >
                      {r.configuredTrains} Configured Train{r.configuredTrains === 1 ? '' : 's'}
                    </div>

                    <div style={{ height: '1px', backgroundColor: '#F1F5F9', marginBottom: '12px' }} />

                    {/* Metrics Grid */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '8px',
                        fontSize: '11px',
                        marginBottom: '6px',
                      }}
                    >
                      <div
                        style={{
                          backgroundColor: '#F8FAFC',
                          padding: '8px 10px',
                          borderRadius: '6px',
                          border: '1px solid #E2E8F0',
                        }}
                      >
                        <div style={{ color: '#64748B', fontSize: '10px' }}>Coaches:</div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>
                          {r.coaches}
                        </div>
                      </div>
                      <div
                        style={{
                          backgroundColor: '#F8FAFC',
                          padding: '8px 10px',
                          borderRadius: '6px',
                          border: '1px solid #E2E8F0',
                        }}
                      >
                        <div style={{ color: '#64748B', fontSize: '10px' }}>Tanks:</div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>
                          {r.tanks}
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        backgroundColor: '#F8FAFC',
                        padding: '8px 10px',
                        borderRadius: '6px',
                        border: '1px solid #E2E8F0',
                        fontSize: '11px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span style={{ color: '#64748B' }}>Online Trains:</span>
                      <strong style={{ color: r.onlineTrains > 0 ? '#16A34A' : '#64748B' }}>
                        {r.onlineTrains}
                      </strong>
                    </div>
                  </div>

                  {/* Card Bottom: Action Link */}
                  <button
                    onClick={() => handleSelectRegion(r.region)}
                    style={{
                      width: '100%',
                      padding: '8px',
                      backgroundColor: '#EFF6FF',
                      border: '1px solid #BFDBFE',
                      borderRadius: '6px',
                      color: '#2563EB',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      textAlign: 'center',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                    }}
                  >
                    <span>View Trains in Region</span>
                    <ChevronRight size={14} />
                  </button>
                </div>
              );
            })}
            </div>
          </div>
      )}

      {/* 3. LEVEL 2: TRAINS LIST WITHIN SELECTED REGION */}
      {selectedRegion && !selectedTrain && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A', margin: 0 }}>
                {activeRegionObj?.name} ({selectedRegion})
              </h2>
              <span style={{ fontSize: '12px', color: '#64748B' }}>
                {activeRegionObj?.configuredTrains || 0} train consists assigned to this zone
              </span>
            </div>

            <button
              onClick={handleResetToRegions}
              style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid #CBD5E1',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                color: '#475569',
                cursor: 'pointer',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <ArrowLeft size={13} />
              <span>Back to Regions</span>
            </button>
          </div>

          {/* Trains Table / Card List */}
          <div
            className="scada-table-scroll-container"
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: '8px',
              overflowX: 'auto',
            }}
          >
            <div style={{ minWidth: '600px' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '120px 2fr 100px 100px 120px 140px',
                  padding: '12px 16px',
                  backgroundColor: '#F8FAFC',
                  borderBottom: '1px solid #E2E8F0',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#64748B',
                  letterSpacing: '0.4px',
                }}
              >
                <span>TRAIN NO.</span>
                <span>NAME / CORRIDOR</span>
                <span>COACHES</span>
                <span>TANKS</span>
                <span>STATUS</span>
                <span style={{ textAlign: 'right' }}>ACTIONS</span>
              </div>

            {(!activeRegionObj?.trains || activeRegionObj.trains.length === 0) && (
              <div style={{ padding: '30px', textAlign: 'center', color: '#94A3B8', fontSize: '13px' }}>
                No trains registered in {activeRegionObj?.name}. Click "+ Add Train" above to configure.
              </div>
            )}

            {activeRegionObj?.trains.map((train) => {
              const isOnline = train.is_online;
              return (
                <div
                  key={train.train_number}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '120px 2fr 100px 100px 120px 140px',
                    padding: '12px 16px',
                    borderBottom: '1px solid #F1F5F9',
                    fontSize: '12px',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ fontWeight: 700, color: '#0F172A' }}>{train.train_number}</span>
                  <div>
                    <span style={{ fontWeight: 600, color: '#1E293B', display: 'block' }}>
                      {train.name}
                    </span>
                    <span style={{ fontSize: '11px', color: '#64748B' }}>{train.type}</span>
                  </div>
                  <span style={{ color: '#0F172A', fontWeight: 600 }}>{train.coaches_count}</span>
                  <span style={{ color: '#0F172A', fontWeight: 600 }}>{train.tanks_count}</span>
                  <div>
                    <span
                      style={{
                        backgroundColor: isOnline ? '#ECFDF5' : '#F1F5F9',
                        color: isOnline ? '#16A34A' : '#64748B',
                        border: `1px solid ${isOnline ? '#DCFCE7' : '#E2E8F0'}`,
                        borderRadius: '10px',
                        padding: '2px 8px',
                        fontSize: '10px',
                        fontWeight: 700,
                      }}
                    >
                      {isOnline ? 'ONLINE' : 'OFFLINE'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => handleInspectTrain(train.train_number)}
                      style={{
                        backgroundColor: '#EFF6FF',
                        border: '1px solid #BFDBFE',
                        color: '#2563EB',
                        borderRadius: '4px',
                        padding: '4px 8px',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <span>Consist</span>
                      <ChevronRight size={12} />
                    </button>
                    {currentUser?.role === 'ADMIN' && (
                      <>
                        <button
                          onClick={() => handleOpenEditTrainModal(train)}
                          style={{
                            backgroundColor: '#F1F5F9',
                            border: '1px solid #CBD5E1',
                            color: '#475569',
                            borderRadius: '4px',
                            padding: '4px 6px',
                            fontSize: '11px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                          title="Edit train configuration"
                        >
                          <Edit3 size={13} />
                        </button>
                        <button
                          onClick={() => handleDeleteTrain(train.train_number)}
                          style={{
                            backgroundColor: '#FFF1F2',
                            border: '1px solid #FECDD3',
                            color: '#E11D48',
                            borderRadius: '4px',
                            padding: '4px 6px',
                            fontSize: '11px',
                            cursor: 'pointer',
                          }}
                          title="Delete train"
                        >
                          <Trash2 size={13} color="#DC2626" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            </div>
          </div>
        </div>
      )}

      {/* 4. LEVEL 3: DETAILED TRAIN CONSIST & TANK DRILL-DOWN */}
      {selectedTrain && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Header Card */}
          <div
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: '8px',
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A', margin: '0 0 4px 0' }}>
                Train {selectedTrain.train_number} — {selectedTrain.name}
              </h2>
              <div style={{ fontSize: '12px', color: '#64748B', display: 'flex', gap: '14px' }}>
                <span>Region: <strong>{selectedTrain.region}</strong></span>
                <span>Coaches: <strong>{selectedTrain.coaches_count}</strong></span>
                <span>Tanks: <strong>{selectedTrain.tanks_count}</strong></span>
                <span>
                  Status:{' '}
                  <strong style={{ color: selectedTrain.online_status ? '#16A34A' : '#64748B' }}>
                    {selectedTrain.online_status ? 'Consist Online' : 'Consist Offline'}
                  </strong>
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                onClick={() => {
                  setSelectedTrainNumber(selectedTrain.train_number);
                  setActiveScreen('coaches');
                }}
                style={{
                  backgroundColor: '#EFF6FF',
                  border: '1px solid #BFDBFE',
                  color: '#2563EB',
                  borderRadius: '6px',
                  padding: '8px 14px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span>Coach Consist</span>
                <Layers size={13} />
              </button>

              <button
                onClick={() => {
                  setSelectedTrainNumber(selectedTrain.train_number);
                  setActiveScreen('watertank');
                }}
                style={{
                  backgroundColor: '#2563EB',
                  border: 'none',
                  color: '#FFFFFF',
                  borderRadius: '6px',
                  padding: '8px 14px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span>Inspect in Water Tank Monitor</span>
                <ArrowRight size={13} />
              </button>
              <button
                onClick={() => setSelectedTrain(null)}
                style={{
                  backgroundColor: '#F1F5F9',
                  border: '1px solid #CBD5E1',
                  color: '#475569',
                  borderRadius: '6px',
                  padding: '8px 14px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <ArrowLeft size={13} />
                <span>Back to Trains</span>
              </button>
            </div>
          </div>

          {/* Consist Coaches Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {selectedTrain.coaches.map((coach) => (
              <div
                key={coach.coach_number}
                style={{
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderRadius: '8px',
                  padding: '16px 20px',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                }}
              >
                {/* Coach Header */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '14px',
                    borderBottom: '1px solid #F1F5F9',
                    paddingBottom: '10px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>
                      Coach {coach.coach_number}
                    </span>
                    <span
                      style={{
                        fontSize: '10px',
                        backgroundColor: '#F1F5F9',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        color: '#64748B',
                        fontFamily: 'monospace',
                      }}
                    >
                      UID: {coach.device_uid}
                    </span>
                    <span style={{ fontSize: '11px', color: '#94A3B8' }}>
                      Device: Water Monitoring Node
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      onClick={() => {
                        setSelectedTrainNumber(selectedTrain.train_number);
                        setSelectedCoachNumber(coach.coach_number);
                        setActiveScreen('coach-details');
                      }}
                      style={{
                        padding: '3px 8px',
                        backgroundColor: '#EFF6FF',
                        border: '1px solid #BFDBFE',
                        borderRadius: '4px',
                        color: '#2563EB',
                        fontSize: '10px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <span>Coach Details</span>
                      <ArrowRight size={10} />
                    </button>

                    <span
                      style={{
                        backgroundColor: coach.is_online ? '#ECFDF5' : '#F1F5F9',
                        color: coach.is_online ? '#16A34A' : '#64748B',
                        border: `1px solid ${coach.is_online ? '#DCFCE7' : '#E2E8F0'}`,
                        borderRadius: '10px',
                        padding: '2px 8px',
                        fontSize: '10px',
                        fontWeight: 700,
                      }}
                    >
                      {coach.is_online ? 'DEVICE ONLINE' : 'DEVICE OFFLINE'}
                    </span>
                  </div>
                </div>

                {/* Tanks Grid for this coach */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                    gap: '14px',
                  }}
                >
                  {coach.tanks.map((tank) => {
                    const isWarn = tank.status === 'WARNING';
                    const isCrit = tank.status === 'CRITICAL';
                    const barColor = isCrit ? '#DC2626' : isWarn ? '#D97706' : '#2563EB';

                    return (
                      <div
                        key={tank.id}
                        style={{
                          backgroundColor: '#F8FAFC',
                          border: '1px solid #E2E8F0',
                          borderRadius: '6px',
                          padding: '12px 14px',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: '8px',
                          }}
                        >
                          <span style={{ fontWeight: 700, fontSize: '13px', color: '#0F172A' }}>
                            {tank.name}
                          </span>
                          <span
                            style={{
                              fontSize: '9px',
                              fontWeight: 700,
                              padding: '2px 6px',
                              borderRadius: '4px',
                              backgroundColor: isCrit ? '#FEE2E2' : isWarn ? '#FEF3C7' : '#ECFDF5',
                              color: isCrit ? '#DC2626' : isWarn ? '#D97706' : '#16A34A',
                            }}
                          >
                            {tank.status}
                          </span>
                        </div>

                        {/* Level & Volume digits */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'baseline',
                            justifyContent: 'space-between',
                            marginBottom: '6px',
                          }}
                        >
                          <div>
                            <span style={{ fontSize: '20px', fontWeight: 800, color: barColor }}>
                              {tank.current_level_percent}%
                            </span>
                            <span style={{ fontSize: '11px', color: '#64748B', marginLeft: '6px' }}>
                              ({tank.current_volume_liters} L / {tank.capacity_liters} L)
                            </span>
                          </div>
                        </div>

                        {/* Progress Fill Bar */}
                        <div
                          style={{
                            width: '100%',
                            height: '8px',
                            backgroundColor: '#E2E8F0',
                            borderRadius: '4px',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: `${Math.min(100, Math.max(0, tank.current_level_percent))}%`,
                              height: '100%',
                              backgroundColor: barColor,
                              borderRadius: '4px',
                              transition: 'width 0.4s ease',
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. ADD TRAIN MODAL DIALOG */}
      {isAddModalOpen && (
        <div
          className="modal-backdrop"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(15, 23, 42, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            className="modal-dialog"
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '10px',
              padding: '20px',
              width: '460px',
              maxWidth: 'min(460px, calc(100vw - 24px))',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '16px',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0F172A' }}>
                Add Railway Train Fleet
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                title="Close modal"
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  color: '#94A3B8',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '4px',
                }}
              >
                <X size={16} />
              </button>
            </div>

            {formError && (
              <div
                style={{
                  backgroundColor: '#FEE2E2',
                  border: '1px solid #FCA5A5',
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

            <form onSubmit={handleCreateTrainSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  Train Number (5-digit Indian Railways code)
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 12004 or 12302"
                  value={newTrainNumber}
                  onChange={(e) => setNewTrainNumber(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  Train Name & Route
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Lucknow Shatabdi Express"
                  value={newTrainName}
                  onChange={(e) => setNewTrainName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  Railway Region Zone
                </label>
                <select
                  value={newTrainRegion}
                  onChange={(e) => setNewTrainRegion(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13px',
                    backgroundColor: '#FFFFFF',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="NORTH">NORTH — Northern Railway (NR)</option>
                  <option value="SOUTH">SOUTH — Southern Railway (SR)</option>
                  <option value="EAST">EAST — Eastern Railway (ER)</option>
                  <option value="WEST">WEST — Western Railway (WR)</option>
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                    Initial Coach Number
                  </label>
                  <input
                    type="text"
                    value={newCoachNumber}
                    onChange={(e) => setNewCoachNumber(e.target.value)}
                    placeholder="B1, C1, A2..."
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                    Tank Capacity (L)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={newCapacity}
                    onChange={(e) => setNewCapacity(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '14px' }}>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  style={{
                    backgroundColor: '#F1F5F9',
                    border: '1px solid #CBD5E1',
                    borderRadius: '6px',
                    padding: '8px 16px',
                    fontSize: '12px',
                    color: '#475569',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    backgroundColor: '#2563EB',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '8px 20px',
                    fontSize: '12px',
                    color: '#FFFFFF',
                    cursor: 'pointer',
                    fontWeight: 700,
                  }}
                >
                  {loading ? 'Registering...' : 'Add Train Consist'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Train Modal */}
      {isEditModalOpen && (
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
              width: '460px',
              maxWidth: 'min(460px, calc(100vw - 24px))',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
            }}
          >
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid #E2E8F0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0F172A' }}>
                  Edit Train Configuration
                </h3>
                <span style={{ fontSize: '11px', color: '#64748B' }}>Train Number: {editTrainNumber}</span>
              </div>
              <button
                onClick={() => setIsEditModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleUpdateTrainSubmit} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {formError && (
                <div style={{ padding: '10px 14px', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '6px', color: '#DC2626', fontSize: '13px' }}>
                  {formError}
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  Train Name &amp; Corridor Description *
                </label>
                <input
                  type="text"
                  required
                  value={editTrainName}
                  onChange={(e) => setEditTrainName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  Railway Region Zone
                </label>
                <select
                  value={editTrainRegion}
                  onChange={(e) => setEditTrainRegion(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13px',
                    backgroundColor: '#FFFFFF',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="NORTH">NORTH — Northern Railway (NR)</option>
                  <option value="SOUTH">SOUTH — Southern Railway (SR)</option>
                  <option value="EAST">EAST — Eastern Railway (ER)</option>
                  <option value="WEST">WEST — Western Railway (WR)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  Consist Fleet Classification
                </label>
                <input
                  type="text"
                  value={editTrainType}
                  onChange={(e) => setEditTrainType(e.target.value)}
                  placeholder="e.g. Shatabdi Express, Superfast AC, Rajdhani..."
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '14px' }}>
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  style={{
                    backgroundColor: '#F1F5F9',
                    border: '1px solid #CBD5E1',
                    borderRadius: '6px',
                    padding: '8px 16px',
                    fontSize: '12px',
                    color: '#475569',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    backgroundColor: '#2563EB',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '8px 20px',
                    fontSize: '12px',
                    color: '#FFFFFF',
                    cursor: 'pointer',
                    fontWeight: 700,
                  }}
                >
                  {loading ? 'Saving...' : 'Update Train'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

