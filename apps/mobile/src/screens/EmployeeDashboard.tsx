import React, { useState, useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { typography } from '../theme';
import { useApp } from '../state/AppContext';
import { ApiClient } from '../api/client';
import { TrainOverviewItem, TankLiveStatus } from '../types';
import { DEMO_TRAIN, DEMO_ARRIVAL_TANK, DEMO_DEPARTURE_TANK } from '../data/demonstrationData';
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
  batteryPercent: number;
  arrivalLevel: number;
  arrivalHeightCm: number;
  departureLevel: number;
  departureHeightCm: number;
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
  } = useApp();

  const { dashboard, isDark } = useDisplayPreferences();

  const [selectedRegion, setSelectedRegion] = useState<string>('South East');
  const [searchQuery, setSearchQuery] = useState<string>('12841');
  const [backendTrains, setBackendTrains] = useState<TrainOverviewItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  // Selected coach (defaults to C4 as per reference image)
  const [activeCoachNum, setActiveCoachNum] = useState<string>(selectedCoachNumber || 'C4');

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
    if (selectedTrainNumber === '12841' || !selectedTrainNumber) {
      return {
        trainNumber: '12841',
        name: 'Coromandel Express',
        source: 'Chennai (MAS)',
        destination: 'Howrah (HWH)',
        region: 'South East',
        status: 'Active',
        latitude: 22.5726,
        longitude: 88.3639,
        speedKmh: 0,
        nearestStation: 'Kharagpur (KGP)',
        lastUpdate: '23 Jan 2025, 11:26:20',
        totalCoaches: 24,
      };
    }
    const match = backendTrains.find((t) => t.train_number === selectedTrainNumber);
    if (match) {
      return {
        trainNumber: match.train_number,
        name: match.name,
        source: (match as any).source || 'Station A',
        destination: (match as any).destination || 'Station B',
        region: match.region || 'Eastern',
        status: match.is_online ? 'Active' : 'Standby',
        latitude: (match as any).latitude || 22.5726,
        longitude: (match as any).longitude || 88.3639,
        speedKmh: (match as any).speed_kmh || 0,
        nearestStation: (match as any).nearest_station || 'Howrah Junction (HWH)',
        lastUpdate: match.last_telemetry || 'Just now',
        totalCoaches: match.coaches_count || 24,
      };
    }
    return {
      trainNumber: '12841',
      name: 'Coromandel Express',
      source: 'Chennai (MAS)',
      destination: 'Howrah (HWH)',
      region: 'South East',
      status: 'Active',
      latitude: 22.5726,
      longitude: 88.3639,
      speedKmh: 0,
      nearestStation: 'Kharagpur (KGP)',
      lastUpdate: '23 Jan 2025, 11:26:20',
      totalCoaches: 24,
    };
  }, [selectedTrainNumber, backendTrains]);

  // Generate 24 coaches for current train
  const coaches24: DashboardCoach[] = useMemo(() => {
    const list: DashboardCoach[] = [];
    const coachTypes = ['Passenger', 'AC Chair Car', 'AC 3-Tier', 'AC 2-Tier', 'Sleeper Class', 'Executive'];

    for (let i = 1; i <= 24; i++) {
      const cNum = `C${i}`;
      if (cNum === 'C4') {
        // C4 matches reference image: Device-1, Passenger, 62% battery, Arrival 70%, Departure 40%
        list.push({
          coachNumber: 'C4',
          coachType: 'Passenger',
          deviceId: 'Device-1',
          deviceStatus: 'Online',
          batteryPercent: 62,
          arrivalLevel: 70,
          arrivalHeightCm: 35.0,
          departureLevel: 40,
          departureHeightCm: 20.0,
        });
      } else {
        const typeIndex = (i - 1) % coachTypes.length;
        // In reference image: C1, C2, C3 are healthy green (~70-85%)
        const arr = i <= 3 ? 75 + ((i * 3) % 15) : 30 + ((i * 7) % 60);
        const dep = i <= 3 ? 70 + ((i * 4) % 15) : 25 + ((i * 9) % 65);
        const batt = 45 + ((i * 5) % 50);

        list.push({
          coachNumber: cNum,
          coachType: coachTypes[typeIndex],
          deviceId: `Device-${i}`,
          deviceStatus: i % 8 === 0 ? 'Offline' : 'Online',
          batteryPercent: batt,
          arrivalLevel: arr,
          arrivalHeightCm: (arr / 100) * 50,
          departureLevel: dep,
          departureHeightCm: (dep / 100) * 50,
        });
      }
    }
    return list;
  }, [currentTrain.trainNumber]);

  // Selected coach data
  const selectedCoach = useMemo(() => {
    return coaches24.find((c) => c.coachNumber === activeCoachNum) || coaches24[3]; // default C4
  }, [coaches24, activeCoachNum]);

  // Leaflet map setup for Train Location
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const lat = currentTrain.latitude;
    const lon = currentTrain.longitude;

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
    if (mapInstanceRef.current) {
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
        maxWidth: '1600px',
        margin: '0 auto',
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

          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px' }}>
            {/* Region Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary, #475569)' }}>
                Region :
              </span>
              <select
                value={selectedRegion}
                onChange={(e) => setSelectedRegion(e.target.value)}
                style={{
                  height: '32px',
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary, #475569)' }}>
                Train No. :
              </span>
              <div style={{ position: 'relative', width: '130px' }}>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="12841"
                  style={{
                    width: '100%',
                    height: '32px',
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
              style={{
                height: '32px',
                padding: '0 14px',
                backgroundColor: 'var(--color-primary, #2563EB)',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(37,99,235,0.2)',
                transition: 'all 0.15s ease',
              }}
            >
              <Plus size={14} strokeWidth={2.4} />
              <span>Add Train</span>
            </button>
          </div>
        </div>

        {/* Train List Table (Matching Reference Columns) */}
        <div style={{ overflowX: 'auto', borderRadius: '6px', border: '1px solid var(--color-border, #E2E8F0)' }}>
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
              {/* Primary Demo Train: 12841 Coromandel Express */}
              <tr
                onClick={() => handleSelectTrain('12841')}
                style={{
                  backgroundColor:
                    currentTrain.trainNumber === '12841'
                      ? 'var(--color-primary-surface, #EFF6FF)'
                      : 'var(--color-surface, #FFFFFF)',
                  borderLeft:
                    currentTrain.trainNumber === '12841'
                      ? '3px solid var(--color-primary, #2563EB)'
                      : '3px solid transparent',
                  borderBottom: '1px solid var(--color-border, #E2E8F0)',
                  cursor: 'pointer',
                  transition: 'background-color 0.12s ease',
                }}
              >
                <td style={{ padding: '10px 14px', fontWeight: 800, color: 'var(--color-primary, #2563EB)' }}>
                  12841
                </td>
                <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--color-text-primary, #0F172A)' }}>
                  Coromandel Express
                </td>
                <td style={{ padding: '10px 14px', color: 'var(--color-text-secondary, #475569)' }}>
                  Chennai (MAS)
                </td>
                <td style={{ padding: '10px 14px', color: 'var(--color-text-secondary, #475569)' }}>
                  Howrah (HWH)
                </td>
                <td style={{ padding: '10px 14px', color: 'var(--color-text-secondary, #475569)' }}>
                  South East
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <div
                      style={{
                        width: '7px',
                        height: '7px',
                        borderRadius: '50%',
                        backgroundColor: 'var(--color-status-success, #16A34A)',
                      }}
                    />
                    <span style={{ fontWeight: 600, color: 'var(--color-status-success, #16A34A)' }}>Active</span>
                  </div>
                </td>
                <td style={{ padding: '10px 14px', color: 'var(--color-text-secondary, #475569)' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <MapPin size={13} color="var(--color-primary, #2563EB)" />
                    22.5726&deg; N, 88.3639&deg; E
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
                  23 Jan 2025, 11:26:20
                </td>
              </tr>

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

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
            {/* ==================== INDIAN RAILWAYS LOCOMOTIVE ==================== */}
            <div
              style={{
                flexShrink: 0,
                width: '140px',
                height: '76px',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
              }}
            >
              <svg width="140" height="72" viewBox="0 0 140 72" fill="none">
                {/* Rooftop Pantograph & Equipment */}
                <path d="M 40 10 L 55 2 L 70 10" stroke="#64748B" strokeWidth="2" fill="none" />
                <rect x="52" y="1" width="6" height="3" fill="#94A3B8" />
                <rect x="25" y="8" width="80" height="4" rx="2" fill="#475569" />

                {/* Main Locomotive Body (Orange/Red Indian Railways WAP-7 livery) */}
                <path
                  d="M 6 46 L 16 18 C 18 13, 24 12, 32 12 L 132 12 C 136 12, 138 14, 138 18 L 138 52 L 4 52 Z"
                  fill="url(#locoBodyGrad)"
                />
                {/* Yellow Lightning Strike Livery Line */}
                <path
                  d="M 6 44 L 28 32 L 65 32 L 80 40 L 138 40 L 138 44 L 78 44 L 63 36 L 25 36 Z"
                  fill="#FBBF24"
                />

                {/* Driver Cab Windows */}
                <path d="M 18 20 L 30 20 L 30 30 L 14 30 Z" fill="#1E293B" stroke="#FBBF24" strokeWidth="1" />
                <rect x="34" y="20" width="14" height="10" rx="1" fill="#1E293B" stroke="#CBD5E1" strokeWidth="0.8" />
                <rect x="52" y="20" width="14" height="10" rx="1" fill="#1E293B" stroke="#CBD5E1" strokeWidth="0.8" />

                {/* Headlights */}
                <circle cx="10" cy="46" r="3.5" fill="#FEF08A" stroke="#B45309" strokeWidth="1" />
                <circle cx="10" cy="46" r="1.5" fill="#FFFFFF" />

                {/* Lower Chassis & Cowcatcher / Pilot */}
                <rect x="4" y="52" width="134" height="6" fill="#1E293B" />
                <path d="M 2 56 L 10 52 L 10 58 Z" fill="#DC2626" />

                {/* Bogie Wheels (2 sets of 3 wheels) */}
                <g fill="#334155" stroke="#94A3B8" strokeWidth="1.5">
                  <circle cx="24" cy="62" r="7" />
                  <circle cx="42" cy="62" r="7" />
                  <circle cx="60" cy="62" r="7" />

                  <circle cx="86" cy="62" r="7" />
                  <circle cx="104" cy="62" r="7" />
                  <circle cx="122" cy="62" r="7" />

                  {/* Inner Wheel Hubs */}
                  <circle cx="24" cy="62" r="2.5" fill="#64748B" />
                  <circle cx="42" cy="62" r="2.5" fill="#64748B" />
                  <circle cx="60" cy="62" r="2.5" fill="#64748B" />
                  <circle cx="86" cy="62" r="2.5" fill="#64748B" />
                  <circle cx="104" cy="62" r="2.5" fill="#64748B" />
                  <circle cx="122" cy="62" r="2.5" fill="#64748B" />
                </g>

                {/* Gradients */}
                <defs>
                  <linearGradient id="locoBodyGrad" x1="0" y1="12" x2="0" y2="52" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#EA580C" />
                    <stop offset="60%" stopColor="#C2410C" />
                    <stop offset="100%" stopColor="#9A3412" />
                  </linearGradient>
                </defs>
              </svg>
            </div>

            {/* Coupler Spacer */}
            <div
              style={{
                width: '8px',
                height: '4px',
                backgroundColor: 'var(--color-border-strong, #64748B)',
                marginBottom: '18px',
                flexShrink: 0,
              }}
            />

            {/* ==================== 24 COACHES (C1 TO C24) ==================== */}
            {coaches24.map((coach, index) => {
              const isSelected = coach.coachNumber === activeCoachNum;
              // Reference image: C1, C2, C3 are pale green, C4 is vibrant blue, C5..C24 are soft blue/slate
              const isGreen = index < 3; // C1, C2, C3

              let coachBg = 'var(--color-surface, #FFFFFF)';
              let coachBorder = '1px solid var(--color-border, #CBD5E1)';
              let textColor = 'var(--color-text-primary, #0F172A)';
              let glowStyle = 'none';

              if (isSelected) {
                coachBg = isDark ? '#1E293B' : '#EFF6FF';
                coachBorder = '2px solid var(--color-primary, #2563EB)';
                textColor = 'var(--color-primary, #2563EB)';
                glowStyle = '0 0 10px rgba(37,99,235,0.35)';
              } else if (isGreen) {
                coachBg = isDark ? 'rgba(34,197,94,0.18)' : '#DCFCE7';
                coachBorder = '1px solid rgba(34,197,94,0.45)';
                textColor = isDark ? '#4ADE80' : '#15803D';
              } else {
                coachBg = isDark ? '#1E293B' : '#F1F5F9';
                coachBorder = '1px solid var(--color-border, #CBD5E1)';
                textColor = 'var(--color-text-secondary, #475569)';
              }

              return (
                <div
                  key={coach.coachNumber}
                  onClick={() => handleSelectCoach(coach.coachNumber)}
                  style={{
                    flexShrink: 0,
                    width: '74px',
                    height: '66px',
                    borderRadius: '6px',
                    backgroundColor: coachBg,
                    border: coachBorder,
                    boxShadow: glowStyle,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    padding: '4px 6px',
                    cursor: 'pointer',
                    boxSizing: 'border-box',
                    transition: 'all 0.15s ease',
                    position: 'relative',
                  }}
                >
                  {/* Coach Window Band Strip */}
                  <div
                    style={{
                      display: 'flex',
                      gap: '3px',
                      justifyContent: 'center',
                      marginTop: '2px',
                    }}
                  >
                    {[1, 2, 3, 4].map((w) => (
                      <div
                        key={w}
                        style={{
                          width: '10px',
                          height: '5px',
                          borderRadius: '1px',
                          backgroundColor: isDark ? '#0F172A' : '#334155',
                          opacity: 0.6,
                        }}
                      />
                    ))}
                  </div>

                  {/* Coach Number Label */}
                  <div
                    style={{
                      textAlign: 'center',
                      fontSize: '13px',
                      fontWeight: 800,
                      color: textColor,
                      lineHeight: '16px',
                    }}
                  >
                    {coach.coachNumber}
                  </div>

                  {/* Wheels (2 bogie wheels under each coach) */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '0 4px',
                      marginBottom: '-9px',
                    }}
                  >
                    <div
                      style={{
                        width: '10px',
                        height: '10px',
                        borderRadius: '50%',
                        backgroundColor: '#334155',
                        border: '1.5px solid #94A3B8',
                      }}
                    />
                    <div
                      style={{
                        width: '10px',
                        height: '10px',
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
          SECTION 3: THREE-COLUMN INFORMATION GRID
          Col 1: Coach Info | Col 2: Dual Water Tanks | Col 3: Train Location & Map
          ========================================================================= */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '14px',
        }}
      >
        {/* ==================== COLUMN 1: SELECTED COACH INFO ==================== */}
        <div
          className="interactive-card"
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
              margin: '0 0 16px 0',
              fontSize: '15px',
              fontWeight: 800,
              color: 'var(--color-text-primary, #0F172A)',
            }}
          >
            Coach : {selectedCoach.coachNumber}
          </h3>

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
                <Battery size={16} color={selectedCoach.batteryPercent < 40 ? '#EF4444' : '#16A34A'} />
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
                      width: `${selectedCoach.batteryPercent}%`,
                      height: '100%',
                      backgroundColor: selectedCoach.batteryPercent < 40 ? '#EF4444' : '#16A34A',
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
                <span
                  style={{
                    fontSize: '13px',
                    fontWeight: 700,
                    color: selectedCoach.batteryPercent < 40 ? '#EF4444' : 'var(--color-status-success, #16A34A)',
                  }}
                >
                  {selectedCoach.batteryPercent}%
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

        {/* ==================== COLUMN 2: DUAL TANK MONITORING ==================== */}
        <div
          className="interactive-card"
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
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
              flex: 1,
              alignItems: 'center',
            }}
          >
            {/* TANK 1: ARRIVAL SIDE */}
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

              {/* 3D Realistic Cylindrical Metallic Tank */}
              <svg width="120" height="136" viewBox="0 0 120 136">
                <defs>
                  {/* Polished metallic cylinder shading */}
                  <linearGradient id="metalGrad1" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#CBD5E1" />
                    <stop offset="25%" stopColor="#F8FAFC" />
                    <stop offset="50%" stopColor="#94A3B8" />
                    <stop offset="75%" stopColor="#CBD5E1" />
                    <stop offset="100%" stopColor="#64748B" />
                  </linearGradient>

                  {/* Water fill gradient */}
                  <linearGradient id="waterGrad1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#38BDF8" />
                    <stop offset="100%" stopColor="#0284C7" />
                  </linearGradient>

                  {/* Glass highlight */}
                  <linearGradient id="glassShine" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="rgba(255,255,255,0.45)" />
                    <stop offset="30%" stopColor="rgba(255,255,255,0.05)" />
                    <stop offset="70%" stopColor="rgba(255,255,255,0.05)" />
                    <stop offset="100%" stopColor="rgba(255,255,255,0.3)" />
                  </linearGradient>
                </defs>

                {/* Curved Inlet Pipe on Left */}
                <path
                  d="M 28 36 C 10 36, 6 54, 6 96 L 6 120"
                  stroke="#94A3B8"
                  strokeWidth="6"
                  fill="none"
                  strokeLinecap="round"
                />
                <circle cx="6" cy="120" r="4" fill="#64748B" />

                {/* Main Cylindrical Tank Shell */}
                <rect x="26" y="24" width="76" height="96" rx="4" fill="url(#metalGrad1)" />

                {/* Top Metallic Domed Cap */}
                <ellipse cx="64" cy="24" rx="38" ry="12" fill="url(#metalGrad1)" stroke="#94A3B8" strokeWidth="1" />
                {/* Filler Neck & Cap Handle */}
                <rect x="58" y="10" width="12" height="6" rx="1" fill="#64748B" />
                <ellipse cx="64" cy="10" rx="8" ry="3" fill="#94A3B8" />

                {/* Center Glass Sight Window (Water View) */}
                <rect x="32" y="30" width="64" height="84" rx="3" fill="#0F172A" />

                {/* Water Level Fill */}
                {(() => {
                  const maxH = 80;
                  const waterH = (selectedCoach.arrivalLevel / 100) * maxH;
                  const waterY = 32 + (maxH - waterH);
                  return (
                    <g>
                      <rect x="34" y={waterY} width="60" height={waterH} rx="2" fill="url(#waterGrad1)" />
                      {/* Animated wave path on surface */}
                      <path
                        d={`M 34 ${waterY} Q 49 ${waterY - 2}, 64 ${waterY} T 94 ${waterY} L 94 ${waterY + 4} L 34 ${waterY + 4} Z`}
                        fill="#7DD3FC"
                        opacity="0.8"
                      />
                    </g>
                  );
                })()}

                {/* Glass Window Reflection */}
                <rect x="32" y="30" width="64" height="84" rx="3" fill="url(#glassShine)" />

                {/* Centered Bold Percentage */}
                <text
                  x="64"
                  y="78"
                  fontSize="22"
                  fontWeight="900"
                  fill="#FFFFFF"
                  textAnchor="middle"
                  style={{ textShadow: '0 2px 4px rgba(0,0,0,0.6)' }}
                >
                  {selectedCoach.arrivalLevel.toFixed(0)}%
                </text>

                {/* Bottom Base Flange */}
                <ellipse cx="64" cy="120" rx="40" ry="10" fill="url(#metalGrad1)" stroke="#64748B" strokeWidth="1" />
              </svg>

              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: 'var(--color-text-secondary, #475569)',
                  marginTop: '4px',
                }}
              >
                {selectedCoach.arrivalHeightCm.toFixed(1)} cm &bull; 14.0 L
              </span>
            </div>

            {/* TANK 2: DEPARTURE SIDE */}
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

              {/* 3D Realistic Cylindrical Metallic Tank */}
              <svg width="120" height="136" viewBox="0 0 120 136">
                {/* Curved Outlet Pipe on Right */}
                <path
                  d="M 92 64 C 110 64, 114 74, 114 100 L 114 120"
                  stroke="#94A3B8"
                  strokeWidth="6"
                  fill="none"
                  strokeLinecap="round"
                />
                <circle cx="114" cy="120" r="4" fill="#64748B" />

                {/* Main Cylindrical Tank Shell */}
                <rect x="20" y="24" width="76" height="96" rx="4" fill="url(#metalGrad1)" />

                {/* Top Metallic Domed Cap */}
                <ellipse cx="58" cy="24" rx="38" ry="12" fill="url(#metalGrad1)" stroke="#94A3B8" strokeWidth="1" />
                {/* Filler Neck & Cap Handle */}
                <rect x="52" y="10" width="12" height="6" rx="1" fill="#64748B" />
                <ellipse cx="58" cy="10" rx="8" ry="3" fill="#94A3B8" />

                {/* Center Glass Sight Window (Water View) */}
                <rect x="26" y="30" width="64" height="84" rx="3" fill="#0F172A" />

                {/* Water Level Fill */}
                {(() => {
                  const maxH = 80;
                  const waterH = (selectedCoach.departureLevel / 100) * maxH;
                  const waterY = 32 + (maxH - waterH);
                  return (
                    <g>
                      <rect x="28" y={waterY} width="60" height={waterH} rx="2" fill="url(#waterGrad1)" />
                      {/* Animated wave path on surface */}
                      <path
                        d={`M 28 ${waterY} Q 43 ${waterY - 2}, 58 ${waterY} T 88 ${waterY} L 88 ${waterY + 4} L 28 ${waterY + 4} Z`}
                        fill="#7DD3FC"
                        opacity="0.8"
                      />
                    </g>
                  );
                })()}

                {/* Glass Window Reflection */}
                <rect x="26" y="30" width="64" height="84" rx="3" fill="url(#glassShine)" />

                {/* Centered Bold Percentage */}
                <text
                  x="58"
                  y="78"
                  fontSize="22"
                  fontWeight="900"
                  fill="#FFFFFF"
                  textAnchor="middle"
                  style={{ textShadow: '0 2px 4px rgba(0,0,0,0.6)' }}
                >
                  {selectedCoach.departureLevel.toFixed(0)}%
                </text>

                {/* Bottom Base Flange */}
                <ellipse cx="58" cy="120" rx="40" ry="10" fill="url(#metalGrad1)" stroke="#64748B" strokeWidth="1" />
              </svg>

              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: 'var(--color-text-secondary, #475569)',
                  marginTop: '4px',
                }}
              >
                {selectedCoach.departureHeightCm.toFixed(1)} cm &bull; 8.0 L
              </span>
            </div>
          </div>
        </div>

        {/* ==================== COLUMN 3: TRAIN LOCATION & MAP ==================== */}
        <div
          className="interactive-card"
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
            style={{
              display: 'grid',
              gridTemplateColumns: '1.2fr 1.3fr',
              gap: '12px',
              flex: 1,
              alignItems: 'center',
            }}
          >
            {/* Map Preview Container */}
            <div
              ref={mapContainerRef}
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
                  {currentTrain.latitude.toFixed(4)}&deg; N
                </strong>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--color-text-secondary, #475569)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <MapPin size={12} color="var(--color-primary, #2563EB)" />
                  <span>Longitude</span>
                </span>
                <strong style={{ color: 'var(--color-text-primary, #0F172A)' }}>
                  {currentTrain.longitude.toFixed(4)}&deg; E
                </strong>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--color-text-secondary, #475569)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Activity size={12} color="#0284C7" />
                  <span>Speed</span>
                </span>
                <strong style={{ color: 'var(--color-text-primary, #0F172A)' }}>
                  {currentTrain.speedKmh} km/h (Stopped)
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
                <span style={{ color: 'var(--color-text-muted, #64748B)' }}>11:26:20</span>
              </div>
            </div>
          </div>

          {/* Center Train Button */}
          <button
            onClick={handleCenterTrain}
            style={{
              marginTop: '12px',
              height: '32px',
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

        {/* View Details Button (Primary Action) */}
        <button
          onClick={() => setActiveScreen('coaches')}
          style={{
            padding: '10px 24px',
            backgroundColor: 'var(--color-primary, #2563EB)',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
            boxShadow: '0 2px 4px rgba(37,99,235,0.25)',
            transition: 'all 0.15s ease',
          }}
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
