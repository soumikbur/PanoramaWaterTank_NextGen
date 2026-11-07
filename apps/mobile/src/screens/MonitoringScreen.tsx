import React, { useState, useMemo } from 'react';
import { typography } from '../theme';
import { useApp } from '../state/AppContext';
import { TankLiveStatus } from '../types';
import { TankVisualization } from '../components/tank/TankVisualization';
import {
  Activity,
  Gauge,
  Battery,
  BatteryWarning,
  Search,
  Filter,
  Train,
  Layers,
  MapPin,
  Clock,
  Radio,
  CheckCircle2,
  AlertTriangle,
  X,
  ExternalLink,
  Table as TableIcon,
  LayoutGrid,
} from 'lucide-react';

export interface MonitoringRow {
  trainNumber: string;
  trainName: string;
  coachNumber: string;
  coachType: string;
  deviceCode: string;
  isOnline: boolean;
  batteryPercent: number;
  arrivalLevel: number | null;
  arrivalHeightCm: number | null;
  arrivalStatus: 'NORMAL' | 'WARNING' | 'CRITICAL' | 'STALE' | 'NO_DATA';
  departureLevel: number | null;
  departureHeightCm: number | null;
  departureStatus: 'NORMAL' | 'WARNING' | 'CRITICAL' | 'STALE' | 'NO_DATA';
  gpsCoordinates: string;
  hasGps: boolean;
  lastCommunication: string;
  isDemo?: boolean;
}

