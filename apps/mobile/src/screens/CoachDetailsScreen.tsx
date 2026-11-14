import React, { useState, useMemo } from 'react';
import { useApp } from '../state/AppContext';
import { CoachDualTankCard } from '../components/tank/CoachDualTankCard';
import { CoachMiniMap } from '../components/location/CoachMiniMap';
import { ManageCoachModal } from '../components/coach/ManageCoachModal';
import { AddDeviceModal } from '../components/device/AddDeviceModal';
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
  Radio,
  CheckCircle2,
  SlidersHorizontal,
  Plus,
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
    managedDevices,
    liveTank,
    connectionStatus,
    refreshData,
    liveTelemetry,
    configuredTrains,
    activeConsist,
    mqttConnectionStatus,
    telemetryTimeoutSeconds,
    currentUser,
  } = useApp();

  const isAdmin = currentUser?.role === 'ADMIN';

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isManageCoachOpen, setIsManageCoachOpen] = useState<boolean>(false);
  const [isAddDeviceOpen, setIsAddDeviceOpen] = useState<boolean>(false);
  const trainNum = (selectedTrainNumber || configuredTrains[0]?.train_number || '').trim();
  const coachNum = (selectedCoachNumber || '').toUpperCase();

  const matchedConfiguredTrain = configuredTrains.find((t) => t.train_number === trainNum);
  const trainMeta = matchedConfiguredTrain
    ? {
        name: matchedConfiguredTrain.name,
        from: matchedConfiguredTrain.source_station || 'Origin Station',
        to: matchedConfiguredTrain.destination_station || 'Terminus Station',
        region: matchedConfiguredTrain.railway_zone || matchedConfiguredTrain.region || 'Eastern Railway',
      }
    : {
        name: trainNum ? `Train ${trainNum}` : 'No Train Configured',
        from: 'Origin Station',
        to: 'Terminus Station',
        region: 'Eastern Railway',
      };

  // Extract coach index (1..24) if formatted as C1..C24
  const coachIndexMatch = coachNum.match(/^C?(\d+)$/i);
  const coachIndex = coachIndexMatch ? Math.min(24, Math.max(1, parseInt(coachIndexMatch[1], 10))) : 1;
  const isValidCoach = Boolean(coachNum && coachNum.trim().length > 0);

  const coachTypes = ['Passenger', 'AC Chair Car', 'AC 3-Tier', 'AC 2-Tier', 'Sleeper Class', 'Executive AC'];
  const coachType = coachTypes[(Math.abs(coachIndex - 1)) % coachTypes.length];

  // Assigned device lookup or deterministic consist capability
  const matchingDevice: any = useMemo(() => {
    return (
      managedDevices?.find(
        (d) =>
          (d.coachNumber && d.coachNumber.toUpperCase() === coachNum) ||
          (d.trainNumber === trainNum && d.coachNumber === coachNum)
      ) ||
      devices.find(
        (d) =>
          (d.coachNumber && d.coachNumber.toUpperCase() === coachNum) ||
          (d.trainNumber === trainNum && d.coachNumber === coachNum)
      )
    );
  }, [managedDevices, devices, coachNum, trainNum]);

  const timeoutMs = (telemetryTimeoutSeconds || 120) * 1000;
  const now = Date.now();
  const isMqttConnected = mqttConnectionStatus !== 'DISCONNECTED' && connectionStatus !== 'DISCONNECTED';

  const hasLiveTelemetry = Boolean(
    liveTelemetry &&
    isMqttConnected &&
    !liveTelemetry.isStale &&
    liveTelemetry.chno.toUpperCase() === coachNum
  );

  const isMatchingDeviceFresh = Boolean(
    matchingDevice &&
    matchingDevice.lastSeenTimestamp &&
    now - matchingDevice.lastSeenTimestamp <= timeoutMs
  );

  const isOnline = Boolean(isMqttConnected && (hasLiveTelemetry || (matchingDevice?.isOnline && isMatchingDeviceFresh)));
  const deviceId = (hasLiveTelemetry && liveTelemetry?.uid) || matchingDevice?.uid || (matchingDevice?.deviceUid) || 'Not Mapped';
  const batteryPercent = hasLiveTelemetry && liveTelemetry ? liveTelemetry.bat : (matchingDevice?.batteryPercent ?? null);
  const isBatteryLow = batteryPercent != null && batteryPercent < 40;

  // Configured tank geometry dynamically derived from train / consist settings
  const configuredMaxHeight = (activeConsist?.train_number === trainNum && activeConsist?.tank_height_cm) || matchedConfiguredTrain?.tank_height_cm || 50.0;
  const configuredMaxCapacity = (activeConsist?.train_number === trainNum && activeConsist?.tank_capacity_liters) || matchedConfiguredTrain?.tank_capacity_liters || 20.0;

  // Dual Tank Telemetry values: formula (heightCm / configuredMaxHeight) * 100
  const arrivalPercent = hasLiveTelemetry && liveTelemetry && typeof liveTelemetry.cm1 === 'number' && configuredMaxHeight > 0
    ? Number(Math.min(100, Math.max(0, (liveTelemetry.cm1 / configuredMaxHeight) * 100)).toFixed(1))
    : (matchingDevice?.primaryLevel ?? null);
  const arrivalHeight = hasLiveTelemetry && liveTelemetry ? liveTelemetry.cm1 : (arrivalPercent != null ? (arrivalPercent / 100) * configuredMaxHeight : null);
  const arrivalVolume = arrivalPercent != null ? Number(((arrivalPercent / 100) * configuredMaxCapacity).toFixed(1)) : null;

  const departurePercent = hasLiveTelemetry && liveTelemetry && typeof liveTelemetry.cm2 === 'number' && configuredMaxHeight > 0
    ? Number(Math.min(100, Math.max(0, (liveTelemetry.cm2 / configuredMaxHeight) * 100)).toFixed(1))
    : (matchingDevice?.secondaryLevel ?? null);
  const departureHeight = hasLiveTelemetry && liveTelemetry ? liveTelemetry.cm2 : (departurePercent != null ? (departurePercent / 100) * configuredMaxHeight : null);
  const departureVolume = departurePercent != null ? Number(((departurePercent / 100) * configuredMaxCapacity).toFixed(1)) : null;

  const availableCoaches = useMemo(() => {
    if (activeConsist?.train_number === trainNum && activeConsist.coaches?.length) {
      return activeConsist.coaches.map((c) => c.coach_number);
    }
    return ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10', 'C11', 'C12'];
  }, [activeConsist, trainNum]);

  const currentCoachIdx = availableCoaches.findIndex((c) => c.toUpperCase() === coachNum.toUpperCase());
  const canPrev = currentCoachIdx > 0;
  const canNext = currentCoachIdx !== -1 && currentCoachIdx < availableCoaches.length - 1;

  const handleStepCoach = (dir: 'prev' | 'next') => {
    if (dir === 'prev' && canPrev) {
      setSelectedCoachNumber(availableCoaches[currentCoachIdx - 1]);
    } else if (dir === 'next' && canNext) {
      setSelectedCoachNumber(availableCoaches[currentCoachIdx + 1]);
    }
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

  // If no train is configured or coach is invalid
  if (!trainNum || configuredTrains.length === 0 || !isValidCoach) {
    return (
      <div
        style={{
          maxWidth: '680px',
          margin: '36px auto',
          backgroundColor: '#FFFFFF',
          borderRadius: '8px',
          border: '1px solid #E2E8F0',
          padding: '28px 20px',
          textAlign: 'center',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
        }}
      >
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            backgroundColor: '#F1F5F9',
            color: '#475569',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 14px auto',
          }}
        >
          <AlertCircle size={24} />
        </div>
        <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: '0 0 6px 0' }}>
          {!trainNum || configuredTrains.length === 0
            ? 'No trains configured. Please add a train to begin monitoring.'
            : `Invalid Coach Identifier: ${coachNum}`}
        </h2>
        <p style={{ fontSize: '12px', color: '#64748B', margin: '0 0 16px 0' }}>
          Coach identifier must be in the standard railway range <strong>C1 to C24</strong> for Train {trainNum} ({trainMeta.name}).
        </p>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
          <button
            onClick={() => setSelectedCoachNumber('C1')}
            style={{
              padding: '6px 14px',
              backgroundColor: '#2563EB',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Select Coach C1
          </button>
          <button
            onClick={() => setActiveScreen('dashboard')}
            style={{
              padding: '6px 14px',
              backgroundColor: '#F1F5F9',
              color: '#475569',
              border: '1px solid #CBD5E1',
              borderRadius: '6px',
              fontSize: '11px',
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
      className="coach-details-container"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        boxSizing: 'border-box',
        width: '100%',
        minWidth: 0,
      }}
    >
      {/* =========================================================================
          SECTION A: COACH HEADER & NAVIGATION BAR
          ========================================================================= */}
      <div
        className="coach-details-header-card"
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '8px',
          border: '1px solid #E2E8F0',
          padding: '10px 14px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
        }}
      >
        {/* Navigation & Title Group */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setActiveScreen('trains')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '5px 10px',
              backgroundColor: '#F8FAFC',
              border: '1px solid #CBD5E1',
              borderRadius: '6px',
              color: '#0F172A',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.12s ease',
            }}
          >
            <ArrowLeft size={13} />
            <span>Train Management</span>
          </button>

          <button
            onClick={() => setActiveScreen('coaches')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '5px 10px',
              backgroundColor: '#F8FAFC',
              border: '1px solid #CBD5E1',
              borderRadius: '6px',
              color: '#475569',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Layers size={13} />
            <span>Consist</span>
          </button>

          {isAdmin && (
            <button
              id="coach-details-manage-coach-btn"
              onClick={() => setIsManageCoachOpen(true)}
              title="Manage Coach Fleet & Consist"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 10px',
                backgroundColor: '#EFF6FF',
                border: '1px solid #BFDBFE',
                borderRadius: '6px',
                color: '#2563EB',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.12s ease',
              }}
            >
              <SlidersHorizontal size={13} />
              <span>Manage Coach</span>
            </button>
          )}

          <button
            onClick={() => setIsAddDeviceOpen(true)}
            title="Register & Assign Device to this Coach"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '5px 10px',
              backgroundColor: '#EFF6FF',
              border: '1px solid #BFDBFE',
              borderRadius: '6px',
              color: '#2563EB',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.12s ease',
            }}
          >
            <Plus size={13} />
            <span>Add Device</span>
          </button>

          <div style={{ height: '20px', width: '1px', backgroundColor: '#E2E8F0' }} />

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  backgroundColor: '#2563EB',
                  color: '#FFFFFF',
                  fontSize: '9.5px',
                  fontWeight: 800,
                  padding: '2px 6px',
                  borderRadius: '4px',
                  letterSpacing: '0.4px',
                }}
              >
                COACH DETAILS
              </span>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>
                Coach {coachNum} &bull; {coachType}
              </h2>
            </div>
            <div style={{ fontSize: '11px', color: '#64748B', marginTop: '1px' }}>
              Train {trainNum} &ndash; {trainMeta.name} ({trainMeta.from} &rarr; {trainMeta.to}) &bull; Region: {trainMeta.region}
            </div>
          </div>
        </div>

        {/* Stepper Navigation (Prev / Next Coach) & Refresh */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            onClick={() => handleStepCoach('prev')}
            disabled={!canPrev}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '3px',
              padding: '5px 9px',
              backgroundColor: !canPrev ? '#F1F5F9' : '#FFFFFF',
              border: '1px solid #CBD5E1',
              borderRadius: '6px',
              color: !canPrev ? '#94A3B8' : '#0F172A',
              fontSize: '11px',
              fontWeight: 600,
              cursor: !canPrev ? 'not-allowed' : 'pointer',
            }}
          >
            <ChevronLeft size={13} />
            <span>Prev</span>
          </button>

          <span style={{ fontSize: '11px', fontWeight: 700, color: '#2563EB', padding: '0 4px', whiteSpace: 'nowrap' }}>
            {coachNum} / {availableCoaches.length > 0 ? `${availableCoaches.length} Coaches` : 'C24'}
          </span>

          <button
            onClick={() => handleStepCoach('next')}
            disabled={!canNext}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '3px',
              padding: '5px 9px',
              backgroundColor: !canNext ? '#F1F5F9' : '#FFFFFF',
              border: '1px solid #CBD5E1',
              borderRadius: '6px',
              color: !canNext ? '#94A3B8' : '#0F172A',
              fontSize: '11px',
              fontWeight: 600,
              cursor: !canNext ? 'not-allowed' : 'pointer',
            }}
          >
            <span>Next</span>
            <ChevronRight size={13} />
          </button>

          <button
            onClick={handleRefresh}
            title="Refresh Telemetry"
            style={{
              padding: '5px 8px',
              backgroundColor: '#EFF6FF',
              border: '1px solid #BFDBFE',
              borderRadius: '6px',
              color: '#2563EB',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* =========================================================================
          SECTION B: DEVICE INFORMATION & NODE HEALTH (SCADA STATUS STRIP)
          ========================================================================= */}
      <div
        className="coach-details-device-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
          gap: '10px',
        }}
      >
        {/* Card 1: Train & Coach */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '8px',
            border: '1px solid #E2E8F0',
            padding: '10px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)',
          }}
        >
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '6px',
              backgroundColor: '#EFF6FF',
              color: '#2563EB',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Train size={18} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 600 }}>TRAIN / COACH</div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {trainNum} &bull; {coachNum}
            </div>
          </div>
        </div>

        {/* Card 2: Assigned Device UID */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '8px',
            border: '1px solid #E2E8F0',
            padding: '10px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '6px',
                backgroundColor: '#F8FAFC',
                color: '#0F172A',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Cpu size={18} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 600 }}>ASSIGNED DEVICE</div>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {deviceId}
              </div>
            </div>
          </div>
          <button
            onClick={() => setIsAddDeviceOpen(true)}
            title="Register / Assign Device to this Coach"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 8px',
              backgroundColor: '#EFF6FF',
              border: '1px solid #BFDBFE',
              borderRadius: '6px',
              color: '#2563EB',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            <Plus size={12} />
            <span>Add Device</span>
          </button>
        </div>

        {/* Card 3: Device Connectivity Status */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '8px',
            border: '1px solid #E2E8F0',
            padding: '10px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)',
          }}
        >
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '6px',
              backgroundColor: isOnline ? '#ECFDF5' : '#FEF2F2',
              color: isOnline ? '#16A34A' : '#DC2626',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Activity size={18} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 600 }}>DEVICE STATUS</div>
            <div
              style={{
                fontSize: '13px',
                fontWeight: 800,
                color: isOnline ? '#16A34A' : '#DC2626',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {isOnline ? 'Online (Active)' : (!matchingDevice && !hasLiveTelemetry ? 'Offline (Unmapped)' : 'Offline (Standby)')}
            </div>
          </div>
        </div>

        {/* Card 4: Node Battery Level */}
        <div
          style={{
            backgroundColor: isBatteryLow ? '#FEF2F2' : '#FFFFFF',
            borderRadius: '8px',
            border: `1px solid ${isBatteryLow ? '#FCA5A5' : '#E2E8F0'}`,
            padding: '10px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)',
          }}
        >
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '6px',
              backgroundColor: isBatteryLow ? '#FEE2E2' : '#ECFDF5',
              color: isBatteryLow ? '#DC2626' : '#16A34A',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {isBatteryLow ? <BatteryWarning size={18} /> : <Battery size={18} />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#64748B', fontWeight: 600 }}>
              <span>NODE BATTERY</span>
              <strong style={{ color: isBatteryLow ? '#DC2626' : '#16A34A' }}>
                {batteryPercent != null ? `${batteryPercent}%` : 'Nominal'}
              </strong>
            </div>
            <div style={{ height: '5px', backgroundColor: '#E2E8F0', borderRadius: '3px', marginTop: '3px', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${batteryPercent != null ? batteryPercent : 85}%`,
                  height: '100%',
                  backgroundColor: isBatteryLow ? '#DC2626' : '#16A34A',
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          SECTIONS C & D: DUAL TANK MONITORING & TANK DIAGNOSTICS (SIDE BY SIDE)
          ========================================================================= */}
      <div
        className="coach-details-tanks-section"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '6px',
            padding: '0 2px',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>
              Dual Tank Monitoring &bull; Coach {coachNum}
            </h3>
            <div style={{ fontSize: '11px', color: '#64748B' }}>
              Side-by-side independent ultrasonic transceivers &bull; Sensor 1: Arrival Tank &bull; Sensor 2: Departure Tank
            </div>
          </div>
          <div style={{ fontSize: '11px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Clock size={12} />
            <span>Telemetry Stream: <strong>{isOnline && hasLiveTelemetry ? 'Active MQTT Stream' : 'Awaiting Link'}</strong></span>
          </div>
        </div>

        {/* Dual Tanks Grid — Side by Side on Desktop, Identical Dimensions */}
        <div
          className="coach-details-tanks-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))',
            gap: '12px',
            alignItems: 'stretch',
          }}
        >
          {/* Tank 1: Arrival Side */}
          <CoachDualTankCard
            tankId={`tank-${trainNum}-${coachNum}-arr`}
            tankIndex={1}
            tankName="Arrival Side (Tank 1)"
            sensorLabel="Sensor 1"
            capacityLiters={500.0}
            maxHeightCm={150.0}
            fillPercent={arrivalPercent}
            waterHeightCm={arrivalHeight}
            volumeLiters={arrivalVolume}
            isOnline={isOnline}
            hasTelemetry={arrivalPercent != null}
            isStale={false}
            lastUpdated={new Date().toISOString()}
            batteryPercent={batteryPercent}
            deviceId={deviceId}
            valveState={arrivalPercent != null && arrivalPercent < 15 ? 'ALERT' : 'NORMAL'}
          />

          {/* Tank 2: Departure Side */}
          <CoachDualTankCard
            tankId={`tank-${trainNum}-${coachNum}-dep`}
            tankIndex={2}
            tankName="Departure Side (Tank 2)"
            sensorLabel="Sensor 2"
            capacityLiters={500.0}
            maxHeightCm={150.0}
            fillPercent={departurePercent}
            waterHeightCm={departureHeight}
            volumeLiters={departureVolume}
            isOnline={isOnline}
            hasTelemetry={departurePercent != null}
            isStale={false}
            lastUpdated={new Date().toISOString()}
            batteryPercent={batteryPercent}
            deviceId={deviceId}
            valveState={departurePercent != null && departurePercent < 15 ? 'ALERT' : 'NORMAL'}
          />
        </div>
      </div>

      {/* =========================================================================
          SECTION E: TRAIN LOCATION & SATELLITE GPS TRACKING (MAP INTEGRATION)
          ========================================================================= */}
      <CoachMiniMap
        latitude={liveTelemetry?.lat}
        longitude={liveTelemetry?.long}
        speedKmh={liveTelemetry?.speed}
        trainNumber={trainNum}
        coachNumber={coachNum}
        isOnline={isOnline}
        hasGpsFix={Boolean(liveTelemetry && liveTelemetry.gpsFix !== false && liveTelemetry.lat != null)}
        lastUpdate={liveTelemetry?.time}
        onOpenFullMap={() => setActiveScreen('location')}
      />

      {/* =========================================================================
          SECTION F: BOTTOM ACTION BAR (HISTORY & NAVIGATION)
          ========================================================================= */}
      <div
        className="coach-details-actions-bar"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
          paddingTop: '2px',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          <button
            onClick={() => setActiveScreen('history')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              backgroundColor: '#FFFFFF',
              border: '1px solid #CBD5E1',
              borderRadius: '6px',
              color: '#0F172A',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
            }}
          >
            <LineChart size={14} color="#2563EB" />
            <span>Water Level History</span>
          </button>

          <button
            onClick={() => setActiveScreen('location')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              backgroundColor: '#FFFFFF',
              border: '1px solid #CBD5E1',
              borderRadius: '6px',
              color: '#0F172A',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
            }}
          >
            <MapPin size={14} color="#2563EB" />
            <span>GPS Corridor History</span>
          </button>
        </div>

        <button
          onClick={() => setActiveScreen('dashboard')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 16px',
            backgroundColor: '#2563EB',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '6px',
            fontSize: '11px',
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 1px 3px rgba(37,99,235,0.25)',
          }}
        >
          <ArrowLeft size={14} />
          <span>Back to Dashboard</span>
        </button>
      </div>

      {/* Manage Coach Modal */}
      <ManageCoachModal
        isOpen={isManageCoachOpen}
        onClose={() => setIsManageCoachOpen(false)}
        trainNumber={trainNum}
      />

      {/* Add Device Modal (Available to both Admin and Employee) */}
      <AddDeviceModal
        isOpen={isAddDeviceOpen}
        onClose={() => setIsAddDeviceOpen(false)}
        presetTrainNumber={trainNum}
        presetCoachNumber={coachNum}
        onSuccess={() => refreshData()}
      />
    </div>
  );
};

export default CoachDetailsScreen;
