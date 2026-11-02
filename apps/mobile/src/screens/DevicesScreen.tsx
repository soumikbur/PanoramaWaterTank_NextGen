import React, { useState, useMemo } from 'react';
import { colors, metrics, typography } from '../theme';
import { useApp } from '../state/AppContext';
import { BaseCard } from '../components/common/BaseCard';
import { InfoRow } from '../components/common/InfoRow';
import { RefreshCw, X } from 'lucide-react';

export interface DeviceTelemetry {
  name: string;
  id: string;
  serialNumber: string;
  location: string;
  status: 'Online' | 'Offline' | 'Warning';
  connectionType: string;
  modemModel: string;
  signalQuality: string;
  ipAddress: string;
  waterLevel: number | null;
  waterHeightCm: number | null;
  tankHeightCm: number;
  volumeLiters: number | null;
  capacityLiters: number;
  sensorStatus: string;
  sensorType: string;
  gain: string;
  temperature: number | null;
  pressure: number | null;
  humidity: number | null;
  firmwareVersion: string;
  runtime: string;
  calibrationStatus: string;
  airBaseline: number;
  deadband: string;
  alarmState: string;
  lastUpdate: string;
  uploadInterval: string;
  isPrimary: boolean;
}

export const DevicesScreen: React.FC = () => {
  const { liveTank, devices, connectionStatus, currentTime, refreshData } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [connFilter, setConnFilter] = useState('All');
  const [selectedDevice, setSelectedDevice] = useState<DeviceTelemetry | null>(null);

  // Live devices mapped strictly from registered backend database devices
  const allDevices: DeviceTelemetry[] = useMemo(() => {
    return devices.map((d, index) => {
      const isPrimary = index === 0;
      const liveLevel = isPrimary ? (liveTank?.levelPercent ?? d.primaryLevel ?? null) : (d.primaryLevel ?? null);
      const liveHeight = isPrimary ? (liveTank?.heightCm ?? null) : null;
      const liveMaxHeight = isPrimary ? (liveTank?.maxHeightCm ?? 50.0) : 50.0;
      const liveVol = isPrimary ? (liveTank?.volumeLiters ?? null) : null;
      const liveCap = isPrimary ? (liveTank?.capacityLiters ?? 20.0) : 20.0;
      const status: 'Online' | 'Offline' | 'Warning' = !d.isOnline
        ? 'Offline'
        : d.hasActiveAlarm || (liveLevel != null && (liveLevel < 20.0 || liveLevel >= 100.0))
        ? 'Warning'
        : 'Online';

      return {
        name: d.name || `Water Monitor (${d.trainNumber}/${d.coachNumber})`,
        id: d.uid,
        serialNumber: d.uid,
        location: `Coach ${d.coachNumber} (Train ${d.trainNumber})`,
        status,
        connectionType: 'Cellular / MQTT',
        modemModel: d.hardwareVersion || 'EC200U LTE Cat-1',
        signalQuality: d.isOnline ? 'Active Link' : 'No Signal',
        ipAddress: 'MQTT / Cellular',
        waterLevel: liveLevel,
        waterHeightCm: liveHeight,
        tankHeightCm: liveMaxHeight,
        volumeLiters: liveVol,
        capacityLiters: liveCap,
        sensorStatus: d.isOnline ? 'Operational' : 'Offline',
        sensorType: 'Hydrostatic Pressure (4-20mA)',
        gain: '±4.096 V (128 SPS)',
        temperature: liveTank?.temperature ?? null,
        pressure: liveTank?.pressure ?? null,
        humidity: null,
        firmwareVersion: d.firmwareVersion || '2.0.0',
        runtime: 'FreeRTOS / ESP-IDF',
        calibrationStatus: 'Calibrated',
        airBaseline: 0,
        deadband: '0.5 cm',
        alarmState: d.hasActiveAlarm ? 'ALERT_ACTIVE' : 'NORMAL',
        lastUpdate: d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleTimeString() : 'Awaiting Data',
        uploadInterval: '3 seconds',
        isPrimary,
      };
    });
  }, [devices, liveTank, connectionStatus]);

  // Filtering
  const filteredDevices = useMemo(() => {
    return allDevices.filter((dev) => {
      if (searchQuery.trim().length > 0) {
        const q = searchQuery.toLowerCase();
        const matchName = dev.name.toLowerCase().includes(q);
        const matchId = dev.id.toLowerCase().includes(q);
        const matchLoc = dev.location.toLowerCase().includes(q);
        if (!matchName && !matchId && !matchLoc) return false;
      }
      if (statusFilter !== 'All' && dev.status !== statusFilter) return false;
      if (connFilter !== 'All' && !dev.connectionType.includes(connFilter)) return false;
      return true;
    });
  }, [allDevices, searchQuery, statusFilter, connFilter]);

  const totalCount = allDevices.length;
  const onlineCount = allDevices.filter((d) => d.status === 'Online').length;
  const offlineCount = allDevices.filter((d) => d.status === 'Offline').length;
  const warningCount = allDevices.filter((d) => d.status === 'Warning').length;

  return (
    <div style={{ position: 'relative', width: '100%', display: 'flex', flexDirection: 'column', gap: metrics.space16 }}>
      {/* Scrollable Container with Right Margin when Drawer is open */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: metrics.space16,
          marginRight: selectedDevice ? '460px' : '0',
          transition: 'margin-right 250ms ease-out',
        }}
      >
        {/* 1. Page Header with Title & Action Controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold', color: '#0F172A', fontFamily: typography.fontFamily }}>
              Devices
            </h1>
            <p style={{ margin: '2px 0 0 0', fontSize: '14px', color: '#64748B', fontFamily: typography.fontFamily }}>
              Manage and monitor connected water-level monitoring devices
            </p>
          </div>

          <button
            onClick={() => refreshData()}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: '1px solid #CBD5E1',
              backgroundColor: '#FFFFFF',
              color: '#334155',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: typography.fontFamily,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <RefreshCw size={13} />
            <span>Refresh</span>
          </button>
        </div>

        {/* 2. Search & Filter Bar */}
        <BaseCard style={{ padding: '12px', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Search devices by name, ID, or location..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                flex: 1,
                minWidth: '220px',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                fontSize: '13px',
                fontFamily: typography.fontFamily,
                outline: 'none',
              }}
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '13px', color: '#64748B', fontFamily: typography.fontFamily }}>Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  fontSize: '12px',
                  fontFamily: typography.fontFamily,
                  backgroundColor: '#FFFFFF',
                }}
              >
                <option value="All">All</option>
                <option value="Online">Online</option>
                <option value="Offline">Offline</option>
                <option value="Warning">Warning</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '13px', color: '#64748B', fontFamily: typography.fontFamily }}>Connection:</span>
              <select
                value={connFilter}
                onChange={(e) => setConnFilter(e.target.value)}
                style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  fontSize: '12px',
                  fontFamily: typography.fontFamily,
                  backgroundColor: '#FFFFFF',
                }}
              >
                <option value="All">All</option>
                <option value="LTE">LTE</option>
                <option value="BLE">BLE</option>
                <option value="RS485">RS485</option>
              </select>
            </div>

            {(searchQuery.length > 0 || statusFilter !== 'All' || connFilter !== 'All') && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('All');
                  setConnFilter('All');
                }}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#FFFFFF',
                  color: '#64748B',
                  fontSize: '12px',
                  cursor: 'pointer',
                  fontFamily: typography.fontFamily,
                }}
              >
                Reset
              </button>
            )}
          </div>
        </BaseCard>

        {/* 3. Device Overview Metric Cards (4 Tiles) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: metrics.space12, width: '100%' }}>
          {/* Total Devices */}
          <BaseCard style={{ height: '100px', padding: '14px', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748B', fontFamily: typography.fontFamily }}>
                TOTAL DEVICES
              </span>
              <span style={{ fontSize: '26px', fontWeight: 'bold', color: '#0F172A', fontFamily: typography.fontFamily }}>
                {totalCount}
              </span>
              <span style={{ fontSize: '11px', color: '#94A3B8', fontFamily: typography.fontFamily }}>
                Registered Monitoring Nodes
              </span>
            </div>
          </BaseCard>

          {/* Online Devices */}
          <BaseCard style={{ height: '100px', padding: '14px', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748B', fontFamily: typography.fontFamily }}>
                  ONLINE
                </span>
                <div style={{ width: '8px', height: '8px', borderRadius: '4px', backgroundColor: '#10B981' }} />
              </div>
              <span style={{ fontSize: '26px', fontWeight: 'bold', color: '#059669', fontFamily: typography.fontFamily }}>
                {onlineCount}
              </span>
              <span style={{ fontSize: '11px', color: '#94A3B8', fontFamily: typography.fontFamily }}>
                Active Telemetry Uplink
              </span>
            </div>
          </BaseCard>

          {/* Offline Devices */}
          <BaseCard style={{ height: '100px', padding: '14px', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748B', fontFamily: typography.fontFamily }}>
                  OFFLINE
                </span>
                <div style={{ width: '8px', height: '8px', borderRadius: '4px', backgroundColor: '#EF4444' }} />
              </div>
              <span style={{ fontSize: '26px', fontWeight: 'bold', color: offlineCount > 0 ? '#DC2626' : '#64748B', fontFamily: typography.fontFamily }}>
                {offlineCount}
              </span>
              <span style={{ fontSize: '11px', color: '#94A3B8', fontFamily: typography.fontFamily }}>
                No Signal / Link Timeout
              </span>
            </div>
          </BaseCard>

          {/* Warnings */}
          <BaseCard style={{ height: '100px', padding: '14px', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748B', fontFamily: typography.fontFamily }}>
                  WARNINGS
                </span>
                <div style={{ width: '8px', height: '8px', borderRadius: '4px', backgroundColor: '#F59E0B' }} />
              </div>
              <span style={{ fontSize: '26px', fontWeight: 'bold', color: warningCount > 0 ? '#D97706' : '#64748B', fontFamily: typography.fontFamily }}>
                {warningCount}
              </span>
              <span style={{ fontSize: '11px', color: '#94A3B8', fontFamily: typography.fontFamily }}>
                Subsystem / Level Alarms
              </span>
            </div>
          </BaseCard>
        </div>

        {/* 4. Device Management Table */}
        <BaseCard style={{ padding: '16px', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Table Header Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#0F172A', fontFamily: typography.fontFamily }}>
                Registered Water Monitoring Devices ({filteredDevices.length})
              </span>
              <span style={{ fontSize: '12px', color: '#94A3B8', fontFamily: typography.fontFamily }}>
                Click any device row to view full hardware telemetry
              </span>
            </div>

            <div style={{ width: '100%', height: '1px', backgroundColor: '#E2E8F0' }} />

            {/* Table Column Headers */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '180px 100px 130px 150px 120px 90px 1fr 90px',
                gap: '12px',
                padding: '0 12px',
                fontSize: '11px',
                fontWeight: 'bold',
                color: '#64748B',
                fontFamily: typography.fontFamily,
              }}
            >
              <div>DEVICE NAME / ID</div>
              <div>STATUS</div>
              <div>CONNECTION</div>
              <div>WATER LEVEL</div>
              <div>SENSOR HEALTH</div>
              <div>FIRMWARE</div>
              <div>LAST UPDATE</div>
              <div>ACTION</div>
            </div>

            <div style={{ width: '100%', height: '1px', backgroundColor: '#F1F5F9' }} />

            {/* Table Rows */}
            {filteredDevices.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '36px 0' }}>
                <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#0F172A', fontFamily: typography.fontFamily }}>
                  No Devices Found Matching Query
                </div>
                <div style={{ fontSize: '13px', color: '#64748B', fontFamily: typography.fontFamily, marginTop: '4px' }}>
                  Try adjusting your search query or reset the filter dropdowns.
                </div>
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('All');
                    setConnFilter('All');
                  }}
                  style={{
                    marginTop: '12px',
                    padding: '6px 14px',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#FFFFFF',
                    color: '#334155',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  Reset All Filters
                </button>
              </div>
            ) : (
              filteredDevices.map((dev, index) => {
                const isSelected = selectedDevice?.id === dev.id;
                return (
                  <div
                    key={dev.id}
                    onClick={() => setSelectedDevice(dev)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '180px 100px 130px 150px 120px 90px 1fr 90px',
                      gap: '12px',
                      alignItems: 'center',
                      height: '64px',
                      padding: '0 12px',
                      borderRadius: '8px',
                      backgroundColor: isSelected ? '#EFF6FF' : index % 2 === 1 ? '#FAFAFA' : '#FFFFFF',
                      border: `1px solid ${isSelected ? '#3B82F6' : '#F1F5F9'}`,
                      cursor: 'pointer',
                      transition: 'background-color 120ms ease, border-color 120ms ease',
                      boxSizing: 'border-box',
                    }}
                  >
                    {/* Device Name & ID */}
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#0F172A', fontFamily: typography.fontFamily, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {dev.name}
                      </span>
                      <span style={{ fontSize: '11px', color: '#64748B', fontFamily: typography.fontFamily }}>
                        ID: {dev.id}
                      </span>
                    </div>

                    {/* Status Badge */}
                    <div>
                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          height: '24px',
                          padding: '0 10px',
                          borderRadius: '12px',
                          backgroundColor: dev.status === 'Online' ? '#ECFDF5' : dev.status === 'Warning' ? '#FFFBEB' : '#FEF2F2',
                          border: `1px solid ${dev.status === 'Online' ? '#A7F3D0' : dev.status === 'Warning' ? '#FDE68A' : '#FECACA'}`,
                        }}
                      >
                        <div
                          style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '3px',
                            backgroundColor: dev.status === 'Online' ? '#10B981' : dev.status === 'Warning' ? '#F59E0B' : '#EF4444',
                          }}
                        />
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 'bold',
                            color: dev.status === 'Online' ? '#065F46' : dev.status === 'Warning' ? '#92400E' : '#991B1B',
                            fontFamily: typography.fontFamily,
                          }}
                        >
                          {dev.status}
                        </span>
                      </div>
                    </div>

                    {/* Connection Type */}
                    <span style={{ fontSize: '12px', color: '#334155', fontFamily: typography.fontFamily }}>
                      {dev.connectionType}
                    </span>

                    {/* Water Level with Mini Progress Bar */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 'bold', color: colors.primary, fontFamily: typography.fontFamily }}>
                          {dev.waterLevel != null ? `${dev.waterLevel.toFixed(1)}%` : 'N/A'}
                        </span>
                        <span style={{ fontSize: '11px', color: '#64748B', fontFamily: typography.fontFamily }}>
                          {dev.waterHeightCm != null ? `(${dev.waterHeightCm.toFixed(1)} cm)` : '(-- cm)'}
                        </span>
                      </div>
                      <div style={{ width: '100%', height: '5px', borderRadius: '2.5px', backgroundColor: '#E2E8F0', overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${dev.waterLevel != null ? Math.max(0, Math.min(100, dev.waterLevel)) : 0}%`,
                            height: '100%',
                            backgroundColor: (dev.waterLevel ?? 0) >= 100.0 ? '#EF4444' : (dev.waterLevel ?? 0) < 20.0 ? '#F59E0B' : '#0878E8',
                          }}
                        />
                      </div>
                    </div>

                    {/* Sensor Health */}
                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: 500,
                        color: dev.sensorStatus === 'Healthy' ? '#059669' : '#D97706',
                        fontFamily: typography.fontFamily,
                      }}
                    >
                      {dev.sensorStatus}
                    </span>

                    {/* Firmware Version */}
                    <span style={{ fontSize: '12px', color: '#64748B', fontFamily: typography.fontFamily }}>
                      {dev.firmwareVersion}
                    </span>

                    {/* Last Update */}
                    <span style={{ fontSize: '12px', color: '#64748B', fontFamily: typography.fontFamily, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {dev.lastUpdate}
                    </span>

                    {/* Action View Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedDevice(dev);
                      }}
                      style={{
                        padding: '6px 10px',
                        borderRadius: '6px',
                        border: '1px solid #CBD5E1',
                        backgroundColor: '#FFFFFF',
                        color: '#334155',
                        fontSize: '12px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        fontFamily: typography.fontFamily,
                      }}
                    >
                      View Details
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </BaseCard>
      </div>

      {/* 5. Slide-in Device Detail Drawer (Right Side Sheet, 440px) */}
      {selectedDevice && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            width: '440px',
            backgroundColor: '#FFFFFF',
            borderLeft: '1px solid #CBD5E1',
            boxShadow: '-4px 0 16px rgba(0,0,0,0.08)',
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
            boxSizing: 'border-box',
          }}
        >
          {/* Scrollable Content inside Drawer */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Drawer Header Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#0F172A', fontFamily: typography.fontFamily }}>
                  {selectedDevice.name}
                </div>
                <div style={{ fontSize: '12px', color: '#64748B', fontFamily: typography.fontFamily, marginTop: '2px' }}>
                  Device ID: {selectedDevice.id}
                </div>
              </div>

              <button
                onClick={() => setSelectedDevice(null)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#FFFFFF',
                  color: '#334155',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: typography.fontFamily,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <X size={14} />
                <span>Close</span>
              </button>
            </div>

            <div style={{ width: '100%', height: '1px', backgroundColor: '#E2E8F0' }} />

            {/* Section 1: Live Water Level & Geometry */}
            <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569', fontFamily: typography.fontFamily }}>
              LIVE TELEMETRY & TANK LEVEL
            </span>

            <div
              style={{
                height: '80px',
                borderRadius: '8px',
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                padding: '12px',
                boxSizing: 'border-box',
              }}
            >
              <div>
                <div style={{ fontSize: '11px', color: '#64748B', fontFamily: typography.fontFamily }}>Water Level</div>
                <div style={{ fontSize: '22px', fontWeight: 'bold', color: colors.primary, fontFamily: typography.fontFamily }}>
                  {selectedDevice.waterLevel != null ? `${selectedDevice.waterLevel.toFixed(2)}%` : 'N/A'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: '#64748B', fontFamily: typography.fontFamily }}>Water Height</div>
                <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#0F172A', fontFamily: typography.fontFamily }}>
                  {selectedDevice.waterHeightCm != null ? `${selectedDevice.waterHeightCm.toFixed(1)} cm` : 'N/A'}
                </div>
              </div>
            </div>

            <InfoRow label="Configured Tank Height" value={`${selectedDevice.tankHeightCm.toFixed(1)} cm`} />
            <InfoRow label="Liquid Volume" value={selectedDevice.volumeLiters != null ? `${selectedDevice.volumeLiters.toFixed(1)} L` : 'N/A'} />
            <InfoRow label="Sensor Health Status" value={selectedDevice.sensorStatus} />

            <div style={{ width: '100%', height: '1px', backgroundColor: '#F1F5F9' }} />

            {/* Section 2: Environmental Sensors (BME280) */}
            <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569', fontFamily: typography.fontFamily }}>
              ENVIRONMENTAL SENSORS (BME280)
            </span>

            <InfoRow label="Atmospheric Pressure" value={selectedDevice.pressure != null ? `${selectedDevice.pressure.toFixed(1)} hPa` : 'N/A'} />
            <InfoRow label="Ambient Temperature" value={selectedDevice.temperature != null ? `${selectedDevice.temperature.toFixed(1)} °C` : 'N/A'} />
            <InfoRow label="Relative Humidity" value={selectedDevice.humidity != null ? `${selectedDevice.humidity.toFixed(1)} % RH` : 'N/A'} />
            <InfoRow label="BME280 Health" value="Healthy (EEPROM Backup Ready)" />

            <div style={{ width: '100%', height: '1px', backgroundColor: '#F1F5F9' }} />

            {/* Section 3: Hardware Diagnostics & Calibration */}
            <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569', fontFamily: typography.fontFamily }}>
              ADC DIAGNOSTICS & CALIBRATION (EEPROM)
            </span>

            <InfoRow label="ADC Differential Mode" value={selectedDevice.sensorType} />
            <InfoRow label="PGA Gain & Rate" value={selectedDevice.gain} />
            <InfoRow label="Air Baseline (A_air)" value={`${selectedDevice.airBaseline} counts`} />
            <InfoRow label="Deadband Threshold" value={selectedDevice.deadband} />
            <InfoRow label="Calibration State" value={selectedDevice.calibrationStatus} />

            <div style={{ width: '100%', height: '1px', backgroundColor: '#F1F5F9' }} />

            {/* Section 4: Connectivity & FreeRTOS Tasks */}
            <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569', fontFamily: typography.fontFamily }}>
              CONNECTIVITY & FREERTOS RUNTIME
            </span>

            <InfoRow label="Uplink Protocol" value={selectedDevice.connectionType} />
            <InfoRow label="Modem / Radio" value={selectedDevice.modemModel} />
            <InfoRow label="Signal Strength" value={selectedDevice.signalQuality} />
            <InfoRow label="Firmware Version" value={selectedDevice.firmwareVersion} />
            <InfoRow label="RTOS Kernel" value={selectedDevice.runtime} />
            <InfoRow label="Cloud Upload Interval" value={selectedDevice.uploadInterval} />
            <InfoRow label="Last Reported Telemetry" value={selectedDevice.lastUpdate} />

            <div style={{ height: '12px' }} />

            <button
              onClick={() => setSelectedDevice(null)}
              style={{
                width: '100%',
                padding: '10px 0',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                backgroundColor: '#F8FAFC',
                color: '#334155',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: typography.fontFamily,
              }}
            >
              Close Device Drawer
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
