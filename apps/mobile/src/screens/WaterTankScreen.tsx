import React, { useState, useMemo } from 'react';
import { colors, metrics, typography } from '../theme';
import { useApp } from '../state/AppContext';
import { TankLiveStatus } from '../types';
import { TankVisualization } from '../components/tank/TankVisualization';
import { LevelTrendCard } from '../components/charts/LevelTrendCard';
import { BaseCard } from '../components/common/BaseCard';
import { InfoRow } from '../components/common/InfoRow';
import {
  LayoutGrid,
  List,
  Search,
  RefreshCw,
  Gauge,
  AlertTriangle,
  CheckCircle2,
  Clock,
  X,
  Droplets,
  Wifi,
  WifiOff,
  ChevronRight,
  Layers,
  Activity,
  ShieldAlert
} from 'lucide-react';

export const WaterTankScreen: React.FC = () => {
  const { tanks, liveTank, connectionStatus, refreshData, selectedTankId: contextTankId, setSelectedTankId: setContextTankId } = useApp();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'ONLINE' | 'OFFLINE' | 'LOW_LEVEL'>('ALL');
  const [selectedTankId, setSelectedTankId] = useState<string | null>(contextTankId || null);

  useEffect(() => {
    if (contextTankId) {
      setSelectedTankId(contextTankId);
    }
  }, [contextTankId]);

  // Fallback to liveTank if tanks array is initially empty
  const allTanks: TankLiveStatus[] = useMemo(() => {
    if (tanks && tanks.length > 0) return tanks;
    if (liveTank) return [liveTank];
    return [];
  }, [tanks, liveTank]);

  // Filter and search logic
  const filteredTanks = useMemo(() => {
    return allTanks.filter((t) => {
      // Search query
      if (searchQuery.trim().length > 0) {
        const q = searchQuery.toLowerCase();
        const matchName = t.tankName.toLowerCase().includes(q);
        const matchCoach = t.coachNumber.toLowerCase().includes(q);
        const matchTrain = t.trainNumber.toLowerCase().includes(q);
        const matchId = t.tankId.toLowerCase().includes(q);
        const matchUid = t.deviceUid.toLowerCase().includes(q);
        if (!matchName && !matchCoach && !matchTrain && !matchId && !matchUid) return false;
      }

      // Filter tabs
      if (activeFilter === 'ONLINE') {
        return t.isOnline;
      }
      if (activeFilter === 'OFFLINE') {
        return !t.isOnline;
      }
      if (activeFilter === 'LOW_LEVEL') {
        return t.hasTelemetry && t.levelPercent != null && t.levelPercent < 20.0;
      }
      return true;
    });
  }, [allTanks, searchQuery, activeFilter]);

  // Selected tank for detailed drawer
  const selectedTank = useMemo(() => {
    if (!selectedTankId) return null;
    return allTanks.find((t) => t.tankId === selectedTankId) || null;
  }, [allTanks, selectedTankId]);

  // Aggregate metrics
  const totalTanks = allTanks.length;
  const onlineTanks = allTanks.filter((t) => t.isOnline).length;
  const offlineTanks = totalTanks - onlineTanks;
  const lowLevelTanks = allTanks.filter(
    (t) => t.hasTelemetry && t.levelPercent != null && t.levelPercent < 20.0
  ).length;

  const validLevels = allTanks
    .filter((t) => t.hasTelemetry && t.levelPercent != null)
    .map((t) => t.levelPercent as number);
  const avgLevel = validLevels.length > 0
    ? (validLevels.reduce((a, b) => a + b, 0) / validLevels.length).toFixed(1)
    : '—';

  return (
    <div style={{ position: 'relative', width: '100%', display: 'flex', flexDirection: 'column', gap: metrics.space16 }}>
      {/* Scrollable Container with Right Margin when Drawer is open */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: metrics.space16,
          marginRight: selectedTank ? '480px' : '0',
          transition: 'margin-right 250ms ease-out',
        }}
      >
        {/* 1. Header with Title & Aggregate Cards */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold', color: '#0F172A', fontFamily: typography.fontFamily }}>
              All Tanks
            </h1>
            <p style={{ margin: '2px 0 0 0', fontSize: '14px', color: '#64748B', fontFamily: typography.fontFamily }}>
              Fleet-wide water reservoir levels, capacity calculations, and sensor health
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* View Mode Toggle */}
            <div style={{ display: 'flex', backgroundColor: '#F1F5F9', borderRadius: '6px', padding: '2px', border: '1px solid #CBD5E1' }}>
              <button
                onClick={() => setViewMode('grid')}
                title="Grid View"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  borderRadius: '4px',
                  border: 'none',
                  backgroundColor: viewMode === 'grid' ? '#FFFFFF' : 'transparent',
                  color: viewMode === 'grid' ? '#0F172A' : '#64748B',
                  fontWeight: viewMode === 'grid' ? 700 : 500,
                  fontSize: '12px',
                  cursor: 'pointer',
                  boxShadow: viewMode === 'grid' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}
              >
                <LayoutGrid size={14} />
                <span>Grid</span>
              </button>
              <button
                onClick={() => setViewMode('list')}
                title="List View"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  borderRadius: '4px',
                  border: 'none',
                  backgroundColor: viewMode === 'list' ? '#FFFFFF' : 'transparent',
                  color: viewMode === 'list' ? '#0F172A' : '#64748B',
                  fontWeight: viewMode === 'list' ? 700 : 500,
                  fontSize: '12px',
                  cursor: 'pointer',
                  boxShadow: viewMode === 'list' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}
              >
                <List size={14} />
                <span>List</span>
              </button>
            </div>

            <button
              onClick={() => refreshData()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFFFFF',
                color: '#334155',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <RefreshCw size={13} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* 2. Top Metric KPI Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
          <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: '#EFF6FF', display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center', color: '#2563EB' }}>
              <Droplets size={20} />
            </div>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748B' }}>TOTAL TANKS</div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A' }}>{totalTanks}</div>
            </div>
          </div>

          <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: '#ECFDF5', display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center', color: '#16A34A' }}>
              <Wifi size={20} />
            </div>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748B' }}>ONLINE</div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#16A34A' }}>{onlineTanks}</div>
            </div>
          </div>

          <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: '#F8FAFC', display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center', color: '#64748B' }}>
              <WifiOff size={20} />
            </div>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748B' }}>OFFLINE</div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: offlineTanks > 0 ? '#DC2626' : '#64748B' }}>{offlineTanks}</div>
            </div>
          </div>

          <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: '#FFFBEB', display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center', color: '#D97706' }}>
              <AlertTriangle size={20} />
            </div>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748B' }}>LOW LEVEL (&lt;20%)</div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: lowLevelTanks > 0 ? '#D97706' : '#0F172A' }}>{lowLevelTanks}</div>
            </div>
          </div>
        </div>

        {/* 3. Search Bar and Filter Tabs */}
        <BaseCard style={{ padding: '12px', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            {/* Search Input */}
            <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
              <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
              <input
                type="text"
                placeholder="Search by tank ID, coach (e.g. B4), train, or device..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px 8px 34px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  fontSize: '13px',
                  fontFamily: typography.fontFamily,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Filter Tabs */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {[
                { id: 'ALL', label: 'All Tanks' },
                { id: 'ONLINE', label: 'Online' },
                { id: 'OFFLINE', label: 'Offline' },
                { id: 'LOW_LEVEL', label: 'Low Level (<20%)' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveFilter(tab.id as any)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: activeFilter === tab.id ? '1px solid #2563EB' : '1px solid #CBD5E1',
                    backgroundColor: activeFilter === tab.id ? '#EFF6FF' : '#FFFFFF',
                    color: activeFilter === tab.id ? '#2563EB' : '#475569',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </BaseCard>

        {/* 4. Main Tanks Display (Grid or List) */}
        {filteredTanks.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
            <Droplets size={36} color="#94A3B8" style={{ margin: '0 auto 8px auto' }} />
            <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', color: '#0F172A' }}>No tanks match your search or filter</h3>
            <p style={{ margin: 0, fontSize: '13px', color: '#64748B' }}>Try adjusting your filters or search terms.</p>
          </div>
        ) : viewMode === 'grid' ? (
          /* Grid View */
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
            {filteredTanks.map((tank) => {
              const hasData = tank.hasTelemetry && tank.levelPercent != null;
              const level = tank.levelPercent ?? null;
              const height = tank.heightCm ?? null;
              const maxHeight = tank.maxHeightCm || 50.0;
              const volume = tank.volumeLiters ?? null;
              const capacity = tank.capacityLiters || 20.0;
              const isSelected = selectedTankId === tank.tankId;

              // Color for level bar
              const barColor = !hasData || !tank.isOnline
                ? '#CBD5E1'
                : level! < 15.0
                ? '#DC2626'
                : level! < 35.0
                ? '#D97706'
                : '#16A34A';

              return (
                <div
                  key={tank.tankId}
                  onClick={() => setSelectedTankId(tank.tankId)}
                  style={{
                    backgroundColor: '#FFFFFF',
                    border: `1.5px solid ${isSelected ? '#2563EB' : '#E2E8F0'}`,
                    borderRadius: '8px',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    cursor: 'pointer',
                    boxShadow: isSelected ? '0 0 0 2px rgba(37, 99, 235, 0.15)' : '0 1px 3px rgba(0,0,0,0.03)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {/* Card Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>{tank.tankName}</span>
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                        Coach <strong>{tank.coachNumber}</strong> • Train <strong>{tank.trainNumber}</strong>
                      </div>
                    </div>

                    {/* Status Pill */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '12px',
                          backgroundColor: !tank.isOnline
                            ? '#F1F5F9'
                            : tank.alarmStatus === 'CRITICAL'
                            ? '#FEF2F2'
                            : tank.alarmStatus === 'WARNING'
                            ? '#FFFBEB'
                            : '#ECFDF5',
                          color: !tank.isOnline
                            ? '#64748B'
                            : tank.alarmStatus === 'CRITICAL'
                            ? '#DC2626'
                            : tank.alarmStatus === 'WARNING'
                            ? '#D97706'
                            : '#16A34A',
                        }}
                      >
                        {!tank.isOnline ? 'OFFLINE' : tank.alarmStatus === 'STALE_DATA' ? 'STALE' : tank.alarmStatus}
                      </span>
                    </div>
                  </div>

                  {/* Visual Progress Bar */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                      <span style={{ color: '#64748B', fontWeight: 500 }}>Water Level</span>
                      <strong style={{ color: '#0F172A' }}>{hasData ? `${level!.toFixed(1)}%` : '—'}</strong>
                    </div>
                    <div style={{ height: '8px', backgroundColor: '#F1F5F9', borderRadius: '4px', overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          width: hasData ? `${Math.min(100, Math.max(0, level!))}%` : '0%',
                          backgroundColor: barColor,
                          borderRadius: '4px',
                          transition: 'width 0.4s ease',
                        }}
                      />
                    </div>
                  </div>

                  {/* Metric Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', backgroundColor: '#F8FAFC', padding: '10px', borderRadius: '6px' }}>
                    <div>
                      <div style={{ fontSize: '11px', color: '#64748B' }}>HEIGHT</div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>
                        {height != null ? `${height.toFixed(1)} cm` : '—'}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: '#64748B' }}>VOLUME</div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>
                        {volume != null ? `${volume.toFixed(1)} L` : '—'}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: '#64748B' }}>CAPACITY</div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>
                        {capacity.toFixed(0)} L
                      </div>
                    </div>
                  </div>

                  {/* Card Footer: Timestamp + Inspect Action */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#94A3B8', borderTop: '1px solid #F1F5F9', paddingTop: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Clock size={12} />
                      <span>{tank.lastUpdate ? new Date(tank.lastUpdate).toLocaleTimeString() : 'Awaiting Telemetry'}</span>
                    </div>
                    <span style={{ color: '#2563EB', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '2px' }}>
                      Inspect <ChevronRight size={13} />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* List / Table View */
          <BaseCard style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px', fontFamily: typography.fontFamily }}>
                <thead>
                  <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <th style={{ padding: '12px 16px' }}>Tank Name / ID</th>
                    <th style={{ padding: '12px 16px' }}>Coach &amp; Train</th>
                    <th style={{ padding: '12px 16px' }}>Status</th>
                    <th style={{ padding: '12px 16px' }}>Level (%)</th>
                    <th style={{ padding: '12px 16px' }}>Height (cm)</th>
                    <th style={{ padding: '12px 16px' }}>Volume (L)</th>
                    <th style={{ padding: '12px 16px' }}>Capacity</th>
                    <th style={{ padding: '12px 16px' }}>Last Telemetry</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTanks.map((tank) => {
                    const hasData = tank.hasTelemetry && tank.levelPercent != null;
                    const isSelected = selectedTankId === tank.tankId;

                    return (
                      <tr
                        key={tank.tankId}
                        style={{
                          borderBottom: '1px solid #F1F5F9',
                          backgroundColor: isSelected ? '#EFF6FF' : 'transparent',
                          cursor: 'pointer',
                        }}
                        onClick={() => setSelectedTankId(tank.tankId)}
                      >
                        <td style={{ padding: '12px 16px' }}>
                          <strong style={{ color: '#0F172A', display: 'block' }}>{tank.tankName}</strong>
                          <span style={{ fontSize: '11px', color: '#94A3B8' }}>{tank.tankId.slice(0, 13)}...</span>
                        </td>
                        <td style={{ padding: '12px 16px', color: '#334155' }}>
                          Coach <strong>{tank.coachNumber}</strong> (Train {tank.trainNumber})
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: '12px',
                              backgroundColor: !tank.isOnline
                                ? '#F1F5F9'
                                : tank.alarmStatus === 'CRITICAL'
                                ? '#FEF2F2'
                                : tank.alarmStatus === 'WARNING'
                                ? '#FFFBEB'
                                : '#ECFDF5',
                              color: !tank.isOnline
                                ? '#64748B'
                                : tank.alarmStatus === 'CRITICAL'
                                ? '#DC2626'
                                : tank.alarmStatus === 'WARNING'
                                ? '#D97706'
                                : '#16A34A',
                            }}
                          >
                            {!tank.isOnline ? 'OFFLINE' : tank.alarmStatus === 'STALE_DATA' ? 'STALE' : tank.alarmStatus}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: 700, color: '#0F172A' }}>
                          {hasData ? `${tank.levelPercent!.toFixed(1)}%` : '—'}
                        </td>
                        <td style={{ padding: '12px 16px', color: '#334155' }}>
                          {tank.heightCm != null ? `${tank.heightCm.toFixed(1)} cm` : '—'}
                        </td>
                        <td style={{ padding: '12px 16px', color: '#334155' }}>
                          {tank.volumeLiters != null ? `${tank.volumeLiters.toFixed(1)} L` : '—'}
                        </td>
                        <td style={{ padding: '12px 16px', color: '#64748B' }}>
                          {tank.capacityLiters.toFixed(0)} L
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '12px', color: '#64748B' }}>
                          {tank.lastUpdate ? new Date(tank.lastUpdate).toLocaleTimeString() : 'Awaiting Telemetry'}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTankId(tank.tankId);
                            }}
                            style={{
                              padding: '4px 10px',
                              borderRadius: '4px',
                              border: '1px solid #CBD5E1',
                              backgroundColor: '#FFFFFF',
                              color: '#2563EB',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            Inspect
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </BaseCard>
        )}
      </div>

      {/* 5. Detailed Tank Drawer (Slides in from right) */}
      {selectedTank && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            width: '480px',
            maxWidth: '90vw',
            backgroundColor: '#FFFFFF',
            boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            boxSizing: 'border-box',
            borderLeft: '1px solid #E2E8F0',
          }}
        >
          {/* Drawer Header */}
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid #E2E8F0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: '#F8FAFC',
            }}
          >
            <div>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0F172A' }}>
                {selectedTank.tankName}
              </h2>
              <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748B' }}>
                Coach {selectedTank.coachNumber} • Train {selectedTank.trainNumber} • UID: {selectedTank.deviceUid}
              </p>
            </div>
            <button
              onClick={() => setSelectedTankId(null)}
              style={{
                background: 'none',
                border: 'none',
                color: '#64748B',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Drawer Body (Scrollable) */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Interactive Real-Time Gauge Visualization */}
            <TankVisualization tank={selectedTank} />

            {/* Geometry & Vessel Parameters */}
            <BaseCard title="Configured Geometry & Capacity">
              <InfoRow label="Vessel Shape" value={selectedTank.crossSectionalAreaM2 > 0.03 ? 'Cylindrical Reservoir' : 'Rectangular'} />
              <InfoRow label="Total Height" value={`${selectedTank.maxHeightCm.toFixed(1)} cm`} />
              <InfoRow label="Rated Capacity" value={`${selectedTank.capacityLiters.toFixed(1)} Litres`} />
              <InfoRow label="Cross-Sectional Area" value={`${selectedTank.crossSectionalAreaM2.toFixed(4)} m²`} />
              <InfoRow
                label="Current Water Volume"
                value={selectedTank.volumeLiters != null ? `${selectedTank.volumeLiters.toFixed(2)} Litres` : '— (No Telemetry)'}
                highlight={selectedTank.volumeLiters != null}
              />
              <InfoRow
                label="Current Water Height"
                value={selectedTank.heightCm != null ? `${selectedTank.heightCm.toFixed(2)} cm` : '—'}
              />
            </BaseCard>

            {/* Threshold Configuration */}
            <BaseCard title="SCADA Alarm Thresholds">
              <InfoRow label="Overflow Threshold" value="100.0% (Upper Limit)" />
              <InfoRow label="Warning Threshold" value="20.0% (Refill Advisory)" />
              <InfoRow label="Critical Threshold" value="10.0% (Refill Mandatory)" />
              <InfoRow
                label="Operating Alarm State"
                value={selectedTank.alarmStatus}
                highlight={selectedTank.alarmStatus !== 'NORMAL'}
              />
            </BaseCard>

            {/* Edge Sensor Telemetry */}
            <BaseCard title="Sensor Diagnostics & Signal Link">
              <InfoRow label="Connection Status" value={selectedTank.isOnline ? 'Online Link' : 'Device Offline'} />
              <InfoRow label="Battery Voltage" value={selectedTank.batteryVoltage != null ? `${selectedTank.batteryVoltage.toFixed(2)} V` : 'Not Reported'} />
              <InfoRow label="Capacity Rank" value={selectedTank.rank} />
              <InfoRow label="Last Telemetry Received" value={selectedTank.lastUpdate ? new Date(selectedTank.lastUpdate).toLocaleString() : 'Awaiting Data'} />
            </BaseCard>

            {/* Level Trend Card */}
            <LevelTrendCard tankId={selectedTank.tankId} />
          </div>
        </div>
      )}
    </div>
  );
};
