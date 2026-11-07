import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../state/AppContext';
import { TankVisualization } from '../components/tank/TankVisualization';
import { TankLiveStatus, Device } from '../types';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Train,
  Layers,
  Cpu,
  Battery,
  BatteryWarning,
  Activity,
  MapPin,
  Clock,
  LineChart,
  Navigation,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';

export const CoachDetailsScreen: React.FC = () => {
  const {
    activeScreen,
    setActiveScreen,
    selectedTrainNumber,
    setSelectedTrainNumber,
    selectedCoachNumber,
    setSelectedCoachNumber,
    devices,
    liveTank,
    connectionStatus,
    refreshData,
    liveTelemetry,
  } = useApp();

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const trainNum = liveTelemetry?.trno || selectedTrainNumber || '225256';
  const coachNum = (selectedCoachNumber || liveTelemetry?.chno || 'CR123456').toUpperCase();

  // Known train names mapping
  const trainNames: Record<string, { name: string; from: string; to: string; region: string }> = {
    '225256': { name: 'Special Express (225256)', from: 'Live Corridor', to: 'In Service', region: 'Eastern' },
    '12002': { name: 'Shatabdi Express', from: 'New Delhi (NDLS)', to: 'Bhopal (BPL)', region: 'Northern' },
    '12951': { name: 'Mumbai Rajdhani', from: 'Mumbai Central (MMCT)', to: 'New Delhi (NDLS)', region: 'Western' },
    '12301': { name: 'Howrah Rajdhani', from: 'Howrah (HWH)', to: 'New Delhi (NDLS)', region: 'Eastern' },
  };

  const trainMeta = trainNames[trainNum] || {
    name: `Superfast Express (${trainNum})`,
    from: 'Origin Station',
    to: 'Terminus Station',
    region: 'Railway Division',
  };

  // Extract coach index (1..24) if formatted as C1..C24
  const coachIndexMatch = coachNum.match(/^C?(\d+)$/i);
  const coachIndex = coachIndexMatch ? Math.min(24, Math.max(1, parseInt(coachIndexMatch[1], 10))) : 1;
  const isValidCoach = Boolean(coachNum && coachNum.trim().length > 0);

  const coachTypes = ['Passenger', 'AC Chair Car', 'AC 3-Tier', 'AC 2-Tier', 'Sleeper Class', 'Executive AC'];
  const coachType = coachTypes[(Math.abs(coachIndex - 1)) % coachTypes.length];

  // Assigned device lookup or deterministic simulation for 24 consist capability
  const matchingDevice: Device | undefined = useMemo(() => {
    return devices.find(
      (d) =>
        (d.coachNumber && d.coachNumber.toUpperCase() === coachNum) ||
        (d.trainNumber === trainNum && d.coachNumber === coachNum)
    );
  }, [devices, coachNum, trainNum]);

  const hasLiveTelemetry = Boolean(liveTelemetry && (liveTelemetry.chno.toUpperCase() === coachNum || coachNum === 'CR123456'));
  const deviceId = (hasLiveTelemetry && liveTelemetry?.uid) || matchingDevice?.uid || (hasLiveTelemetry ? '0023004D4B42501120353332' : `DEV-${coachNum}`);
  const isOnline = hasLiveTelemetry && liveTelemetry ? !liveTelemetry.isStale : (matchingDevice?.isOnline ?? false);
  const batteryPercent = hasLiveTelemetry && liveTelemetry ? liveTelemetry.bat : (matchingDevice?.batteryPercent ?? null);
  const isBatteryLow = batteryPercent != null && batteryPercent < 40;

  // Dual Tank Telemetry values: formula (heightCm / 150.0) * 100
  const arrivalPercent = hasLiveTelemetry && liveTelemetry && typeof liveTelemetry.cm1 === 'number'
    ? Number(((liveTelemetry.cm1 / 150.0) * 100).toFixed(1))
    : (matchingDevice?.primaryLevel ?? null);
  const arrivalHeight = hasLiveTelemetry && liveTelemetry ? liveTelemetry.cm1 : (arrivalPercent != null ? (arrivalPercent / 100) * 150.0 : null);

  const departurePercent = hasLiveTelemetry && liveTelemetry && typeof liveTelemetry.cm2 === 'number'
    ? Number(((liveTelemetry.cm2 / 150.0) * 100).toFixed(1))
    : (matchingDevice?.secondaryLevel ?? null);
  const departureHeight = hasLiveTelemetry && liveTelemetry ? liveTelemetry.cm2 : (departurePercent != null ? (departurePercent / 100) * 150.0 : null);

  // Build TankLiveStatus objects for TankVisualization
  const arrivalTank: TankLiveStatus = useMemo(() => {
    return {
      tankId: `tank-${trainNum}-${coachNum}-arr`,
      tankIndex: 1,
      deviceId,
      deviceUid: deviceId,
      trainNumber: trainNum,
      coachNumber: coachNum,
      tankName: `Arrival Side (Tank 1)`,
      capacityLiters: 500.0,
      maxHeightCm: 150.0,
      crossSectionalAreaM2: 0.33,
      levelPercent: arrivalPercent,
      rawLevelPercent: arrivalPercent,
      volumeLiters: arrivalPercent != null ? (arrivalPercent / 100) * 500.0 : null,
      heightCm: arrivalHeight,
      rank: arrivalPercent && arrivalPercent < 20 ? 'LOW' : 'GOOD',
      alarmStatus: arrivalPercent && arrivalPercent < 15 ? 'CRITICAL_LOW' : arrivalPercent && arrivalPercent < 25 ? 'WARNING_LOW' : 'NORMAL',
      batteryVoltage: 3.8,
      temperature: 28.0,
      isOnline,
      hasTelemetry: arrivalPercent != null,
      isStale: false,
      lastUpdate: new Date().toISOString(),
    };
  }, [trainNum, coachNum, deviceId, isOnline, arrivalPercent, arrivalHeight]);

  const departureTank: TankLiveStatus = useMemo(() => {
    return {
      tankId: `tank-${trainNum}-${coachNum}-dep`,
      tankIndex: 2,
      deviceId,
      deviceUid: deviceId,
      trainNumber: trainNum,
      coachNumber: coachNum,
      tankName: `Departure Side (Tank 2)`,
      capacityLiters: 500.0,
      maxHeightCm: 150.0,
      crossSectionalAreaM2: 0.33,
      levelPercent: departurePercent,
      rawLevelPercent: departurePercent,
      volumeLiters: departurePercent != null ? (departurePercent / 100) * 500.0 : null,
      heightCm: departureHeight,
      rank: departurePercent && departurePercent < 20 ? 'LOW' : 'GOOD',
      alarmStatus: departurePercent && departurePercent < 15 ? 'CRITICAL_LOW' : departurePercent && departurePercent < 25 ? 'WARNING_LOW' : 'NORMAL',
      batteryVoltage: 3.8,
      temperature: 28.2,
      isOnline,
      hasTelemetry: departurePercent != null,
      isStale: false,
      lastUpdate: new Date().toISOString(),
    };
  }, [trainNum, coachNum, deviceId, isOnline, departurePercent, departureHeight]);

  const handleStepCoach = (dir: 'prev' | 'next') => {
    const nextIdx = dir === 'prev' ? Math.max(1, coachIndex - 1) : Math.min(24, coachIndex + 1);
    setSelectedCoachNumber(`C${nextIdx}`);
  };

  const handleRefresh = async () => {
    setIsLoading(true);
    try {
      await refreshData();
    } catch (e) {
      console.warn('Data refresh failed:', e);
    } finally {
      setTimeout(() => setIsLoading(false), 500);
    }
  };

  // If coach is completely invalid
  if (!isValidCoach) {
    return (
      <div
        style={{
          maxWidth: '700px',
          margin: '40px auto',
          backgroundColor: '#FFFFFF',
          borderRadius: '10px',
          border: '1px solid #FECACA',
          padding: '32px 24px',
          textAlign: 'center',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
        }}
      >
        <div
          style={{
            width: '52px',
            height: '52px',
            borderRadius: '50%',
            backgroundColor: '#FEE2E2',
            color: '#DC2626',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px auto',
          }}
        >
          <AlertCircle size={28} />
        </div>
        <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: '0 0 8px 0' }}>
          Invalid Coach Identifier: {coachNum}
        </h2>
        <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 20px 0' }}>
          Coach identifier must be in the standard railway range <strong>C1 to C24</strong> for Train {trainNum} ({trainMeta.name}).
        </p>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          <button
            onClick={() => setSelectedCoachNumber('C1')}
            style={{
              padding: '8px 18px',
              backgroundColor: '#2563EB',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Select Coach C1
          </button>
          <button
            onClick={() => setActiveScreen('dashboard')}
            style={{
              padding: '8px 18px',
              backgroundColor: '#F1F5F9',
              color: '#475569',
              border: '1px solid #CBD5E1',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

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
      {/* =========================================================================
          SECTION 1: BREADCRUMB & HEADER ACTION BAR
          ========================================================================= */}
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
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
        }}
      >
        {/* Navigation & Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setActiveScreen('dashboard')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              backgroundColor: '#F8FAFC',
              border: '1px solid #CBD5E1',
              borderRadius: '6px',
              color: '#0F172A',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <ArrowLeft size={14} />
            <span>Dashboard</span>
          </button>

          <button
            onClick={() => setActiveScreen('coaches')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              backgroundColor: '#F8FAFC',
              border: '1px solid #CBD5E1',
              borderRadius: '6px',
              color: '#475569',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Layers size={14} />
            <span>Coach Consist</span>
          </button>

          <div style={{ height: '24px', width: '1px', backgroundColor: '#E2E8F0' }} />

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  backgroundColor: '#2563EB',
                  color: '#FFFFFF',
                  fontSize: '10px',
                  fontWeight: 800,
                  padding: '2px 8px',
                  borderRadius: '4px',
                  letterSpacing: '0.4px',
                }}
              >
                COACH DETAILS
              </span>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0F172A' }}>
                Coach {coachNum} &bull; {coachType}
              </h2>
            </div>
            <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
              Train {trainNum} &ndash; {trainMeta.name} ({trainMeta.from} &rarr; {trainMeta.to}) &bull; Region: {trainMeta.region}
            </div>
          </div>
        </div>

        {/* Stepper Navigation (Prev / Next Coach) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => handleStepCoach('prev')}
            disabled={coachIndex <= 1}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '6px 12px',
              backgroundColor: coachIndex <= 1 ? '#F1F5F9' : '#FFFFFF',
              border: '1px solid #CBD5E1',
              borderRadius: '6px',
              color: coachIndex <= 1 ? '#94A3B8' : '#0F172A',
              fontSize: '11px',
              fontWeight: 600,
              cursor: coachIndex <= 1 ? 'not-allowed' : 'pointer',
            }}
          >
            <ChevronLeft size={14} />
            <span>Prev (C{Math.max(1, coachIndex - 1)})</span>
          </button>

          <span style={{ fontSize: '12px', fontWeight: 700, color: '#2563EB', padding: '0 4px' }}>
            {coachNum} of C24
          </span>

          <button
            onClick={() => handleStepCoach('next')}
            disabled={coachIndex >= 24}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '6px 12px',
              backgroundColor: coachIndex >= 24 ? '#F1F5F9' : '#FFFFFF',
              border: '1px solid #CBD5E1',
              borderRadius: '6px',
              color: coachIndex >= 24 ? '#94A3B8' : '#0F172A',
              fontSize: '11px',
              fontWeight: 600,
              cursor: coachIndex >= 24 ? 'not-allowed' : 'pointer',
            }}
          >
            <span>Next (C{Math.min(24, coachIndex + 1)})</span>
            <ChevronRight size={14} />
          </button>

          <button
            onClick={handleRefresh}
            title="Refresh Telemetry"
            style={{
              padding: '6px 10px',
              backgroundColor: '#EFF6FF',
              border: '1px solid #BFDBFE',
              borderRadius: '6px',
              color: '#2563EB',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* =========================================================================
          SECTION 2: COACH & HARDWARE TELEMETRY SUMMARY STRIP
          ========================================================================= */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '12px',
        }}
      >
        {/* Card 1: Train & Coach Number */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '8px',
            border: '1px solid #E2E8F0',
            padding: '12px 14px',
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
              backgroundColor: '#EFF6FF',
              color: '#2563EB',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Train size={22} />
          </div>
          <div>
            <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>TRAIN / COACH</div>
            <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>
              {trainNum} &bull; {coachNum}
            </div>
          </div>
        </div>

        {/* Card 2: Assigned Device */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '8px',
            border: '1px solid #E2E8F0',
            padding: '12px 14px',
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
              backgroundColor: '#F8FAFC',
              color: '#0F172A',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Cpu size={22} />
          </div>
          <div>
            <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>ASSIGNED DEVICE</div>
            <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>{deviceId}</div>
          </div>
        </div>

        {/* Card 3: Connection Status */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '8px',
            border: '1px solid #E2E8F0',
            padding: '12px 14px',
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
              backgroundColor: isOnline ? '#ECFDF5' : '#FEF2F2',
              color: isOnline ? '#16A34A' : '#DC2626',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Activity size={22} />
          </div>
          <div>
            <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>DEVICE STATUS</div>
            <div
              style={{
                fontSize: '14px',
                fontWeight: 800,
                color: isOnline ? '#16A34A' : '#DC2626',
              }}
            >
              {isOnline ? 'Online (Active)' : 'Offline (Standby)'}
            </div>
          </div>
        </div>

        {/* Card 4: Battery Level */}
        <div
          style={{
            backgroundColor: isBatteryLow ? '#FEF2F2' : '#FFFFFF',
            borderRadius: '8px',
            border: `1px solid ${isBatteryLow ? '#FCA5A5' : '#E2E8F0'}`,
            padding: '12px 14px',
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
              backgroundColor: isBatteryLow ? '#FEE2E2' : '#ECFDF5',
              color: isBatteryLow ? '#DC2626' : '#16A34A',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {isBatteryLow ? <BatteryWarning size={22} /> : <Battery size={22} />}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748B', fontWeight: 600 }}>
              <span>NODE BATTERY</span>
              <strong style={{ color: isBatteryLow ? '#DC2626' : '#16A34A' }}>{batteryPercent}%</strong>
            </div>
            <div style={{ height: '6px', backgroundColor: '#E2E8F0', borderRadius: '3px', marginTop: '4px', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${batteryPercent}%`,
                  height: '100%',
                  backgroundColor: isBatteryLow ? '#DC2626' : '#16A34A',
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          SECTION 3: DUAL TANK MONITORING (Arrival Tank 1 & Departure Tank 2)
          ========================================================================= */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '8px',
          border: '1px solid #E2E8F0',
          padding: '18px',
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.03)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #E2E8F0',
            paddingBottom: '12px',
            marginBottom: '16px',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>
              Dual Tank Monitoring &bull; Coach {coachNum}
            </h3>
            <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
              Independent ultrasonic level transceivers &bull; Sensor 1: Arrival Tank &bull; Sensor 2: Departure Tank
            </div>
          </div>

          <div style={{ fontSize: '11px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Clock size={13} />
            <span>Last Telemetry Update: <strong>{new Date().toLocaleTimeString()}</strong></span>
          </div>
        </div>

        {/* Dual Tanks Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
            gap: '20px',
          }}
        >
          {/* Tank 1: Arrival Side */}
          <div
            style={{
              backgroundColor: '#F8FAFC',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span
                  style={{
                    backgroundColor: '#2563EB',
                    color: '#FFFFFF',
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '4px',
                  }}
                >
                  Sensor 1
                </span>
                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>
                  Arrival Side (Tank 1)
                </h4>
              </div>
              <span style={{ fontSize: '11px', color: '#64748B' }}>150.0 cm / 500.0 L Capacity</span>
            </div>

            <TankVisualization
              tank={arrivalTank}
              batteryPercent={batteryPercent}
              connectionStatus={isOnline ? 'Online' : 'Offline'}
            />

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '8px',
                backgroundColor: '#FFFFFF',
                borderRadius: '6px',
                border: '1px solid #E2E8F0',
                padding: '8px',
                textAlign: 'center',
              }}
            >
              <div>
                <div style={{ fontSize: '10px', color: '#64748B' }}>Fill Percent</div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#2563EB' }}>
                  {arrivalPercent != null ? `${arrivalPercent.toFixed(1)}%` : 'Awaiting'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '10px', color: '#64748B' }}>Water Height</div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>
                  {arrivalHeight != null ? `${arrivalHeight.toFixed(1)} cm` : '--'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '10px', color: '#64748B' }}>Estimated Vol</div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>
                  {arrivalPercent != null ? `${((arrivalPercent / 100) * 500).toFixed(1)} L` : '--'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '10px', color: '#64748B' }}>Valve State</div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#16A34A' }}>
                  Valve Normal
                </div>
              </div>
            </div>
          </div>

          {/* Tank 2: Departure Side */}
          <div
            style={{
              backgroundColor: '#F8FAFC',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span
                  style={{
                    backgroundColor: '#0284C7',
                    color: '#FFFFFF',
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '4px',
                  }}
                >
                  Sensor 2
                </span>
                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>
                  Departure Side (Tank 2)
                </h4>
              </div>
              <span style={{ fontSize: '11px', color: '#64748B' }}>150.0 cm / 500.0 L Capacity</span>
            </div>

            <TankVisualization
              tank={departureTank}
              batteryPercent={batteryPercent}
              connectionStatus={isOnline ? 'Online' : 'Offline'}
            />

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '8px',
                backgroundColor: '#FFFFFF',
                borderRadius: '6px',
                border: '1px solid #E2E8F0',
                padding: '8px',
                textAlign: 'center',
              }}
            >
              <div>
                <div style={{ fontSize: '10px', color: '#64748B' }}>Fill Percent</div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#DC2626' }}>
                  {departurePercent != null ? `${departurePercent.toFixed(1)}%` : 'Awaiting'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '10px', color: '#64748B' }}>Water Height</div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>
                  {departureHeight != null ? `${departureHeight.toFixed(1)} cm` : '--'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '10px', color: '#64748B' }}>Estimated Vol</div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>
                  {departurePercent != null ? `${((departurePercent / 100) * 500).toFixed(1)} L` : '--'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '10px', color: '#64748B' }}>Valve State</div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#DC2626' }}>
                  Valve Alert
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          SECTION 4: GPS CORRIDOR & SATELLITE TRACKING FOR THIS TRAIN
          ========================================================================= */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '8px',
          border: '1px solid #E2E8F0',
          padding: '16px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '8px',
              backgroundColor: '#EFF6FF',
              color: '#2563EB',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <MapPin size={22} />
          </div>
          <div>
            <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>
              Train Location &bull; Eastern Railway Mainline Corridor
            </h4>
            <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
              Coordinates: <strong>{liveTelemetry?.lat != null ? `${liveTelemetry.lat.toFixed(4)}° N, ${liveTelemetry.long?.toFixed(4)}° E` : 'Awaiting GPS Fix'}</strong> &bull; Speed: <strong>{liveTelemetry?.speed != null ? `${liveTelemetry.speed.toFixed(1)} km/h` : '—'}</strong> &bull; Time: <strong>{liveTelemetry?.time || '12:15:39'}</strong> &bull; Status: <strong>{liveTelemetry && !liveTelemetry.isStale ? 'Active Stream' : 'Standby'}</strong>
            </div>
          </div>
        </div>

        <button
          onClick={() => setActiveScreen('location')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 16px',
            backgroundColor: '#F8FAFC',
            border: '1px solid #CBD5E1',
            borderRadius: '6px',
            color: '#2563EB',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          <Navigation size={14} />
          <span>Open Full GPS Map</span>
        </button>
      </div>

      {/* =========================================================================
          SECTION 5: BOTTOM ACTIONS (History & Navigation)
          ========================================================================= */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          paddingTop: '4px',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          <button
            onClick={() => setActiveScreen('history')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 18px',
              backgroundColor: '#FFFFFF',
              border: '1px solid #CBD5E1',
              borderRadius: '8px',
              color: '#0F172A',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
            }}
          >
            <LineChart size={16} color="#2563EB" />
            <span>Water Level History</span>
          </button>

          <button
            onClick={() => setActiveScreen('location')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 18px',
              backgroundColor: '#FFFFFF',
              border: '1px solid #CBD5E1',
              borderRadius: '8px',
              color: '#0F172A',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
            }}
          >
            <MapPin size={16} color="#2563EB" />
            <span>GPS / Train History</span>
          </button>
        </div>

        <button
          onClick={() => setActiveScreen('dashboard')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 22px',
            backgroundColor: '#2563EB',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 2px 4px rgba(37,99,235,0.25)',
          }}
        >
          <ArrowLeft size={16} />
          <span>Back to Dashboard</span>
        </button>
      </div>
    </div>
  );
};
