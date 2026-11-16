import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Route,
  Search,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Download,
  Save,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Droplets,
  MapPin,
  Train as TrainIcon,
} from 'lucide-react';
import { ApiClient } from '../../api/client';
import { useApp } from '../../state/AppContext';
import { colors, typography, metrics } from '../../theme';
import { CorridorStation, TrainOverviewItem } from '../../types';

export interface RouteConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTrainNumber?: string;
  onRouteSaved?: (trainNumber: string) => void;
}

interface EditableStation {
  code: string;
  name: string;
  latitude: number;
  longitude: number;
  water_refill_available: boolean;
  water_capacity_liters: number;
}

export const RouteConfigModal: React.FC<RouteConfigModalProps> = ({
  isOpen,
  onClose,
  initialTrainNumber,
  onRouteSaved,
}) => {
  const { configuredTrains, refreshData } = useApp();

  const [selectedTrain, setSelectedTrain] = useState<string>(initialTrainNumber || '');
  const [stations, setStations] = useState<EditableStation[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [importing, setImporting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Station search state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState<boolean>(false);

  // Sync initial train when modal opens
  useEffect(() => {
    if (isOpen) {
      const target = initialTrainNumber || (configuredTrains[0]?.train_number ?? '');
      setSelectedTrain(target);
      setError(null);
      setSuccessMsg(null);
      setSearchQuery('');
      setSearchResults([]);
    }
  }, [isOpen, initialTrainNumber, configuredTrains]);

  // Load route when train changes
  useEffect(() => {
    if (!isOpen || !selectedTrain) return;

    let isMounted = true;
    const loadRouteForTrain = async () => {
      setLoading(true);
      setError(null);
      try {
        const corrStations = await ApiClient.fetchCorridorStations(selectedTrain);
        if (isMounted) {
          if (Array.isArray(corrStations) && corrStations.length >= 2) {
            setStations(
              corrStations.map((s) => ({
                code: s.code,
                name: s.name,
                latitude: s.latitude,
                longitude: s.longitude,
                water_refill_available: Boolean(s.water_refill_available),
                water_capacity_liters: Number(s.water_capacity_liters || 0),
              }))
            );
          } else {
            setStations([]);
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err?.message || 'Failed to load route stations.');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadRouteForTrain();
    return () => {
      isMounted = false;
    };
  }, [isOpen, selectedTrain]);

  // Search stations with debounce
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q || q.length < 2) {
      setSearchResults([]);
      return;
    }

    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await ApiClient.searchStations(q, 15);
        setSearchResults(results || []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 280);

    return () => clearTimeout(t);
  }, [searchQuery]);

  // Calculate total track distance (Haversine km)
  const totalDistanceKm = useMemo(() => {
    if (stations.length < 2) return 0;
    let dist = 0;
    for (let i = 0; i < stations.length - 1; i++) {
      const lat1 = stations[i].latitude;
      const lon1 = stations[i].longitude;
      const lat2 = stations[i + 1].latitude;
      const lon2 = stations[i + 1].longitude;
      const dLat = (lat2 - lat1) * (Math.PI / 180.0);
      const dLon = (lon2 - lon1) * (Math.PI / 180.0);
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180.0)) *
          Math.cos(lat2 * (Math.PI / 180.0)) *
          Math.sin(dLon / 2) *
          Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      dist += 6371.0 * c * 1.12; // 1.12 winding factor
    }
    return Math.round(dist);
  }, [stations]);

  // Import Official Route
  const handleImportOfficialRoute = async () => {
    if (!selectedTrain) return;
    setImporting(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const data = await ApiClient.fetchOfficialRoute(selectedTrain);
      if (data && data.stations && Array.isArray(data.stations) && data.stations.length >= 2) {
        setStations(
          data.stations.map((s: any) => ({
            code: s.code,
            name: s.name,
            latitude: s.latitude,
            longitude: s.longitude,
            water_refill_available: Boolean(s.water_refill_available),
            water_capacity_liters: Number(s.water_capacity_liters || 0),
          }))
        );
        setSuccessMsg(
          `Imported official railway route for ${data.train_name || selectedTrain} (${data.stops_count} halts).`
        );
      } else {
        setError(`No official railway route found for Train ${selectedTrain}. You can configure halts manually.`);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch official route.');
    } finally {
      setImporting(false);
    }
  };

  // Add station from search
  const handleAddStation = (st: any) => {
    if (stations.some((s) => s.code.toUpperCase() === st.code.toUpperCase())) {
      setError(`Station ${st.code} (${st.name}) is already added to this route.`);
      return;
    }
    setStations((prev) => [
      ...prev,
      {
        code: st.code.toUpperCase(),
        name: st.name || st.code,
        latitude: st.latitude,
        longitude: st.longitude,
        water_refill_available: Boolean(st.water_refill_available),
        water_capacity_liters: Number(st.water_capacity_liters || 0),
      },
    ]);
    setSearchQuery('');
    setSearchResults([]);
    setError(null);
  };

  // Remove station
  const handleRemoveStation = (index: number) => {
    setStations((prev) => prev.filter((_, i) => i !== index));
  };

  // Move station up
  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    setStations((prev) => {
      const next = [...prev];
      const temp = next[index - 1];
      next[index - 1] = next[index];
      next[index] = temp;
      return next;
    });
  };

  // Move station down
  const handleMoveDown = (index: number) => {
    if (index >= stations.length - 1) return;
    setStations((prev) => {
      const next = [...prev];
      const temp = next[index + 1];
      next[index + 1] = next[index];
      next[index] = temp;
      return next;
    });
  };

  // Toggle Refill
  const handleToggleRefill = (index: number) => {
    setStations((prev) =>
      prev.map((s, i) => (i === index ? { ...s, water_refill_available: !s.water_refill_available } : s))
    );
  };

  // Save Route
  const handleSaveRoute = async () => {
    if (!selectedTrain) {
      setError('Please select a train.');
      return;
    }
    if (stations.length < 2) {
      setError('A valid railway route requires at least 2 stations (source and destination).');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const formattedStations = stations.map((s, idx) => ({
        id: `${selectedTrain}_${s.code.toLowerCase()}_${idx}`,
        code: s.code,
        name: s.name,
        latitude: s.latitude,
        longitude: s.longitude,
        route_order: idx,
        water_refill_available: s.water_refill_available,
        water_capacity_liters: s.water_capacity_liters,
        operational_status: s.water_refill_available ? 'Operational Refill Hub' : 'Route Halt',
        last_verified: new Date().toISOString(),
        is_source: idx === 0,
        is_destination: idx === stations.length - 1,
      }));

      await ApiClient.saveRoute(selectedTrain, formattedStations, {
        source_code: stations[0].code,
        source_station: stations[0].name,
        destination_code: stations[stations.length - 1].code,
        destination_station: stations[stations.length - 1].name,
      });

      setSuccessMsg(`Route corridor for Train ${selectedTrain} successfully saved and persisted!`);
      if (onRouteSaved) onRouteSaved(selectedTrain);
      await refreshData();
    } catch (err: any) {
      setError(err?.message || 'Failed to save route configuration.');
    } finally {
      setSaving(false);
    }
  };

  // Delete Route
  const handleDeleteRoute = async () => {
    if (!selectedTrain) return;
    if (!window.confirm(`Are you sure you want to remove the route corridor for Train ${selectedTrain}?`)) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await ApiClient.deleteRoute(selectedTrain);
      setStations([]);
      setSuccessMsg(`Route corridor for Train ${selectedTrain} deleted.`);
      if (onRouteSaved) onRouteSaved(selectedTrain);
      await refreshData();
    } catch (err: any) {
      setError(err?.message || 'Failed to delete route.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '780px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
          overflow: 'hidden',
          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
        }}
      >
        {/* Header */}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                backgroundColor: '#EDE9FE',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#7C3AED',
              }}
            >
              <Route size={20} />
            </div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#1E293B' }}>
                Railway Route Configuration
              </div>
              <div style={{ fontSize: '11px', color: '#64748B' }}>
                Configure, import, and persist official railway corridor station halts & geometries
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#94A3B8',
              padding: '4px',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Train Selector & Official Import Bar */}
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid #E2E8F0',
            backgroundColor: '#FFFFFF',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '260px' }}>
            <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', whiteSpace: 'nowrap' }}>
              Select Train:
            </label>
            <select
              value={selectedTrain}
              onChange={(e) => setSelectedTrain(e.target.value)}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                fontSize: '13px',
                fontWeight: 600,
                color: '#0F172A',
                backgroundColor: '#FFFFFF',
                outline: 'none',
              }}
            >
              {configuredTrains.map((t) => (
                <option key={t.train_number} value={t.train_number}>
                  {t.train_number} — {t.name} ({t.region})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleImportOfficialRoute}
            disabled={importing || loading || !selectedTrain}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '6px',
              backgroundColor: '#EDE9FE',
              border: '1px solid #C4B5FD',
              color: '#6D28D9',
              fontSize: '12px',
              fontWeight: 700,
              cursor: importing || loading ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {importing ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            <span>Import Official Railway Route</span>
          </button>
        </div>

        {/* Feedback Toasts */}
        {error && (
          <div
            style={{
              padding: '10px 20px',
              backgroundColor: '#FEF2F2',
              borderBottom: '1px solid #FECACA',
              color: '#DC2626',
              fontSize: '12px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}
        {successMsg && (
          <div
            style={{
              padding: '10px 20px',
              backgroundColor: '#F0FDF4',
              borderBottom: '1px solid #BBF7D0',
              color: '#16A34A',
              fontSize: '12px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <CheckCircle2 size={16} />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Main Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Station Search / Add Bar */}
          <div style={{ position: 'relative' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                backgroundColor: '#F8FAFC',
              }}
            >
              <Search size={16} color="#64748B" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search official station database to add halt (e.g. HWH, Dadar, Asansol, Jodhpur)..."
                style={{
                  flex: 1,
                  border: 'none',
                  backgroundColor: 'transparent',
                  outline: 'none',
                  fontSize: '13px',
                  color: '#0F172A',
                }}
              />
              {searching && <Loader2 size={16} className="animate-spin" color="#64748B" />}
            </div>

            {/* Dropdown Results */}
            {searchResults.length > 0 && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  marginTop: '4px',
                  backgroundColor: '#FFFFFF',
                  borderRadius: '8px',
                  border: '1px solid #E2E8F0',
                  boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
                  maxHeight: '220px',
                  overflowY: 'auto',
                  zIndex: 50,
                }}
              >
                {searchResults.map((st) => (
                  <div
                    key={st.code}
                    onClick={() => handleAddStation(st)}
                    style={{
                      padding: '8px 12px',
                      borderBottom: '1px solid #F1F5F9',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '12px',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F8FAFC')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#FFFFFF')}
                  >
                    <div>
                      <span style={{ fontWeight: 800, color: '#1E293B', marginRight: '6px' }}>{st.code}</span>
                      <span style={{ color: '#475569' }}>{st.name}</span>
                      {st.state && <span style={{ color: '#94A3B8', fontSize: '11px', marginLeft: '6px' }}>({st.state})</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '10px', color: '#64748B', fontFamily: 'monospace' }}>
                        {st.latitude.toFixed(4)}°, {st.longitude.toFixed(4)}°
                      </span>
                      <button
                        style={{
                          background: '#EFF6FF',
                          border: '1px solid #BFDBFE',
                          color: '#2563EB',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        + Add
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Route Summary Metrics Bar */}
          <div
            style={{
              padding: '10px 14px',
              backgroundColor: '#F8FAFC',
              borderRadius: '8px',
              border: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '12px',
            }}
          >
            <div>
              <span style={{ color: '#64748B' }}>Total Halts: </span>
              <span style={{ fontWeight: 800, color: '#0F172A' }}>{stations.length}</span>
              {stations.length >= 2 && (
                <>
                  <span style={{ margin: '0 8px', color: '#CBD5E1' }}>|</span>
                  <span style={{ color: '#64748B' }}>Corridor Distance: </span>
                  <span style={{ fontWeight: 800, color: '#0F172A' }}>~{totalDistanceKm} km</span>
                  <span style={{ margin: '0 8px', color: '#CBD5E1' }}>|</span>
                  <span style={{ color: '#64748B' }}>Origin &rarr; Terminus: </span>
                  <span style={{ fontWeight: 800, color: '#2563EB' }}>
                    {stations[0].code} &rarr; {stations[stations.length - 1].code}
                  </span>
                </>
              )}
            </div>
            {stations.length < 2 && (
              <span style={{ color: '#E11D48', fontWeight: 600, fontSize: '11px' }}>
                Add at least 2 stations to form a route polyline
              </span>
            )}
          </div>

          {/* Stations List Table */}
          <div
            style={{
              borderRadius: '8px',
              border: '1px solid #E2E8F0',
              overflow: 'hidden',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ backgroundColor: '#F1F5F9', borderBottom: '1px solid #CBD5E1', textAlign: 'left' }}>
                  <th style={{ padding: '8px 10px', width: '50px', color: '#475569' }}>#</th>
                  <th style={{ padding: '8px 10px', color: '#475569' }}>Station Code & Name</th>
                  <th style={{ padding: '8px 10px', color: '#475569' }}>Coordinates</th>
                  <th style={{ padding: '8px 10px', color: '#475569', textAlign: 'center' }}>Water Refill</th>
                  <th style={{ padding: '8px 10px', width: '120px', textAlign: 'right', color: '#475569' }}>
                    Reorder / Delete
                  </th>
                </tr>
              </thead>
              <tbody>
                {stations.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: '32px 16px', textAlign: 'center', color: '#94A3B8' }}>
                      No route stations configured yet. Click <strong>Import Official Railway Route</strong> above or search for stations to add halts.
                    </td>
                  </tr>
                ) : (
                  stations.map((s, idx) => {
                    const isSource = idx === 0;
                    const isDest = idx === stations.length - 1;
                    return (
                      <tr
                        key={`${s.code}-${idx}`}
                        style={{
                          borderBottom: '1px solid #F1F5F9',
                          backgroundColor: isSource ? '#F0FDF4' : isDest ? '#FAF5FF' : '#FFFFFF',
                        }}
                      >
                        <td style={{ padding: '8px 10px', fontWeight: 700, color: '#64748B' }}>
                          {idx + 1}
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontWeight: 800, color: '#1E293B' }}>{s.code}</span>
                            <span style={{ color: '#475569' }}>{s.name}</span>
                            {isSource && (
                              <span
                                style={{
                                  backgroundColor: '#DCFCE7',
                                  color: '#15803D',
                                  fontSize: '10px',
                                  fontWeight: 800,
                                  padding: '1px 5px',
                                  borderRadius: '4px',
                                }}
                              >
                                ORIGIN
                              </span>
                            )}
                            {isDest && (
                              <span
                                style={{
                                  backgroundColor: '#EDE9FE',
                                  color: '#6D28D9',
                                  fontSize: '10px',
                                  fontWeight: 800,
                                  padding: '1px 5px',
                                  borderRadius: '4px',
                                }}
                              >
                                TERMINUS
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '8px 10px', fontFamily: 'monospace', color: '#64748B', fontSize: '11px' }}>
                          {s.latitude.toFixed(4)}°, {s.longitude.toFixed(4)}°
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => handleToggleRefill(idx)}
                            style={{
                              padding: '2px 8px',
                              borderRadius: '4px',
                              border: `1px solid ${s.water_refill_available ? '#0284C7' : '#CBD5E1'}`,
                              backgroundColor: s.water_refill_available ? '#E0F2FE' : '#FFFFFF',
                              color: s.water_refill_available ? '#0284C7' : '#94A3B8',
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <Droplets size={12} />
                            <span>{s.water_refill_available ? 'Refill Hub' : 'No Facility'}</span>
                          </button>
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <button
                              type="button"
                              onClick={() => handleMoveUp(idx)}
                              disabled={idx === 0}
                              style={{
                                border: '1px solid #E2E8F0',
                                backgroundColor: idx === 0 ? '#F1F5F9' : '#FFFFFF',
                                color: idx === 0 ? '#CBD5E1' : '#475569',
                                borderRadius: '4px',
                                padding: '3px 5px',
                                cursor: idx === 0 ? 'not-allowed' : 'pointer',
                              }}
                              title="Move Station Up"
                            >
                              <ArrowUp size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveDown(idx)}
                              disabled={idx === stations.length - 1}
                              style={{
                                border: '1px solid #E2E8F0',
                                backgroundColor: idx === stations.length - 1 ? '#F1F5F9' : '#FFFFFF',
                                color: idx === stations.length - 1 ? '#CBD5E1' : '#475569',
                                borderRadius: '4px',
                                padding: '3px 5px',
                                cursor: idx === stations.length - 1 ? 'not-allowed' : 'pointer',
                              }}
                              title="Move Station Down"
                            >
                              <ArrowDown size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveStation(idx)}
                              style={{
                                border: '1px solid #FEE2E2',
                                backgroundColor: '#FEF2F2',
                                color: '#DC2626',
                                borderRadius: '4px',
                                padding: '3px 5px',
                                cursor: 'pointer',
                              }}
                              title="Remove Halt"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer with Actions */}
        <div
          style={{
            padding: '14px 20px',
            borderTop: '1px solid #E2E8F0',
            backgroundColor: '#F8FAFC',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            {stations.length >= 2 && (
              <button
                type="button"
                onClick={handleDeleteRoute}
                disabled={saving || loading}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: '#DC2626',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: '6px 8px',
                }}
              >
                <Trash2 size={14} />
                <span>Clear / Delete Route</span>
              </button>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFFFFF',
                color: '#475569',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveRoute}
              disabled={saving || stations.length < 2}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 20px',
                borderRadius: '6px',
                backgroundColor: stations.length >= 2 ? '#2563EB' : '#94A3B8',
                border: 'none',
                color: '#FFFFFF',
                fontSize: '13px',
                fontWeight: 700,
                cursor: saving || stations.length < 2 ? 'not-allowed' : 'pointer',
                boxShadow: '0 2px 4px rgba(37,99,235,0.2)',
              }}
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              <span>Save & Persist Route</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
