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
  const { liveTank, selectedTrainNumber, devices, tanks } = useApp();

  const [reportType, setReportType] = useState<EmployeeReportType>('train_water');
  const [selectedTrain, setSelectedTrain] = useState<string>(selectedTrainNumber || '225256');
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

  // Generate Report Data preview based on selected report type
  const reportData = useMemo(() => {
    if (reportType === 'train_water') {
      return [
        { train: selectedTrain, name: `Express Fleet ${selectedTrain}`, region: 'South East', totalCapacity: '480 L', currentVolume: '360 L', avgLevel: '75.0%', status: 'Nominal' },
        { train: '12002', name: 'Shatabdi Express', region: 'Northern', totalCapacity: '240 L', currentVolume: '168 L', avgLevel: '70.0%', status: 'Nominal' },
        { train: '12951', name: 'Mumbai Rajdhani', region: 'Western', totalCapacity: '360 L', currentVolume: '234 L', avgLevel: '65.0%', status: 'Nominal' },
      ];
    } else if (reportType === 'coach_water') {
      return [
        { coach: 'C1', type: 'Executive AC', arrivalLvl: '82.0%', departureLvl: '79.0%', arrivalCm: '41.0 cm', departureCm: '39.5 cm', alert: 'Normal' },
        { coach: 'C2', type: 'AC 3-Tier', arrivalLvl: '64.0%', departureLvl: '58.0%', arrivalCm: '32.0 cm', departureCm: '29.0 cm', alert: 'Normal' },
        { coach: 'C3', type: 'AC 3-Tier', arrivalLvl: '18.0%', departureLvl: '22.0%', arrivalCm: '9.0 cm', departureCm: '11.0 cm', alert: 'Low Water (<20%)' },
        { coach: 'C4', type: 'AC Chair Car', arrivalLvl: '75.0%', departureLvl: '68.0%', arrivalCm: '37.5 cm', departureCm: '34.0 cm', alert: 'Normal' },
        { coach: 'C5', type: 'Sleeper Class', arrivalLvl: '52.0%', departureLvl: '48.0%', arrivalCm: '26.0 cm', departureCm: '24.0 cm', alert: 'Normal' },
      ];
    } else if (reportType === 'battery_status') {
      return [
        { device: 'DEV-WLI-01', coach: 'C1', battery: '94%', voltage: '4.12 V', status: 'Nominal', alert: 'None' },
        { device: 'DEV-WLI-02', coach: 'C2', battery: '34%', voltage: '3.62 V', status: 'Critical', alert: 'LOW BATTERY (<40%)' },
        { device: 'DEV-WLI-03', coach: 'C3', battery: '76%', voltage: '3.88 V', status: 'Nominal', alert: 'None' },
        { device: 'Device-1', coach: 'C4', battery: '88%', voltage: '3.92 V', status: 'Nominal', alert: 'None' },
        { device: 'DEV-WLI-05', coach: 'C5', battery: '38%', voltage: '3.66 V', status: 'Warning', alert: 'LOW BATTERY (<40%)' },
      ];
    } else if (reportType === 'device_status') {
      return [
        { device: 'Device-1', train: selectedTrain, coach: 'C4', assignment: 'ENGAGED', online: 'Online', uptime: '99.8%', lastComms: 'Just now' },
        { device: 'DEV-WLI-01', train: selectedTrain, coach: 'C1', assignment: 'ENGAGED', online: 'Online', uptime: '99.5%', lastComms: '1 min ago' },
        { device: 'DEV-WLI-02', train: selectedTrain, coach: 'C2', assignment: 'ENGAGED', online: 'Online', uptime: '98.9%', lastComms: '2 mins ago' },
        { device: 'DEV-WLI-POOL', train: '—', coach: '—', assignment: 'FREE POOL', online: 'Standby', uptime: '100%', lastComms: 'Depot' },
      ];
    } else {
      // GPS History Report
      return [
        { timestamp: '14:30:00', train: selectedTrain, lat: '13.0827° N', lon: '80.2707° E', speed: '78.5 km/h', station: 'Chennai Central Corridor' },
        { timestamp: '14:00:00', train: selectedTrain, lat: '13.4500° N', lon: '80.1200° E', speed: '82.0 km/h', station: 'Gudur Junction Outskirts' },
        { timestamp: '13:30:00', train: selectedTrain, lat: '13.8200° N', lon: '80.0500° E', speed: '76.0 km/h', station: 'Nellore Approach' },
        { timestamp: '13:00:00', train: selectedTrain, lat: '14.1200° N', lon: '79.9800° E', speed: '0.0 km/h (Halt)', station: 'Ongole Junction' },
      ];
    }
  }, [reportType, selectedTrain]);

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
        maxWidth: '1600px',
        margin: '0 auto',
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
              <option value="225256">225256 - Express Fleet</option>
              <option value="12002">12002 - Shatabdi Express</option>
              <option value="12951">12951 - Mumbai Rajdhani</option>
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
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
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

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
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
