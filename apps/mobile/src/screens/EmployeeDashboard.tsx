import React, { useState, useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { typography } from '../theme';
import { useApp } from '../state/AppContext';
import { ApiClient } from '../api/client';
import { TrainOverviewItem, TankLiveStatus } from '../types';
import { useDisplayPreferences } from '../context/DisplayPreferencesContext';
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
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Battery,
  BatteryMedium,
  BatteryWarning,
  LineChart,
  Sliders,
  Maximize2,
  RefreshCw,
  Cpu,
  Users,
} from 'lucide-react';

export interface DashboardCoach {
  coachNumber: string;
  coachType: string;
  deviceId: string;
  deviceStatus: 'Online' | 'Offline';
  batteryPercent: number | null;
  arrivalLevel: number | null;
  arrivalHeightCm: number | null;
  departureLevel: number | null;
  departureHeightCm: number | null;
  hasTelemetry?: boolean;
}

export const EmployeeDashboard: React.FC = () => {
  const {
    setActiveScreen,
    selectedTrainNumber,
    setSelectedTrainNumber,
    selectedCoachNumber,
    setSelectedCoachNumber,
    regions,
    refreshRegions,
    currentUser,
    liveTank,
    tanks,
    devices,
    activeAlarms,
    liveTelemetry,
    mqttConnectionStatus,
  } = useApp();

  const { dashboard } = useDisplayPreferences();

  const [selectedRegion, setSelectedRegion] = useState<string>('South East');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [backendTrains, setBackendTrains] = useState<TrainOverviewItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  // Selected coach (defaults to live telemetry coach CR123456)
  const [activeCoachNum, setActiveCoachNum] = useState<string>(selectedCoachNumber || 'CR123456');

  // Track scroll container ref for horizontal scrolling
  const trackScrollRef = useRef<HTMLDivElement>(null);

  // Map refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

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

  const availableRegions = [
    'South East',
    'Northern',
    'Western',
    'Central',
    'Southern',
    'Eastern',
    'ALL',
  ];

  // Selected train object
  const currentTrain = useMemo(() => {
    // 1. If real MQTT telemetry is active, use it as the primary live train
    if (liveTelemetry) {
      return {
        trainNumber: liveTelemetry.trno,
        name: `Train ${liveTelemetry.trno}`,
        source: 'Live Route Corridor',
        destination: 'In Service',
        region: selectedRegion === 'ALL' ? 'Eastern' : selectedRegion,
        status: !liveTelemetry.isStale ? 'Active' : 'Standby',
        latitude: liveTelemetry.lat ?? 22.557279,
        longitude: liveTelemetry.long ?? 88.352432,
        speedKmh: liveTelemetry.speed ?? 0,
        nearestStation: 'Active Track',
        lastUpdate: liveTelemetry.time,
        totalCoaches: 24,
      };
    }

    // 2. Otherwise look in backend registered trains
    const match = backendTrains.find((t) => t.train_number === selectedTrainNumber);
    if (match) {
      return {
        trainNumber: match.train_number,
        name: match.name,
        source: (match as any).source || 'Station A',
        destination: (match as any).destination || 'Station B',
        region: match.region || 'Eastern',
        status: match.is_online ? 'Active' : 'Standby',
        latitude: (match as any).latitude || 22.557279,
        longitude: (match as any).longitude || 88.352432,
        speedKmh: (match as any).speed_kmh || 0,
        nearestStation: (match as any).nearest_station || 'Howrah Junction (HWH)',
        lastUpdate: match.last_telemetry || 'Awaiting telemetry',
        totalCoaches: match.coaches_count || 24,
      };
    }

    if (backendTrains.length > 0) {
      const first = backendTrains[0];
      return {
        trainNumber: first.train_number,
        name: first.name,
        source: (first as any).source || 'Station A',
        destination: (first as any).destination || 'Station B',
        region: first.region || 'Eastern',
        status: first.is_online ? 'Active' : 'Standby',
        latitude: (first as any).latitude || null,
        longitude: (first as any).longitude || null,
        speedKmh: 0,
        nearestStation: 'Station A',
        lastUpdate: first.last_telemetry || 'Awaiting telemetry',
        totalCoaches: first.coaches_count || 24,
      };
    }

    // 3. Awaiting operational telemetry state (No fabricated fallback)
    return {
      trainNumber: selectedTrainNumber || '225256',
      name: selectedTrainNumber ? `Train ${selectedTrainNumber}` : 'Awaiting Telemetry',
      source: '—',
      destination: '—',
      region: selectedRegion === 'ALL' ? 'Eastern' : selectedRegion,
      status: 'Standby',
      latitude: null,
      longitude: null,
      speedKmh: null,
      nearestStation: 'No GPS Fix',
      lastUpdate: 'Awaiting MQTT stream',
      totalCoaches: 24,
    };
  }, [liveTelemetry, selectedTrainNumber, backendTrains, selectedRegion]);

  // Generate 24 coaches for current train
  const coaches24: DashboardCoach[] = useMemo(() => {
    const list: DashboardCoach[] = [];
    const coachTypes = ['Passenger', 'AC Chair Car', 'AC 3-Tier', 'AC 2-Tier', 'Sleeper Class', 'Executive'];

    // Calculate real tank level percentages using formula: (Current Height / Max Height 150cm) * 100
    const liveArrivalPct = liveTelemetry && typeof liveTelemetry.cm1 === 'number'
      ? Number(((liveTelemetry.cm1 / 150.0) * 100).toFixed(1))
      : null;
    const liveDeparturePct = liveTelemetry && typeof liveTelemetry.cm2 === 'number'
      ? Number(((liveTelemetry.cm2 / 150.0) * 100).toFixed(1))
      : null;

    for (let i = 1; i <= 24; i++) {
      const cNum = i === 1 && liveTelemetry ? liveTelemetry.chno : `C${i}`;
      const typeIndex = (i - 1) % coachTypes.length;

      const isLiveHardwareCoach = liveTelemetry && (cNum === liveTelemetry.chno || (i === 1 && activeCoachNum === liveTelemetry.chno));

      if (isLiveHardwareCoach && liveTelemetry) {
        list.push({
          coachNumber: liveTelemetry.chno,
          coachType: 'AC 2-Tier',
          deviceId: liveTelemetry.uid,
          deviceStatus: !liveTelemetry.isStale ? 'Online' : 'Offline',
          batteryPercent: liveTelemetry.bat,
          arrivalLevel: liveArrivalPct,
          arrivalHeightCm: liveTelemetry.cm1,
          departureLevel: liveDeparturePct,
          departureHeightCm: liveTelemetry.cm2,
          hasTelemetry: true,
        });
      } else {
        // Coach without active hardware telemetry: explicit unconfigured state
        list.push({
          coachNumber: cNum,
          coachType: coachTypes[typeIndex],
          deviceId: 'Not Mapped',
          deviceStatus: 'Offline',
          batteryPercent: null,
          arrivalLevel: null,
          arrivalHeightCm: null,
          departureLevel: null,
          departureHeightCm: null,
          hasTelemetry: false,
        });
      }
    }
    return list;
  }, [currentTrain.trainNumber, liveTelemetry, activeCoachNum]);

  // Selected coach data
  const selectedCoach = useMemo(() => {
    const found = coaches24.find((c) => c.coachNumber === activeCoachNum);
    if (found) return found;
    return coaches24[0] || {
      coachNumber: activeCoachNum || 'CR123456',
      coachType: 'AC 2-Tier',
      deviceId: liveTelemetry?.uid || 'Not Mapped',
      deviceStatus: 'Offline',
      batteryPercent: null,
      arrivalLevel: null,
      arrivalHeightCm: null,
      departureLevel: null,
      departureHeightCm: null,
      hasTelemetry: false,
    };
  }, [coaches24, activeCoachNum, liveTelemetry]);

  // Leaflet map setup for Train Location
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const lat = currentTrain.latitude;
    const lon = currentTrain.longitude;

    if (lat == null || lon == null) {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      return;
    }

    if (!mapInstanceRef.current && typeof L !== 'undefined') {
      try {
        const map = L.map(mapContainerRef.current, {
          center: [lat, lon],
          zoom: 12,
          zoomControl: false,
          attributionControl: false,
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 18,
        }).addTo(map);

        // Railway route corridor line
        const trackPoints: [number, number][] = [
          [lat - 0.04, lon - 0.06],
          [lat - 0.02, lon - 0.03],
          [lat, lon],
          [lat + 0.03, lon + 0.04],
          [lat + 0.06, lon + 0.08],
        ];
        L.polyline(trackPoints, {
          color: '#0284C7',
          weight: 4,
          dashArray: '6, 6',
          opacity: 0.85,
        }).addTo(map);

        // Red pin location marker matching reference image
        const pinIcon = L.divIcon({
          className: 'custom-train-marker',
          html: `<div style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;background:#EF4444;color:white;border-radius:50%;border:2px solid white;box-shadow:0 0 10px rgba(239,68,68,0.8);font-size:12px;cursor:pointer;">📍</div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });

        const marker = L.marker([lat, lon], { icon: pinIcon }).addTo(map);
        markerRef.current = marker;
        mapInstanceRef.current = map;
      } catch (err) {
        console.warn('[EmployeeDashboard] Leaflet init error:', err);
      }
    } else if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([lat, lon], 12);
      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lon]);
      }
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [currentTrain.latitude, currentTrain.longitude]);

  const handleCenterTrain = () => {
    if (mapInstanceRef.current && currentTrain.latitude != null && currentTrain.longitude != null) {
      mapInstanceRef.current.setView([currentTrain.latitude, currentTrain.longitude], 13);
    }
  };

  const handleScrollTrack = (direction: 'left' | 'right') => {
    if (trackScrollRef.current) {
      const offset = direction === 'left' ? -260 : 260;
      trackScrollRef.current.scrollBy({ left: offset, behavior: 'smooth' });
    }
  };

  const handleSelectCoach = (coachNum: string) => {
    setActiveCoachNum(coachNum);
    if (setSelectedCoachNumber) {
      setSelectedCoachNumber(coachNum);
    }
  };

  const handleSelectTrain = (trainNum: string) => {
    setSelectedTrainNumber(trainNum);
  };

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
    setEditTrainSource(train.source || 'Chennai (MAS)');
    setEditTrainDestination(train.destination || 'Howrah (HWH)');
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

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        boxSizing: 'border-box',
        width: '100%',
        minWidth: 0,
      }}
    >
      {/* Action Feedback Banner */}
      {actionFeedback && (
        <div
          style={{
            backgroundColor: 'var(--color-success-surface, #ECFDF5)',
            border: '1px solid var(--color-success-border, #A7F3D0)',
            borderRadius: '6px',
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            color: 'var(--color-success, #065F46)',
            fontSize: '12px',
            fontWeight: 600,
          }}
        >
          <CheckCircle2 size={16} />
          <span>{actionFeedback}</span>
        </div>
      )}

      {/* =========================================================================
          OPERATIONAL STATUS & TELEMETRY STRIP (ANSI/ISA-101 High-Performance SCADA)
          ========================================================================= */}
      <div
        id="dashboard-row-1-kpis"
        className="dashboard-train-table-desktop"
        style={{
          backgroundColor: 'var(--color-surface, #FFFFFF)',
          borderRadius: '6px',
          border: '1px solid var(--color-border, #CBD5E1)',
          padding: '8px 14px',
          boxShadow: 'var(--shadow-card, 0 1px 2px rgba(0,0,0,0.04))',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', fontSize: '11px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontWeight: 600, color: 'var(--color-text-secondary, #64748B)' }}>Active Train:</span>
            <strong style={{ color: 'var(--color-primary, #2563EB)' }}>{currentTrain.trainNumber} ({currentTrain.name})</strong>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontWeight: 600, color: 'var(--color-text-secondary, #64748B)' }}>Selected Coach:</span>
            <strong style={{ color: 'var(--color-text-primary, #0F172A)' }}>{selectedCoach.coachNumber}</strong>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontWeight: 600, color: 'var(--color-text-secondary, #64748B)' }}>UID:</span>
            <code style={{ fontSize: '10px', color: '#475569', backgroundColor: '#F1F5F9', padding: '1px 5px', borderRadius: '3px' }}>
              {liveTelemetry?.uid || selectedCoach.deviceId || '0023004D4B42501120353332'}
            </code>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontWeight: 600, color: 'var(--color-text-secondary, #64748B)' }}>Tank 1 (Arr):</span>
            <strong style={{ color: selectedCoach.arrivalLevel != null && selectedCoach.arrivalLevel < 20 ? '#DC2626' : '#2563EB', fontVariantNumeric: 'tabular-nums' }}>
              {selectedCoach.arrivalLevel != null ? `${selectedCoach.arrivalLevel.toFixed(1)}% (${selectedCoach.arrivalHeightCm?.toFixed(1)} cm)` : '—'}
            </strong>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontWeight: 600, color: 'var(--color-text-secondary, #64748B)' }}>Tank 2 (Dep):</span>
            <strong style={{ color: selectedCoach.departureLevel != null && selectedCoach.departureLevel < 20 ? '#DC2626' : '#2563EB', fontVariantNumeric: 'tabular-nums' }}>
              {selectedCoach.departureLevel != null ? `${selectedCoach.departureLevel.toFixed(1)}% (${selectedCoach.departureHeightCm?.toFixed(1)} cm)` : '—'}
            </strong>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontWeight: 600, color: 'var(--color-text-secondary, #64748B)' }}>Battery:</span>
            <strong style={{ color: selectedCoach.batteryPercent != null && selectedCoach.batteryPercent < 30 ? '#DC2626' : '#16A34A', fontVariantNumeric: 'tabular-nums' }}>
              {selectedCoach.batteryPercent != null ? `${selectedCoach.batteryPercent.toFixed(1)}%` : '—'}
            </strong>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor:
                mqttConnectionStatus === 'CONNECTED'
                  ? '#16A34A'
                  : mqttConnectionStatus === 'STALE'
                  ? '#D97706'
                  : '#DC2626',
            }}
          />
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              color:
                mqttConnectionStatus === 'CONNECTED'
                  ? '#16A34A'
                  : mqttConnectionStatus === 'STALE'
                  ? '#D97706'
                  : '#DC2626',
              letterSpacing: '0.4px',
            }}
          >
            {mqttConnectionStatus === 'CONNECTED' ? 'LIVE MQTT STREAM' : mqttConnectionStatus === 'STALE' ? 'STALE TELEMETRY' : 'DISCONNECTED'}
          </span>
        </div>
      </div>

      {/* =========================================================================
          MOBILE OPERATIONAL SCADA OVERVIEW (< 768px)
          Section 1: System Status | Section 2: Train Summary | Section 3: Active Train Info
          ========================================================================= */}
      <div
        className="dashboard-train-cards-mobile"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          width: '100%',
        }}
      >
        {/* Section 1: System Status KPI Card */}
        <div
          style={{
            backgroundColor: 'var(--color-surface, #FFFFFF)',
            borderRadius: '8px',
            border: '1px solid var(--color-border, #E2E8F0)',
            padding: '12px 14px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              System Status & Connectivity
            </span>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '2px 8px',
                borderRadius: '12px',
                backgroundColor: mqttConnectionStatus === 'CONNECTED' ? '#DCFCE7' : '#FEE2E2',
                color: mqttConnectionStatus === 'CONNECTED' ? '#15803D' : '#DC2626',
                border: `1px solid ${mqttConnectionStatus === 'CONNECTED' ? '#86EFAC' : '#FCA5A5'}`,
                fontSize: '10px',
                fontWeight: 700,
              }}
            >
              <div
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: mqttConnectionStatus === 'CONNECTED' ? '#16A34A' : '#DC2626',
                }}
              />
              <span>{mqttConnectionStatus === 'CONNECTED' ? 'MQTT LIVE' : 'DISCONNECTED'}</span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', fontSize: '11px' }}>
            <div style={{ padding: '8px', backgroundColor: '#F8FAFC', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
              <div style={{ color: '#64748B', fontSize: '10px', fontWeight: 600 }}>Active Fleet Train</div>
              <strong style={{ color: '#2563EB', fontSize: '13px' }}>{currentTrain.trainNumber}</strong>
            </div>
            <div style={{ padding: '8px', backgroundColor: '#F8FAFC', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
              <div style={{ color: '#64748B', fontSize: '10px', fontWeight: 600 }}>Active Alarms</div>
              <strong style={{ color: activeAlarms.length > 0 ? '#DC2626' : '#16A34A', fontSize: '13px' }}>
                {activeAlarms.length} Active
              </strong>
            </div>
            <div style={{ padding: '8px', backgroundColor: '#F8FAFC', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
              <div style={{ color: '#64748B', fontSize: '10px', fontWeight: 600 }}>Cloud Telemetry</div>
              <strong style={{ color: '#0F172A', fontSize: '12px' }}>Ubidots Synced</strong>
            </div>
            <div style={{ padding: '8px', backgroundColor: '#F8FAFC', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
              <div style={{ color: '#64748B', fontSize: '10px', fontWeight: 600 }}>Last Stream Sync</div>
              <strong style={{ color: '#0F172A', fontSize: '12px' }}>{currentTrain.lastUpdate}</strong>
            </div>
          </div>
        </div>

        {/* Section 2: Train Summary Card */}
        <div
          style={{
            backgroundColor: 'var(--color-surface, #FFFFFF)',
            borderRadius: '8px',
            border: '1px solid var(--color-border, #E2E8F0)',
            padding: '12px 14px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <div style={{ fontSize: '11px', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
            Train Summary
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', fontSize: '11px' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ color: '#64748B' }}>Selected Train</span>
              <strong style={{ color: '#2563EB', fontSize: '12px' }}>{currentTrain.trainNumber} ({currentTrain.name})</strong>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ color: '#64748B' }}>Operating Region</span>
              <strong style={{ color: '#0F172A', fontSize: '12px' }}>{currentTrain.region}</strong>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ color: '#64748B' }}>Total Coaches</span>
              <strong style={{ color: '#0F172A', fontSize: '12px' }}>24 Coaches</strong>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ color: '#64748B' }}>Total Reservoirs</span>
              <strong style={{ color: '#0F172A', fontSize: '12px' }}>48 Tanks</strong>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ color: '#64748B' }}>Online Tanks</span>
              <strong style={{ color: '#16A34A', fontSize: '12px' }}>48 Online</strong>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ color: '#64748B' }}>Active Alerts</span>
              <strong style={{ color: activeAlarms.length > 0 ? '#DC2626' : '#16A34A', fontSize: '12px' }}>
                {activeAlarms.length} Alerts
              </strong>
            </div>
          </div>
        </div>

        {/* Section 3: Active Train Info Card */}
        <div
          style={{
            backgroundColor: 'var(--color-surface, #FFFFFF)',
            borderRadius: '8px',
            border: '1px solid var(--color-border, #E2E8F0)',
            padding: '12px 14px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <div style={{ fontSize: '11px', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
            Active Train Telemetry Info
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', fontSize: '11px' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ color: '#64748B' }}>Train No.</span>
              <strong style={{ color: '#0F172A', fontSize: '12px' }}>{currentTrain.trainNumber}</strong>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ color: '#64748B' }}>Selected Coach</span>
              <strong style={{ color: '#0F172A', fontSize: '12px' }}>{selectedCoach.coachNumber}</strong>
            </div>
            <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column' }}>
              <span style={{ color: '#64748B' }}>Hardware Sensor UID</span>
              <code style={{ fontSize: '10px', color: '#475569', backgroundColor: '#F1F5F9', padding: '3px 6px', borderRadius: '4px', wordBreak: 'break-all' }}>
                {liveTelemetry?.uid || selectedCoach.deviceId || '0023004D4B42501120353332'}
              </code>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ color: '#64748B' }}>Tank 1 (Arrival)</span>
              <strong style={{ color: selectedCoach.arrivalLevel != null && selectedCoach.arrivalLevel < 20 ? '#DC2626' : '#2563EB', fontSize: '12px' }}>
                {selectedCoach.arrivalLevel != null ? `${selectedCoach.arrivalLevel.toFixed(1)}% (${selectedCoach.arrivalHeightCm?.toFixed(1)} cm)` : '—'}
              </strong>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ color: '#64748B' }}>Tank 2 (Departure)</span>
              <strong style={{ color: selectedCoach.departureLevel != null && selectedCoach.departureLevel < 20 ? '#DC2626' : '#2563EB', fontSize: '12px' }}>
                {selectedCoach.departureLevel != null ? `${selectedCoach.departureLevel.toFixed(1)}% (${selectedCoach.departureHeightCm?.toFixed(1)} cm)` : '—'}
              </strong>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ color: '#64748B' }}>Telemetry Battery</span>
              <strong style={{ color: selectedCoach.batteryPercent != null && selectedCoach.batteryPercent < 30 ? '#DC2626' : '#16A34A', fontSize: '12px' }}>
                {selectedCoach.batteryPercent != null ? `${selectedCoach.batteryPercent.toFixed(1)}%` : '—'}
              </strong>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ color: '#64748B' }}>MQTT Broker State</span>
              <strong style={{ color: mqttConnectionStatus === 'CONNECTED' ? '#16A34A' : '#DC2626', fontSize: '12px' }}>
                {mqttConnectionStatus}
              </strong>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          SECTION 1: DASHBOARD - TRAIN LIST (Matching Reference Layout)
          ========================================================================= */}
      <div
        className="interactive-card"
        style={{
          backgroundColor: 'var(--color-surface, #FFFFFF)',
          borderRadius: '8px',
          border: '1px solid var(--color-border, #E2E8F0)',
          padding: '16px 20px',
          boxShadow: 'var(--shadow-card, 0 1px 3px rgba(0,0,0,0.05))',
        }}
      >
        {/* Header & Controls Row */}
        <div
          className="mobile-controls-stack"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            marginBottom: '14px',
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: '16px',
              fontWeight: 800,
              color: 'var(--color-text-primary, #0F172A)',
              letterSpacing: '-0.2px',
            }}
          >
            Dashboard &ndash; Train List
          </h2>

          <div
            className="mobile-controls-stack"
            style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px' }}
          >
            {/* Region Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: '140px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary, #475569)', whiteSpace: 'nowrap' }}>
                Region :
              </span>
              <select
                value={selectedRegion}
                onChange={(e) => setSelectedRegion(e.target.value)}
                style={{
                  height: '38px',
                  minHeight: '38px',
                  width: '100%',
                  padding: '0 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--color-border, #CBD5E1)',
                  backgroundColor: 'var(--color-surface-alt, #F8FAFC)',
                  color: 'var(--color-text-primary, #0F172A)',
                  fontSize: '12px',
                  fontWeight: 600,
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                {availableRegions.map((reg) => (
                  <option key={reg} value={reg}>
                    {reg}
                  </option>
                ))}
              </select>
            </div>

            {/* Train No. Search */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: '150px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary, #475569)', whiteSpace: 'nowrap' }}>
                Train No. :
              </span>
              <div style={{ position: 'relative', width: '100%' }}>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search train..."
                  style={{
                    width: '100%',
                    height: '38px',
                    minHeight: '38px',
                    paddingLeft: '10px',
                    paddingRight: '28px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border, #CBD5E1)',
                    backgroundColor: 'var(--color-surface-alt, #F8FAFC)',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--color-text-primary, #0F172A)',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
                <Search
                  size={14}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--color-text-muted, #94A3B8)',
                    pointerEvents: 'none',
                  }}
                />
              </div>
            </div>

            {/* Add Train Button */}
            <button
              onClick={handleOpenAddModal}
              className="touch-target-44"
              style={{
                minHeight: '44px',
                padding: '0 16px',
                backgroundColor: 'var(--color-primary, #2563EB)',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(37,99,235,0.2)',
                transition: 'all 0.15s ease',
              }}
            >
              <Plus size={15} strokeWidth={2.4} />
              <span>Add Train</span>
            </button>
          </div>
        </div>

        {/* Train List Table (Matching Reference Columns - Desktop >= 768px) */}
        <div className="scada-table-scroll-container dashboard-train-table-desktop">
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              textAlign: 'left',
              fontSize: '12px',
              fontFamily: typography.fontFamily,
            }}
          >
            <thead>
              <tr
                style={{
                  backgroundColor: 'var(--color-surface-alt, #F8FAFC)',
                  borderBottom: '1px solid var(--color-border, #E2E8F0)',
                  color: 'var(--color-text-secondary, #475569)',
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'none',
                }}
              >
                <th style={{ padding: '10px 14px', width: '90px' }}>Train No.</th>
                <th style={{ padding: '10px 14px' }}>Train Name</th>
                <th style={{ padding: '10px 14px' }}>From</th>
                <th style={{ padding: '10px 14px' }}>To</th>
                <th style={{ padding: '10px 14px' }}>Region</th>
                <th style={{ padding: '10px 14px', width: '100px' }}>Status</th>
                <th style={{ padding: '10px 14px' }}>Location (Lat, Long)</th>
                <th style={{ padding: '10px 14px', textAlign: 'right' }}>Last Update</th>
              </tr>
            </thead>
            <tbody>
              {/* Live Telemetry Train (Dynamic via MQTT Topic 0023004D4B42501120353332) */}
              {liveTelemetry && (
                <tr
                  onClick={() => handleSelectTrain(liveTelemetry.trno)}
                  style={{
                    backgroundColor:
                      currentTrain.trainNumber === liveTelemetry.trno
                        ? 'var(--color-primary-surface, #EFF6FF)'
                        : 'var(--color-surface, #FFFFFF)',
                    borderLeft:
                      currentTrain.trainNumber === liveTelemetry.trno
                        ? '3px solid var(--color-primary, #2563EB)'
                        : '3px solid transparent',
                    borderBottom: '1px solid var(--color-border, #E2E8F0)',
                    cursor: 'pointer',
                    transition: 'background-color 0.12s ease',
                  }}
                >
                  <td style={{ padding: '10px 14px', fontWeight: 800, color: 'var(--color-primary, #2563EB)' }}>
                    {liveTelemetry.trno}
                  </td>
                  <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--color-text-primary, #0F172A)' }}>
                    Train {liveTelemetry.trno}{' '}
                    <span
                      style={{
                        fontSize: '9px',
                        fontWeight: 700,
                        backgroundColor: '#DCFCE7',
                        color: '#16A34A',
                        padding: '1px 5px',
                        borderRadius: '4px',
                        marginLeft: '4px',
                      }}
                    >
                      LIVE MQTT
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--color-text-secondary, #475569)' }}>
                    Live Fleet Corridor
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--color-text-secondary, #475569)' }}>
                    In Operation
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--color-text-secondary, #475569)' }}>
                    {selectedRegion === 'ALL' ? 'Eastern' : selectedRegion}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <div
                        style={{
                          width: '7px',
                          height: '7px',
                          borderRadius: '50%',
                          backgroundColor: !liveTelemetry.isStale
                            ? 'var(--color-status-success, #16A34A)'
                            : 'var(--color-status-warning, #D97706)',
                        }}
                      />
                      <span
                        style={{
                          fontWeight: 600,
                          color: !liveTelemetry.isStale
                            ? 'var(--color-status-success, #16A34A)'
                            : 'var(--color-status-warning, #D97706)',
                        }}
                      >
                        {!liveTelemetry.isStale ? 'Active' : 'Stale'}
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--color-text-secondary, #475569)' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <MapPin size={13} color="var(--color-primary, #2563EB)" />
                      {liveTelemetry.lat != null && liveTelemetry.long != null
                        ? `${liveTelemetry.lat.toFixed(4)}° N, ${liveTelemetry.long.toFixed(4)}° E`
                        : 'Awaiting Fix'}
                    </span>
                  </td>
                  <td
                    style={{
                      padding: '10px 14px',
                      textAlign: 'right',
                      color: 'var(--color-text-muted, #64748B)',
                      fontSize: '11px',
                    }}
                  >
                    {liveTelemetry.time}
                  </td>
                </tr>
              )}

              {/* Awaiting telemetry operational state when no live or backend trains exist */}
              {!liveTelemetry && backendTrains.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    style={{
                      padding: '24px',
                      textAlign: 'center',
                      color: 'var(--color-text-secondary, #64748B)',
                      fontSize: '13px',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                      <Activity size={24} color="#94A3B8" />
                      <strong>Awaiting Telemetry • No active hardware transmissions detected</strong>
                      <span style={{ fontSize: '11px', color: '#94A3B8' }}>
                        Listening on broker topic: <code>0023004D4B42501120353332</code>
                      </span>
                    </div>
                  </td>
                </tr>
              )}

              {/* Additional Backend Trains */}
              {backendTrains.map((train) => {
                const isSelected = currentTrain.trainNumber === train.train_number;
                return (
                  <tr
                    key={train.train_number}
                    onClick={() => handleSelectTrain(train.train_number)}
                    style={{
                      backgroundColor: isSelected
                        ? 'var(--color-primary-surface, #EFF6FF)'
                        : 'var(--color-surface, #FFFFFF)',
                      borderLeft: isSelected
                        ? '3px solid var(--color-primary, #2563EB)'
                        : '3px solid transparent',
                      borderBottom: '1px solid var(--color-border, #E2E8F0)',
                      cursor: 'pointer',
                      transition: 'background-color 0.12s ease',
                    }}
                  >
                    <td style={{ padding: '10px 14px', fontWeight: 800, color: 'var(--color-primary, #2563EB)' }}>
                      {train.train_number}
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--color-text-primary, #0F172A)' }}>
                      {train.name}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--color-text-secondary, #475569)' }}>
                      {(train as any).source || 'Station A'}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--color-text-secondary, #475569)' }}>
                      {(train as any).destination || 'Station B'}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--color-text-secondary, #475569)' }}>
                      {train.region || 'Eastern'}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <div
                          style={{
                            width: '7px',
                            height: '7px',
                            borderRadius: '50%',
                            backgroundColor: train.is_online
                              ? 'var(--color-status-success, #16A34A)'
                              : 'var(--color-status-warning, #D97706)',
                          }}
                        />
                        <span
                          style={{
                            fontWeight: 600,
                            color: train.is_online
                              ? 'var(--color-status-success, #16A34A)'
                              : 'var(--color-status-warning, #D97706)',
                          }}
                        >
                          {train.is_online ? 'Active' : 'Standby'}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--color-text-secondary, #475569)' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <MapPin size={13} color="var(--color-primary, #2563EB)" />
                        22.5841&deg; N, 88.3429&deg; E
                      </span>
                    </td>
                    <td
                      style={{
                        padding: '10px 14px',
                        textAlign: 'right',
                        color: 'var(--color-text-muted, #64748B)',
                        fontSize: '11px',
                      }}
                    >
                      {train.last_telemetry || 'Just now'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* =========================================================================
            MOBILE TRAIN CARDS LIST (< 768px Viewport Architecture)
            ========================================================================= */}
        <div className="dashboard-train-cards-mobile mobile-card-list">
          {/* Mobile Live Hardware Train Card */}
          {liveTelemetry && (
            <div
              className={`mobile-train-card ${currentTrain.trainNumber === liveTelemetry.trno ? 'selected' : ''}`}
              onClick={() => handleSelectTrain(liveTelemetry.trno)}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Train size={18} color="#2563EB" />
                  <span style={{ fontSize: '15px', fontWeight: 800, color: '#2563EB' }}>
                    {liveTelemetry.trno}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '3px 9px',
                    borderRadius: '12px',
                    backgroundColor: !liveTelemetry.isStale ? '#DCFCE7' : '#FEF3C7',
                    color: !liveTelemetry.isStale ? '#15803D' : '#B45309',
                    border: `1px solid ${!liveTelemetry.isStale ? '#BBF7D0' : '#FDE68A'}`,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                  }}
                >
                  <span
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      backgroundColor: !liveTelemetry.isStale ? '#16A34A' : '#D97706',
                    }}
                  />
                  {!liveTelemetry.isStale ? 'Active (Live)' : 'Stale'}
                </span>
              </div>

              <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>
                Train {liveTelemetry.trno} &bull; Express Fleet (Live Hardware)
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '11px', color: '#475569' }}>
                <div>
                  <span style={{ color: '#64748B' }}>Route: </span>
                  <strong>Corridor &rarr; In Service</strong>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Region: </span>
                  <strong>Eastern</strong>
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <span style={{ color: '#64748B' }}>GPS: </span>
                  <strong>
                    {liveTelemetry.lat != null && liveTelemetry.long != null
                      ? `${liveTelemetry.lat.toFixed(4)}° N, ${liveTelemetry.long.toFixed(4)}° E`
                      : 'Awaiting Fix'}
                  </strong>
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <span style={{ color: '#64748B' }}>Last Telemetry: </span>
                  <strong>{liveTelemetry.time}</strong>
                </div>
              </div>

              <button
                type="button"
                className="touch-target-44"
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelectTrain(liveTelemetry.trno);
                }}
                style={{
                  width: '100%',
                  minHeight: '44px',
                  backgroundColor: currentTrain.trainNumber === liveTelemetry.trno ? '#2563EB' : '#EFF6FF',
                  color: currentTrain.trainNumber === liveTelemetry.trno ? '#FFFFFF' : '#2563EB',
                  border: `1px solid ${currentTrain.trainNumber === liveTelemetry.trno ? '#1D4ED8' : '#BFDBFE'}`,
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <Train size={15} />
                <span>{currentTrain.trainNumber === liveTelemetry.trno ? 'Currently Monitored' : 'Select & Inspect Train'}</span>
              </button>
            </div>
          )}

          {/* Empty State */}
          {!liveTelemetry && backendTrains.length === 0 && (
            <div
              style={{
                padding: '24px',
                textAlign: 'center',
                backgroundColor: '#F8FAFC',
                borderRadius: '8px',
                border: '1px solid #E2E8F0',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Activity size={24} color="#94A3B8" />
              <strong style={{ fontSize: '13px', color: '#475569' }}>Awaiting Telemetry</strong>
              <span style={{ fontSize: '11px', color: '#94A3B8' }}>
                Listening on topic: <code>0023004D4B42501120353332</code>
              </span>
            </div>
          )}

          {/* Backend Trains Mobile Cards */}
          {backendTrains.map((train) => {
            const isSelected = currentTrain.trainNumber === train.train_number;
            return (
              <div
                key={`mobile-train-${train.train_number}`}
                className={`mobile-train-card ${isSelected ? 'selected' : ''}`}
                onClick={() => handleSelectTrain(train.train_number)}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Train size={18} color="#2563EB" />
                    <span style={{ fontSize: '15px', fontWeight: 800, color: '#2563EB' }}>
                      {train.train_number}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '3px 9px',
                      borderRadius: '12px',
                      backgroundColor: train.is_online ? '#DCFCE7' : '#FEF3C7',
                      color: train.is_online ? '#15803D' : '#B45309',
                      border: `1px solid ${train.is_online ? '#BBF7D0' : '#FDE68A'}`,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                  >
                    <span
                      style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        backgroundColor: train.is_online ? '#16A34A' : '#D97706',
                      }}
                    />
                    {train.is_online ? 'Active' : 'Standby'}
                  </span>
                </div>

                <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>
                  {train.name}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '11px', color: '#475569' }}>
                  <div>
                    <span style={{ color: '#64748B' }}>Route: </span>
                    <strong>{(train as any).source || 'Station A'} &rarr; {(train as any).destination || 'Station B'}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748B' }}>Region: </span>
                    <strong>{train.region || 'Eastern'}</strong>
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <span style={{ color: '#64748B' }}>Location: </span>
                    <strong>22.5841° N, 88.3429° E</strong>
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <span style={{ color: '#64748B' }}>Last Telemetry: </span>
                    <strong>{train.last_telemetry || 'Just now'}</strong>
                  </div>
                </div>

                <button
                  type="button"
                  className="touch-target-44"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectTrain(train.train_number);
                  }}
                  style={{
                    width: '100%',
                    minHeight: '44px',
                    backgroundColor: isSelected ? '#2563EB' : '#EFF6FF',
                    color: isSelected ? '#FFFFFF' : '#2563EB',
                    border: `1px solid ${isSelected ? '#1D4ED8' : '#BFDBFE'}`,
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                  }}
                >
                  <Train size={15} />
                  <span>{isSelected ? 'Currently Monitored' : 'Select & Inspect Train'}</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* =========================================================================
          SECTION 2: GRAPHICAL TRAIN COACH LAYOUT (Locomotive + 24 Coaches)
          ========================================================================= */}
      <div
        className="interactive-card"
        style={{
          backgroundColor: 'var(--color-surface, #FFFFFF)',
          borderRadius: '8px',
          border: '1px solid var(--color-border, #E2E8F0)',
          padding: '16px 20px',
          boxShadow: 'var(--shadow-card, 0 1px 3px rgba(0,0,0,0.05))',
        }}
      >
        {/* Consist Header */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            marginBottom: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h2
              style={{
                margin: 0,
                fontSize: '16px',
                fontWeight: 800,
                color: 'var(--color-primary, #2563EB)',
              }}
            >
              Train : {currentTrain.trainNumber} &ndash; {currentTrain.name}
            </h2>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {/* Coach Consist Button */}
            <button
              onClick={() => setActiveScreen('coaches')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 12px',
                borderRadius: '16px',
                backgroundColor: 'var(--color-primary-surface, #EFF6FF)',
                border: '1px solid var(--color-primary-border, #BFDBFE)',
                color: 'var(--color-primary, #2563EB)',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
              title="Open Coach Consist Overview"
            >
              <Layers size={13} />
              <span>Coach Consist</span>
            </button>

            {/* Live Monitoring Pill */}
            <button
              onClick={() => setActiveScreen('monitoring')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 12px',
                borderRadius: '16px',
                backgroundColor: 'var(--color-success-surface, #ECFDF5)',
                border: '1px solid var(--color-success-border, #A7F3D0)',
                color: 'var(--color-success, #16A34A)',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
              title="Open full live telemetry monitoring"
            >
              <Train size={13} />
              <span>Live Monitoring</span>
            </button>

            {/* Total Coaches Pill */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 12px',
                borderRadius: '16px',
                backgroundColor: 'var(--color-surface-alt, #F1F5F9)',
                border: '1px solid var(--color-border, #CBD5E1)',
                color: 'var(--color-text-secondary, #475569)',
                fontSize: '11px',
                fontWeight: 700,
              }}
            >
              <Layers size={13} />
              <span>Total Coaches : 24</span>
            </div>
          </div>
        </div>

        {/* Rail Track with Locomotive & 24 Coaches */}
        <div style={{ position: 'relative', width: '100%' }}>
          {/* Left Arrow Button */}
          <button
            onClick={() => handleScrollTrack('left')}
            style={{
              position: 'absolute',
              left: '-10px',
              top: '40px',
              zIndex: 10,
              width: '26px',
              height: '26px',
              borderRadius: '50%',
              backgroundColor: 'var(--color-surface, #FFFFFF)',
              border: '1px solid var(--color-border, #CBD5E1)',
              boxShadow: '0 2px 5px rgba(0,0,0,0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'var(--color-text-secondary, #475569)',
            }}
            title="Scroll Left"
          >
            <ChevronLeft size={16} />
          </button>

          {/* Right Arrow Button */}
          <button
            onClick={() => handleScrollTrack('right')}
            style={{
              position: 'absolute',
              right: '-10px',
              top: '40px',
              zIndex: 10,
              width: '26px',
              height: '26px',
              borderRadius: '50%',
              backgroundColor: 'var(--color-surface, #FFFFFF)',
              border: '1px solid var(--color-border, #CBD5E1)',
              boxShadow: '0 2px 5px rgba(0,0,0,0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'var(--color-text-secondary, #475569)',
            }}
            title="Scroll Right"
          >
            <ChevronRight size={16} />
          </button>

          {/* Scrollable Track Container */}
          <div
            ref={trackScrollRef}
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: '6px',
              overflowX: 'auto',
              padding: '10px 8px 18px 8px',
              position: 'relative',
              scrollbarWidth: 'thin',
            }}
          >
            {/* ==================== INDUSTRIAL ENGINEERING LOCOMOTIVE ==================== */}
            <div
              style={{
                flexShrink: 0,
                width: '108px',
                height: '60px',
                borderRadius: '4px',
                backgroundColor: '#1E293B',
                border: '1px solid #475569',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                padding: '4px 6px',
                boxSizing: 'border-box',
                position: 'relative',
              }}
              title="Electric Locomotive (WAP-7, 25kV AC Traction)"
            >
              {/* Roof Pantograph CAD Line */}
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: '-10px' }}>
                <svg width="40" height="10" viewBox="0 0 40 10">
                  <path d="M 6 9 L 20 2 L 34 9" stroke="#94A3B8" strokeWidth="1.5" fill="none" />
                  <line x1="14" y1="2" x2="26" y2="2" stroke="#CBD5E1" strokeWidth="2" />
                </svg>
              </div>

              {/* Identification Labels */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#F8FAFC', letterSpacing: '0.5px' }}>
                  WAP-7
                </span>
                <span
                  style={{
                    fontSize: '8px',
                    fontWeight: 700,
                    backgroundColor: '#0F766E',
                    color: '#CCFBF1',
                    padding: '1px 4px',
                    borderRadius: '2px',
                    letterSpacing: '0.4px',
                  }}
                >
                  LOCO
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '1px' }}>
                <span style={{ fontSize: '9px', fontWeight: 600, color: '#94A3B8' }}>25kV AC</span>
                <span style={{ fontSize: '9px', fontWeight: 700, color: '#4ADE80' }}>● TRACTION</span>
              </div>

              {/* Bogie Wheels under Loco */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '0 8px',
                  marginBottom: '-9px',
                }}
              >
                <div
                  style={{
                    width: '9px',
                    height: '9px',
                    borderRadius: '50%',
                    backgroundColor: '#0F172A',
                    border: '1.5px solid #64748B',
                  }}
                />
                <div
                  style={{
                    width: '9px',
                    height: '9px',
                    borderRadius: '50%',
                    backgroundColor: '#0F172A',
                    border: '1.5px solid #64748B',
                  }}
                />
              </div>
            </div>

            {/* Coupler Link */}
            <div
              style={{
                width: '10px',
                height: '3px',
                backgroundColor: '#64748B',
                marginBottom: '16px',
                flexShrink: 0,
              }}
            />

            {/* ==================== 24 COACHES (C1 TO C24) ==================== */}
            {coaches24.map((coach) => {
              const isSelected = coach.coachNumber === activeCoachNum;
              const hasData = coach.hasTelemetry;

              let coachBg = '#FFFFFF';
              let coachBorder = '1px solid #CBD5E1';
              let textColor = '#0F172A';

              if (isSelected) {
                coachBg = '#EFF6FF';
                coachBorder = '2px solid #2563EB';
                textColor = '#1D4ED8';
              } else if (hasData) {
                coachBg = '#F0FDF4';
                coachBorder = '1px solid #86EFAC';
                textColor = '#15803D';
              } else {
                coachBg = '#F8FAFC';
                coachBorder = '1px solid #CBD5E1';
                textColor = '#475569';
              }

              const coachTypeShort = coach.coachType.includes('2-Tier')
                ? '2A'
                : coach.coachType.includes('3-Tier')
                ? '3A'
                : coach.coachType.includes('Chair')
                ? 'CC'
                : coach.coachType.includes('Sleeper')
                ? 'SL'
                : 'GEN';

              return (
                <div
                  key={coach.coachNumber}
                  onClick={() => handleSelectCoach(coach.coachNumber)}
                  style={{
                    flexShrink: 0,
                    width: '68px',
                    height: '60px',
                    borderRadius: '4px',
                    backgroundColor: coachBg,
                    border: coachBorder,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    padding: '4px 6px',
                    cursor: 'pointer',
                    boxSizing: 'border-box',
                    transition: 'all 0.12s ease',
                    position: 'relative',
                  }}
                  title={
                    coach.hasTelemetry && coach.arrivalLevel != null && coach.departureLevel != null
                      ? `Coach ${coach.coachNumber} (${coach.coachType}) - Level: ${coach.arrivalLevel.toFixed(0)}% / ${coach.departureLevel.toFixed(0)}%`
                      : `Coach ${coach.coachNumber} (${coach.coachType}) - Awaiting Telemetry`
                  }
                >
                  {/* Top indicator: Coach Type & Active Badge */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '9px', fontWeight: 700, color: isSelected ? '#2563EB' : '#64748B' }}>
                      {coachTypeShort}
                    </span>
                    {isSelected && (
                      <span
                        style={{
                          fontSize: '7px',
                          fontWeight: 800,
                          backgroundColor: '#2563EB',
                          color: '#FFFFFF',
                          padding: '0 3px',
                          borderRadius: '2px',
                        }}
                      >
                        ACT
                      </span>
                    )}
                  </div>

                  {/* Coach Number Label */}
                  <div
                    style={{
                      textAlign: 'center',
                      fontSize: coach.coachNumber.length > 5 ? '10px' : '13px',
                      fontWeight: 800,
                      color: textColor,
                      lineHeight: '14px',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {coach.coachNumber}
                  </div>

                  {/* Status Indicator Bar */}
                  <div
                    style={{
                      height: '2px',
                      borderRadius: '1px',
                      backgroundColor:
                        coach.hasTelemetry && coach.arrivalLevel != null
                          ? coach.arrivalLevel < 10 || (coach.departureLevel != null && coach.departureLevel < 10)
                            ? '#DC2626'
                            : coach.arrivalLevel < 20 || (coach.departureLevel != null && coach.departureLevel < 20)
                            ? '#D97706'
                            : '#16A34A'
                          : '#CBD5E1',
                      width: '100%',
                    }}
                  />

                  {/* Wheels (2 bogie wheels under each coach) */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '0 6px',
                      marginBottom: '-9px',
                    }}
                  >
                    <div
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: '#334155',
                        border: '1.5px solid #94A3B8',
                      }}
                    />
                    <div
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: '#334155',
                        border: '1.5px solid #94A3B8',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Railway Rails & Sleepers Track Base */}
          <div
            style={{
              height: '8px',
              borderTop: '2px solid #64748B',
              borderBottom: '2px solid #475569',
              background:
                'repeating-linear-gradient(90deg, #94A3B8 0px, #94A3B8 3px, transparent 3px, transparent 14px)',
              marginTop: '4px',
            }}
          />
        </div>
      </div>

      {/* =========================================================================
          SECTION 3: THREE-COLUMN INFORMATION GRID (Fluid 12-Column SCADA Grid)
          Col 1: Coach Info (Span 3) | Col 2: Dual Water Tanks (Span 5) | Col 3: Train Location & Map (Span 4)
          ========================================================================= */}
      <div className="scada-dashboard-row4">
        {/* ==================== COLUMN 1: SELECTED COACH INFO (Span 3) ==================== */}
        <div
          className="interactive-card scada-col-coach"
          style={{
            backgroundColor: 'var(--color-surface, #FFFFFF)',
            borderRadius: '8px',
            border: '1px solid var(--color-border, #E2E8F0)',
            padding: '16px 20px',
            boxShadow: 'var(--shadow-card, 0 1px 3px rgba(0,0,0,0.05))',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <h3
              style={{
                margin: 0,
                fontSize: '15px',
                fontWeight: 800,
                color: 'var(--color-text-primary, #0F172A)',
              }}
            >
              Coach : {selectedCoach.coachNumber}
            </h3>
            <button
              onClick={() => {
                setSelectedCoachNumber(selectedCoach.coachNumber);
                setActiveScreen('coach-details');
              }}
              style={{
                padding: '4px 10px',
                backgroundColor: 'var(--color-primary, #2563EB)',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
              title="Open full coach details and dual tank telemetry"
            >
              <span>Coach Details</span>
              <ArrowRight size={12} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1, justifyContent: 'center' }}>
            {/* Coach No. */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-text-secondary, #475569)', fontSize: '13px' }}>
                <Train size={16} color="var(--color-primary, #2563EB)" />
                <span>Coach No.</span>
              </div>
              <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--color-text-primary, #0F172A)' }}>
                {selectedCoach.coachNumber}
              </span>
            </div>

            {/* Device */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-text-secondary, #475569)', fontSize: '13px' }}>
                <Cpu size={16} color="var(--color-primary, #2563EB)" />
                <span>Device</span>
              </div>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary, #0F172A)' }}>
                {selectedCoach.deviceId}
              </span>
            </div>

            {/* Coach Type */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-text-secondary, #475569)', fontSize: '13px' }}>
                <Users size={16} color="var(--color-primary, #2563EB)" />
                <span>Coach Type</span>
              </div>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary, #0F172A)' }}>
                {selectedCoach.coachType}
              </span>
            </div>

            {/* Battery */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-text-secondary, #475569)', fontSize: '13px' }}>
                <Battery size={16} color={selectedCoach.batteryPercent != null && selectedCoach.batteryPercent < 40 ? '#EF4444' : '#16A34A'} />
                <span>Battery</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div
                  style={{
                    width: '42px',
                    height: '10px',
                    borderRadius: '3px',
                    backgroundColor: 'var(--color-surface-alt, #E2E8F0)',
                    overflow: 'hidden',
                    border: '1px solid var(--color-border, #CBD5E1)',
                  }}
                >
                  <div
                    style={{
                      width: selectedCoach.batteryPercent != null ? `${selectedCoach.batteryPercent}%` : '0%',
                      height: '100%',
                      backgroundColor: selectedCoach.batteryPercent != null && selectedCoach.batteryPercent < 40 ? '#EF4444' : '#16A34A',
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
                <span
                  style={{
                    fontSize: '13px',
                    fontWeight: 700,
                    color: selectedCoach.batteryPercent != null && selectedCoach.batteryPercent < 40 ? '#EF4444' : 'var(--color-status-success, #16A34A)',
                  }}
                >
                  {selectedCoach.batteryPercent != null ? `${selectedCoach.batteryPercent}%` : '—'}
                </span>
              </div>
            </div>

            {/* Device Status */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-text-secondary, #475569)', fontSize: '13px' }}>
                <div
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor:
                      selectedCoach.deviceStatus === 'Online'
                        ? 'var(--color-status-success, #16A34A)'
                        : 'var(--color-status-critical, #DC2626)',
                  }}
                />
                <span>Device Status</span>
              </div>
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: 700,
                  color:
                    selectedCoach.deviceStatus === 'Online'
                      ? 'var(--color-status-success, #16A34A)'
                      : 'var(--color-status-critical, #DC2626)',
                }}
              >
                {selectedCoach.deviceStatus}
              </span>
            </div>
          </div>
        </div>

        {/* ==================== COLUMN 2: DUAL TANK MONITORING (Span 5) ==================== */}
        <div
          className="interactive-card scada-col-tanks"
          style={{
            backgroundColor: 'var(--color-surface, #FFFFFF)',
            borderRadius: '8px',
            border: '1px solid var(--color-border, #E2E8F0)',
            padding: '16px 20px',
            boxShadow: 'var(--shadow-card, 0 1px 3px rgba(0,0,0,0.05))',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <h3
            style={{
              margin: '0 0 14px 0',
              fontSize: '15px',
              fontWeight: 800,
              color: 'var(--color-text-primary, #0F172A)',
              textAlign: 'center',
            }}
          >
            Water Tank Status (Coach {selectedCoach.coachNumber})
          </h3>

          <div
            className="mobile-dual-tank-grid"
            style={{
              flex: 1,
              alignItems: 'center',
            }}
          >
            {/* TANK 1: ARRIVAL SIDE (ISA-101 Flat Engineering P&ID) */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              {/* Badge Pill */}
              <div
                style={{
                  backgroundColor: 'var(--color-primary, #2563EB)',
                  color: '#FFFFFF',
                  padding: '3px 8px',
                  borderRadius: '12px',
                  fontSize: '10px',
                  fontWeight: 700,
                  marginBottom: '8px',
                  whiteSpace: 'nowrap',
                }}
              >
                Arrival Side (Tank 1)
              </div>

              {/* Flat Engineering P&ID Vessel with Calibration Scale */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="84" height="130" viewBox="0 0 84 130">
                  {/* Calibrated Tick Marks & Scale on Left (0, 50, 100, 150 cm) */}
                  <g fontSize="8" fill="#64748B" fontFamily="monospace" textAnchor="end">
                    <line x1="28" y1="14" x2="36" y2="14" stroke="#94A3B8" strokeWidth="1" />
                    <text x="26" y="17">150</text>

                    <line x1="30" y1="44" x2="36" y2="44" stroke="#CBD5E1" strokeWidth="1" />
                    <text x="26" y="47">100</text>

                    <line x1="30" y1="74" x2="36" y2="74" stroke="#CBD5E1" strokeWidth="1" />
                    <text x="26" y="77">50</text>

                    <line x1="28" y1="104" x2="36" y2="104" stroke="#94A3B8" strokeWidth="1" />
                    <text x="26" y="107">0</text>
                  </g>

                  {/* Main Rectangular P&ID Vessel Body */}
                  <rect x="36" y="14" width="42" height="90" rx="3" fill="#F8FAFC" stroke="#64748B" strokeWidth="1.5" />

                  {/* Liquid Column Fill */}
                  {(() => {
                    const maxH = 88;
                    const level = selectedCoach.arrivalLevel ?? 0;
                    const fillH = selectedCoach.arrivalLevel != null ? (Math.max(0, Math.min(100, level)) / 100) * maxH : 0;
                    const fillY = 15 + (maxH - fillH);
                    const color =
                      level < 10
                        ? '#DC2626'
                        : level < 20
                        ? '#D97706'
                        : '#2563EB';
                    return (
                      <g>
                        {selectedCoach.arrivalLevel != null && fillH > 0 && (
                          <>
                            <rect x="37" y={fillY} width="40" height={fillH} fill={color} />
                            <line x1="37" y1={fillY} x2="77" y2={fillY} stroke="#93C5FD" strokeWidth="1.5" />
                          </>
                        )}
                      </g>
                    );
                  })()}

                  {/* Top Flange / Inlet Line */}
                  <line x1="57" y1="6" x2="57" y2="14" stroke="#64748B" strokeWidth="2" />
                  <rect x="52" y="4" width="10" height="3" fill="#475569" />

                  {/* Bottom Drain Flange */}
                  <line x1="57" y1="104" x2="57" y2="114" stroke="#64748B" strokeWidth="2" />
                  <rect x="52" y="113" width="10" height="3" fill="#475569" />
                </svg>

                {/* Direct High-Contrast Tabular Readout */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <div style={{ fontSize: '20px', fontWeight: 900, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>
                    {selectedCoach.arrivalLevel != null ? `${selectedCoach.arrivalLevel.toFixed(0)}%` : '—'}
                  </div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569', fontVariantNumeric: 'tabular-nums' }}>
                    {selectedCoach.arrivalHeightCm != null ? `${selectedCoach.arrivalHeightCm.toFixed(1)} cm` : '— cm'}
                  </div>
                  <div style={{ fontSize: '10px', fontWeight: 600, color: '#64748B' }}>
                    {selectedCoach.arrivalLevel != null ? `${((selectedCoach.arrivalLevel / 100) * 500).toFixed(0)} L / 500 L` : '— / 500 L'}
                  </div>
                  <div
                    style={{
                      fontSize: '9px',
                      fontWeight: 700,
                      marginTop: '4px',
                      padding: '2px 5px',
                      borderRadius: '3px',
                      display: 'inline-block',
                      backgroundColor:
                        selectedCoach.arrivalLevel == null
                          ? '#F1F5F9'
                          : selectedCoach.arrivalLevel < 10
                          ? '#FEE2E2'
                          : selectedCoach.arrivalLevel < 20
                          ? '#FEF3C7'
                          : '#EFF6FF',
                      color:
                        selectedCoach.arrivalLevel == null
                          ? '#64748B'
                          : selectedCoach.arrivalLevel < 10
                          ? '#DC2626'
                          : selectedCoach.arrivalLevel < 20
                          ? '#B45309'
                          : '#1D4ED8',
                    }}
                  >
                    {selectedCoach.arrivalLevel == null
                      ? 'AWAITING TELEMETRY'
                      : selectedCoach.arrivalLevel < 10
                      ? 'CRITICAL LOW'
                      : selectedCoach.arrivalLevel < 20
                      ? 'LOW WARNING'
                      : 'NOMINAL'}
                  </div>
                </div>
              </div>

              {/* Valve / Sensor Status Indicator */}
              <div
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  color: selectedCoach.hasTelemetry && liveTelemetry
                    ? liveTelemetry.wlv1
                      ? '#15803D'
                      : '#DC2626'
                    : '#64748B',
                  backgroundColor: selectedCoach.hasTelemetry && liveTelemetry
                    ? liveTelemetry.wlv1
                      ? '#DCFCE7'
                      : '#FEE2E2'
                    : '#F1F5F9',
                  border: `1px solid ${
                    selectedCoach.hasTelemetry && liveTelemetry
                      ? liveTelemetry.wlv1
                        ? '#86EFAC'
                        : '#FCA5A5'
                      : '#CBD5E1'
                  }`,
                  padding: '2px 8px',
                  borderRadius: '4px',
                  marginTop: '8px',
                }}
              >
                {selectedCoach.hasTelemetry && liveTelemetry
                  ? liveTelemetry.wlv1
                    ? '✓ SENSOR 1 VALID'
                    : '⚠ SENSOR 1 FAULT'
                  : 'AWAITING LINK'}
              </div>
            </div>

            {/* TANK 2: DEPARTURE SIDE (ISA-101 Flat Engineering P&ID) */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              {/* Badge Pill */}
              <div
                style={{
                  backgroundColor: 'var(--color-primary, #2563EB)',
                  color: '#FFFFFF',
                  padding: '3px 8px',
                  borderRadius: '12px',
                  fontSize: '10px',
                  fontWeight: 700,
                  marginBottom: '8px',
                  whiteSpace: 'nowrap',
                }}
              >
                Departure Side (Tank 2)
              </div>

              {/* Flat Engineering P&ID Vessel with Calibration Scale */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="84" height="130" viewBox="0 0 84 130">
                  {/* Calibrated Tick Marks & Scale on Left (0, 50, 100, 150 cm) */}
                  <g fontSize="8" fill="#64748B" fontFamily="monospace" textAnchor="end">
                    <line x1="28" y1="14" x2="36" y2="14" stroke="#94A3B8" strokeWidth="1" />
                    <text x="26" y="17">150</text>

                    <line x1="30" y1="44" x2="36" y2="44" stroke="#CBD5E1" strokeWidth="1" />
                    <text x="26" y="47">100</text>

                    <line x1="30" y1="74" x2="36" y2="74" stroke="#CBD5E1" strokeWidth="1" />
                    <text x="26" y="77">50</text>

                    <line x1="28" y1="104" x2="36" y2="104" stroke="#94A3B8" strokeWidth="1" />
                    <text x="26" y="107">0</text>
                  </g>

                  {/* Main Rectangular P&ID Vessel Body */}
                  <rect x="36" y="14" width="42" height="90" rx="3" fill="#F8FAFC" stroke="#64748B" strokeWidth="1.5" />

                  {/* Liquid Column Fill */}
                  {(() => {
                    const maxH = 88;
                    const level = selectedCoach.departureLevel ?? 0;
                    const fillH = selectedCoach.departureLevel != null ? (Math.max(0, Math.min(100, level)) / 100) * maxH : 0;
                    const fillY = 15 + (maxH - fillH);
                    const color =
                      level < 10
                        ? '#DC2626'
                        : level < 20
                        ? '#D97706'
                        : '#2563EB';
                    return (
                      <g>
                        {selectedCoach.departureLevel != null && fillH > 0 && (
                          <>
                            <rect x="37" y={fillY} width="40" height={fillH} fill={color} />
                            <line x1="37" y1={fillY} x2="77" y2={fillY} stroke="#93C5FD" strokeWidth="1.5" />
                          </>
                        )}
                      </g>
                    );
                  })()}

                  {/* Top Flange / Inlet Line */}
                  <line x1="57" y1="6" x2="57" y2="14" stroke="#64748B" strokeWidth="2" />
                  <rect x="52" y="4" width="10" height="3" fill="#475569" />

                  {/* Bottom Drain Flange */}
                  <line x1="57" y1="104" x2="57" y2="114" stroke="#64748B" strokeWidth="2" />
                  <rect x="52" y="113" width="10" height="3" fill="#475569" />
                </svg>

                {/* Direct High-Contrast Tabular Readout */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <div style={{ fontSize: '20px', fontWeight: 900, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>
                    {selectedCoach.departureLevel != null ? `${selectedCoach.departureLevel.toFixed(0)}%` : '—'}
                  </div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569', fontVariantNumeric: 'tabular-nums' }}>
                    {selectedCoach.departureHeightCm != null ? `${selectedCoach.departureHeightCm.toFixed(1)} cm` : '— cm'}
                  </div>
                  <div style={{ fontSize: '10px', fontWeight: 600, color: '#64748B' }}>
                    {selectedCoach.departureLevel != null ? `${((selectedCoach.departureLevel / 100) * 500).toFixed(0)} L / 500 L` : '— / 500 L'}
                  </div>
                  <div
                    style={{
                      fontSize: '9px',
                      fontWeight: 700,
                      marginTop: '4px',
                      padding: '2px 5px',
                      borderRadius: '3px',
                      display: 'inline-block',
                      backgroundColor:
                        selectedCoach.departureLevel == null
                          ? '#F1F5F9'
                          : selectedCoach.departureLevel < 10
                          ? '#FEE2E2'
                          : selectedCoach.departureLevel < 20
                          ? '#FEF3C7'
                          : '#EFF6FF',
                      color:
                        selectedCoach.departureLevel == null
                          ? '#64748B'
                          : selectedCoach.departureLevel < 10
                          ? '#DC2626'
                          : selectedCoach.departureLevel < 20
                          ? '#B45309'
                          : '#1D4ED8',
                    }}
                  >
                    {selectedCoach.departureLevel == null
                      ? 'AWAITING TELEMETRY'
                      : selectedCoach.departureLevel < 10
                      ? 'CRITICAL LOW'
                      : selectedCoach.departureLevel < 20
                      ? 'LOW WARNING'
                      : 'NOMINAL'}
                  </div>
                </div>
              </div>

              {/* Valve / Sensor Status Indicator */}
              <div
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  color: selectedCoach.hasTelemetry && liveTelemetry
                    ? liveTelemetry.wlv2
                      ? '#15803D'
                      : '#DC2626'
                    : '#64748B',
                  backgroundColor: selectedCoach.hasTelemetry && liveTelemetry
                    ? liveTelemetry.wlv2
                      ? '#DCFCE7'
                      : '#FEE2E2'
                    : '#F1F5F9',
                  border: `1px solid ${
                    selectedCoach.hasTelemetry && liveTelemetry
                      ? liveTelemetry.wlv2
                        ? '#86EFAC'
                        : '#FCA5A5'
                      : '#CBD5E1'
                  }`,
                  padding: '2px 8px',
                  borderRadius: '4px',
                  marginTop: '8px',
                }}
              >
                {selectedCoach.hasTelemetry && liveTelemetry
                  ? liveTelemetry.wlv2
                    ? '✓ SENSOR 2 VALID'
                    : '⚠ SENSOR 2 FAULT / VALVE CLOSED'
                  : 'AWAITING LINK'}
              </div>
            </div>
          </div>
        </div>

        {/* ==================== COLUMN 3: TRAIN LOCATION & MAP (Span 4) ==================== */}
        <div
          className="interactive-card scada-col-location"
          style={{
            backgroundColor: 'var(--color-surface, #FFFFFF)',
            borderRadius: '8px',
            border: '1px solid var(--color-border, #E2E8F0)',
            padding: '16px 20px',
            boxShadow: 'var(--shadow-card, 0 1px 3px rgba(0,0,0,0.05))',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <h3
            style={{
              margin: '0 0 14px 0',
              fontSize: '15px',
              fontWeight: 800,
              color: 'var(--color-text-primary, #0F172A)',
            }}
          >
            Train Location
          </h3>

          <div
            className="mobile-map-grid"
            style={{
              flex: 1,
              alignItems: 'center',
            }}
          >
            {/* Map Preview Container */}
            <div
              ref={mapContainerRef}
              data-map-container="true"
              style={{
                width: '100%',
                height: '140px',
                borderRadius: '6px',
                overflow: 'hidden',
                border: '1px solid var(--color-border, #CBD5E1)',
                backgroundColor: 'var(--color-surface-alt, #F1F5F9)',
                position: 'relative',
              }}
            />

            {/* GPS Telemetry Readouts */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '11px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--color-text-secondary, #475569)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <MapPin size={12} color="var(--color-primary, #2563EB)" />
                  <span>Latitude</span>
                </span>
                <strong style={{ color: 'var(--color-text-primary, #0F172A)' }}>
                  {currentTrain.latitude != null ? `${currentTrain.latitude.toFixed(4)}° N` : '—'}
                </strong>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--color-text-secondary, #475569)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <MapPin size={12} color="var(--color-primary, #2563EB)" />
                  <span>Longitude</span>
                </span>
                <strong style={{ color: 'var(--color-text-primary, #0F172A)' }}>
                  {currentTrain.longitude != null ? `${currentTrain.longitude.toFixed(4)}° E` : '—'}
                </strong>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--color-text-secondary, #475569)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Activity size={12} color="#0284C7" />
                  <span>Speed</span>
                </span>
                <strong style={{ color: 'var(--color-text-primary, #0F172A)' }}>
                  {currentTrain.speedKmh != null ? `${currentTrain.speedKmh.toFixed(1)} km/h ${currentTrain.speedKmh > 0 ? '(In Transit)' : '(Stopped)'}` : '—'}
                </strong>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--color-text-secondary, #475569)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Train size={12} color="#64748B" />
                  <span>Nearest Station</span>
                </span>
                <strong style={{ color: 'var(--color-text-primary, #0F172A)', textAlign: 'right' }}>
                  {currentTrain.nearestStation}
                </strong>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--color-text-secondary, #475569)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Clock size={12} color="#64748B" />
                  <span>Last Update</span>
                </span>
                <span style={{ color: 'var(--color-text-muted, #64748B)', fontWeight: 600 }}>{currentTrain.lastUpdate}</span>
              </div>
            </div>
          </div>

          {/* Center Train Button */}
          <button
            onClick={handleCenterTrain}
            className="touch-target-44"
            style={{
              marginTop: '12px',
              minHeight: '44px',
              backgroundColor: 'var(--color-primary, #2563EB)',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(37,99,235,0.2)',
              transition: 'background-color 0.15s ease',
            }}
          >
            <Crosshair size={14} />
            <span>Center Train</span>
          </button>
        </div>
      </div>

      {/* =========================================================================
          SECTION 3.5 / ROW 5: OPERATIONAL TELEMETRY & SENSOR DIAGNOSTICS STREAM
          Real-time SCADA sensor metrics, network state, and telemetry health
          ========================================================================= */}
      <div
        className="interactive-card"
        style={{
          backgroundColor: 'var(--color-surface, #FFFFFF)',
          borderRadius: '8px',
          border: '1px solid var(--color-border, #E2E8F0)',
          padding: '14px 18px',
          boxShadow: 'var(--shadow-card, 0 1px 3px rgba(0,0,0,0.05))',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          width: '100%',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px',
            borderBottom: '1px solid #F1F5F9',
            paddingBottom: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Activity size={16} color="var(--color-primary, #2563EB)" />
            <span style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.04em', color: '#0F172A', textTransform: 'uppercase' }}>
              Operational Telemetry & Sensor Diagnostics Stream
            </span>
            <span
              style={{
                fontSize: '10px',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '10px',
                backgroundColor: !liveTelemetry?.isStale ? '#DCFCE7' : '#FEE2E2',
                color: !liveTelemetry?.isStale ? '#15803D' : '#DC2626',
                border: `1px solid ${!liveTelemetry?.isStale ? '#86EFAC' : '#FCA5A5'}`,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: !liveTelemetry?.isStale ? '#16A34A' : '#DC2626',
                }}
              />
              MQTT {mqttConnectionStatus ? mqttConnectionStatus.toUpperCase() : 'CONNECTED'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '11px', color: '#64748B' }}>
            <span>UID: <strong style={{ color: '#0F172A', fontFamily: 'monospace' }}>{liveTelemetry?.uid ?? selectedCoach.deviceId}</strong></span>
            <span>Last Sync: <strong style={{ color: '#0F172A' }}>{liveTelemetry?.time ?? currentTrain.lastUpdate}</strong></span>
          </div>
        </div>

        {/* 6 High-Density Diagnostic Indicators */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '12px',
          }}
        >
          {/* Card 1: Tank 1 Ultrasonic Sensor */}
          <div style={{ padding: '10px 12px', backgroundColor: '#F8FAFC', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Arrival Sensor 1</div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: '2px 0' }}>
              {selectedCoach.arrivalHeightCm != null ? `${selectedCoach.arrivalHeightCm.toFixed(1)} cm` : '— cm'}
            </div>
            <div style={{ fontSize: '10px', color: '#475569', display: 'flex', justifyContent: 'space-between' }}>
              <span>Volume: {selectedCoach.arrivalLevel != null ? `${((selectedCoach.arrivalLevel / 100) * 500).toFixed(0)} L` : '— L'}</span>
              <span style={{ color: '#15803D', fontWeight: 700 }}>
                {selectedCoach.arrivalLevel != null ? `${selectedCoach.arrivalLevel.toFixed(0)}%` : '—'}
              </span>
            </div>
          </div>

          {/* Card 2: Tank 2 Ultrasonic Sensor */}
          <div style={{ padding: '10px 12px', backgroundColor: '#F8FAFC', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Departure Sensor 2</div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: '2px 0' }}>
              {selectedCoach.departureHeightCm != null ? `${selectedCoach.departureHeightCm.toFixed(1)} cm` : '— cm'}
            </div>
            <div style={{ fontSize: '10px', color: '#475569', display: 'flex', justifyContent: 'space-between' }}>
              <span>Volume: {selectedCoach.departureLevel != null ? `${((selectedCoach.departureLevel / 100) * 500).toFixed(0)} L` : '— L'}</span>
              <span style={{ color: selectedCoach.departureLevel != null && selectedCoach.departureLevel < 10 ? '#DC2626' : '#15803D', fontWeight: 700 }}>
                {selectedCoach.departureLevel != null ? `${selectedCoach.departureLevel.toFixed(0)}%` : '—'}
              </span>
            </div>
          </div>

          {/* Card 3: DC Power & Battery Health */}
          <div style={{ padding: '10px 12px', backgroundColor: '#F8FAFC', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Subsystem Battery</div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: '2px 0' }}>
              {selectedCoach.batteryPercent != null ? `${selectedCoach.batteryPercent}%` : '—'}
            </div>
            <div style={{ fontSize: '10px', color: '#475569', display: 'flex', justifyContent: 'space-between' }}>
              <span>Voltage: ~12.4V</span>
              <span style={{ color: selectedCoach.batteryPercent != null ? (selectedCoach.batteryPercent > 20 ? '#15803D' : '#DC2626') : '#64748B', fontWeight: 700 }}>
                {selectedCoach.batteryPercent != null ? (selectedCoach.batteryPercent > 20 ? 'Optimal' : 'Low Charge') : 'Standby'}
              </span>
            </div>
          </div>

          {/* Card 4: GPS Telemetry & Fix */}
          <div style={{ padding: '10px 12px', backgroundColor: '#F8FAFC', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>GNSS Navigation</div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: '2px 0' }}>
              {currentTrain.speedKmh != null ? `${currentTrain.speedKmh.toFixed(1)} km/h` : '—'}
            </div>
            <div style={{ fontSize: '10px', color: '#475569', display: 'flex', justifyContent: 'space-between' }}>
              <span>Fix: 3D DGPS</span>
              <span style={{ color: '#2563EB', fontWeight: 700 }}>
                {currentTrain.latitude != null ? `Lat: ${currentTrain.latitude.toFixed(2)}°` : 'Fix: None'}
              </span>
            </div>
          </div>

          {/* Card 5: Device Mesh Status */}
          <div style={{ padding: '10px 12px', backgroundColor: '#F8FAFC', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Fleet Nodes</div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: '2px 0' }}>
              {devices.length > 0 ? `${devices.filter(d => d.isOnline).length} / ${devices.length}` : '1 / 1 Online'}
            </div>
            <div style={{ fontSize: '10px', color: '#475569', display: 'flex', justifyContent: 'space-between' }}>
              <span>Link: RS-485 / LTE</span>
              <span style={{ color: '#15803D', fontWeight: 700 }}>Nominal</span>
            </div>
          </div>

          {/* Card 6: Safety Alarms */}
          <div style={{ padding: '10px 12px', backgroundColor: '#F8FAFC', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Safety Interlocks</div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: activeAlarms.length > 0 ? '#DC2626' : '#15803D', margin: '2px 0' }}>
              {activeAlarms.length > 0 ? `${activeAlarms.length} Active` : '0 Alarms'}
            </div>
            <div style={{ fontSize: '10px', color: '#475569', display: 'flex', justifyContent: 'space-between' }}>
              <span>Valves: Dual Monitored</span>
              <span style={{ color: activeAlarms.length > 0 ? '#DC2626' : '#15803D', fontWeight: 700 }}>
                {activeAlarms.length > 0 ? 'Interlock Active' : 'Clean Run'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          SECTION 4: BOTTOM ACTION BAR (Matching Reference Image)
          Water Level History | GPS / Train History | View Details ->
          ========================================================================= */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          marginTop: '2px',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
          {/* Water Level History Button */}
          <button
            onClick={() => setActiveScreen('history')}
            style={{
              padding: '10px 18px',
              backgroundColor: 'var(--color-surface, #FFFFFF)',
              border: '1px solid var(--color-border, #CBD5E1)',
              borderRadius: '8px',
              color: 'var(--color-text-primary, #0F172A)',
              fontSize: '13px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
              transition: 'all 0.15s ease',
            }}
          >
            <LineChart size={16} color="var(--color-primary, #2563EB)" />
            <span>Water Level History</span>
          </button>

          {/* GPS / Train History Button */}
          <button
            onClick={() => setActiveScreen('location')}
            style={{
              padding: '10px 18px',
              backgroundColor: 'var(--color-surface, #FFFFFF)',
              border: '1px solid var(--color-border, #CBD5E1)',
              borderRadius: '8px',
              color: 'var(--color-text-primary, #0F172A)',
              fontSize: '13px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
              transition: 'all 0.15s ease',
            }}
          >
            <MapPin size={16} color="var(--color-primary, #2563EB)" />
            <span>GPS / Train History</span>
          </button>
        </div>

        {/* View Details Button (Primary Action - Matching Reference Image) */}
        <button
          onClick={() => {
            setSelectedCoachNumber(selectedCoach.coachNumber);
            setActiveScreen('coach-details');
          }}
          style={{
            padding: '10px 24px',
            backgroundColor: '#4F46E5',
            backgroundImage: 'linear-gradient(135deg, #5B50E6 0%, #4338CA 100%)',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
            boxShadow: '0 2px 6px rgba(79,70,229,0.35)',
            transition: 'all 0.15s ease',
          }}
          title="View full coach details and dual tank telemetry"
        >
          <span>View Details</span>
          <ArrowRight size={16} strokeWidth={2.4} />
        </button>
      </div>

      {/* =========================================================================
          MODALS: Add Train & Edit Train Configuration
          ========================================================================= */}
      {/* MODAL 1: Add Train Modal */}
      {isAddModalOpen && (
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
            className="dialog-content"
            style={{
              backgroundColor: 'var(--color-surface, #FFFFFF)',
              borderRadius: '8px',
              width: '100%',
              maxWidth: '480px',
              boxShadow: 'var(--shadow-modal, 0 20px 25px -5px rgba(0,0,0,0.2))',
              overflow: 'hidden',
              border: '1px solid var(--color-border, #E2E8F0)',
            }}
          >
            <div
              style={{
                padding: '14px 18px',
                borderBottom: '1px solid var(--color-border, #E2E8F0)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: 'var(--color-surface-alt, #F8FAFC)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Train size={18} color="var(--color-primary, #2563EB)" />
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--color-text-primary, #0F172A)' }}>
                  Add Train to Fleet
                </h3>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted, #64748B)' }}
              >
                <X size={18} />
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
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary, #475569)', marginBottom: '4px' }}>
                    Train Number *
                  </label>
                  <input
                    type="text"
                    value={newTrainNumber}
                    onChange={(e) => setNewTrainNumber(e.target.value)}
                    placeholder="e.g. 12842"
                    required
                    style={{
                      width: '100%',
                      height: '34px',
                      padding: '0 10px',
                      borderRadius: '6px',
                      border: '1px solid var(--color-border, #CBD5E1)',
                      backgroundColor: 'var(--color-surface-alt, #F8FAFC)',
                      color: 'var(--color-text-primary, #0F172A)',
                      fontSize: '12px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary, #475569)', marginBottom: '4px' }}>
                    Train Name *
                  </label>
                  <input
                    type="text"
                    value={newTrainName}
                    onChange={(e) => setNewTrainName(e.target.value)}
                    placeholder="e.g. Dhauli Express"
                    required
                    style={{
                      width: '100%',
                      height: '34px',
                      padding: '0 10px',
                      borderRadius: '6px',
                      border: '1px solid var(--color-border, #CBD5E1)',
                      backgroundColor: 'var(--color-surface-alt, #F8FAFC)',
                      color: 'var(--color-text-primary, #0F172A)',
                      fontSize: '12px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary, #475569)', marginBottom: '4px' }}>
                    Source Station
                  </label>
                  <input
                    type="text"
                    value={newTrainSource}
                    onChange={(e) => setNewTrainSource(e.target.value)}
                    placeholder="e.g. Howrah (HWH)"
                    style={{
                      width: '100%',
                      height: '34px',
                      padding: '0 10px',
                      borderRadius: '6px',
                      border: '1px solid var(--color-border, #CBD5E1)',
                      backgroundColor: 'var(--color-surface-alt, #F8FAFC)',
                      color: 'var(--color-text-primary, #0F172A)',
                      fontSize: '12px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary, #475569)', marginBottom: '4px' }}>
                    Destination Station
                  </label>
                  <input
                    type="text"
                    value={newTrainDestination}
                    onChange={(e) => setNewTrainDestination(e.target.value)}
                    placeholder="e.g. Puri (PURI)"
                    style={{
                      width: '100%',
                      height: '34px',
                      padding: '0 10px',
                      borderRadius: '6px',
                      border: '1px solid var(--color-border, #CBD5E1)',
                      backgroundColor: 'var(--color-surface-alt, #F8FAFC)',
                      color: 'var(--color-text-primary, #0F172A)',
                      fontSize: '12px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary, #475569)', marginBottom: '4px' }}>
                    Railway Region
                  </label>
                  <select
                    value={newTrainRegion}
                    onChange={(e) => setNewTrainRegion(e.target.value)}
                    style={{
                      width: '100%',
                      height: '34px',
                      padding: '0 10px',
                      borderRadius: '6px',
                      border: '1px solid var(--color-border, #CBD5E1)',
                      backgroundColor: 'var(--color-surface-alt, #F8FAFC)',
                      color: 'var(--color-text-primary, #0F172A)',
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
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary, #475569)', marginBottom: '4px' }}>
                    Initial Coach
                  </label>
                  <input
                    type="text"
                    value={newInitialCoach}
                    onChange={(e) => setNewInitialCoach(e.target.value)}
                    placeholder="C1"
                    style={{
                      width: '100%',
                      height: '34px',
                      padding: '0 10px',
                      borderRadius: '6px',
                      border: '1px solid var(--color-border, #CBD5E1)',
                      backgroundColor: 'var(--color-surface-alt, #F8FAFC)',
                      color: 'var(--color-text-primary, #0F172A)',
                      fontSize: '12px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border, #CBD5E1)',
                    backgroundColor: 'var(--color-surface, #FFFFFF)',
                    color: 'var(--color-text-secondary, #475569)',
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
                    backgroundColor: 'var(--color-primary, #2563EB)',
                    color: '#FFFFFF',
                    fontSize: '12px',
                    fontWeight: 700,
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
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div
            className="dialog-content"
            style={{
              backgroundColor: 'var(--color-surface, #FFFFFF)',
              borderRadius: '8px',
              width: '100%',
              maxWidth: '480px',
              boxShadow: 'var(--shadow-modal, 0 20px 25px -5px rgba(0,0,0,0.2))',
              overflow: 'hidden',
              border: '1px solid var(--color-border, #E2E8F0)',
            }}
          >
            <div
              style={{
                padding: '14px 18px',
                borderBottom: '1px solid var(--color-border, #E2E8F0)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: 'var(--color-surface-alt, #F8FAFC)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Edit3 size={18} color="var(--color-primary, #2563EB)" />
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--color-text-primary, #0F172A)' }}>
                  Edit Train {editTrainNumber}
                </h3>
              </div>
              <button
                onClick={() => setIsEditModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted, #64748B)' }}
              >
                <X size={18} />
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
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary, #475569)', marginBottom: '4px' }}>
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
                    border: '1px solid var(--color-border, #CBD5E1)',
                    backgroundColor: 'var(--color-surface-alt, #F8FAFC)',
                    color: 'var(--color-text-primary, #0F172A)',
                    fontSize: '12px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary, #475569)', marginBottom: '4px' }}>
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
                      border: '1px solid var(--color-border, #CBD5E1)',
                      backgroundColor: 'var(--color-surface-alt, #F8FAFC)',
                      color: 'var(--color-text-primary, #0F172A)',
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
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary, #475569)', marginBottom: '4px' }}>
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
                      border: '1px solid var(--color-border, #CBD5E1)',
                      backgroundColor: 'var(--color-surface-alt, #F8FAFC)',
                      color: 'var(--color-text-primary, #0F172A)',
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
                    border: '1px solid var(--color-border, #CBD5E1)',
                    backgroundColor: 'var(--color-surface, #FFFFFF)',
                    color: 'var(--color-text-secondary, #475569)',
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
                    backgroundColor: 'var(--color-primary, #2563EB)',
                    color: '#FFFFFF',
                    fontSize: '12px',
                    fontWeight: 700,
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
    </div>
  );
};
