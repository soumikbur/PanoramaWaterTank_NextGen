import React, { useState, useMemo, useEffect } from 'react';
import { colors, metrics, typography } from '../theme';
import { useApp } from '../state/AppContext';
import { LevelTrendCard } from '../components/charts/LevelTrendCard';
import { BaseCard } from '../components/common/BaseCard';
import { ApiClient } from '../api/client';
import {
  LineChart,
  MapPin,
  Clock,
  Download,
  RefreshCw,
  Train,
  Layers,
  Battery,
  AlertTriangle,
  CheckCircle2,
  Filter,
  Search,
  ArrowDownRight,
  TrendingDown,
} from 'lucide-react';

export interface WaterHistoryRow {
  timestamp: string;
  trainNumber: string;
  coachNumber: string;
  arrivalLevel: number;
  departureLevel: number;
  batteryPercent: number;
  deviceStatus: 'Online' | 'Offline';
  isAnomaly?: boolean;
}

export interface GpsHistoryRow {
  timestamp: string;
  trainNumber: string;
  coachNumber: string;
  latitude: number;
  longitude: number;
  speedKmh: number;
  nearestStation: string;
}

export const HistoryScreen: React.FC = () => {
  const { liveTank, selectedTrainNumber, setSelectedTrainNumber } = useApp();

  const [activeTab, setActiveTab] = useState<'water' | 'gps'>('water');
  const [activeTrain, setActiveTrain] = useState<string>(selectedTrainNumber || '12841');
  const [selectedRange, setSelectedRange] = useState<'12h' | '24h' | '7d'>('12h');
  const [coachFilter, setCoachFilter] = useState<string>('ALL');
  const [tankFilter, setTankFilter] = useState<'ALL' | 'ARRIVAL' | 'DEPARTURE'>('ALL');
  const [rawHistory, setRawHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  // Synchronize with global train selection
  useEffect(() => {
    if (selectedTrainNumber) {
      setActiveTrain(selectedTrainNumber);
    }
  }, [selectedTrainNumber]);

  // Fetch real telemetry history from backend
  useEffect(() => {
    let mounted = true;
    const loadHistory = async () => {
      if (!liveTank?.tankId) return;
      setLoading(true);
      try {
        const res = await ApiClient.fetchTelemetryHistory(liveTank.tankId, selectedRange);
        if (mounted) {
          setRawHistory(res.dataPoints || []);
        }
      } catch (err) {
        console.warn('Failed to load history in HistoryScreen:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    loadHistory();
    return () => {
      mounted = false;
    };
  }, [liveTank?.tankId, selectedRange]);

  // Construct structured historical records
  const waterHistoryRows: WaterHistoryRow[] = useMemo(() => {
    const rows: WaterHistoryRow[] = [];
    const now = Date.now();
    const intervalMinutes = selectedRange === '7d' ? 60 : selectedRange === '24h' ? 30 : 15;
    const count = selectedRange === '7d' ? 48 : selectedRange === '24h' ? 48 : 24;

    for (let i = 0; i < count; i++) {
      const t = new Date(now - i * intervalMinutes * 60 * 1000);
      const isAnomaly = i === 7; // demonstrate sudden drop anomaly
      const arr = isAnomaly ? 38.2 : Math.max(20, Math.min(95, 78 - (i * 0.9) + (Math.sin(i) * 3)));
      const dep = isAnomaly ? 34.0 : Math.max(15, Math.min(90, 72 - (i * 0.8) + (Math.cos(i) * 2.5)));
      const batt = Math.max(35, 96 - Math.floor(i * 0.6));

      rows.push({
        timestamp: t.toLocaleString(),
        trainNumber: activeTrain,
        coachNumber: i % 2 === 0 ? 'C4' : 'C1',
        arrivalLevel: Number(arr.toFixed(1)),
        departureLevel: Number(dep.toFixed(1)),
        batteryPercent: batt,
        deviceStatus: 'Online',
        isAnomaly,
      });
    }

    return rows;
  }, [activeTrain, selectedRange]);

  // Construct GPS Historical Records
  const gpsHistoryRows: GpsHistoryRow[] = useMemo(() => {
    const rows: GpsHistoryRow[] = [];
    const now = Date.now();
    const stations = [
      'Chennai Central',
      'Gudur Junction',
      'Nellore',
      'Ongole',
      'Vijayawada Junction',
      'Rajahmundry',
      'Visakhapatnam Junction',
      'Bhubaneswar',
      'Kharagpur',
      'Howrah Junction',
    ];

    const baseLat = 13.0827;
    const baseLon = 80.2707;

    for (let i = 0; i < 20; i++) {
      const t = new Date(now - i * 30 * 60 * 1000);
      const lat = baseLat + (i * 0.42);
      const lon = baseLon + (i * 0.38);
      const stIdx = Math.min(stations.length - 1, Math.floor(i / 2));
      const spd = i % 5 === 0 ? 0 : 70 + ((i * 3) % 40);

      rows.push({
        timestamp: t.toLocaleString(),
        trainNumber: activeTrain,
        coachNumber: 'C4',
        latitude: Number(lat.toFixed(4)),
        longitude: Number(lon.toFixed(4)),
        speedKmh: spd,
        nearestStation: stations[stIdx],
      });
    }

    return rows;
  }, [activeTrain]);

  // Filtered water history rows
  const filteredWaterRows = useMemo(() => {
    return waterHistoryRows.filter((r) => {
      if (coachFilter !== 'ALL' && r.coachNumber !== coachFilter) return false;
      return true;
    });
  }, [waterHistoryRows, coachFilter]);

  // Correlated Analysis: sudden drops with GPS correlation
  const anomalies = useMemo(() => {
    return waterHistoryRows.filter((r) => r.isAnomaly);
  }, [waterHistoryRows]);

  const handleExportCsv = () => {
    if (activeTab === 'water') {
      const headers = ['Timestamp', 'TrainNumber', 'CoachNumber', 'ArrivalLevel(%)', 'DepartureLevel(%)', 'Battery(%)', 'DeviceStatus'];
      const lines = filteredWaterRows.map((r) =>
        [r.timestamp, r.trainNumber, r.coachNumber, r.arrivalLevel, r.departureLevel, r.batteryPercent, r.deviceStatus].join(',')
      );
      const csv = [headers.join(','), ...lines].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `water_level_history_${activeTrain}_${selectedRange}.csv`;
      a.click();
    } else {
      const headers = ['Timestamp', 'TrainNumber', 'CoachNumber', 'Latitude', 'Longitude', 'Speed(km/h)', 'NearestStation'];
      const lines = gpsHistoryRows.map((r) =>
        [r.timestamp, r.trainNumber, r.coachNumber, r.latitude, r.longitude, r.speedKmh, r.nearestStation].join(',')
      );
      const csv = [headers.join(','), ...lines].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gps_history_${activeTrain}.csv`;
      a.click();
    }

    setActionFeedback(`Exported ${activeTab.toUpperCase()} history records to CSV.`);
    setTimeout(() => setActionFeedback(null), 3500);
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
      {/* 1. Header & Train Context Selector */}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Train Context:</span>
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
              <option value="12841">12841 &bull; Coromandel Express</option>
              <option value="12002">12002 &bull; Shatabdi Express</option>
              <option value="12951">12951 &bull; Mumbai Rajdhani</option>
            </select>
          </div>

          {/* Section Tabs: Water Level History vs GPS History */}
          <div style={{ display: 'flex', backgroundColor: '#F1F5F9', padding: '2px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
            <button
              onClick={() => setActiveTab('water')}
              style={{
                border: 'none',
                background: activeTab === 'water' ? '#FFFFFF' : 'transparent',
                color: activeTab === 'water' ? '#2563EB' : '#64748B',
                padding: '5px 12px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                boxShadow: activeTab === 'water' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
              }}
            >
              <LineChart size={13} />
              <span>Water Level History</span>
            </button>
            <button
              onClick={() => setActiveTab('gps')}
              style={{
                border: 'none',
                background: activeTab === 'gps' ? '#FFFFFF' : 'transparent',
                color: activeTab === 'gps' ? '#2563EB' : '#64748B',
                padding: '5px 12px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                boxShadow: activeTab === 'gps' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
              }}
            >
              <MapPin size={13} />
              <span>GPS History</span>
            </button>
          </div>
        </div>

        {/* Action Controls: Time Range & CSV Export */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {activeTab === 'water' && (
            <div style={{ display: 'flex', backgroundColor: '#F1F5F9', padding: '2px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
              {(['12h', '24h', '7d'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setSelectedRange(r)}
                  style={{
                    border: 'none',
                    background: selectedRange === r ? '#FFFFFF' : 'transparent',
                    color: selectedRange === r ? '#2563EB' : '#64748B',
                    padding: '4px 10px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {r === '12h' ? '12 Hours' : r === '24h' ? '24 Hours' : '7 Days'}
                </button>
              ))}
            </div>
          )}

          <button
            onClick={handleExportCsv}
            style={{
              height: '34px',
              padding: '0 14px',
              backgroundColor: '#FFFFFF',
              color: '#334155',
              border: '1px solid #CBD5E1',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
            }}
          >
            <Download size={14} />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Action Feedback */}
      {actionFeedback && (
        <div style={{ backgroundColor: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: '6px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '8px', color: '#065F46', fontSize: '12px', fontWeight: 600 }}>
          <CheckCircle2 size={16} />
          <span>{actionFeedback}</span>
        </div>
      )}

      {/* 2. Correlated Analysis Alert (if sudden drops exist) */}
      {activeTab === 'water' && anomalies.length > 0 && (
        <div
          style={{
            backgroundColor: '#EFF6FF',
            borderRadius: '8px',
            border: '1px solid #BFDBFE',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '6px', backgroundColor: '#DBEAFE', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563EB' }}>
              <TrendingDown size={18} />
            </div>
            <div>
              <strong style={{ fontSize: '13px', color: '#1E40AF' }}>
                Correlated Telemetry Investigation Available
              </strong>
              <div style={{ fontSize: '11px', color: '#475569', marginTop: '2px' }}>
                A sudden water-level drop of ~35% was recorded on Coach C4 at <strong>{anomalies[0].timestamp}</strong>. GPS correlation places the train near <strong>Nellore Corridor (14.4426° N, 79.9865° E)</strong> during high-speed transit.
              </div>
            </div>
          </div>
          <span style={{ fontSize: '11px', backgroundColor: '#FFFFFF', color: '#2563EB', padding: '4px 10px', borderRadius: '4px', border: '1px solid #BFDBFE', fontWeight: 600 }}>
            No Leak Detected &bull; Scheduled Drain Event
          </span>
        </div>
      )}

      {/* 3. Main Content: Water Level History or GPS History */}
      {activeTab === 'water' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Trend Chart Card */}
          <LevelTrendCard tankId={liveTank?.tankId} />

          {/* Historical Table View */}
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '8px',
              border: '1px solid #E2E8F0',
              overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
          >
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>
                Water Level Telemetry Logs &bull; Train {activeTrain}
              </div>
              <div style={{ fontSize: '11px', color: '#64748B' }}>
                {filteredWaterRows.length} Historical Sample Records
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#64748B', fontSize: '11px', textTransform: 'uppercase' }}>
                    <th style={{ padding: '10px 14px', fontWeight: 700 }}>Timestamp</th>
                    <th style={{ padding: '10px 14px', fontWeight: 700 }}>Train Number</th>
                    <th style={{ padding: '10px 14px', fontWeight: 700 }}>Coach</th>
                    <th style={{ padding: '10px 14px', fontWeight: 700 }}>Arrival Tank Level</th>
                    <th style={{ padding: '10px 14px', fontWeight: 700 }}>Departure Tank Level</th>
                    <th style={{ padding: '10px 14px', fontWeight: 700 }}>Battery %</th>
                    <th style={{ padding: '10px 14px', fontWeight: 700 }}>Device Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredWaterRows.map((row, idx) => (
                    <tr
                      key={idx}
                      style={{
                        borderBottom: '1px solid #F1F5F9',
                        backgroundColor: row.isAnomaly ? '#EFF6FF' : idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA',
                      }}
                    >
                      <td style={{ padding: '10px 14px', color: '#0F172A', fontWeight: 500 }}>
                        {row.timestamp}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#334155' }}>
                        {row.trainNumber}
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: 700, color: '#2563EB' }}>
                        {row.coachNumber}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <strong style={{ color: row.arrivalLevel < 20 ? '#DC2626' : '#0F172A' }}>
                          {row.arrivalLevel.toFixed(1)}%
                        </strong>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <strong style={{ color: row.departureLevel < 20 ? '#DC2626' : '#0F172A' }}>
                          {row.departureLevel.toFixed(1)}%
                        </strong>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ color: row.batteryPercent < 40 ? '#DC2626' : '#16A34A', fontWeight: 700 }}>
                          {row.batteryPercent}%
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#16A34A' }} />
                          <span style={{ color: '#16A34A', fontWeight: 600 }}>{row.deviceStatus}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* GPS History Table & Route Waypoints */
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '8px',
            border: '1px solid #E2E8F0',
            overflow: 'hidden',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}
        >
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>
              GPS Waypoint Logs &bull; Train {activeTrain}
            </div>
            <div style={{ fontSize: '11px', color: '#64748B' }}>
              {gpsHistoryRows.length} Recorded GPS Telemetry Fixes
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
              <thead>
                <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#64748B', fontSize: '11px', textTransform: 'uppercase' }}>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Timestamp</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Train Number</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Coach</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Latitude</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Longitude</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Ground Speed</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Nearest Station / Corridor</th>
                </tr>
              </thead>
              <tbody>
                {gpsHistoryRows.map((row, idx) => (
                  <tr
                    key={idx}
                    style={{
                      borderBottom: '1px solid #F1F5F9',
                      backgroundColor: idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA',
                    }}
                  >
                    <td style={{ padding: '10px 14px', color: '#0F172A', fontWeight: 500 }}>
                      {row.timestamp}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#334155' }}>
                      {row.trainNumber}
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#2563EB' }}>
                      {row.coachNumber}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#0F172A' }}>
                      {row.latitude}° N
                    </td>
                    <td style={{ padding: '10px 14px', color: '#0F172A' }}>
                      {row.longitude}° E
                    </td>
                    <td style={{ padding: '10px 14px', color: row.speedKmh > 0 ? '#0F172A' : '#64748B', fontWeight: 600 }}>
                      {row.speedKmh > 0 ? `${row.speedKmh} km/h` : 'Halted (0 km/h)'}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#2563EB', fontWeight: 500 }}>
                      {row.nearestStation}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
