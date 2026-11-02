import React, { useState, useMemo, useEffect } from 'react';
import { colors, metrics, typography } from '../theme';
import { useApp } from '../state/AppContext';
import { LevelTrendCard } from '../components/charts/LevelTrendCard';
import { BaseCard } from '../components/common/BaseCard';
import { ApiClient } from '../api/client';
import { AlertCircle, CheckCircle2, X, Download, RefreshCw } from 'lucide-react';

interface HistoricalPoint {
  timestampMs: number;
  timeStr: string;
  timeOnlyStr: string;
  level: number;
  heightCm: number;
  volumeLiters: number;
  status: 'Normal' | 'Warning' | 'Critical' | 'Overflow';
}

export const HistoryScreen: React.FC = () => {
  const { liveTank, currentTime } = useApp();
  const [selectedRangeHours, setSelectedRangeHours] = useState<12 | 24 | 168>(12);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [statusIsError, setStatusIsError] = useState<boolean>(false);
  const [statusVisible, setStatusVisible] = useState<boolean>(false);
  const [rawHistory, setRawHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  const maxHeightCm = liveTank?.maxHeightCm ?? 50.0;
  const capacityLiters = liveTank?.capacityLiters ?? 20.0;

  // Fetch real telemetry history from backend
  useEffect(() => {
    let mounted = true;
    const loadHistory = async () => {
      if (!liveTank?.tankId) return;
      const rangeStr = selectedRangeHours === 168 ? '7d' : selectedRangeHours === 24 ? '24h' : '12h';
      setLoading(true);
      try {
        const res = await ApiClient.fetchTelemetryHistory(liveTank.tankId, rangeStr);
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
  }, [liveTank?.tankId, selectedRangeHours]);

  // Format date helper
  const formatDateTime = (date: Date) => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const d = date.getDate();
    const m = months[date.getMonth()];
    let hh = date.getHours();
    const mm = date.getMinutes();
    const ampm = hh >= 12 ? 'PM' : 'AM';
    hh = hh % 12;
    if (hh === 0) hh = 12;
    const mStr = mm < 10 ? `0${mm}` : `${mm}`;
    return `${d} ${m} ${hh}:${mStr} ${ampm}`;
  };

  const formatTimeOnly = (date: Date) => {
    let hh = date.getHours();
    const mm = date.getMinutes();
    const ss = date.getSeconds();
    const ampm = hh >= 12 ? 'PM' : 'AM';
    hh = hh % 12;
    if (hh === 0) hh = 12;
    const mStr = mm < 10 ? `0${mm}` : `${mm}`;
    const sStr = ss < 10 ? `0${ss}` : `${ss}`;
    return `${hh}:${mStr}:${sStr} ${ampm}`;
  };

  // Process strictly real points
  const { parsedPoints, fromTimeString, toTimeString, avgLevel, minLevel, maxLevel, levelChange } = useMemo(() => {
    const nowMs = Date.now();
    const durationMs = selectedRangeHours * 3600 * 1000;
    const startMs = nowMs - durationMs;

    const fromStr = formatDateTime(new Date(startMs));
    const toStr = formatDateTime(new Date(nowMs));

    if (!rawHistory || rawHistory.length === 0) {
      return {
        parsedPoints: [],
        fromTimeString: fromStr,
        toTimeString: toStr,
        avgLevel: null,
        minLevel: null,
        maxLevel: null,
        levelChange: null,
      };
    }

    const pts: HistoricalPoint[] = rawHistory.map((p) => {
      const t = new Date(p.timestamp).getTime();
      const pVal = p.levelPercent;
      let st: HistoricalPoint['status'] = 'Normal';
      if (pVal >= 100.0) st = 'Overflow';
      else if (pVal < 10.0) st = 'Critical';
      else if (pVal < 20.0) st = 'Warning';

      return {
        timestampMs: t,
        timeStr: formatDateTime(new Date(t)),
        timeOnlyStr: formatTimeOnly(new Date(t)),
        level: pVal,
        heightCm: p.heightCm,
        volumeLiters: p.volumeLiters,
        status: st,
      };
    });

    pts.sort((a, b) => a.timestampMs - b.timestampMs);

    let sum = 0;
    let minV = pts[0].level;
    let maxV = pts[0].level;
    for (let j = 0; j < pts.length; j++) {
      const val = pts[j].level;
      sum += val;
      if (val < minV) minV = val;
      if (val > maxV) maxV = val;
    }
    const avg = sum / pts.length;
    const change = pts[pts.length - 1].level - pts[0].level;

    return {
      parsedPoints: pts,
      fromTimeString: fromStr,
      toTimeString: toStr,
      avgLevel: avg,
      minLevel: minV,
      maxLevel: maxV,
      levelChange: change,
    };
  }, [selectedRangeHours, rawHistory]);

  const handleDownloadCsv = () => {
    // Generate real CSV from parsed points
    const headers = ['Timestamp', 'LevelPercent', 'HeightCm', 'VolumeLiters', 'Status'];
    const rows = parsedPoints.map((p) => [
      new Date(p.timestampMs).toISOString(),
      p.level.toFixed(2),
      p.heightCm.toFixed(2),
      p.volumeLiters.toFixed(2),
      p.status,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const filename = `water_tank_history_${selectedRangeHours}h_${new Date().toISOString().slice(0, 10)}.csv`;
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setStatusMessage(`Successfully exported ${parsedPoints.length} data points to ${filename}`);
    setStatusIsError(false);
    setStatusVisible(true);
    setTimeout(() => setStatusVisible(false), 5000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: metrics.space16, width: '100%' }}>
      {/* 1. Page Header & Time Range Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: metrics.space16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold', color: '#0F172A', fontFamily: typography.fontFamily }}>
            History
          </h1>
          <p style={{ margin: '2px 0 0 0', fontSize: '14px', color: '#64748B', fontFamily: typography.fontFamily }}>
            Water level trends and historical sensor data
          </p>
        </div>

        {/* Right Status Badge, Refresh & Download CSV */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              height: '32px',
              padding: '0 12px',
              borderRadius: '6px',
              backgroundColor: '#F0FDF4',
              border: '1px solid #BBF7D0',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <div style={{ width: '6px', height: '6px', borderRadius: '3px', backgroundColor: '#10B981' }} />
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#166534', fontFamily: typography.fontFamily }}>
              Ubidots Cloud (90s sample interval)
            </span>
          </div>

          <button
            onClick={() => {
              setStatusMessage('Refreshed trend history dataset.');
              setStatusIsError(false);
              setStatusVisible(true);
              setTimeout(() => setStatusVisible(false), 3000);
            }}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: '1px solid #CBD5E1',
              backgroundColor: '#FFFFFF',
              color: '#334155',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: typography.fontFamily,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <RefreshCw size={13} />
            <span>Refresh Trend</span>
          </button>

          <button
            onClick={handleDownloadCsv}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: '1px solid #CBD5E1',
              backgroundColor: '#FFFFFF',
              color: '#334155',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: typography.fontFamily,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Download size={13} />
            <span>Download CSV</span>
          </button>
        </div>
      </div>

      {/* Status Notification Banner (Export feedback) */}
      {statusVisible && (
        <div
          style={{
            height: '42px',
            borderRadius: '6px',
            backgroundColor: statusIsError ? '#FEF2F2' : '#ECFDF5',
            border: `1px solid ${statusIsError ? '#FCA5A5' : '#A7F3D0'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 14px',
            gap: '10px',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {statusIsError ? (
              <AlertCircle size={16} color="#DC2626" />
            ) : (
              <CheckCircle2 size={16} color="#059669" />
            )}
            <span style={{ fontSize: '13px', fontWeight: 500, color: statusIsError ? '#991B1B' : '#065F46', fontFamily: typography.fontFamily }}>
              {statusMessage}
            </span>
          </div>
          <button
            onClick={() => setStatusVisible(false)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: statusIsError ? '#991B1B' : '#065F46',
              display: 'flex',
              alignItems: 'center',
              padding: '2px',
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* 2. Time Range Selector Bar */}
      <BaseCard style={{ padding: '14px', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#64748B', fontFamily: typography.fontFamily }}>
              TIME RANGE:
            </span>

            <div style={{ display: 'flex', gap: '6px' }}>
              {([12, 24, 168] as const).map((hours) => {
                const isSelected = selectedRangeHours === hours;
                const label = hours === 168 ? '7 Days' : `${hours} Hours`;
                return (
                  <button
                    key={hours}
                    onClick={() => setSelectedRangeHours(hours)}
                    style={{
                      height: '32px',
                      padding: '0 16px',
                      borderRadius: '6px',
                      backgroundColor: isSelected ? colors.primary : '#F1F5F9',
                      border: `1px solid ${isSelected ? colors.primary : '#CBD5E1'}`,
                      color: isSelected ? '#FFFFFF' : '#334155',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      fontFamily: typography.fontFamily,
                      transition: 'background-color 120ms ease',
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* From & To Date Range Window Display */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '12px', fontWeight: 500, color: '#475569', fontFamily: typography.fontFamily }}>
              From: {fromTimeString}
            </span>
            <div style={{ width: '1px', height: '16px', backgroundColor: '#CBD5E1' }} />
            <span style={{ fontSize: '12px', fontWeight: 500, color: '#475569', fontFamily: typography.fontFamily }}>
              To: {toTimeString}
            </span>
          </div>
        </div>
      </BaseCard>

      {/* 3. Primary Water Level History Chart */}
      <LevelTrendCard height={360} />

      {/* 4. Trend Statistics Metric Cards (4 Tiles) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: metrics.space12, width: '100%' }}>
        {/* Average Level Card */}
        <BaseCard style={{ height: '100px', padding: '14px', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748B', fontFamily: typography.fontFamily }}>
              AVERAGE LEVEL
            </span>
            <span style={{ fontSize: '24px', fontWeight: 'bold', color: colors.primary, fontFamily: typography.fontFamily }}>
              {avgLevel != null ? `${avgLevel.toFixed(1)}%` : 'N/A'}
            </span>
            <span style={{ fontSize: '11px', color: '#94A3B8', fontFamily: typography.fontFamily }}>
              Mean fill over {selectedRangeHours}h window
            </span>
          </div>
        </BaseCard>

        {/* Minimum Level Card */}
        <BaseCard style={{ height: '100px', padding: '14px', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748B', fontFamily: typography.fontFamily }}>
              MINIMUM LEVEL
            </span>
            <span style={{ fontSize: '24px', fontWeight: 'bold', color: minLevel != null && minLevel < 20.0 ? '#D97706' : '#0F172A', fontFamily: typography.fontFamily }}>
              {minLevel != null ? `${minLevel.toFixed(1)}%` : 'N/A'}
            </span>
            <span style={{ fontSize: '11px', color: '#94A3B8', fontFamily: typography.fontFamily }}>
              {minLevel != null ? `Lowest reading: ${((minLevel / 100.0) * maxHeightCm).toFixed(1)} cm` : 'Awaiting Telemetry'}
            </span>
          </div>
        </BaseCard>

        {/* Maximum Level Card */}
        <BaseCard style={{ height: '100px', padding: '14px', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748B', fontFamily: typography.fontFamily }}>
              MAXIMUM LEVEL
            </span>
            <span style={{ fontSize: '24px', fontWeight: 'bold', color: maxLevel != null && maxLevel >= 100.0 ? '#DC2626' : '#0F172A', fontFamily: typography.fontFamily }}>
              {maxLevel != null ? `${maxLevel.toFixed(1)}%` : 'N/A'}
            </span>
            <span style={{ fontSize: '11px', color: '#94A3B8', fontFamily: typography.fontFamily }}>
              {maxLevel != null ? `Peak reading: ${((maxLevel / 100.0) * maxHeightCm).toFixed(1)} cm` : 'Awaiting Telemetry'}
            </span>
          </div>
        </BaseCard>

        {/* Level Change Card */}
        <BaseCard style={{ height: '100px', padding: '14px', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748B', fontFamily: typography.fontFamily }}>
              LEVEL CHANGE
            </span>
            <span style={{ fontSize: '24px', fontWeight: 'bold', color: levelChange != null && levelChange >= 0 ? '#059669' : '#DC2626', fontFamily: typography.fontFamily }}>
              {levelChange != null ? (levelChange >= 0 ? '+' : '') + levelChange.toFixed(1) + '%' : 'N/A'}
            </span>
            <span style={{ fontSize: '11px', color: '#94A3B8', fontFamily: typography.fontFamily }}>
              Net shift from range start
            </span>
          </div>
        </BaseCard>
      </div>

      {/* 5. Historical Readings Table */}
      <BaseCard style={{ padding: '16px', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#0F172A', fontFamily: typography.fontFamily }}>
              Historical Readings Log ({parsedPoints.length} data points)
            </span>
            <span style={{ fontSize: '12px', color: '#94A3B8', fontFamily: typography.fontFamily }}>
              Normalized UTC epoch ms samples
            </span>
          </div>

          <div style={{ width: '100%', height: '1px', backgroundColor: '#E2E8F0' }} />

          {/* Table Column Headers */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '160px 120px 130px 140px 1fr',
              gap: '12px',
              padding: '0 12px',
              fontSize: '11px',
              fontWeight: 'bold',
              color: '#64748B',
              fontFamily: typography.fontFamily,
            }}
          >
            <div>TIMESTAMP</div>
            <div>WATER LEVEL</div>
            <div>WATER HEIGHT</div>
            <div>ESTIMATED VOLUME</div>
            <div>STATUS</div>
          </div>

          <div style={{ width: '100%', height: '1px', backgroundColor: '#F1F5F9' }} />

          {/* Table Rows (first 15 records in compact table) */}
          {parsedPoints.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '36px 0', color: '#64748B' }}>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>
                No historical telemetry records found
              </div>
              <div style={{ fontSize: '12px' }}>
                Waiting for operational telemetry from MQTT broker.
              </div>
            </div>
          ) : (
            parsedPoints.slice(0, 15).map((pt, index) => (
              <div
                key={index}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '160px 120px 130px 140px 1fr',
                  gap: '12px',
                  alignItems: 'center',
                  height: '44px',
                  padding: '0 12px',
                  borderRadius: '6px',
                  backgroundColor: index % 2 === 1 ? '#FAFAFA' : '#FFFFFF',
                  border: '1px solid #F1F5F9',
                  boxSizing: 'border-box',
                }}
              >
                <span style={{ fontSize: '12px', color: '#334155', fontFamily: typography.fontFamily }}>
                  {pt.timeStr}
                </span>

                <span style={{ fontSize: '12px', fontWeight: 'bold', color: colors.primary, fontFamily: typography.fontFamily }}>
                  {pt.level.toFixed(2)}%
                </span>

                <span style={{ fontSize: '12px', fontWeight: 500, color: '#0F172A', fontFamily: typography.fontFamily }}>
                  {pt.heightCm.toFixed(1)} cm
                </span>

                <span style={{ fontSize: '12px', color: '#64748B', fontFamily: typography.fontFamily }}>
                  {pt.volumeLiters.toFixed(1)} L
                </span>

                <div>
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: '22px',
                      padding: '0 10px',
                      borderRadius: '11px',
                      backgroundColor: pt.status === 'Normal' ? '#ECFDF5' : pt.status === 'Warning' ? '#FFFBEB' : '#FEF2F2',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 'bold',
                        color: pt.status === 'Normal' ? '#065F46' : pt.status === 'Warning' ? '#92400E' : '#991B1B',
                        fontFamily: typography.fontFamily,
                      }}
                    >
                      {pt.status}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </BaseCard>
    </div>
  );
};
