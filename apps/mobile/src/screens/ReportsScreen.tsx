import React, { useState, useEffect, useMemo } from 'react';
import { colors, typography } from '../theme';
import { useApp } from '../state/AppContext';
import { ApiClient } from '../api/client';
import { FileText, Download, CheckCircle2 } from 'lucide-react';

export const ReportsScreen: React.FC = () => {
  const { liveTank, selectedTrainNumber } = useApp();
  const [reportType, setReportType] = useState<'consumption' | 'refill' | 'compliance'>('consumption');
  const [timeRange, setTimeRange] = useState<string>('24h');
  const [historyPoints, setHistoryPoints] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    let mounted = true;
    const fetchHistory = async () => {
      if (!liveTank?.tankId) return;
      setLoading(true);
      try {
        const res = await ApiClient.fetchTelemetryHistory(liveTank.tankId, timeRange);
        if (mounted) {
          setHistoryPoints(res.dataPoints || []);
        }
      } catch (e) {
        console.warn('[ReportsScreen] Error fetching history:', e);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchHistory();
    return () => {
      mounted = false;
    };
  }, [liveTank?.tankId, timeRange]);

  // Derived real consumption analytics from real telemetry
  const { totalConsumedLiters, hourlyDrain, refillEvents } = useMemo(() => {
    if (!historyPoints || historyPoints.length < 2) {
      return { totalConsumedLiters: null, hourlyDrain: null, refillEvents: [] };
    }

    let consumed = 0;
    const refills: any[] = [];

    for (let i = 1; i < historyPoints.length; i++) {
      const prev = historyPoints[i - 1];
      const curr = historyPoints[i];
      const diff = curr.volumeLiters - prev.volumeLiters;
      if (diff < -0.05) {
        consumed += Math.abs(diff);
      } else if (diff > 1.0) {
        // Positive jump indicates a refill event
        refills.push({
          time: new Date(curr.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          date: new Date(curr.timestamp).toLocaleDateString(),
          start: `${prev.levelPercent.toFixed(1)}% (${prev.volumeLiters.toFixed(1)} L)`,
          end: `${curr.levelPercent.toFixed(1)}% (${curr.volumeLiters.toFixed(1)} L)`,
          added: `+${diff.toFixed(1)} L`,
        });
      }
    }

    const firstTime = new Date(historyPoints[0].timestamp).getTime();
    const lastTime = new Date(historyPoints[historyPoints.length - 1].timestamp).getTime();
    const elapsedHours = Math.max(0.1, (lastTime - firstTime) / (3600 * 1000));
    const drainRate = consumed / elapsedHours;

    return {
      totalConsumedLiters: consumed,
      hourlyDrain: drainRate,
      refillEvents: refills,
    };
  }, [historyPoints]);

  const exportUrl = ApiClient.getExportCsvUrl(liveTank?.tankId, timeRange);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        backgroundColor: colors.background,
        boxSizing: 'border-box',
      }}
    >
      {/* Top Header Card */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '8px',
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A', margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={18} color="#2563EB" />
            <span>Operational & Compliance Reports</span>
          </h2>
          <span style={{ fontSize: '12px', color: '#64748B' }}>
            Automated water consumption audit, refill event analysis and sensor SLA metrics
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: '1px solid #CBD5E1',
              fontSize: '12px',
              fontWeight: 600,
              backgroundColor: '#F8FAFC',
              color: '#0F172A',
            }}
          >
            <option value="12h">Last 12 Hours</option>
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
          </select>

          <a
            href={exportUrl}
            target="_blank"
            rel="noreferrer"
            download
            style={{
              backgroundColor: '#16A34A',
              color: '#FFFFFF',
              textDecoration: 'none',
              padding: '6px 16px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Download size={14} />
            <span>Export CSV</span>
          </a>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #E2E8F0', paddingBottom: '4px' }}>
        <button
          onClick={() => setReportType('consumption')}
          style={{
            padding: '8px 16px',
            border: 'none',
            borderBottom: reportType === 'consumption' ? '3px solid #2563EB' : '3px solid transparent',
            backgroundColor: 'transparent',
            color: reportType === 'consumption' ? '#2563EB' : '#64748B',
            fontWeight: reportType === 'consumption' ? 700 : 500,
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          Water Consumption Audit
        </button>
        <button
          onClick={() => setReportType('refill')}
          style={{
            padding: '8px 16px',
            border: 'none',
            borderBottom: reportType === 'refill' ? '3px solid #2563EB' : '3px solid transparent',
            backgroundColor: 'transparent',
            color: reportType === 'refill' ? '#2563EB' : '#64748B',
            fontWeight: reportType === 'refill' ? 700 : 500,
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          Station Yard Refill Events
        </button>
        <button
          onClick={() => setReportType('compliance')}
          style={{
            padding: '8px 16px',
            border: 'none',
            borderBottom: reportType === 'compliance' ? '3px solid #2563EB' : '3px solid transparent',
            backgroundColor: 'transparent',
            color: reportType === 'compliance' ? '#2563EB' : '#64748B',
            fontWeight: reportType === 'compliance' ? 700 : 500,
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          IoT Sensor SLA & Compliance
        </button>
      </div>

      {/* Report Content Panels */}
      {reportType === 'consumption' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
            <div style={{ backgroundColor: '#FFFFFF', padding: '16px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
              <span style={{ fontSize: '11px', color: '#64748B' }}>TOTAL FLUID CONSUMED</span>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
                {totalConsumedLiters != null ? `${totalConsumedLiters.toFixed(1)} Liters` : 'N/A'}
              </div>
              <span style={{ fontSize: '10px', color: totalConsumedLiters != null ? '#16A34A' : '#94A3B8' }}>
                {totalConsumedLiters != null ? 'Calculated from telemetry stream' : 'Awaiting Telemetry'}
              </span>
            </div>
            <div style={{ backgroundColor: '#FFFFFF', padding: '16px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
              <span style={{ fontSize: '11px', color: '#64748B' }}>HOURLY AVERAGE DRAIN</span>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#2563EB', marginTop: '4px' }}>
                {hourlyDrain != null ? `${hourlyDrain.toFixed(2)} L/hr` : 'N/A'}
              </div>
              <span style={{ fontSize: '10px', color: '#64748B' }}>Operational coach usage rate</span>
            </div>
            <div style={{ backgroundColor: '#FFFFFF', padding: '16px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
              <span style={{ fontSize: '11px', color: '#64748B' }}>TELEMETRY SAMPLES</span>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
                {historyPoints.length} Points
              </div>
              <span style={{ fontSize: '10px', color: '#64748B' }}>Recorded in selected window</span>
            </div>
            <div style={{ backgroundColor: '#FFFFFF', padding: '16px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
              <span style={{ fontSize: '11px', color: '#64748B' }}>ESTIMATED RUNTIME</span>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#16A34A', marginTop: '4px' }}>
                {hourlyDrain && hourlyDrain > 0 && liveTank?.volumeLiters != null
                  ? `${(liveTank.volumeLiters / hourlyDrain).toFixed(1)} Hours`
                  : 'N/A'}
              </div>
              <span style={{ fontSize: '10px', color: '#16A34A' }}>Remaining until refill required</span>
            </div>
          </div>

          <div
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: '8px',
              padding: '16px',
            }}
          >
            <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>
              Historical Telemetry Stream Breakdown ({selectedTrainNumber ? `Train ${selectedTrainNumber}` : 'Fleet'})
            </h3>
            {historyPoints.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '36px 0', color: '#64748B' }}>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>
                  No historical telemetry recorded
                </div>
                <div style={{ fontSize: '12px' }}>
                  Waiting for operational telemetry from MQTT broker.
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '180px 140px 140px 1fr', padding: '8px 12px', backgroundColor: '#F8FAFC', fontWeight: 600, fontSize: '11px', color: '#64748B' }}>
                  <span>TIMESTAMP</span>
                  <span>WATER LEVEL (%)</span>
                  <span>VOLUME (L)</span>
                  <span>HEIGHT (CM)</span>
                </div>
                {historyPoints.slice(-10).reverse().map((row, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '180px 140px 140px 1fr',
                      padding: '10px 12px',
                      borderBottom: '1px solid #F1F5F9',
                      fontSize: '12px',
                    }}
                  >
                    <span style={{ fontWeight: 600, color: '#0F172A' }}>{new Date(row.timestamp).toLocaleTimeString()}</span>
                    <span style={{ color: '#2563EB', fontWeight: 600 }}>{row.levelPercent.toFixed(1)}%</span>
                    <span style={{ color: '#0F172A' }}>{row.volumeLiters.toFixed(1)} L</span>
                    <span style={{ color: '#64748B' }}>{row.heightCm.toFixed(1)} cm</span>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {reportType === 'refill' && (
        <div
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '8px',
            padding: '16px',
          }}
        >
          <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>
            Station Yard Quick-Watering Events Log
          </h3>
          {refillEvents.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '36px 0', color: '#64748B' }}>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>
                No refill events recorded in this time range
              </div>
              <div style={{ fontSize: '12px' }}>
                Refill events are automatically detected when positive water level step changes occur.
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '140px 120px 120px 120px 1fr', padding: '8px 12px', backgroundColor: '#F8FAFC', fontWeight: 600, fontSize: '11px', color: '#64748B' }}>
                <span>DATE</span>
                <span>TIME</span>
                <span>START LEVEL</span>
                <span>END LEVEL</span>
                <span>VOLUME ADDED</span>
              </div>
              {refillEvents.map((row, i) => (
                <div
                  key={i}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '140px 120px 120px 120px 1fr',
                    padding: '12px',
                    borderBottom: '1px solid #F1F5F9',
                    fontSize: '12px',
                  }}
                >
                  <span style={{ fontWeight: 700, color: '#0F172A' }}>{row.date}</span>
                  <span style={{ color: '#64748B' }}>{row.time}</span>
                  <span style={{ color: '#D97706', fontWeight: 600 }}>{row.start}</span>
                  <span style={{ color: '#16A34A', fontWeight: 700 }}>{row.end}</span>
                  <span style={{ color: '#2563EB', fontWeight: 600 }}>{row.added}</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {reportType === 'compliance' && (
        <div
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '8px',
            padding: '16px',
          }}
        >
          <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>
            Telemetry Quality of Service & MQTT Broker Connectivity
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ padding: '12px', backgroundColor: '#ECFDF5', border: '1px solid #DCFCE7', borderRadius: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle2 size={15} color="#16A34A" />
                <strong style={{ color: '#16A34A' }}>MQTT Protocol Integrity</strong>
              </div>
              <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#065F46' }}>
                Active MQTT subscription on panorama/telemetry/+ with strict Pydantic payload validation.
              </p>
            </div>
            <div style={{ padding: '12px', backgroundColor: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle2 size={15} color="#2563EB" />
                <strong style={{ color: '#2563EB' }}>Real-time Telemetry Status</strong>
              </div>
              <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#1E40AF' }}>
                {historyPoints.length > 0
                  ? `Telemetry active with ${historyPoints.length} valid frames persisted in database.`
                  : 'Awaiting telemetry ingestion from field edge device.'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

