import React, { useState, useMemo, useEffect } from 'react';
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
  const { tanks, liveTank, connectionStatus, refreshData, selectedTankId: contextTankId, setSelectedTankId: setContextTankId, setActiveScreen } = useApp();
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
      {/* Main Tanks Container */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: metrics.space16,
        }}
      >
        {/* 0. Breadcrumb Line (Qt AllTanksPage.qml) */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
            <span
              onClick={() => setActiveScreen('dashboard')}
              style={{ color: '#2563EB', fontWeight: 600, cursor: 'pointer' }}
            >
              Train Management
            </span>
            <span style={{ color: '#94A3B8' }}>›</span>
            <span style={{ color: '#0F172A', fontWeight: 600 }}>All Tanks</span>
          </div>

          <button
            onClick={() => setActiveScreen('dashboard')}
            style={{
              background: 'none',
              border: 'none',
              color: '#2563EB',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <span>Select Train →</span>
          </button>
        </div>

        {/* 1. Filter Pills Row & Search Bar (Qt AllTanksPage.qml) */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          {/* Filter Pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {/* All Tanks */}
            <button
              onClick={() => setActiveFilter('ALL')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 14px',
                borderRadius: '16px',
                border: activeFilter === 'ALL' ? '1px solid #2563EB' : '1px solid #E2E8F0',
                backgroundColor: activeFilter === 'ALL' ? '#2563EB' : '#FFFFFF',
                color: activeFilter === 'ALL' ? '#FFFFFF' : '#475569',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <span>All Tanks</span>
              <span
                style={{
                  backgroundColor: activeFilter === 'ALL' ? '#1D4ED8' : '#F1F5F9',
                  color: activeFilter === 'ALL' ? '#FFFFFF' : '#475569',
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '1px 6px',
                  borderRadius: '10px',
                }}
              >
                {totalTanks}
              </span>
            </button>

            {/* Online */}
            <button
              onClick={() => setActiveFilter('ONLINE')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 14px',
                borderRadius: '16px',
                border: activeFilter === 'ONLINE' ? '1px solid #16A34A' : '1px solid #E2E8F0',
                backgroundColor: activeFilter === 'ONLINE' ? '#16A34A' : '#FFFFFF',
                color: activeFilter === 'ONLINE' ? '#FFFFFF' : '#475569',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <span>Online</span>
              <span
                style={{
                  backgroundColor: activeFilter === 'ONLINE' ? '#15803D' : '#DCFCE7',
                  color: activeFilter === 'ONLINE' ? '#FFFFFF' : '#15803D',
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '1px 6px',
                  borderRadius: '10px',
                }}
              >
                {onlineTanks}
              </span>
            </button>

            {/* Offline */}
            <button
              onClick={() => setActiveFilter('OFFLINE')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 14px',
                borderRadius: '16px',
                border: activeFilter === 'OFFLINE' ? '1px solid #DC2626' : '1px solid #E2E8F0',
                backgroundColor: activeFilter === 'OFFLINE' ? '#DC2626' : '#FFFFFF',
                color: activeFilter === 'OFFLINE' ? '#FFFFFF' : '#475569',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <span>Offline</span>
              <span
                style={{
                  backgroundColor: activeFilter === 'OFFLINE' ? '#B91C1C' : '#FEE2E2',
                  color: activeFilter === 'OFFLINE' ? '#FFFFFF' : '#DC2626',
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '1px 6px',
                  borderRadius: '10px',
                }}
              >
                {offlineTanks}
              </span>
            </button>

            {/* Low Level */}
            <button
              onClick={() => setActiveFilter('LOW_LEVEL')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 14px',
                borderRadius: '16px',
                border: activeFilter === 'LOW_LEVEL' ? '1px solid #D97706' : '1px solid #E2E8F0',
                backgroundColor: activeFilter === 'LOW_LEVEL' ? '#D97706' : '#FFFFFF',
                color: activeFilter === 'LOW_LEVEL' ? '#FFFFFF' : '#475569',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <span>Low Level</span>
              <span
                style={{
                  backgroundColor: activeFilter === 'LOW_LEVEL' ? '#B45309' : '#FEF3C7',
                  color: activeFilter === 'LOW_LEVEL' ? '#FFFFFF' : '#D97706',
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '1px 6px',
                  borderRadius: '10px',
                }}
              >
                {lowLevelTanks}
              </span>
            </button>
          </div>

          {/* Right Controls: Search & View Toggles */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Search Input */}
            <div style={{ position: 'relative', width: '220px' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
              <input
                type="text"
                placeholder="Search tank or coach..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  height: '32px',
                  paddingLeft: '32px',
                  paddingRight: '10px',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontFamily: typography.fontFamily,
                  color: '#0F172A',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* View Mode Toggle */}
            <div style={{ display: 'flex', backgroundColor: '#FFFFFF', borderRadius: '6px', padding: '2px', border: '1px solid #E2E8F0' }}>
              <button
                onClick={() => setViewMode('grid')}
                title="Grid View"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 10px',
                  borderRadius: '4px',
                  border: 'none',
                  backgroundColor: viewMode === 'grid' ? '#EFF6FF' : 'transparent',
                  color: viewMode === 'grid' ? '#2563EB' : '#64748B',
                  fontWeight: viewMode === 'grid' ? 700 : 500,
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                <LayoutGrid size={13} />
                <span>Grid View</span>
              </button>
              <button
                onClick={() => setViewMode('list')}
                title="List View"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 10px',
                  borderRadius: '4px',
                  border: 'none',
                  backgroundColor: viewMode === 'list' ? '#EFF6FF' : 'transparent',
                  color: viewMode === 'list' ? '#2563EB' : '#64748B',
                  fontWeight: viewMode === 'list' ? 700 : 500,
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                <List size={13} />
                <span>List View</span>
              </button>
            </div>
          </div>
        </div>

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
                  {/* Card Header (Qt Style) */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>
                        Coach {tank.coachNumber}
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                        {tank.tankName || 'Toilet Front'}
                      </div>
                      <div style={{ fontSize: '11px', color: '#94A3B8' }}>
                        Cylindrical
                      </div>
                    </div>
                    <ChevronRight size={16} color="#94A3B8" />
                  </div>

                  {/* Level & Vessel Volume Readout (Qt Style) */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '6px 0' }}>
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        backgroundColor: !tank.isOnline ? '#FEE2E2' : '#EFF6FF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: !tank.isOnline ? '#DC2626' : '#2563EB',
                        flexShrink: 0,
                      }}
                    >
                      <Droplets size={16} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                      <span style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>
                        {hasData && tank.isOnline ? `${level!.toFixed(0)}%` : '--'}
                      </span>
                      <span style={{ fontSize: '12px', color: '#64748B' }}>
                        / {height != null && tank.isOnline ? `${height.toFixed(1)} cm` : `${maxHeight.toFixed(1)} cm`}
                      </span>
                      <span style={{ fontSize: '12px', color: '#64748B' }}>
                        / {volume != null && tank.isOnline ? `${volume.toFixed(1)} L` : `${capacity.toFixed(2)} L`}
                      </span>
                    </div>
                  </div>

                  {/* Visual Progress Bar */}
                  <div>
                    <div style={{ height: '6px', backgroundColor: '#F1F5F9', borderRadius: '3px', overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          width: hasData && tank.isOnline ? `${Math.min(100, Math.max(0, level!))}%` : '0%',
                          backgroundColor: barColor,
                          borderRadius: '3px',
                          transition: 'width 0.4s ease',
                        }}
                      />
                    </div>
                  </div>

                  {/* Card Footer: Status Dot + Chevron (Qt Style) */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', borderTop: '1px solid #F1F5F9', paddingTop: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <div
                        style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '3px',
                          backgroundColor: !tank.isOnline ? '#DC2626' : '#16A34A',
                        }}
                      />
                      <span
                        style={{
                          fontWeight: 700,
                          color: !tank.isOnline ? '#DC2626' : '#16A34A',
                        }}
                      >
                        {!tank.isOnline ? 'Offline' : 'Online'}
                      </span>
                    </div>
                    <ChevronRight size={14} color="#94A3B8" />
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

      {/* Backdrop overlay for Drawer */}
      {selectedTank && (
        <div
          onClick={() => setSelectedTankId(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(2px)',
            zIndex: 999,
          }}
        />
      )}

      {/* 5. Detailed Tank Drawer (Slides in from right) */}
      {selectedTank && (
        <div
          className="drawer-slide-in"
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            width: '480px',
            maxWidth: '100vw',
            backgroundColor: '#FFFFFF',
            boxShadow: '-6px 0 28px rgba(0,0,0,0.20)',
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

            {/* Device Telemetry */}
            <BaseCard title="Device Communication & Diagnostics">
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
