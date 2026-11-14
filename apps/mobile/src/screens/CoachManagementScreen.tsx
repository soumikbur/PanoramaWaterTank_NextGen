import React, { useState, useEffect, useMemo, useRef } from 'react';
import { typography } from '../theme';
import { useApp } from '../state/AppContext';
import { ApiClient } from '../api/client';
import { TankLiveStatus, Device, AlarmStatus } from '../types';
import { filterConsistCoaches, CoachTankFilterMode } from '../services/tankStatusService';
import { TankVisualization } from '../components/tank/TankVisualization';
import { ManageCoachModal } from '../components/coach/ManageCoachModal';
import {
  Layers,
  Train,
  Plus,
  Edit3,
  Battery,
  BatteryWarning,
  Gauge,
  Droplets,
  ChevronLeft,
  ChevronRight,
  X,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Radio,
  SlidersHorizontal,
  LayoutGrid,
  Search,
} from 'lucide-react';

export interface CoachRecord {
  id: string;
  coachNumber: string;
  coachType: string;
  trainNumber: string;
  deviceId: string;
  isOnline: boolean;
  batteryPercent: number | null;
  arrivalLevel: number | null;
  arrivalHeightCm: number | null;
  departureLevel: number | null;
  departureHeightCm: number | null;
  arrivalAlarmStatus?: AlarmStatus;
  departureAlarmStatus?: AlarmStatus;
  isStale?: boolean;
}

