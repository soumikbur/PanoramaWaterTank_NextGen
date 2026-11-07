import React, { useState, useEffect, useMemo, useRef } from 'react';
import { typography } from '../theme';
import { useApp } from '../state/AppContext';
import { ApiClient } from '../api/client';
import { TankLiveStatus, Device, AlarmStatus } from '../types';
import { DEMO_TRAIN, DEMO_ARRIVAL_TANK, DEMO_DEPARTURE_TANK } from '../data/demonstrationData';
import { TankVisualization } from '../components/tank/TankVisualization';
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
} from 'lucide-react';

export interface CoachRecord {
  id: string;
  coachNumber: string;
  coachType: string;
  trainNumber: string;
  deviceId: string;
  isOnline: boolean;
  batteryPercent: number;
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
    devices,
    tanks,
    liveTank,
    connectionStatus,
    refreshData,
  } = useApp();

  const [activeTrain, setActiveTrain] = useState<string>(selectedTrainNumber || '12841');
  const [viewMode, setViewMode] = useState<'track' | 'grid'>('track');
  const [selectedCoach, setSelectedCoach] = useState<CoachRecord | null>(null);
  const [isAddCoachOpen, setIsAddCoachOpen] = useState(false);
  const [isEditCoachOpen, setIsEditCoachOpen] = useState(false);
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

  // Synchronize with global context
  useEffect(() => {
    if (selectedTrainNumber) {
      setActiveTrain(selectedTrainNumber);
    }
  }, [selectedTrainNumber]);

  // Generate 24 coaches for demonstrative consist or map real backend coaches
  const [customCoaches, setCustomCoaches] = useState<CoachRecord[]>([]);

  // Construct coach fleet for active train
  const coachesList: CoachRecord[] = useMemo(() => {
    if (activeTrain === '12841') {
      // Demo Coromandel Express with 24 Coach Capacity support
      const baseCoaches: CoachRecord[] = [
        {
          id: 'coach-12841-C4',
          coachNumber: 'C4',
          coachType: 'AC Chair Car',
          trainNumber: '12841',
          deviceId: 'Device-1',
          isOnline: true,
          batteryPercent: 88,
          arrivalLevel: 75.0,
          arrivalHeightCm: 37.5,
          departureLevel: 68.0,
          departureHeightCm: 34.0,
          arrivalAlarmStatus: 'NORMAL',
          departureAlarmStatus: 'NORMAL',
        },
      ];

      // Add default 23 sequential coaches to demonstrate 24-coach capability
      const coachTypes = ['Executive AC', 'AC 2-Tier', 'AC 3-Tier', 'AC Chair Car', 'Sleeper Class', 'Pantry Car'];
      for (let i = 1; i <= 24; i++) {
        const cNum = `C${i}`;
        if (cNum === 'C4') continue; // already added
        const typeIndex = (i - 1) % coachTypes.length;
        const batt = 35 + ((i * 7) % 60); // some under 40% to demonstrate battery alert
        const isOnline = i % 7 !== 0;
        const arrLvl = isOnline ? 20 + ((i * 11) % 75) : null;
        const depLvl = isOnline ? 15 + ((i * 9) % 75) : null;

        baseCoaches.push({
          id: `coach-12841-${cNum}`,
          coachNumber: cNum,
          coachType: coachTypes[typeIndex],
          trainNumber: '12841',
          deviceId: isOnline ? `DEV-WLI-${i < 10 ? '0' + i : i}` : 'Unassigned',
          isOnline,
          batteryPercent: batt,
          arrivalLevel: arrLvl,
          arrivalHeightCm: arrLvl ? (arrLvl / 100) * 50 : null,
          departureLevel: depLvl,
          departureHeightCm: depLvl ? (depLvl / 100) * 50 : null,
          arrivalAlarmStatus: arrLvl && arrLvl < 20 ? 'WARNING' : 'NORMAL',
          departureAlarmStatus: depLvl && depLvl < 20 ? 'WARNING' : 'NORMAL',
        });
      }

      // Sort in sequential order: C1, C2, C3, ..., C24
      baseCoaches.sort((a, b) => {
        const numA = parseInt(a.coachNumber.replace(/\D/g, '')) || 0;
        const numB = parseInt(b.coachNumber.replace(/\D/g, '')) || 0;
        return numA - numB;
      });

      return baseCoaches;
    }

    // For other trains, build from backend devices and live telemetry
    const trainDevs = devices.filter((d) => (d.trainNumber || '12002') === activeTrain);
    if (trainDevs.length > 0) {
      return trainDevs.map((d, idx) => ({
        id: d.id,
        coachNumber: d.coachNumber || `C${idx + 1}`,
        coachType: 'Standard Coach',
        trainNumber: activeTrain,
        deviceId: d.uid,
        isOnline: d.isOnline,
        batteryPercent: d.batteryPercent ?? 85,
        arrivalLevel: idx === 0 ? liveTank?.levelPercent ?? d.primaryLevel ?? null : d.primaryLevel ?? null,
        arrivalHeightCm: idx === 0 ? liveTank?.heightCm ?? null : null,
        departureLevel: d.secondaryLevel ?? null,
        departureHeightCm: null,
        arrivalAlarmStatus: idx === 0 ? liveTank?.alarmStatus : 'NORMAL',
        departureAlarmStatus: 'NORMAL',
      }));
    }

    // Fallback single coach
    return [
      {
        id: 'fallback-c1',
        coachNumber: 'C1',
        coachType: 'AC Chair Car',
        trainNumber: activeTrain,
        deviceId: 'DEV-01',
        isOnline: true,
        batteryPercent: 90,
        arrivalLevel: liveTank?.levelPercent ?? 70,
        arrivalHeightCm: liveTank?.heightCm ?? 35,
        departureLevel: 65,
        departureHeightCm: 32.5,
        arrivalAlarmStatus: 'NORMAL',
        departureAlarmStatus: 'NORMAL',
      },
    ];
  }, [activeTrain, devices, liveTank]);

  const allCoaches = [...coachesList, ...customCoaches];

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

  const handleScrollTrack = (dir: 'left' | 'right') => {
    if (trackScrollRef.current) {
      const offset = dir === 'left' ? -380 : 380;
      trackScrollRef.current.scrollBy({ left: offset, behavior: 'smooth' });
    }
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
      deviceId: newCoachDev.trim() || 'DEV-WLI-NEW',
      isOnline: true,
      batteryPercent: 95,
      arrivalLevel: 80,
      arrivalHeightCm: 40,
      departureLevel: 75,
      departureHeightCm: 37.5,
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

    setCustomCoaches((prev) =>
      prev.map((c) =>
        c.id === coachToEdit.id
          ? { ...c, coachNumber: editCoachNum, coachType: editCoachType, deviceId: editCoachDev }
          : c
      )
    );
    if (selectedCoach?.id === coachToEdit.id) {
      setSelectedCoach((prev) =>
        prev ? { ...prev, coachNumber: editCoachNum, coachType: editCoachType, deviceId: editCoachDev } : null
      );
    }
    setIsEditCoachOpen(false);
    setActionFeedback(`Coach ${editCoachNum} updated successfully.`);
    setTimeout(() => setActionFeedback(null), 3500);
  };

  // Step through coaches in detailed view
  const handleNavigateCoach = (dir: 'prev' | 'next') => {
    if (!selectedCoach) return;
    const idx = allCoaches.findIndex((c) => c.id === selectedCoach.id);
    if (idx === -1) return;
    const newIdx = dir === 'prev' ? Math.max(0, idx - 1) : Math.min(allCoaches.length - 1, idx + 1);
    setSelectedCoach(allCoaches[newIdx]);
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
        maxWidth: '1600px',
        margin: '0 auto',
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
            onClick={() => setActiveScreen('dashboard')}
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
            <span>Dashboard</span>
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
              <option value="12841">12841 &bull; Coromandel Express (24 Coaches)</option>
              <option value="12002">12002 &bull; Shatabdi Express</option>
              <option value="12951">12951 &bull; Mumbai Rajdhani</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: '#64748B' }}>
            <span>
              Route: <strong>{activeTrain === '12841' ? 'Chennai Central → Howrah' : 'New Delhi → Howrah'}</strong>
            </span>
            <span>&bull;</span>
            <span>
              Consist: <strong>{allCoaches.length} Coaches</strong> (Capacity: 24)
            </span>
          </div>
        </div>

        {/* View Mode & Add Coach Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
          borderRadius: '8px',
          border: '1px solid #E2E8F0',
          padding: '16px',
          position: 'relative',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>
              Graphical Consist Layout (Engine &rarr; C1 &rarr; C2 &rarr; ... &rarr; C24)
            </h3>
            <span style={{ fontSize: '11px', color: '#64748B' }}>
              Showing full 24-coach rake capability with dual water tanks and battery alert telemetry
            </span>
          </div>

          {viewMode === 'track' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                onClick={() => handleScrollTrack('left')}
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#F8FAFC',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#475569',
                }}
                title="Scroll Left"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => handleScrollTrack('right')}
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#F8FAFC',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#475569',
                }}
                title="Scroll Right"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>

        {/* Consist Stream: Track Mode (Horizontal Scroll) or Grid Mode */}
        {viewMode === 'track' ? (
          <div
            ref={trackScrollRef}
            style={{
              display: 'flex',
              alignItems: 'stretch',
              gap: '12px',
              overflowX: 'auto',
              paddingBottom: '16px',
              scrollBehavior: 'smooth',
            }}
          >
            {/* Locomotive Engine Card */}
            <div
              style={{
                width: '160px',
                minWidth: '160px',
                borderRadius: '8px',
                backgroundColor: 'var(--color-surface, #FFFFFF)',
                border: '1px solid var(--color-border-strong, #CBD5E1)',
                color: 'var(--color-text-primary, #0F172A)',
                padding: '12px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                flexShrink: 0,
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-primary, #2563EB)', letterSpacing: '0.5px' }}>
                    LOCOMOTIVE
                  </span>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#16A34A' }} />
                </div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-text-primary, #0F172A)' }}>
                  WAP-7
                </div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-muted, #64748B)', marginTop: '2px' }}>
                  Electric Loco #30245
                </div>
              </div>

              <div style={{ marginTop: '14px', paddingTop: '10px', borderTop: '1px solid var(--color-border, #E2E8F0)', fontSize: '10px', color: 'var(--color-text-secondary, #475569)' }}>
                <div>Speed: <strong>78.5 km/h</strong></div>
                <div>Traction: <strong style={{ color: 'var(--color-success, #16A34A)' }}>Active</strong></div>
              </div>
            </div>

            {/* Coupling Line Graphic */}
            <div style={{ display: 'flex', alignItems: 'center', color: '#94A3B8', flexShrink: 0, fontSize: '12px', fontWeight: 700 }}>
              &harr;
            </div>

            {/* Sequential Coaches (C1 to C24) */}
            {allCoaches.map((coach) => {
              const isSelected = selectedCoach?.id === coach.id;
              const isBatteryLow = coach.batteryPercent < 40;

              return (
                <div
                  key={coach.id}
                  onClick={() => {
                    setSelectedCoach(coach);
                    setSelectedCoachNumber(coach.coachNumber);
                  }}
                  style={{
                    width: '210px',
                    minWidth: '210px',
                    borderRadius: '8px',
                    backgroundColor: isSelected ? '#EFF6FF' : '#FFFFFF',
                    border: isBatteryLow
                      ? '2px solid #EF4444'
                      : isSelected
                      ? '2px solid #2563EB'
                      : '1px solid #E2E8F0',
                    boxShadow: isSelected ? '0 4px 6px -1px rgba(37, 99, 235, 0.15)' : 'none',
                    padding: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    flexShrink: 0,
                    boxSizing: 'border-box',
                    position: 'relative',
                  }}
                >
                  {/* Battery Alert Badge if < 40% */}
                  {isBatteryLow && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '-8px',
                        right: '8px',
                        backgroundColor: '#EF4444',
                        color: '#FFFFFF',
                        fontSize: '8px',
                        fontWeight: 800,
                        padding: '1px 5px',
                        borderRadius: '4px',
                        letterSpacing: '0.3px',
                        animation: 'pulse 1.5s infinite',
                      }}
                    >
                      BATTERY LOW &lt;40%
                    </div>
                  )}

                  {/* Header: Coach Number & Type */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span
                        style={{
                          fontSize: '14px',
                          fontWeight: 800,
                          color: isSelected ? '#2563EB' : '#0F172A',
                        }}
                      >
                        Coach {coach.coachNumber}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <div
                          style={{
                            width: '7px',
                            height: '7px',
                            borderRadius: '50%',
                            backgroundColor: coach.isOnline ? '#16A34A' : '#DC2626',
                          }}
                        />
                        <span style={{ fontSize: '9px', fontWeight: 600, color: coach.isOnline ? '#16A34A' : '#DC2626' }}>
                          {coach.isOnline ? 'ONLINE' : 'OFFLINE'}
                        </span>
                      </div>
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748B', marginBottom: '10px' }}>
                      {coach.coachType}
                    </div>

                    {/* Dual Water Tank Gauges */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', backgroundColor: '#F8FAFC', padding: '8px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                      {/* Arrival Tank */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#475569', marginBottom: '2px' }}>
                          <span>Arrival Tank:</span>
                          <strong>{coach.arrivalLevel != null ? `${coach.arrivalLevel.toFixed(0)}%` : 'Awaiting'}</strong>
                        </div>
                        <div style={{ height: '6px', backgroundColor: '#E2E8F0', borderRadius: '3px', overflow: 'hidden' }}>
                          <div
                            style={{
                              width: `${Math.max(0, Math.min(100, coach.arrivalLevel || 0))}%`,
                              height: '100%',
                              backgroundColor: coach.arrivalLevel && coach.arrivalLevel < 20 ? '#EF4444' : '#2563EB',
                              transition: 'width 0.3s ease',
                            }}
                          />
                        </div>
                      </div>

                      {/* Departure Tank */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#475569', marginBottom: '2px' }}>
                          <span>Departure Tank:</span>
                          <strong>{coach.departureLevel != null ? `${coach.departureLevel.toFixed(0)}%` : 'Awaiting'}</strong>
                        </div>
                        <div style={{ height: '6px', backgroundColor: '#E2E8F0', borderRadius: '3px', overflow: 'hidden' }}>
                          <div
                            style={{
                              width: `${Math.max(0, Math.min(100, coach.departureLevel || 0))}%`,
                              height: '100%',
                              backgroundColor: coach.departureLevel && coach.departureLevel < 20 ? '#EF4444' : '#0284C7',
                              transition: 'width 0.3s ease',
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Footer: Device & Battery */}
                  <div
                    style={{
                      marginTop: '10px',
                      paddingTop: '8px',
                      borderTop: '1px solid #E2E8F0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '10px',
                    }}
                  >
                    <span style={{ color: '#64748B' }}>{coach.deviceId}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '3px', color: isBatteryLow ? '#DC2626' : '#16A34A', fontWeight: 700 }}>
                      {isBatteryLow ? <BatteryWarning size={13} /> : <Battery size={13} />}
                      <span>{coach.batteryPercent}%</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Grid View Mode */
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
              gap: '12px',
            }}
          >
            {allCoaches.map((coach) => {
              const isSelected = selectedCoach?.id === coach.id;
              const isBatteryLow = coach.batteryPercent < 40;

              return (
                <div
                  key={coach.id}
                  onClick={() => {
                    setSelectedCoach(coach);
                    setSelectedCoachNumber(coach.coachNumber);
                  }}
                  style={{
                    borderRadius: '8px',
                    backgroundColor: isSelected ? '#EFF6FF' : '#FFFFFF',
                    border: isBatteryLow
                      ? '2px solid #EF4444'
                      : isSelected
                      ? '2px solid #2563EB'
                      : '1px solid #E2E8F0',
                    padding: '12px',
                    cursor: 'pointer',
                    boxSizing: 'border-box',
                    position: 'relative',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: isSelected ? '#2563EB' : '#0F172A' }}>
                      Coach {coach.coachNumber}
                    </span>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: coach.isOnline ? '#16A34A' : '#DC2626' }}>
                      {coach.isOnline ? 'ONLINE' : 'OFFLINE'}
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748B', margin: '2px 0 8px 0' }}>
                    {coach.coachType}
                  </div>

                  <div style={{ fontSize: '10px', color: '#475569', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Arrival:</span>
                      <strong>{coach.arrivalLevel != null ? `${coach.arrivalLevel.toFixed(0)}%` : '—'}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Departure:</span>
                      <strong>{coach.departureLevel != null ? `${coach.departureLevel.toFixed(0)}%` : '—'}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: isBatteryLow ? '#DC2626' : '#16A34A', fontWeight: 700 }}>
                      <span>Battery:</span>
                      <span>{coach.batteryPercent}%</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
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
          <div
            style={{
              backgroundColor: selectedCoach.batteryPercent < 40 ? '#FEF2F2' : '#F8FAFC',
              border: `1px solid ${selectedCoach.batteryPercent < 40 ? '#FCA5A5' : '#E2E8F0'}`,
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
                  backgroundColor: selectedCoach.batteryPercent < 40 ? '#DC2626' : '#16A34A',
                  color: '#FFFFFF',
                  fontSize: '11px',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                {selectedCoach.batteryPercent < 40 ? <BatteryWarning size={14} /> : <Battery size={14} />}
                <span>Battery: {selectedCoach.batteryPercent}%</span>
              </div>
              <span style={{ fontSize: '12px', color: selectedCoach.batteryPercent < 40 ? '#991B1B' : '#475569', fontWeight: 600 }}>
                {selectedCoach.batteryPercent < 40
                  ? 'CRITICAL BATTERY ALERT: Charge or replace node power cell immediately.'
                  : 'Power subsystem nominal. Wireless telemetry communicating regularly.'}
              </span>
            </div>

            <div style={{ fontSize: '11px', color: '#64748B' }}>
              Tank Mapping: <strong>Sensor 1 = Arrival Tank</strong> &bull;{' '}
              <strong>Sensor 2 = Departure Tank</strong>
            </div>
          </div>

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

            <form onSubmit={handleCreateCoach} style={{ padding: '18px' }}>
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

            <form onSubmit={handleSaveEditCoach} style={{ padding: '18px' }}>
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

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  Assigned Device
                </label>
                <input
                  type="text"
                  value={editCoachDev}
                  onChange={(e) => setEditCoachDev(e.target.value)}
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
    </div>
  );
};
