import React, { useState, useEffect } from 'react';
import { colors, typography, metrics } from '../theme';
import { useApp } from '../state/AppContext';
import { ApiClient } from '../api/client';
import { RegionSummary, TrainOverviewItem, TrainConsist } from '../types';
import { Train, Plus, Trash2, X, ChevronRight, MapPin, ArrowLeft, ArrowRight, CheckCircle2, Edit3, Layers, SlidersHorizontal } from 'lucide-react';
import { AddTrainModal } from '../components/train/AddTrainModal';
import { ManageCoachModal } from '../components/coach/ManageCoachModal';

export const TrainManagementScreen: React.FC = () => {
  const {
    regions,
    refreshRegions,
    setActiveScreen,
    setSelectedTrainNumber,
    setSelectedCoachNumber,
    currentUser,
    searchQuery,
    managedDevices,
    liveTelemetry,
    mqttConnectionStatus,
    telemetryTimeoutSeconds,
  } = useApp();

  const isTrainOnline = (trainNumber: string): boolean => {
    const clean = trainNumber.trim().toLowerCase();
    const liveMatch =
      liveTelemetry &&
      mqttConnectionStatus !== 'DISCONNECTED' &&
      !liveTelemetry.isStale &&
      liveTelemetry.trno?.trim().toLowerCase() === clean;
    if (liveMatch) return true;
    const timeoutMs = (telemetryTimeoutSeconds || 120) * 1000;
    const now = Date.now();
    return managedDevices.some(
      (d) =>
        d.assignmentStatus === 'ENGAGED' &&
        d.trainNumber?.trim().toLowerCase() === clean &&
        d.lastSeenTimestamp &&
        now - d.lastSeenTimestamp <= timeoutMs
    );
  };

  const isCoachOnline = (trainNumber: string, coachNumber: string): boolean => {
    const cleanTrain = trainNumber.trim().toLowerCase();
    const cleanCoach = coachNumber.trim().toLowerCase();
    const liveMatch =
      liveTelemetry &&
      mqttConnectionStatus !== 'DISCONNECTED' &&
      !liveTelemetry.isStale &&
      liveTelemetry.trno?.trim().toLowerCase() === cleanTrain &&
      liveTelemetry.chno?.trim().toLowerCase() === cleanCoach;
    if (liveMatch) return true;
    const timeoutMs = (telemetryTimeoutSeconds || 120) * 1000;
    const now = Date.now();
    return managedDevices.some(
      (d) =>
        d.assignmentStatus === 'ENGAGED' &&
        d.trainNumber?.trim().toLowerCase() === cleanTrain &&
        d.coachNumber?.trim().toLowerCase() === cleanCoach &&
        d.lastSeenTimestamp &&
        now - d.lastSeenTimestamp <= timeoutMs
    );
  };

  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [selectedTrain, setSelectedTrain] = useState<TrainConsist | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [isEditCoachOpen, setIsEditCoachOpen] = useState<boolean>(false);

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
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleteTargetTrain, setDeleteTargetTrain] = useState<TrainOverviewItem | null>(null);
  const [deletingTrain, setDeletingTrain] = useState<boolean>(false);

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

  const requestDeleteTrain = (train: TrainOverviewItem) => {
    setActionError(null);
    if (currentUser?.role !== 'ADMIN') {
      setActionError('Only administrators can remove trains from the fleet.');
      return;
    }
    setDeleteTargetTrain(train);
  };

  const confirmDeleteTrain = async () => {
    if (!deleteTargetTrain || deletingTrain) return;
    const trainNumber = deleteTargetTrain.train_number;
    try {
      setDeletingTrain(true);
      setActionError(null);
      const res = await ApiClient.deleteTrain(trainNumber);
      setDeleteTargetTrain(null);
      await refreshRegions();
      if (selectedTrain?.train_number === trainNumber) {
        setSelectedTrain(null);
      }
      setActionMessage(res?.message || `Train ${trainNumber} deleted successfully.`);
      setTimeout(() => setActionMessage(null), 3500);
    } catch (e: any) {
      console.error('[TrainManagementScreen] Delete train failed:', e);
      setDeleteTargetTrain(null);
      setActionError(e?.message || `Failed to delete Train ${trainNumber}.`);
    } finally {
      setDeletingTrain(false);
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
          role="status"
          data-testid="train-action-success"
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

      {actionError && (
        <div
          role="alert"
          data-testid="train-action-error"
          style={{
            backgroundColor: '#FEF2F2',
            border: '1px solid #FECACA',
            color: '#991B1B',
            borderRadius: '6px',
            padding: '10px 16px',
            fontSize: '13px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
          }}
        >
          <span>{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            aria-label="Dismiss error"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991B1B', display: 'flex' }}
          >
            <X size={15} />
          </button>
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

          {regions.every((r) => !r.trains || r.trains.length === 0) && (
            <div
              data-testid="trains-empty-banner"
              style={{
                backgroundColor: '#F8FAFC',
                border: '1px dashed #CBD5E1',
                borderRadius: '8px',
                padding: '14px 16px',
                marginBottom: '14px',
                fontSize: '13px',
                fontWeight: 600,
                color: '#475569',
                textAlign: 'center',
              }}
            >
              No trains configured. Please add a train to begin monitoring.
            </div>
          )}

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
                      <strong style={{ color: r.trains.filter((t) => isTrainOnline(t.train_number)).length > 0 ? '#16A34A' : '#64748B' }}>
                        {r.trains.filter((t) => isTrainOnline(t.train_number)).length}
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
                No trains configured. Please add a train to begin monitoring.
              </div>
            )}

            {activeRegionObj?.trains.map((train) => {
              const isOnline = isTrainOnline(train.train_number);
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
                          onClick={() => requestDeleteTrain(train)}
                          data-testid={`delete-train-${train.train_number}`}
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
                  <strong style={{ color: isTrainOnline(selectedTrain.train_number) ? '#16A34A' : '#64748B' }}>
                    {isTrainOnline(selectedTrain.train_number) ? 'Consist Online' : 'Consist Offline'}
                  </strong>
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                onClick={() => setIsEditCoachOpen(true)}
                title="Edit Coaches & Consist"
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
                <SlidersHorizontal size={13} />
                <span>Edit Coaches</span>
              </button>

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

                    {(() => {
                      const coachOnline = isCoachOnline(selectedTrain.train_number, coach.coach_number);
                      return (
                        <span
                          style={{
                            backgroundColor: coachOnline ? '#ECFDF5' : '#F1F5F9',
                            color: coachOnline ? '#16A34A' : '#64748B',
                            border: `1px solid ${coachOnline ? '#DCFCE7' : '#E2E8F0'}`,
                            borderRadius: '10px',
                            padding: '2px 8px',
                            fontSize: '10px',
                            fontWeight: 700,
                          }}
                        >
                          {coachOnline ? 'DEVICE ONLINE' : 'DEVICE OFFLINE'}
                        </span>
                      );
                    })()}
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
      <AddTrainModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onTrainAdded={async (trainNo, meta) => {
          if (meta?.region) {
            setSelectedRegion(meta.region);
          }
          setActionMessage(`Train ${trainNo} registered successfully.`);
          await refreshRegions();
        }}
      />

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

      {/* Delete Train Confirmation Modal */}
      {deleteTargetTrain && (
        <div
          className="modal-backdrop"
          data-testid="delete-train-modal"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1150,
            padding: '16px',
          }}
        >
          <div
            className="modal-dialog"
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '8px',
              width: '440px',
              maxWidth: 'min(440px, calc(100vw - 24px))',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
              overflow: 'hidden',
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
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0F172A' }}>
                Confirm Train Deletion
              </h3>
              <button
                type="button"
                disabled={deletingTrain}
                onClick={() => setDeleteTargetTrain(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
              >
                <X size={18} />
              </button>
            </div>
            <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <p style={{ margin: 0, fontSize: '13px', color: '#334155', lineHeight: 1.5 }}>
                Are you sure you want to delete <strong>Train {deleteTargetTrain.train_number}</strong>
                {deleteTargetTrain.name ? ` (${deleteTargetTrain.name})` : ''}?
              </p>
              <div
                style={{
                  backgroundColor: '#FFF7ED',
                  border: '1px solid #FED7AA',
                  borderRadius: '6px',
                  padding: '10px 12px',
                  fontSize: '12px',
                  color: '#9A3412',
                  lineHeight: 1.45,
                }}
              >
                Assigned coach hardware ({deleteTargetTrain.coaches_count} coaches, {deleteTargetTrain.tanks_count} tanks) will be released to the unassigned inventory pool while preserving historical telemetry and alarm logs.
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                <button
                  type="button"
                  disabled={deletingTrain}
                  onClick={() => setDeleteTargetTrain(null)}
                  data-testid="cancel-delete-train"
                  style={{
                    backgroundColor: '#F1F5F9',
                    border: '1px solid #CBD5E1',
                    borderRadius: '6px',
                    padding: '8px 16px',
                    fontSize: '12px',
                    color: '#475569',
                    cursor: deletingTrain ? 'not-allowed' : 'pointer',
                    fontWeight: 600,
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deletingTrain}
                  onClick={confirmDeleteTrain}
                  data-testid="confirm-delete-train"
                  style={{
                    backgroundColor: deletingTrain ? '#FCA5A5' : '#DC2626',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '8px 18px',
                    fontSize: '12px',
                    color: '#FFFFFF',
                    cursor: deletingTrain ? 'wait' : 'pointer',
                    fontWeight: 700,
                  }}
                >
                  {deletingTrain ? 'Deleting...' : 'Delete Train'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedTrain && (
        <ManageCoachModal
          isOpen={isEditCoachOpen}
          onClose={async () => {
            setIsEditCoachOpen(false);
            if (selectedTrain) {
              try {
                const refreshed = await ApiClient.fetchTrainConsist(selectedTrain.train_number);
                setSelectedTrain(refreshed);
              } catch {}
            }
          }}
          trainNumber={selectedTrain.train_number}
        />
      )}
    </div>
  );
};