export const MonitoringScreen: React.FC = () => {
  const { liveTank, tanks, devices, selectedTrainNumber, setSelectedTrainNumber, setActiveScreen, liveTelemetry } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'ALL' | 'ONLINE' | 'LOW_WATER' | 'LOW_BATTERY'>('ALL');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('table');
  const [inspectModalRow, setInspectModalRow] = useState<MonitoringRow | null>(null);

  // Build authoritative fleet monitoring dataset
  const fleetData: MonitoringRow[] = useMemo(() => {
    const list: MonitoringRow[] = [];

    // 1. Live MQTT Telemetry Train & Coach
    if (liveTelemetry) {
      const liveArrPct = typeof liveTelemetry.cm1 === 'number' ? Number(((liveTelemetry.cm1 / 150.0) * 100).toFixed(1)) : liveTelemetry.wlp1;
      const liveDepPct = typeof liveTelemetry.cm2 === 'number' ? Number(((liveTelemetry.cm2 / 150.0) * 100).toFixed(1)) : liveTelemetry.wlp2;

      list.push({
        trainNumber: liveTelemetry.trno,
        trainName: `Special Express (${liveTelemetry.trno})`,
        coachNumber: liveTelemetry.chno,
        coachType: 'AC 2-Tier',
        deviceCode: liveTelemetry.uid,
        isOnline: !liveTelemetry.isStale,
        batteryPercent: liveTelemetry.bat,
        arrivalLevel: liveArrPct,
        arrivalHeightCm: liveTelemetry.cm1,
        arrivalStatus: !liveTelemetry.wlv1 ? 'WARNING' : (liveArrPct != null && liveArrPct < 20 ? 'CRITICAL' : 'NORMAL'),
        departureLevel: liveDepPct,
        departureHeightCm: liveTelemetry.cm2,
        departureStatus: !liveTelemetry.wlv2 ? 'WARNING' : (liveDepPct != null && liveDepPct < 20 ? 'CRITICAL' : 'NORMAL'),
        gpsCoordinates: liveTelemetry.lat != null ? `${liveTelemetry.lat.toFixed(4)}° N, ${liveTelemetry.long?.toFixed(4)}° E` : 'Awaiting Fix',
        hasGps: liveTelemetry.lat != null,
        lastCommunication: liveTelemetry.time,
        isDemo: false,
      });
    }

    // 2. Real Backend Fleet Devices
    devices.forEach((d) => {
      if (liveTelemetry && d.uid === liveTelemetry.uid) return;
      const arrLvl = liveTank?.levelPercent ?? d.primaryLevel ?? null;
      const depLvl = d.secondaryLevel ?? null;
      const batt = d.batteryPercent ?? 85;

      list.push({
        trainNumber: d.trainNumber || '225256',
        trainName: `Express ${d.trainNumber || '225256'}`,
        coachNumber: d.coachNumber || 'C1',
        coachType: 'Standard Coach',
        deviceCode: d.uid,
        isOnline: d.isOnline,
        batteryPercent: batt,
        arrivalLevel: arrLvl,
        arrivalHeightCm: arrLvl ? (arrLvl / 100) * 50 : null,
        arrivalStatus: arrLvl != null && arrLvl < 20 ? 'CRITICAL' : 'NORMAL',
        departureLevel: depLvl,
        departureHeightCm: depLvl ? (depLvl / 100) * 50 : null,
        departureStatus: depLvl != null && depLvl < 20 ? 'CRITICAL' : 'NORMAL',
        gpsCoordinates: liveTank?.latitude ? `${liveTank.latitude.toFixed(4)}°, ${liveTank.longitude?.toFixed(4)}°` : 'Corridor GPS',
        hasGps: Boolean(liveTank?.latitude),
        lastCommunication: d.lastHeartbeat ? new Date(d.lastHeartbeat).toLocaleTimeString() : 'Live Stream',
        isDemo: false,
      });
    });

    return list;
  }, [liveTank, tanks, devices, liveTelemetry]);

  // Filtered rows
  const filteredRows = useMemo(() => {
    return fleetData.filter((r) => {
      // Filter tab
      if (filterMode === 'ONLINE' && !r.isOnline) return false;
      if (filterMode === 'LOW_WATER') {
        const isLowWater = (r.arrivalLevel != null && r.arrivalLevel < 20) || (r.departureLevel != null && r.departureLevel < 20);
        if (!isLowWater) return false;
      }
      if (filterMode === 'LOW_BATTERY' && r.batteryPercent >= 40) return false;

      // Search input
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const mTrain = r.trainNumber.toLowerCase().includes(q) || r.trainName.toLowerCase().includes(q);
        const mCoach = r.coachNumber.toLowerCase().includes(q);
        const mDev = r.deviceCode.toLowerCase().includes(q);
        if (!mTrain && !mCoach && !mDev) return false;
      }
      return true;
    });
  }, [fleetData, filterMode, searchQuery]);

  // Metrics
  const totalCoaches = fleetData.length;
  const onlineCount = fleetData.filter((r) => r.isOnline).length;
  const lowWaterCount = fleetData.filter((r) => (r.arrivalLevel != null && r.arrivalLevel < 20) || (r.departureLevel != null && r.departureLevel < 20)).length;
  const lowBatteryCount = fleetData.filter((r) => r.batteryPercent < 40).length;

  // Build dual tank models for quick inspection modal
  const arrivalInspectTank: TankLiveStatus | null = useMemo(() => {
    if (!inspectModalRow) return null;
    return {
      tankId: `${inspectModalRow.coachNumber}-arrival`,
      tankIndex: 1,
      deviceId: inspectModalRow.deviceCode,
      deviceUid: inspectModalRow.deviceCode,
      trainNumber: inspectModalRow.trainNumber,
      coachNumber: inspectModalRow.coachNumber,
      tankName: 'Arrival Tank',
      capacityLiters: 20.0,
      maxHeightCm: 50.0,
      crossSectionalAreaM2: 0.04,
      levelPercent: inspectModalRow.arrivalLevel,
      rawLevelPercent: inspectModalRow.arrivalLevel,
      volumeLiters: inspectModalRow.arrivalLevel ? (inspectModalRow.arrivalLevel / 100) * 20 : null,
      heightCm: inspectModalRow.arrivalHeightCm,
      rank: inspectModalRow.arrivalLevel && inspectModalRow.arrivalLevel < 20 ? 'LOW' : 'GOOD',
      alarmStatus: inspectModalRow.arrivalStatus === 'CRITICAL' ? 'CRITICAL_LOW' : 'NORMAL',
      batteryVoltage: 3.9,
      temperature: 28.5,
      isOnline: inspectModalRow.isOnline,
      hasTelemetry: inspectModalRow.arrivalLevel != null,
      isStale: false,
      lastUpdate: new Date().toISOString(),
    };
  }, [inspectModalRow]);

  const departureInspectTank: TankLiveStatus | null = useMemo(() => {
    if (!inspectModalRow) return null;
    return {
      tankId: `${inspectModalRow.coachNumber}-departure`,
      tankIndex: 2,
      deviceId: inspectModalRow.deviceCode,
      deviceUid: inspectModalRow.deviceCode,
      trainNumber: inspectModalRow.trainNumber,
      coachNumber: inspectModalRow.coachNumber,
      tankName: 'Departure Tank',
      capacityLiters: 20.0,
      maxHeightCm: 50.0,
      crossSectionalAreaM2: 0.04,
      levelPercent: inspectModalRow.departureLevel,
      rawLevelPercent: inspectModalRow.departureLevel,
      volumeLiters: inspectModalRow.departureLevel ? (inspectModalRow.departureLevel / 100) * 20 : null,
      heightCm: inspectModalRow.departureHeightCm,
      rank: inspectModalRow.departureLevel && inspectModalRow.departureLevel < 20 ? 'LOW' : 'GOOD',
      alarmStatus: inspectModalRow.departureStatus === 'CRITICAL' ? 'CRITICAL_LOW' : 'NORMAL',
      batteryVoltage: 3.9,
      temperature: 28.5,
      isOnline: inspectModalRow.isOnline,
      hasTelemetry: inspectModalRow.departureLevel != null,
      isStale: false,
      lastUpdate: new Date().toISOString(),
    };
  }, [inspectModalRow]);

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
      {/* 1. Summary Metrics Strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: '12px',
        }}
      >
        <div style={{ backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: '#EFF6FF', border: '1px solid #BFDBFE', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563EB' }}>
            <Layers size={22} />
          </div>
          <div>
            <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>Monitored Coaches</div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>{totalCoaches}</div>
          </div>
        </div>

        <div style={{ backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16A34A' }}>
            <Radio size={22} />
          </div>
          <div>
            <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>Online Streams</div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#16A34A', marginTop: '2px' }}>{onlineCount} Active</div>
          </div>
        </div>

        <div style={{ backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#DC2626' }}>
            <Gauge size={22} />
          </div>
          <div>
            <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>Low Water (&lt;20%)</div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: lowWaterCount > 0 ? '#DC2626' : '#16A34A', marginTop: '2px' }}>
              {lowWaterCount} Warning
            </div>
          </div>
        </div>

        <div
          style={{
            backgroundColor: lowBatteryCount > 0 ? '#FEF2F2' : '#FFFFFF',
            borderRadius: '8px',
            border: lowBatteryCount > 0 ? '2px solid #EF4444' : '1px solid #E2E8F0',
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
              backgroundColor: lowBatteryCount > 0 ? '#DC2626' : '#EFF6FF',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {lowBatteryCount > 0 ? <BatteryWarning size={22} /> : <Battery size={22} color="#2563EB" />}
          </div>
          <div>
            <div style={{ fontSize: '11px', color: lowBatteryCount > 0 ? '#991B1B' : '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
              Battery Alert (&lt;40%)
            </div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: lowBatteryCount > 0 ? '#DC2626' : '#16A34A', marginTop: '2px' }}>
              {lowBatteryCount > 0 ? `${lowBatteryCount} CRITICAL` : 'All Nominal'}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Control Bar: Filter Tabs & Search */}
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
            {[
              { id: 'ALL', label: 'All Fleet Coaches' },
              { id: 'ONLINE', label: 'Online Streams' },
              { id: 'LOW_WATER', label: 'Water Alerts (<20%)' },
              { id: 'LOW_BATTERY', label: 'Battery Alerts (<40%)' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilterMode(tab.id as any)}
                style={{
                  border: 'none',
                  background: filterMode === tab.id ? '#FFFFFF' : 'transparent',
                  color: filterMode === tab.id ? '#2563EB' : '#64748B',
                  padding: '5px 12px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: filterMode === tab.id ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                }}
              >
                {tab.label}
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
              placeholder="Search train, coach, device..."
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

        {/* View Mode Toggle */}
        <div style={{ display: 'flex', backgroundColor: '#F1F5F9', padding: '2px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
          <button
            onClick={() => setViewMode('table')}
            style={{
              border: 'none',
              background: viewMode === 'table' ? '#FFFFFF' : 'transparent',
              color: viewMode === 'table' ? '#2563EB' : '#64748B',
              padding: '4px 10px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <TableIcon size={13} />
            <span>SCADA Table</span>
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
            }}
          >
            <LayoutGrid size={13} />
            <span>Card Grid</span>
          </button>
        </div>
      </div>

      {/* 3. Monitoring Content: SCADA Table or Card Grid */}
      {viewMode === 'table' ? (
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '8px',
            border: '1px solid #E2E8F0',
            overflow: 'hidden',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}
        >
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
              <thead>
                <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#64748B', fontSize: '11px', textTransform: 'uppercase' }}>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Train / Coach</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Assigned Device</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Link Status</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Battery Alert</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Arrival Tank (S1)</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Departure Tank (S2)</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>GPS Position</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Last Update</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, idx) => {
                  const isBatteryLow = row.batteryPercent < 40;
                  const isArrLow = row.arrivalLevel != null && row.arrivalLevel < 20;
                  const isDepLow = row.departureLevel != null && row.departureLevel < 20;

                  return (
                    <tr
                      key={`${row.trainNumber}-${row.coachNumber}-${idx}`}
                      style={{
                        borderBottom: '1px solid #F1F5F9',
                        backgroundColor: isBatteryLow ? '#FEF2F2' : idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA',
                        transition: 'background-color 0.1s ease',
                      }}
                    >
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 700, color: '#0F172A' }}>
                          Coach {row.coachNumber}
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748B' }}>
                          {row.trainNumber} &bull; {row.trainName}
                        </div>
                      </td>

                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 600, color: '#0F172A' }}>{row.deviceCode}</div>
                        <div style={{ fontSize: '11px', color: '#64748B' }}>{row.coachType}</div>
                      </td>

                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <div style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: row.isOnline ? '#16A34A' : '#DC2626' }} />
                          <span style={{ fontWeight: 600, color: row.isOnline ? '#16A34A' : '#DC2626' }}>
                            {row.isOnline ? 'Online' : 'Offline'}
                          </span>
                        </div>
                      </td>

                      {/* Battery Alert Column with <40% Warning */}
                      <td style={{ padding: '12px 14px' }}>
                        <div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            backgroundColor: isBatteryLow ? '#DC2626' : '#EFF6FF',
                            color: isBatteryLow ? '#FFFFFF' : '#1E40AF',
                            fontWeight: 700,
                            fontSize: '11px',
                          }}
                        >
                          {isBatteryLow ? <BatteryWarning size={13} /> : <Battery size={13} />}
                          <span>{row.batteryPercent}%</span>
                        </div>
                        {isBatteryLow && (
                          <div style={{ fontSize: '9px', fontWeight: 700, color: '#DC2626', marginTop: '2px' }}>
                            LOW BATTERY &lt;40%
                          </div>
                        )}
                      </td>

                      {/* Arrival Tank (Sensor 1) */}
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '60px', height: '8px', backgroundColor: '#E2E8F0', borderRadius: '4px', overflow: 'hidden' }}>
                            <div
                              style={{
                                width: `${Math.max(0, Math.min(100, row.arrivalLevel || 0))}%`,
                                height: '100%',
                                backgroundColor: isArrLow ? '#EF4444' : '#2563EB',
                              }}
                            />
                          </div>
                          <div>
                            <strong style={{ color: isArrLow ? '#DC2626' : '#0F172A' }}>
                              {row.arrivalLevel != null ? `${row.arrivalLevel.toFixed(1)}%` : '—'}
                            </strong>
                            {row.arrivalHeightCm != null && (
                              <span style={{ fontSize: '10px', color: '#64748B', marginLeft: '4px' }}>
                                ({row.arrivalHeightCm.toFixed(1)} cm)
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Departure Tank (Sensor 2) */}
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '60px', height: '8px', backgroundColor: '#E2E8F0', borderRadius: '4px', overflow: 'hidden' }}>
                            <div
                              style={{
                                width: `${Math.max(0, Math.min(100, row.departureLevel || 0))}%`,
                                height: '100%',
                                backgroundColor: isDepLow ? '#EF4444' : '#0284C7',
                              }}
                            />
                          </div>
                          <div>
                            <strong style={{ color: isDepLow ? '#DC2626' : '#0F172A' }}>
                              {row.departureLevel != null ? `${row.departureLevel.toFixed(1)}%` : '—'}
                            </strong>
                            {row.departureHeightCm != null && (
                              <span style={{ fontSize: '10px', color: '#64748B', marginLeft: '4px' }}>
                                ({row.departureHeightCm.toFixed(1)} cm)
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td style={{ padding: '12px 14px', color: '#475569', fontSize: '11px' }}>
                        {row.gpsCoordinates}
                      </td>

                      <td style={{ padding: '12px 14px', color: '#64748B', fontSize: '11px' }}>
                        {row.lastCommunication}
                      </td>

                      <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                        <button
                          onClick={() => setInspectModalRow(row)}
                          style={{
                            padding: '4px 10px',
                            backgroundColor: '#EFF6FF',
                            border: '1px solid #BFDBFE',
                            borderRadius: '4px',
                            color: '#2563EB',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          Inspect Tanks
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Card Grid View */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '14px' }}>
          {filteredRows.map((row, idx) => {
            const isBatteryLow = row.batteryPercent < 40;
            const isArrLow = row.arrivalLevel != null && row.arrivalLevel < 20;
            const isDepLow = row.departureLevel != null && row.departureLevel < 20;

            return (
              <div
                key={`${row.trainNumber}-${row.coachNumber}-${idx}`}
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: '8px',
                  border: isBatteryLow ? '2px solid #EF4444' : '1px solid #E2E8F0',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <span style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>
                      Coach {row.coachNumber} &bull; {row.trainNumber}
                    </span>
                    <div style={{ fontSize: '11px', color: '#64748B' }}>{row.trainName} ({row.coachType})</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <div style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: row.isOnline ? '#16A34A' : '#DC2626' }} />
                    <span style={{ fontSize: '11px', fontWeight: 700, color: row.isOnline ? '#16A34A' : '#DC2626' }}>
                      {row.isOnline ? 'Online' : 'Offline'}
                    </span>
                  </div>
                </div>

                {/* Battery Alert Banner */}
                <div
                  style={{
                    backgroundColor: isBatteryLow ? '#FEF2F2' : '#F8FAFC',
                    border: `1px solid ${isBatteryLow ? '#FCA5A5' : '#E2E8F0'}`,
                    borderRadius: '6px',
                    padding: '6px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: isBatteryLow ? '#DC2626' : '#16A34A', fontWeight: 700, fontSize: '11px' }}>
                    {isBatteryLow ? <BatteryWarning size={14} /> : <Battery size={14} />}
                    <span>Battery Status: {row.batteryPercent}%</span>
                  </div>
                  {isBatteryLow && (
                    <span style={{ backgroundColor: '#DC2626', color: '#FFFFFF', fontSize: '9px', fontWeight: 800, padding: '1px 5px', borderRadius: '3px' }}>
                      &lt;40% LOW
                    </span>
                  )}
                </div>

                {/* Dual Tank Progress Mini-Bars */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', backgroundColor: '#F8FAFC', padding: '10px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px' }}>
                      <span style={{ color: '#475569', fontWeight: 600 }}>Arrival Tank (Sensor 1):</span>
                      <strong style={{ color: isArrLow ? '#DC2626' : '#0F172A' }}>
                        {row.arrivalLevel != null ? `${row.arrivalLevel.toFixed(1)}%` : 'Awaiting'}
                      </strong>
                    </div>
                    <div style={{ height: '7px', backgroundColor: '#E2E8F0', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${Math.max(0, Math.min(100, row.arrivalLevel || 0))}%`, height: '100%', backgroundColor: isArrLow ? '#EF4444' : '#2563EB' }} />
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px' }}>
                      <span style={{ color: '#475569', fontWeight: 600 }}>Departure Tank (Sensor 2):</span>
                      <strong style={{ color: isDepLow ? '#DC2626' : '#0F172A' }}>
                        {row.departureLevel != null ? `${row.departureLevel.toFixed(1)}%` : 'Awaiting'}
                      </strong>
                    </div>
                    <div style={{ height: '7px', backgroundColor: '#E2E8F0', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${Math.max(0, Math.min(100, row.departureLevel || 0))}%`, height: '100%', backgroundColor: isDepLow ? '#EF4444' : '#0284C7' }} />
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #F1F5F9', paddingTop: '8px', fontSize: '11px', color: '#64748B' }}>
                  <span>{row.deviceCode}</span>
                  <button
                    onClick={() => setInspectModalRow(row)}
                    style={{
                      padding: '4px 10px',
                      backgroundColor: '#EFF6FF',
                      border: '1px solid #BFDBFE',
                      borderRadius: '4px',
                      color: '#2563EB',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Inspect Dual Tanks
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL: Dual Tank Inspection Modal */}
      {inspectModalRow && (
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
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F8FAFC' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0F172A' }}>
                  Coach {inspectModalRow.coachNumber} &bull; Dual Water Tank Monitoring ({inspectModalRow.trainNumber})
                </h3>
                <span style={{ fontSize: '11px', color: '#64748B' }}>
                  Device: {inspectModalRow.deviceCode} (Battery: {inspectModalRow.batteryPercent}%) &bull; Sensor 1 = Arrival Tank, Sensor 2 = Departure Tank
                </span>
              </div>
              <button onClick={() => setInspectModalRow(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}>
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
                <TankVisualization tank={arrivalInspectTank} />
              </div>

              <div>
                <div style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ backgroundColor: '#EFF6FF', color: '#2563EB', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>
                    Sensor 2
                  </span>
                  <strong style={{ fontSize: '14px', color: '#0F172A' }}>Departure Tank</strong>
                </div>
                <TankVisualization tank={departureInspectTank} />
              </div>
            </div>

            <div style={{ padding: '12px 20px', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'flex-end', backgroundColor: '#F8FAFC' }}>
              <button
                onClick={() => setInspectModalRow(null)}
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