export const CoachManagementScreen: React.FC = () => {
  const {
    activeScreen,
    setActiveScreen,
    selectedTrainNumber,
    setSelectedTrainNumber,
    selectedCoachNumber,
    setSelectedCoachNumber,
    configuredTrains,
    consistCoaches,
    devices,
    tanks,
    liveTank,
    liveTelemetry,
    connectionStatus,
    refreshData,
  } = useApp();

  const [activeTrain, setActiveTrain] = useState<string>(selectedTrainNumber || '');
  const [viewMode, setViewMode] = useState<'track' | 'grid'>('track');
  const [coachFilter, setCoachFilter] = useState<CoachTankFilterMode>('ALL');
  const [coachSearch, setCoachSearch] = useState<string>('');
  const [selectedCoach, setSelectedCoach] = useState<CoachRecord | null>(null);
  const [isAddCoachOpen, setIsAddCoachOpen] = useState(false);
  const [isEditCoachOpen, setIsEditCoachOpen] = useState(false);
  const [isManageCoachOpen, setIsManageCoachOpen] = useState(false);
  const [coachToEdit, setCoachToEdit] = useState<CoachRecord | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  // Add Coach Form state
  const [newCoachNum, setNewCoachNum] = useState('');
  const [newCoachType, setNewCoachType] = useState('AC Chair Car');
  const [newCoachDev, setNewCoachDev] = useState('');

  // Edit Coach Form state
  const [editCoachNum, setEditCoachNum] = useState('');
  const [editCoachType, setEditCoachType] = useState('');
  const [editCoachDev, setEditCoachDev] = useState('');

  const trackScrollRef = useRef<HTMLDivElement>(null);

  // Synchronize with global configured trains & selection
  useEffect(() => {
    if (configuredTrains.length === 0) {
      if (activeTrain) setActiveTrain('');
      setSelectedCoach(null);
      return;
    }
    if (selectedTrainNumber && configuredTrains.some((t) => t.train_number === selectedTrainNumber)) {
      setActiveTrain(selectedTrainNumber);
    } else if (!activeTrain || !configuredTrains.some((t) => t.train_number === activeTrain)) {
      setActiveTrain(configuredTrains[0].train_number);
    }
  }, [selectedTrainNumber, configuredTrains]);

  const [customCoaches, setCustomCoaches] = useState<CoachRecord[]>([]);
  const [coachOverrides, setCoachOverrides] = useState<Record<string, Partial<CoachRecord>>>({});

  // Construct coach fleet strictly from configured train consist & mapped devices (never synthetic 24-coach fallbacks)
  const coachesList: CoachRecord[] = useMemo(() => {
    if (!activeTrain || !configuredTrains.some((t) => t.train_number === activeTrain)) {
      return [];
    }

    if (activeTrain === selectedTrainNumber && consistCoaches.length > 0) {
      return consistCoaches.map((c) => ({
        id: `coach-${activeTrain}-${c.coachNumber}`,
        coachNumber: c.coachNumber,
        coachType: c.coachType || 'Standard Coach',
        trainNumber: activeTrain,
        deviceId: c.deviceUid || 'Not Mapped',
        isOnline: c.isOnline,
        batteryPercent: c.batteryPercent,
        arrivalLevel: c.arrivalLevel,
        arrivalHeightCm: c.arrivalHeightCm,
        departureLevel: c.departureLevel,
        departureHeightCm: c.departureHeightCm,
        arrivalAlarmStatus: (c.tanks?.[0]?.alarmStatus || 'NORMAL') as AlarmStatus,
        departureAlarmStatus: (c.tanks?.[1]?.alarmStatus || 'NORMAL') as AlarmStatus,
      }));
    }

    const trainDevs = devices.filter((d) => d.trainNumber === activeTrain);
    return trainDevs.map((d, idx) => ({
      id: d.id,
      coachNumber: d.coachNumber || `C${idx + 1}`,
      coachType: 'Standard Coach',
      trainNumber: activeTrain,
      deviceId: d.uid,
      isOnline: d.isOnline,
      batteryPercent: d.batteryPercent ?? null,
      arrivalLevel: d.primaryLevel ?? null,
      arrivalHeightCm: d.primaryLevel != null ? (d.primaryLevel / 100) * 150.0 : null,
      departureLevel: d.secondaryLevel ?? null,
      departureHeightCm: d.secondaryLevel != null ? (d.secondaryLevel / 100) * 150.0 : null,
      arrivalAlarmStatus: 'NORMAL' as AlarmStatus,
      departureAlarmStatus: 'NORMAL' as AlarmStatus,
    }));
  }, [activeTrain, selectedTrainNumber, configuredTrains, consistCoaches, devices]);

  const allCoaches = useMemo(
    () =>
      [...coachesList, ...customCoaches].map((c) =>
        coachOverrides[c.id] ? { ...c, ...coachOverrides[c.id] } : c
      ),
    [coachesList, customCoaches, coachOverrides]
  );
  const filteredCoaches = useMemo(
    () => filterConsistCoaches(allCoaches, coachFilter, coachSearch),
    [allCoaches, coachFilter, coachSearch]
  );
  const onlineCoachesCount = useMemo(() => allCoaches.filter((c) => c.isOnline).length, [allCoaches]);

  // Auto-select coach matching global context or default to first coach
  useEffect(() => {
    if (allCoaches.length > 0) {
      if (!selectedCoach) {
        const match = selectedCoachNumber
          ? allCoaches.find((c) => c.coachNumber.toUpperCase() === selectedCoachNumber.toUpperCase())
          : null;
        setSelectedCoach(match || allCoaches[0]);
      } else if (selectedCoachNumber && selectedCoach.coachNumber.toUpperCase() !== selectedCoachNumber.toUpperCase()) {
        const match = allCoaches.find((c) => c.coachNumber.toUpperCase() === selectedCoachNumber.toUpperCase());
        if (match) setSelectedCoach(match);
      }
    }
  }, [allCoaches, selectedCoach, selectedCoachNumber]);

  const handleScrollTrack = (dir: 'left' | 'right' | 'start' | 'end') => {
    const el = trackScrollRef.current;
    if (!el) return;
    if (dir === 'start') {
      el.scrollTo({ left: 0, behavior: 'smooth' });
      return;
    }
    if (dir === 'end') {
      el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' });
      return;
    }
    el.scrollBy({ left: dir === 'left' ? -380 : 380, behavior: 'smooth' });
  };

  const handleOpenAddCoach = () => {
    setNewCoachNum(`C${allCoaches.length + 1}`);
    setNewCoachType('AC Chair Car');
    setNewCoachDev('Auto-Assigned');
    setIsAddCoachOpen(true);
  };

  const handleCreateCoach = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCoachNum.trim()) return;

    const newCoach: CoachRecord = {
      id: `custom-${Date.now()}`,
      coachNumber: newCoachNum.trim(),
      coachType: newCoachType,
      trainNumber: activeTrain,
      deviceId: newCoachDev.trim() || 'Not Mapped',
      isOnline: false,
      batteryPercent: null,
      arrivalLevel: null,
      arrivalHeightCm: null,
      departureLevel: null,
      departureHeightCm: null,
      arrivalAlarmStatus: 'NORMAL',
      departureAlarmStatus: 'NORMAL',
    };

    setCustomCoaches((prev) => [...prev, newCoach]);
    setIsAddCoachOpen(false);
    setActionFeedback(`Coach ${newCoach.coachNumber} added to Train ${activeTrain}.`);
    setTimeout(() => setActionFeedback(null), 3500);
  };

  const handleOpenEditCoach = (coach: CoachRecord) => {
    setCoachToEdit(coach);
    setEditCoachNum(coach.coachNumber);
    setEditCoachType(coach.coachType);
    setEditCoachDev(coach.deviceId);
    setIsEditCoachOpen(true);
  };

  const handleSaveEditCoach = (e: React.FormEvent) => {
    e.preventDefault();
    if (!coachToEdit) return;

    const patch: Partial<CoachRecord> = {
      coachNumber: editCoachNum.trim() || coachToEdit.coachNumber,
      coachType: editCoachType,
      deviceId: coachToEdit.deviceId || 'Not Mapped',
    };

    setCoachOverrides((prev) => ({
      ...prev,
      [coachToEdit.id]: { ...prev[coachToEdit.id], ...patch },
    }));
    setCustomCoaches((prev) =>
      prev.map((c) => (c.id === coachToEdit.id ? { ...c, ...patch } : c))
    );
    if (selectedCoach?.id === coachToEdit.id) {
      setSelectedCoach((prev) => (prev ? { ...prev, ...patch } : null));
      if (patch.coachNumber) setSelectedCoachNumber(patch.coachNumber);
    }
    setIsEditCoachOpen(false);
    setActionFeedback(`Coach ${patch.coachNumber} updated successfully.`);
    setTimeout(() => setActionFeedback(null), 3500);
  };

  // Step through coaches in detailed view
  const handleNavigateCoach = (dir: 'prev' | 'next') => {
    if (!selectedCoach || allCoaches.length === 0) return;
    const idx = allCoaches.findIndex((c) => c.id === selectedCoach.id);
    if (idx === -1) return;
    const newIdx = dir === 'prev' ? Math.max(0, idx - 1) : Math.min(allCoaches.length - 1, idx + 1);
    const nextCoach = allCoaches[newIdx];
    setSelectedCoach(nextCoach);
    setSelectedCoachNumber(nextCoach.coachNumber);
  };

  // Build dual tank models for the selected coach
  const arrivalTankData: TankLiveStatus | null = useMemo(() => {
    if (!selectedCoach) return null;
    return {
      tankId: `${selectedCoach.id}-arrival`,
      tankIndex: 1,
      deviceId: selectedCoach.deviceId,
      deviceUid: selectedCoach.deviceId,
      trainNumber: selectedCoach.trainNumber,
      coachNumber: selectedCoach.coachNumber,
      tankName: 'Arrival Tank (Sensor 1)',
      capacityLiters: 20.0,
      maxHeightCm: 50.0,
      crossSectionalAreaM2: 0.04,
      levelPercent: selectedCoach.arrivalLevel,
      rawLevelPercent: selectedCoach.arrivalLevel,
      volumeLiters: selectedCoach.arrivalLevel ? (selectedCoach.arrivalLevel / 100) * 20 : null,
      heightCm: selectedCoach.arrivalHeightCm,
      rank: selectedCoach.arrivalLevel && selectedCoach.arrivalLevel < 20 ? 'LOW' : 'GOOD',
      alarmStatus: (selectedCoach.arrivalAlarmStatus as any) || 'NORMAL',
      batteryVoltage: 3.9,
      temperature: 28.5,
      isOnline: selectedCoach.isOnline,
      hasTelemetry: selectedCoach.arrivalLevel != null,
      isStale: false,
      lastUpdate: new Date().toISOString(),
    };
  }, [selectedCoach]);

  const departureTankData: TankLiveStatus | null = useMemo(() => {
    if (!selectedCoach) return null;
    return {
      tankId: `${selectedCoach.id}-departure`,
      tankIndex: 2,
      deviceId: selectedCoach.deviceId,
      deviceUid: selectedCoach.deviceId,
      trainNumber: selectedCoach.trainNumber,
      coachNumber: selectedCoach.coachNumber,
      tankName: 'Departure Tank (Sensor 2)',
      capacityLiters: 20.0,
      maxHeightCm: 50.0,
      crossSectionalAreaM2: 0.04,
      levelPercent: selectedCoach.departureLevel,
      rawLevelPercent: selectedCoach.departureLevel,
      volumeLiters: selectedCoach.departureLevel ? (selectedCoach.departureLevel / 100) * 20 : null,
      heightCm: selectedCoach.departureHeightCm,
      rank: selectedCoach.departureLevel && selectedCoach.departureLevel < 20 ? 'LOW' : 'GOOD',
      alarmStatus: (selectedCoach.departureAlarmStatus as any) || 'NORMAL',
      batteryVoltage: 3.9,
      temperature: 28.5,
      isOnline: selectedCoach.isOnline,
      hasTelemetry: selectedCoach.departureLevel != null,
      isStale: false,
      lastUpdate: new Date().toISOString(),
    };
  }, [selectedCoach]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        boxSizing: 'border-box',
        width: '100%',
        minWidth: 0,
      }}
    >
      {/* 1. Header & Train Selection Bar */}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setActiveScreen('trains')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              backgroundColor: '#F8FAFC',
              border: '1px solid #CBD5E1',
              borderRadius: '6px',
              color: '#0F172A',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <ChevronLeft size={14} />
            <span>Train Management</span>
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Selected Train:</span>
            <select
              value={activeTrain}
              onChange={(e) => {
                setActiveTrain(e.target.value);
                setSelectedTrainNumber(e.target.value);
              }}
              style={{
                height: '34px',
                padding: '0 12px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                backgroundColor: '#F8FAFC',
                color: '#0F172A',
                fontSize: '13px',
                fontWeight: 700,
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              {configuredTrains.length === 0 ? (
                <option value="">No trains configured</option>
              ) : (
                configuredTrains.map((t) => (
                  <option key={t.train_number} value={t.train_number}>
                    {t.train_number} &bull; {t.name} ({t.coaches_count} Coaches)
                  </option>
                ))
              )}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: '#64748B' }}>
            <span>
              {(() => {
                const activeMeta = configuredTrains.find((t) => t.train_number === activeTrain);
                if (!activeMeta) return <>No trains configured. Please add a train to begin monitoring.</>;
                const src = activeMeta.source_station || 'Origin';
                const dst = activeMeta.destination_station || 'Destination';
                return <>Route: <strong>{src} &rarr; {dst}</strong></>;
              })()}
            </span>
            <span>&bull;</span>
            <span>
              All Coaches: <strong>{allCoaches.length}</strong> &bull; Online: <strong style={{ color: '#16A34A' }}>{allCoaches.filter((c) => c.isOnline).length}</strong> &bull; Offline: <strong style={{ color: '#DC2626' }}>{allCoaches.filter((c) => !c.isOnline).length}</strong>
            </span>
          </div>
        </div>

        {/* View Mode & Add Coach Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            {(['ALL', 'ONLINE', 'OFFLINE'] as CoachTankFilterMode[]).map((mode) => {
              const label = mode === 'ALL' ? 'All Coaches' : mode === 'ONLINE' ? 'Online' : 'Offline';
              const active = coachFilter === mode;
              return (
                <button
                  key={mode}
                  onClick={() => setCoachFilter(mode)}
                  style={{
                    border: active ? '1px solid #2563EB' : '1px solid #E2E8F0',
                    backgroundColor: active ? '#2563EB' : '#FFFFFF',
                    color: active ? '#FFFFFF' : '#475569',
                    padding: '4px 10px',
                    borderRadius: '14px',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search size={13} color="#94A3B8" style={{ position: 'absolute', left: '8px', pointerEvents: 'none' }} />
            <input
              type="text"
              value={coachSearch}
              onChange={(e) => setCoachSearch(e.target.value)}
              placeholder="Search coaches..."
              style={{
                height: '30px',
                padding: '0 8px 0 26px',
                borderRadius: '6px',
                border: '1px solid #E2E8F0',
                fontSize: '11px',
                width: '130px',
              }}
            />
          </div>
          <div style={{ display: 'flex', backgroundColor: '#F1F5F9', padding: '2px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
            <button
              onClick={() => setViewMode('track')}
              style={{
                border: 'none',
                background: viewMode === 'track' ? '#FFFFFF' : 'transparent',
                color: viewMode === 'track' ? '#2563EB' : '#64748B',
                padding: '4px 10px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                boxShadow: viewMode === 'track' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
              }}
            >
              <Train size={13} />
              <span>Rail Track</span>
            </button>
            <button
              onClick={() => setViewMode('grid')}
              style={{
                border: 'none',
                background: viewMode === 'grid' ? '#FFFFFF' : 'transparent',
                color: viewMode === 'grid' ? '#2563EB' : '#64748B',
                padding: '4px 10px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                boxShadow: viewMode === 'grid' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
              }}
            >
              <LayoutGrid size={13} />
              <span>Grid View</span>
            </button>
          </div>

          <button
            onClick={() => setIsManageCoachOpen(true)}
            title="Edit Coaches & Consist"
            style={{
              height: '34px',
              padding: '0 12px',
              backgroundColor: '#EFF6FF',
              color: '#2563EB',
              border: '1px solid #BFDBFE',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
            }}
          >
            <SlidersHorizontal size={14} />
            <span>Edit Coaches</span>
          </button>

          <button
            onClick={handleOpenAddCoach}
            style={{
              height: '34px',
              padding: '0 12px',
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
            <Plus size={14} />
            <span>Add Coach</span>
          </button>
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

      {/* 2. Graphical Consist Layout */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '10px',
          border: '1px solid #E2E8F0',
          padding: '16px',
          position: 'relative',
        }}
      >
        <div className="consist-panel-header" style={{ marginBottom: '14px' }}>
          <div style={{ minWidth: 0, flex: '1 1 240px' }}>
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>
              Graphical Consist Layout (Engine &rarr; C1 &rarr; C2 &rarr; ... &rarr; C24)
            </h3>
            <span style={{ fontSize: '11px', color: '#64748B', display: 'block', marginTop: '2px' }}>
              Showing {filteredCoaches.length} of {allCoaches.length} coaches &bull; Dual water tanks, sensor connectivity &amp; battery telemetry
            </span>
          </div>

          {viewMode === 'track' && (
            <div className="consist-nav-controls">
              <button
                type="button"
                data-testid="consist-scroll-start"
                onClick={() => handleScrollTrack('start')}
                className="consist-scroll-btn"
                style={{ width: 'auto', padding: '0 8px', fontSize: '11px', fontWeight: 700 }}
                title="Jump to Locomotive"
                aria-label="Jump to Locomotive"
              >
                Loco
              </button>
              <button
                type="button"
                data-testid="consist-scroll-left"
                onClick={() => handleScrollTrack('left')}
                className="consist-scroll-btn"
                title="Scroll Left"
                aria-label="Scroll Consist Left"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                data-testid="consist-scroll-right"
                onClick={() => handleScrollTrack('right')}
                className="consist-scroll-btn"
                title="Scroll Right"
                aria-label="Scroll Consist Right"
              >
                <ChevronRight size={16} />
              </button>
              <button
                type="button"
                data-testid="consist-scroll-end"
                onClick={() => handleScrollTrack('end')}
                className="consist-scroll-btn"
                style={{ width: 'auto', padding: '0 8px', fontSize: '11px', fontWeight: 700 }}
                title="Jump to Last Coach"
                aria-label="Jump to Last Coach"
              >
                Tail
              </button>
            </div>
          )}
        </div>

        {(() => {
          const renderTankBar = (label: string, level: number | null, accentColor: string, isOnline: boolean) => {
            const hasLevel = level != null && Number.isFinite(level);
            const clamped = hasLevel ? Math.max(0, Math.min(100, level)) : 0;
            const isCritical = hasLevel && clamped < 20;
            const barColor = isCritical ? '#EF4444' : accentColor;
            const statusText = hasLevel ? `${clamped.toFixed(0)}%` : isOnline ? 'Awaiting' : 'Offline';

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px', fontSize: '11px' }}>
                  <span style={{ color: '#475569', fontWeight: 600 }}>{label}</span>
                  <span
                    style={{
                      fontWeight: 700,
                      color: hasLevel ? (isCritical ? '#DC2626' : '#0F172A') : '#94A3B8',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {statusText}
                  </span>
                </div>
                <div style={{ height: '6px', backgroundColor: '#E2E8F0', borderRadius: '999px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${clamped}%`,
                      height: '100%',
                      backgroundColor: hasLevel ? barColor : '#CBD5E1',
                      borderRadius: '999px',
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
              </div>
            );
          };

          const renderCoachCard = (coach: CoachRecord, layout: 'track' | 'grid') => {
            const isSelected = selectedCoach?.id === coach.id;
            const isBatteryLow = coach.batteryPercent != null && coach.batteryPercent < 40;
            const isMapped = Boolean(coach.deviceId && coach.deviceId !== 'Not Mapped');
            const sensorStatusLabel = coach.isOnline ? 'Sensors: Live' : isMapped ? 'Sensors: Offline' : 'Sensors: Unmapped';
            const sensorColor = coach.isOnline ? '#15803D' : isMapped ? '#DC2626' : '#64748B';
            const batteryLabel = coach.batteryPercent != null ? `${coach.batteryPercent}%` : 'N/A';

            return (
              <div
                key={coach.id}
                data-testid={`consist-coach-card-${coach.coachNumber}`}
                onClick={() => {
                  setSelectedCoach(coach);
                  setSelectedCoachNumber(coach.coachNumber);
                }}
                className={`consist-coach-card${layout === 'grid' ? ' consist-coach-card--grid' : ''}`}
                style={{
                  backgroundColor: isSelected ? '#F0F7FF' : '#FFFFFF',
                  border: isBatteryLow
                    ? '1.5px solid #EF4444'
                    : isSelected
                    ? '2px solid #2563EB'
                    : '1px solid #CBD5E1',
                  boxShadow: isSelected
                    ? '0 4px 12px rgba(37, 99, 235, 0.16)'
                    : '0 1px 3px rgba(15, 23, 42, 0.05)',
                }}
              >
                {/* Header: Coach Number, Category & Completely Contained Status Pill */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', minWidth: 0 }}>
                    <span
                      className="consist-truncate"
                      title={`Coach ${coach.coachNumber}`}
                      style={{
                        flex: 1,
                        fontSize: '14px',
                        fontWeight: 800,
                        color: isSelected ? '#1D4ED8' : '#0F172A',
                      }}
                    >
                      Coach {coach.coachNumber}
                    </span>
                    <span
                      data-testid="coach-status-badge"
                      style={{
                        flexShrink: 0,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '2px 7px',
                        borderRadius: '999px',
                        fontSize: '10px',
                        fontWeight: 700,
                        lineHeight: 1.2,
                        letterSpacing: '0.3px',
                        backgroundColor: coach.isOnline ? '#DCFCE7' : '#FEE2E2',
                        color: coach.isOnline ? '#15803D' : '#B91C1C',
                        border: `1px solid ${coach.isOnline ? '#86EFAC' : '#FECACA'}`,
                      }}
                    >
                      <span
                        style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          backgroundColor: coach.isOnline ? '#16A34A' : '#DC2626',
                        }}
                      />
                      {coach.isOnline ? 'ONLINE' : 'OFFLINE'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', minWidth: 0 }}>
                    <span className="consist-truncate" title={coach.coachType} style={{ fontSize: '11px', color: '#64748B', fontWeight: 500 }}>
                      {coach.coachType}
                    </span>
                    {isBatteryLow && (
                      <span
                        style={{
                          flexShrink: 0,
                          backgroundColor: '#DC2626',
                          color: '#FFFFFF',
                          fontSize: '9px',
                          fontWeight: 800,
                          padding: '1px 5px',
                          borderRadius: '4px',
                          letterSpacing: '0.2px',
                        }}
                      >
                        BAT &lt;40%
                      </span>
                    )}
                  </div>
                </div>

                {/* Body: Dual Tank Telemetry & Sensor Connectivity */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '7px',
                    backgroundColor: '#F8FAFC',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: '1px solid #E2E8F0',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', fontSize: '10px' }}>
                    <span style={{ color: '#64748B', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <Radio size={11} color={sensorColor} />
                      Dual Tank Telemetry
                    </span>
                    <span style={{ color: sensorColor, fontWeight: 700 }}>{sensorStatusLabel}</span>
                  </div>

                  {renderTankBar('Arrival Tank', coach.arrivalLevel, '#2563EB', coach.isOnline)}
                  {renderTankBar('Departure Tank', coach.departureLevel, '#0284C7', coach.isOnline)}
                </div>

                {/* Footer: Mapping Status, Tank Connectivity & Battery */}
                <div
                  style={{
                    paddingTop: '8px',
                    borderTop: '1px solid #E2E8F0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                    fontSize: '10px',
                    minWidth: 0,
                  }}
                >
                  <span
                    className="consist-truncate"
                    title={isMapped ? `Device: ${coach.deviceId}` : 'Device Not Mapped'}
                    style={{
                      flex: 1,
                      color: isMapped ? '#334155' : '#64748B',
                      fontWeight: 600,
                    }}
                  >
                    {isMapped ? `Mapped · ${coach.deviceId}` : 'Unmapped'}
                  </span>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    <span
                      style={{
                        color: coach.isOnline ? '#15803D' : '#64748B',
                        fontWeight: 700,
                      }}
                    >
                      {coach.isOnline ? '2/2 Live' : '0/2 Live'}
                    </span>
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px',
                        color: isBatteryLow ? '#DC2626' : coach.batteryPercent != null ? '#16A34A' : '#64748B',
                        fontWeight: 700,
                      }}
                    >
                      {isBatteryLow ? <BatteryWarning size={12} /> : <Battery size={12} />}
                      <span>{batteryLabel}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          };

          const renderCoupler = (key: string) => (
            <div key={key} className="consist-coupler" aria-hidden="true">
              <div className="consist-coupler-bar">
                <span className="consist-coupler-node">&rarr;</span>
              </div>
            </div>
          );

          if (viewMode === 'track') {
            return (
              <div className="consist-yard-frame">
                <div ref={trackScrollRef} data-testid="consist-track-scroll" className="consist-track-scroll">
                  <div className="consist-rail-stage">
                    <div className="consist-rail-beam" aria-hidden="true" />

                    {/* Distinct SCADA Locomotive Block */}
                    <div data-testid="consist-locomotive-card" className="consist-locomotive-card">
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                          <span style={{ fontSize: '10px', fontWeight: 700, color: '#93C5FD', letterSpacing: '0.7px' }}>
                            LOCOMOTIVE
                          </span>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '2px 6px',
                              borderRadius: '999px',
                              backgroundColor: 'rgba(22, 163, 74, 0.2)',
                              color: '#4ADE80',
                              fontSize: '9px',
                              fontWeight: 700,
                            }}
                          >
                            ACTIVE
                          </span>
                        </div>
                        <div style={{ fontSize: '20px', fontWeight: 800, color: '#FFFFFF', letterSpacing: '0.3px' }}>
                          WAP-7
                        </div>
                        <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>
                          Electric Loco #30245
                        </div>
                      </div>

                      <div
                        style={{
                          paddingTop: '10px',
                          borderTop: '1px solid rgba(148, 163, 184, 0.25)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '3px',
                          fontSize: '11px',
                          color: '#CBD5E1',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>Speed:</span>
                          <strong style={{ color: '#FFFFFF' }}>78.5 km/h</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>Traction:</span>
                          <strong style={{ color: '#4ADE80' }}>Active</strong>
                        </div>
                      </div>
                    </div>

                    {/* Locomotive -> First Coach / Empty State Coupler */}
                    {renderCoupler('coupler-loco')}

                    {filteredCoaches.length === 0 ? (
                      <div
                        style={{
                          padding: '24px 28px',
                          borderRadius: '10px',
                          backgroundColor: '#FFFFFF',
                          border: '1px dashed #CBD5E1',
                          color: '#64748B',
                          fontSize: '13px',
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        {(coachFilter === 'ALL' || coachFilter === 'ONLINE') && onlineCoachesCount === 0
                          ? 'No coaches are currently online.'
                          : coachFilter === 'OFFLINE' && coachSearch.trim().length === 0
                            ? 'No offline coaches'
                            : 'No matching coaches found.'}
                      </div>
                    ) : (
                      filteredCoaches.map((coach, idx) => (
                        <React.Fragment key={coach.id}>
                          {renderCoachCard(coach, 'track')}
                          {idx < filteredCoaches.length - 1 && renderCoupler(`coupler-${coach.id}`)}
                        </React.Fragment>
                      ))
                    )}
                  </div>
                </div>
              </div>
            );
          }

          if (filteredCoaches.length === 0) {
            return (
              <div style={{ padding: '40px', textAlign: 'center', backgroundColor: '#F8FAFC', borderRadius: '8px', border: '1px dashed #CBD5E1', color: '#64748B', fontSize: '13px', fontWeight: 600 }}>
                {(coachFilter === 'ALL' || coachFilter === 'ONLINE') && onlineCoachesCount === 0
                  ? 'No coaches are currently online.'
                  : coachFilter === 'OFFLINE' && coachSearch.trim().length === 0
                    ? 'No offline coaches'
                    : 'No matching coaches found.'}
              </div>
            );
          }

          return (
            <div className="consist-grid-cards">
              {filteredCoaches.map((coach) => renderCoachCard(coach, 'grid'))}
            </div>
          );
        })()}
      </div>

      {/* 3. Dedicated Coach Details Section: Dual Tank Monitoring */}
      {selectedCoach ? (
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '8px',
            border: '1px solid #BFDBFE',
            padding: '16px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
          }}
        >
          {/* Detailed Header with Navigation */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid #E2E8F0',
              paddingBottom: '12px',
              marginBottom: '16px',
              gap: '12px',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    backgroundColor: '#2563EB',
                    color: '#FFFFFF',
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '4px',
                  }}
                >
                  COACH DETAILS
                </span>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0F172A' }}>
                  Coach {selectedCoach.coachNumber} &bull; {selectedCoach.coachType}
                </h2>
              </div>
              <div style={{ fontSize: '12px', color: '#64748B', marginTop: '4px' }}>
                Assigned Device: <strong>{selectedCoach.deviceId}</strong> &bull; Link: {selectedCoach.isOnline ? 'Active' : 'Offline'} &bull; Train {selectedCoach.trainNumber}
              </div>
            </div>

            {/* Stepper Navigation: Previous / Next Coach */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={() => handleNavigateCoach('prev')}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#F8FAFC',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <ChevronLeft size={14} />
                <span>Prev Coach</span>
              </button>
              <button
                onClick={() => handleNavigateCoach('next')}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#F8FAFC',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <span>Next Coach</span>
                <ChevronRight size={14} />
              </button>
              <button
                onClick={() => {
                  setSelectedCoachNumber(selectedCoach.coachNumber);
                  setActiveScreen('coach-details');
                }}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: '#2563EB',
                  color: '#FFFFFF',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
                title="Open full dedicated coach details page"
              >
                <span>Full Details</span>
                <ArrowRight size={13} />
              </button>
              <button
                onClick={() => handleOpenEditCoach(selectedCoach)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid #BFDBFE',
                  backgroundColor: '#EFF6FF',
                  color: '#2563EB',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <Edit3 size={13} />
                <span>Edit Coach</span>
              </button>
              <button
                onClick={() => setSelectedCoach(null)}
                style={{
                  padding: '6px 8px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#F8FAFC',
                  cursor: 'pointer',
                  color: '#64748B',
                }}
                title="Close Details"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Independent Battery & Device Status Strip */}
          {(() => {
            const detailBatLow = selectedCoach.batteryPercent != null && selectedCoach.batteryPercent < 40;
            const detailBatMissing = selectedCoach.batteryPercent == null;
            return (
              <div
                style={{
                  backgroundColor: detailBatLow ? '#FEF2F2' : '#F8FAFC',
                  border: `1px solid ${detailBatLow ? '#FCA5A5' : '#E2E8F0'}`,
                  borderRadius: '6px',
                  padding: '10px 14px',
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '16px',
                  gap: '10px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      padding: '4px 8px',
                      borderRadius: '4px',
                      backgroundColor: detailBatLow ? '#DC2626' : detailBatMissing ? '#64748B' : '#16A34A',
                      color: '#FFFFFF',
                      fontSize: '11px',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                  >
                    {detailBatLow ? <BatteryWarning size={14} /> : <Battery size={14} />}
                    <span>Battery: {detailBatMissing ? 'N/A' : `${selectedCoach.batteryPercent}%`}</span>
                  </div>
                  <span style={{ fontSize: '12px', color: detailBatLow ? '#991B1B' : '#475569', fontWeight: 600 }}>
                    {detailBatLow
                      ? 'CRITICAL BATTERY ALERT: Charge or replace node power cell immediately.'
                      : detailBatMissing
                        ? 'Battery telemetry unavailable — node offline or awaiting device mapping.'
                        : 'Power subsystem nominal. Wireless telemetry communicating regularly.'}
                  </span>
                </div>

                <div style={{ fontSize: '11px', color: '#64748B' }}>
                  Tank Mapping: <strong>Sensor 1 = Arrival Tank</strong> &bull;{' '}
                  <strong>Sensor 2 = Departure Tank</strong>
                </div>
              </div>
            );
          })()}

          {/* DUAL WATER TANK VISUALIZATION (Side-by-Side Cards) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
              gap: '16px',
            }}
          >
            {/* Arrival Tank (Sensor 1) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span
                    style={{
                      backgroundColor: '#2563EB',
                      color: '#FFFFFF',
                      fontSize: '10px',
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: '4px',
                    }}
                  >
                    Sensor 1
                  </span>
                  <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>
                    Arrival Water Tank
                  </h4>
                </div>
                <span style={{ fontSize: '11px', color: '#64748B' }}>50 cm / 20 L Capacity</span>
              </div>
              <TankVisualization
                tank={arrivalTankData}
                batteryPercent={selectedCoach.batteryPercent}
                connectionStatus={selectedCoach.isOnline ? 'Online' : 'Offline'}
              />
            </div>

            {/* Departure Tank (Sensor 2) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span
                    style={{
                      backgroundColor: '#0284C7',
                      color: '#FFFFFF',
                      fontSize: '10px',
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: '4px',
                    }}
                  >
                    Sensor 2
                  </span>
                  <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>
                    Departure Water Tank
                  </h4>
                </div>
                <span style={{ fontSize: '11px', color: '#64748B' }}>50 cm / 20 L Capacity</span>
              </div>
              <TankVisualization
                tank={departureTankData}
                batteryPercent={selectedCoach.batteryPercent}
                connectionStatus={selectedCoach.isOnline ? 'Online' : 'Offline'}
              />
            </div>
          </div>
        </div>
      ) : (
        <div
          style={{
            padding: '30px',
            backgroundColor: '#F8FAFC',
            borderRadius: '8px',
            border: '1px dashed #CBD5E1',
            textAlign: 'center',
            color: '#64748B',
          }}
        >
          <Layers size={32} color="#94A3B8" style={{ marginBottom: '6px' }} />
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#1E293B' }}>
            Click on any coach above to inspect its Dual Water Tank telemetry
          </div>
          <div style={{ fontSize: '11px', marginTop: '2px' }}>
            Inspect Sensor 1 (Arrival Tank) and Sensor 2 (Departure Tank) animated visualizations simultaneously.
          </div>
        </div>
      )}

      {/* MODAL: Add Coach */}
      {isAddCoachOpen && (
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
                Add Coach to Train {activeTrain}
              </h3>
              <button
                onClick={() => setIsAddCoachOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
              >
                <X size={16} />
              </button>
            </div>

            <form data-testid="add-coach-form" onSubmit={handleCreateCoach} style={{ padding: '18px' }}>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  Coach Number *
                </label>
                <input
                  type="text"
                  value={newCoachNum}
                  onChange={(e) => setNewCoachNum(e.target.value)}
                  placeholder="e.g. C5"
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

              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  Coach Type *
                </label>
                <select
                  value={newCoachType}
                  onChange={(e) => setNewCoachType(e.target.value)}
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
                  <option value="AC Chair Car">AC Chair Car (CC)</option>
                  <option value="Executive AC">Executive Chair Car (EC)</option>
                  <option value="AC 3-Tier">AC 3-Tier (3A)</option>
                  <option value="AC 2-Tier">AC 2-Tier (2A)</option>
                  <option value="Sleeper Class">Sleeper Class (SL)</option>
                  <option value="Pantry Car">Pantry Car (PC)</option>
                </select>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  Assigned IoT Device Code
                </label>
                <input
                  type="text"
                  value={newCoachDev}
                  onChange={(e) => setNewCoachDev(e.target.value)}
                  placeholder="e.g. DEV-WLI-05"
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
                  onClick={() => setIsAddCoachOpen(false)}
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
                  Add Coach
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Edit Coach */}
      {isEditCoachOpen && coachToEdit && (
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
                Edit Coach: {coachToEdit.coachNumber}
              </h3>
              <button
                onClick={() => setIsEditCoachOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
              >
                <X size={16} />
              </button>
            </div>

            <form data-testid="edit-coach-form" onSubmit={handleSaveEditCoach} style={{ padding: '18px' }}>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  Coach Number
                </label>
                <input
                  type="text"
                  value={editCoachNum}
                  onChange={(e) => setEditCoachNum(e.target.value)}
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

              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  Coach Type
                </label>
                <select
                  value={editCoachType}
                  onChange={(e) => setEditCoachType(e.target.value)}
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
                  <option value="AC Chair Car">AC Chair Car (CC)</option>
                  <option value="Executive AC">Executive Chair Car (EC)</option>
                  <option value="AC 3-Tier">AC 3-Tier (3A)</option>
                  <option value="AC 2-Tier">AC 2-Tier (2A)</option>
                  <option value="Sleeper Class">Sleeper Class (SL)</option>
                  <option value="Pantry Car">Pantry Car (PC)</option>
                </select>
              </div>



              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsEditCoachOpen(false)}
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
                  Save Coach
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeTrain && (
        <ManageCoachModal
          isOpen={isManageCoachOpen}
          onClose={() => {
            setIsManageCoachOpen(false);
            refreshData();
          }}
          trainNumber={activeTrain}
        />
      )}
    </div>
  );
};
