import React, { useState, useEffect, useMemo } from 'react';
import { colors, typography } from '../theme';
import { useApp } from '../state/AppContext';
import { ApiClient } from '../api/client';
import {
  FileText,
  Download,
  CheckCircle2,
  Filter,
  Train,
  Layers,
  Battery,
  Cpu,
  MapPin,
  Calendar,
} from 'lucide-react';

export type EmployeeReportType =
  | 'train_water'
  | 'coach_water'
  | 'battery_status'
  | 'device_status'
  | 'gps_history';

export const ReportsScreen: React.FC = () => {
  const { liveTank, selectedTrainNumber, devices, tanks, liveTelemetry, configuredTrains, activeConsist } = useApp();

  const [reportType, setReportType] = useState<EmployeeReportType>('train_water');
  const [selectedTrain, setSelectedTrain] = useState<string>(selectedTrainNumber || '');
  const [timeRange, setTimeRange] = useState<string>('24h');
  const [dateFilter, setDateFilter] = useState<string>(new Date().toISOString().slice(0, 10));
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const reportOptions: { id: EmployeeReportType; label: string; icon: any; desc: string }[] = [
    {
      id: 'train_water',
      label: 'Train Water Level Report',
      icon: Train,
      desc: 'Fleet-level aggregate water reserve metrics, consumption trends, and refill history',
    },
    {
      id: 'coach_water',
      label: 'Coach Water Level Report',
      icon: Layers,
      desc: 'Coach-by-coach Arrival vs Departure reservoir levels and capacity breakdown',
    },
    {
      id: 'battery_status',
      label: 'Battery Status Report',
      icon: Battery,
      desc: 'Node battery voltage, health index, discharge rates, and low-battery alerts (<40%)',
    },
    {
      id: 'device_status',
      label: 'Device Status Report',
      icon: Cpu,
      desc: 'Hardware operational status, link reliability, engaged coach assignments, and uptime',
    },
    {
      id: 'gps_history',
      label: 'GPS History Report',
      icon: MapPin,
      desc: 'Train waypoint logs, latitude/longitude tracking, transit speed, and corridor stations',
    },
  ];

  // Generate Report Data preview based on selected report type and actual telemetry
  const reportData = useMemo(() => {
    if (reportType === 'train_water') {
      if (liveTelemetry) {
        const trainItem = configuredTrains.find((t) => t.train_number.trim() === liveTelemetry.trno.trim());
        const configuredHeight = (activeConsist && activeConsist.train_number.trim() === liveTelemetry.trno.trim() && activeConsist.tank_height_cm)
          ? activeConsist.tank_height_cm
          : (trainItem?.tank_height_cm ?? 50.0);
        const configuredCap = (activeConsist && activeConsist.train_number.trim() === liveTelemetry.trno.trim() && activeConsist.tank_capacity_liters)
          ? activeConsist.tank_capacity_liters
          : (trainItem?.tank_capacity_liters ?? 20.0);

        const arrPct = typeof liveTelemetry.cm1 === 'number' && configuredHeight > 0
          ? Number(Math.min(100, Math.max(0, (liveTelemetry.cm1 / configuredHeight) * 100)).toFixed(1))
          : liveTelemetry.wlp1;
        const depPct = typeof liveTelemetry.cm2 === 'number' && configuredHeight > 0
          ? Number(Math.min(100, Math.max(0, (liveTelemetry.cm2 / configuredHeight) * 100)).toFixed(1))
          : liveTelemetry.wlp2;
        const volArr = ((arrPct / 100) * configuredCap);
        const volDep = ((depPct / 100) * configuredCap);
        const totalVol = volArr + volDep;
        const totalCap = configuredCap * 2;
        const avgPct = ((arrPct + depPct) / 2).toFixed(1);
        return [
          {
            train: liveTelemetry.trno,
            name: `Special Express (${liveTelemetry.trno})`,
            region: 'Eastern',
            totalCapacity: `${totalCap.toFixed(0)} L`,
            currentVolume: `${totalVol.toFixed(1)} L`,
            avgLevel: `${avgPct}%`,
            status: !liveTelemetry.isStale ? 'Active' : 'Stale',
          },
        ];
      }
      return [
        {
          train: selectedTrain,
          name: `Train ${selectedTrain}`,
          region: 'Eastern',
          totalCapacity: '—',
          currentVolume: '—',
          avgLevel: '—',
          status: 'Awaiting Telemetry',
        },
      ];
    } else if (reportType === 'coach_water') {
      if (liveTelemetry) {
        const trainItem = configuredTrains.find((t) => t.train_number.trim() === liveTelemetry.trno.trim());
        const configuredHeight = (activeConsist && activeConsist.train_number.trim() === liveTelemetry.trno.trim() && activeConsist.tank_height_cm)
          ? activeConsist.tank_height_cm
          : (trainItem?.tank_height_cm ?? 50.0);
        const arrPct = typeof liveTelemetry.cm1 === 'number' && configuredHeight > 0
          ? Number(Math.min(100, Math.max(0, (liveTelemetry.cm1 / configuredHeight) * 100)).toFixed(1))
          : liveTelemetry.wlp1;
        const depPct = typeof liveTelemetry.cm2 === 'number' && configuredHeight > 0
          ? Number(Math.min(100, Math.max(0, (liveTelemetry.cm2 / configuredHeight) * 100)).toFixed(1))
          : liveTelemetry.wlp2;
        return [
          {
            coach: liveTelemetry.chno,
            type: 'AC 2-Tier',
            arrivalLvl: `${arrPct}%`,
            departureLvl: `${depPct}%`,
            arrivalCm: `${liveTelemetry.cm1.toFixed(1)} cm`,
            departureCm: `${liveTelemetry.cm2.toFixed(1)} cm`,
            alert: !liveTelemetry.wlv2 ? 'Departure Sensor 2 Fault / Valve Closed' : !liveTelemetry.wlv1 ? 'Arrival Sensor 1 Fault' : 'Nominal',
          },
        ];
      }
      return [];
    } else if (reportType === 'battery_status') {
      if (liveTelemetry) {
        return [
          {
            device: liveTelemetry.uid,
            coach: liveTelemetry.chno,
            battery: `${liveTelemetry.bat.toFixed(1)}%`,
            voltage: `${(3.2 + (liveTelemetry.bat / 100) * 1.0).toFixed(2)} V`,
            status: liveTelemetry.bat < 40 ? 'Warning' : 'Nominal',
            alert: liveTelemetry.bat < 40 ? 'LOW BATTERY (<40%)' : 'None',
          },
        ];
      }
      return devices
        .filter((d) => !selectedTrain || d.trainNumber === selectedTrain)
        .map((d) => ({
          device: d.uid,
          coach: d.coachNumber || '—',
          battery: d.batteryPercent != null ? `${d.batteryPercent}%` : '—',
          voltage: d.batteryVoltage != null ? `${d.batteryVoltage} V` : '—',
          status: d.isOnline ? 'Nominal' : 'Offline',
          alert: d.batteryPercent != null && d.batteryPercent < 40 ? 'LOW BATTERY (<40%)' : 'None',
        }));
    } else if (reportType === 'device_status') {
      if (liveTelemetry) {
        return [
          {
            device: liveTelemetry.uid,
            train: liveTelemetry.trno,
            coach: liveTelemetry.chno,
            assignment: 'ENGAGED',
            online: !liveTelemetry.isStale ? 'Online' : 'Offline',
            uptime: '100%',
            lastComms: liveTelemetry.time,
          },
        ];
      }
      return devices.map((d) => ({
        device: d.uid,
        train: d.trainNumber || 'UNASSIGNED',
        coach: d.coachNumber || '—',
        assignment: d.coachNumber ? 'ENGAGED' : 'FREE POOL',
        online: d.isOnline ? 'Online' : 'Offline',
        uptime: '99.9%',
        lastComms: d.lastHeartbeat ? new Date(d.lastHeartbeat).toLocaleTimeString() : 'Depot',
      }));
    } else {
      // GPS History Report
      if (liveTelemetry && liveTelemetry.lat != null && liveTelemetry.long != null) {
        return [
          {
            timestamp: liveTelemetry.time,
            train: liveTelemetry.trno,
            lat: `${liveTelemetry.lat.toFixed(4)}° N`,
            lon: `${liveTelemetry.long.toFixed(4)}° E`,
            speed: `${(liveTelemetry.speed ?? 0).toFixed(1)} km/h`,
            station: 'Active Corridor (Live GPS)',
          },
        ];
      }
      return [
        {
          timestamp: '—',
          train: selectedTrain,
          lat: '—',
          lon: '—',
          speed: '—',
          station: 'Awaiting GPS Fix',
        },
      ];
    }
  }, [reportType, selectedTrain, liveTelemetry, devices]);

  const handleExportCsv = () => {
    if (!reportData || reportData.length === 0) return;
    const headers = Object.keys(reportData[0]);
    const lines = reportData.map((row: any) => headers.map((h) => `"${row[h] || ''}"`).join(','));
    const csvContent = [headers.join(','), ...lines].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${reportType}_report_${selectedTrain}_${dateFilter}.csv`;
    link.click();

    setActionFeedback(`Report exported to ${reportType}_report_${selectedTrain}_${dateFilter}.csv`);
    setTimeout(() => setActionFeedback(null), 4000);
  };

  const activeOption = reportOptions.find((r) => r.id === reportType) || reportOptions[0];

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
      {/* 1. Header & Controls */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '8px',
          border: '1px solid #E2E8F0',
          padding: '16px 20px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '14px',
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0F172A' }}>
            Operational Fleet Reports
          </h2>
          <span style={{ fontSize: '12px', color: '#64748B', marginTop: '2px', display: 'block' }}>
            Generate and export operational reports for trains, coaches, water levels, battery health & GPS
          </span>
        </div>

        {/* Filters: Train Selector & Date Picker */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>Train:</span>
            <select
              value={selectedTrain}
              onChange={(e) => setSelectedTrain(e.target.value)}
              style={{
                height: '34px',
                padding: '0 10px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                backgroundColor: '#F8FAFC',
                color: '#0F172A',
                fontSize: '12px',
                fontWeight: 600,
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              {configuredTrains.length === 0 ? (
                <option value="">No trains configured</option>
              ) : (
                configuredTrains.map((t) => (
                  <option key={t.train_number} value={t.train_number}>
                    {t.train_number} - {t.name}
                  </option>
                ))
              )}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>Date:</span>
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              style={{
                height: '34px',
                padding: '0 10px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                backgroundColor: '#F8FAFC',
                color: '#0F172A',
                fontSize: '12px',
                fontWeight: 600,
                outline: 'none',
              }}
            />
          </div>

          <button
            onClick={handleExportCsv}
            style={{
              height: '34px',
              padding: '0 14px',
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

      {/* 2. 5 Report Type Cards Selector */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',
          gap: '12px',
        }}
      >
        {reportOptions.map((opt) => {
          const isSelected = reportType === opt.id;
          const IconComp = opt.icon;

          return (
            <div
              key={opt.id}
              onClick={() => setReportType(opt.id)}
              style={{
                backgroundColor: isSelected ? '#EFF6FF' : '#FFFFFF',
                borderRadius: '8px',
                border: isSelected ? '2px solid #2563EB' : '1px solid #E2E8F0',
                padding: '14px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '6px', backgroundColor: isSelected ? '#DBEAFE' : '#F1F5F9', color: isSelected ? '#2563EB' : '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <IconComp size={16} />
                </div>
                <strong style={{ fontSize: '13px', color: isSelected ? '#2563EB' : '#0F172A' }}>
                  {opt.label}
                </strong>
              </div>
              <div style={{ fontSize: '11px', color: '#64748B', lineHeight: 1.3 }}>
                {opt.desc}
              </div>
            </div>
          );
        })}
      </div>

      {/* 3. Report Data Table Preview */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '8px',
          border: '1px solid #E2E8F0',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}
      >
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F8FAFC' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>
              {activeOption.label} Preview ({selectedTrain})
            </h3>
            <span style={{ fontSize: '11px', color: '#64748B' }}>
              Report Filter: {dateFilter} &bull; Timeframe: {timeRange}
            </span>
          </div>

          <button
            onClick={handleExportCsv}
            style={{
              padding: '6px 12px',
              backgroundColor: '#EFF6FF',
              color: '#2563EB',
              border: '1px solid #BFDBFE',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              cursor: 'pointer',
            }}
          >
            <Download size={13} />
            <span>Download CSV</span>
          </button>
        </div>

        <div className="scada-table-scroll-container">
          <table style={{ width: '100%', minWidth: '600px', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
            <thead>
              <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#64748B', fontSize: '11px', textTransform: 'uppercase' }}>
                {Object.keys(reportData[0] || {}).map((col) => (
                  <th key={col} style={{ padding: '10px 14px', fontWeight: 700 }}>
                    {col.replace(/([A-Z])/g, ' $1')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reportData.map((row: any, idx: number) => (
                <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA' }}>
                  {Object.keys(row).map((col) => (
                    <td key={col} style={{ padding: '10px 14px', color: '#0F172A' }}>
                      {String(row[col])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
