import React, { useState, useEffect } from 'react';
import { colors, typography, metrics } from '../theme';
import { useApp } from '../state/AppContext';
import { useDisplayPreferences } from '../context/DisplayPreferencesContext';
import { ScalePreset } from '../services/displayPreferencesService';
import { ApiClient } from '../api/client';
import {
  Settings as SettingsIcon,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  ShieldAlert,
  Radio,
  Cpu,
  RefreshCw,
  Save,
  RotateCcw,
  Eye,
  EyeOff,
  Sliders,
  Monitor,
  MapPin,
  Bell,
  User,
  Layers,
  Navigation,
  Volume2,
  Globe,
  Trash2,
  Power,
  Check,
} from 'lucide-react';

import { DisplaySettingsPanel } from '../components/settings/DisplaySettingsPanel';
import {
  resolveApiBaseUrl,
  resolveHealthUrl,
  setCustomApiUrl,
  DEFAULT_PRODUCTION_API_URL,
  DEFAULT_LOCAL_API_URL,
} from '../config/apiConfig';

export const SettingsScreen: React.FC = () => {
  const { currentUser } = useApp();
  const [adminTab, setAdminTab] = useState<'system' | 'display'>('system');

  if (currentUser?.role !== 'ADMIN') {
    return <DisplaySettingsPanel />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: `${metrics.cardSpacing}px`, backgroundColor: colors.background, boxSizing: 'border-box', minHeight: '100%' }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
          borderBottom: `1px solid ${colors.border}`,
          paddingBottom: '12px',
        }}
      >
        <button
          onClick={() => setAdminTab('system')}
          style={{
            padding: '10px 16px',
            minHeight: '44px',
            borderRadius: '6px',
            border: `1px solid ${adminTab === 'system' ? colors.primaryBorder : colors.borderStrong}`,
            backgroundColor: adminTab === 'system' ? colors.primarySurface : colors.surfaceAlt,
            color: adminTab === 'system' ? colors.primary : colors.textSecondary,
            fontSize: '13px',
            fontWeight: adminTab === 'system' ? 700 : 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
          }}
        >
          <SettingsIcon size={14} />
          <span>System & Hardware Configuration</span>
        </button>
        <button
          onClick={() => setAdminTab('display')}
          style={{
            padding: '10px 16px',
            minHeight: '44px',
            borderRadius: '6px',
            border: `1px solid ${adminTab === 'display' ? colors.primaryBorder : colors.borderStrong}`,
            backgroundColor: adminTab === 'display' ? colors.primarySurface : colors.surfaceAlt,
            color: adminTab === 'display' ? colors.primary : colors.textSecondary,
            fontSize: '13px',
            fontWeight: adminTab === 'display' ? 700 : 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
          }}
        >
          <Sliders size={14} />
          <span>Display & Interface Preferences</span>
        </button>
      </div>
      {adminTab === 'display' ? <DisplaySettingsPanel isAdminView={true} /> : <AdminSystemSettings />}
    </div>
  );
};

const AdminSystemSettings: React.FC = () => {
  const {
    liveTank,
    refreshData,
    currentUser,
    connectionStatus,
    selectedTrainNumber,
    setSelectedTrainNumber,
    configuredTrains,
    alertConfig,
    updateAlertConfig,
    alertHistory,
    clearAlertHistory,
  } = useApp();

  const {
    displayScale,
    setDisplayScale,
    layoutDensity,
    setLayoutDensity,
    contrastMode,
    setContrastMode,
    resetDisplayPreferences,
  } = useDisplayPreferences();

  const isAdmin = currentUser?.role === 'ADMIN';

  // Section 1: General Settings
  const [systemName, setSystemName] = useState('Panorama Water Tank SCADA & HMI');
  const [scadaMode, setScadaMode] = useState<'PRODUCTION' | 'SIMULATION' | 'MAINTENANCE'>('PRODUCTION');
  const [clockFormat, setClockFormat] = useState<'12H' | '24H'>('12H');

  // Section 2: Appearance & Display
  const scalePresets = [
    { label: 'Compact', value: '90%' },
    { label: 'Small', value: '100%', isDefault: true },
    { label: 'Normal', value: '110%' },
    { label: 'Large', value: '120%' },
    { label: 'Extra Large', value: '130%' },
    { label: 'Maximum', value: '150%' },
  ];

  // Section 3: Device Configuration & Calibration
  const [deviceHost, setDeviceHost] = useState('192.168.4.1');
  const [devicePort, setDevicePort] = useState(80);
  const [refreshInterval, setRefreshInterval] = useState(3.0);
  const [tankShape, setTankShape] = useState<'CYLINDRICAL' | 'RECTANGULAR'>('CYLINDRICAL');
  const [tankHeight, setTankHeight] = useState(50.0);
  const [tankDiameter, setTankDiameter] = useState(22.56);
  const [tankCapacity, setTankCapacity] = useState(20.0);
  const [tankArea, setTankArea] = useState(0.04);
  const [sensorType, setSensorType] = useState('HYDROSTATIC_4_20MA');
  const [sensorZeroOffset, setSensorZeroOffset] = useState(0.0);
  const [sensorSpan, setSensorSpan] = useState(50.0);
  const [sensorFilterConstant, setSensorFilterConstant] = useState(1.0);
  const [sensorInvert, setSensorInvert] = useState(false);

  // Section 4: Network & Cloud Telemetry
  const [mqttBroker, setMqttBroker] = useState('broker.hivemq.com');
  const [mqttPort, setMqttPort] = useState(1883);
  const [mqttUseTls, setMqttUseTls] = useState(false);
  const [mqttTopic, setMqttTopic] = useState('panorama/telemetry/+');
  const [ubidotsHost, setUbidotsHost] = useState('https://industrial.api.ubidots.com');
  const [ubidotsLabel, setUbidotsLabel] = useState('wli');
  const [ubidotsToken, setUbidotsToken] = useState('BBUS-sample-token-live-telemetry');
  const [showToken, setShowToken] = useState(false);
  const [backendUrl, setBackendUrl] = useState<string>(() => resolveApiBaseUrl());
  const [backendTestStatus, setBackendTestStatus] = useState<string | null>(null);
  const [testingBackend, setTestingBackend] = useState<boolean>(false);

  // Section 5: Map & Location Settings
  const [defaultCorridor, setDefaultCorridor] = useState('ACTIVE_TRAIN_GPS');
  const [defaultMapEngine, setDefaultMapEngine] = useState<'OSM' | 'ESRI'>('OSM');
  const [gnssPollRate, setGnssPollRate] = useState(4);

  // Section 6: Notifications & Alerts
  const [alarmWarning, setAlarmWarning] = useState(20.0);
  const [alarmCritical, setAlarmCritical] = useState(10.0);
  const [alarmOverflow, setAlarmOverflow] = useState(100.0);
  const [alarmMasterEnabled, setAlarmMasterEnabled] = useState(alertConfig?.masterEnabled ?? true);
  const [alarmLowWaterEnabled, setAlarmLowWaterEnabled] = useState(alertConfig?.lowWaterEnabled ?? true);
  const [alarmSensorFaultEnabled, setAlarmSensorFaultEnabled] = useState(alertConfig?.sensorFaultEnabled ?? true);
  const [alarmDeviceOfflineEnabled, setAlarmDeviceOfflineEnabled] = useState(alertConfig?.deviceOfflineEnabled ?? true);
  const [alarmModemFailureEnabled, setAlarmModemFailureEnabled] = useState(alertConfig?.modemFailureEnabled ?? true);
  const [alarmOverflowEnabled, setAlarmOverflowEnabled] = useState(alertConfig?.overflowEnabled ?? true);
  const [alarmVoltageEnabled, setAlarmVoltageEnabled] = useState(alertConfig?.voltageEnabled ?? true);
  const [chimeEnabled, setChimeEnabled] = useState(true);
  const [emergencySms, setEmergencySms] = useState(false);
  const [autoAckTransients, setAutoAckTransients] = useState(true);
  const [isClearAlertHistoryModalOpen, setIsClearAlertHistoryModalOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 768 : true));

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (alertConfig) {
      setAlarmMasterEnabled(alertConfig.masterEnabled);
      setAlarmLowWaterEnabled(alertConfig.lowWaterEnabled);
      setAlarmSensorFaultEnabled(alertConfig.sensorFaultEnabled);
      setAlarmDeviceOfflineEnabled(alertConfig.deviceOfflineEnabled);
      setAlarmModemFailureEnabled(alertConfig.modemFailureEnabled);
      setAlarmOverflowEnabled(alertConfig.overflowEnabled);
      setAlarmVoltageEnabled(alertConfig.voltageEnabled);
    }
  }, [alertConfig]);

  // Section 7: User Preferences
  const [defaultStartupScreen, setDefaultStartupScreen] = useState('dashboard');
  const [soundEffects, setSoundEffects] = useState(true);

  // Status & Diagnostics
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [mqttTestResult, setMqttTestResult] = useState<string | null>(null);
  const [deviceTestResult, setDeviceTestResult] = useState<string | null>(null);
  const [isFactoryResetModalOpen, setIsFactoryResetModalOpen] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Active section tab ('all' or section id)
  const [selectedSectionTab, setSelectedSectionTab] = useState<string>('all');

  // Load configuration from backend
  const loadConfig = async () => {
    try {
      setLoading(true);
      const conf = await ApiClient.fetchUnifiedConfig();
      if (conf) {
        setMqttBroker(conf.mqtt_broker || 'broker.hivemq.com');
        setMqttPort(conf.mqtt_port || 1883);
        setMqttUseTls(Boolean(conf.mqtt_use_tls));
        setMqttTopic(conf.mqtt_topic || 'panorama/telemetry/+');
        setDeviceHost(conf.device_host || '192.168.4.1');
        setDevicePort(conf.device_port || 80);
        setRefreshInterval(conf.device_refresh_interval || 3.0);
        setUbidotsHost(conf.ubidots_host || 'https://industrial.api.ubidots.com');
        setUbidotsLabel(conf.ubidots_device_label || 'wli');
        setUbidotsToken(conf.ubidots_token || 'BBUS-sample-token-live-telemetry');
        setTankShape((conf.tank_shape as any) || 'CYLINDRICAL');
        setTankHeight(conf.tank_height_cm || 50.0);
        setTankDiameter(conf.tank_diameter_cm || 22.56);
        setTankCapacity(conf.tank_capacity_liters || 20.0);
        setTankArea(conf.tank_area_m2 || 0.04);
        setSensorType(conf.sensor_type || 'HYDROSTATIC_4_20MA');
        setSensorZeroOffset(conf.sensor_zero_offset_cm ?? 0.0);
        setSensorSpan(conf.sensor_span_cm || 50.0);
        setSensorFilterConstant(conf.sensor_filter_constant_sec || 1.0);
        setSensorInvert(Boolean(conf.sensor_invert));
        setAlarmWarning(conf.alarm_warning_percent || 20.0);
        setAlarmCritical(conf.alarm_critical_percent || 10.0);
        setAlarmOverflow(conf.alarm_overflow_percent || 100.0);
        if ((conf as any).alarm_master_enabled !== undefined) setAlarmMasterEnabled(Boolean((conf as any).alarm_master_enabled));
        if ((conf as any).alarm_low_water_enabled !== undefined) setAlarmLowWaterEnabled(Boolean((conf as any).alarm_low_water_enabled));
        if ((conf as any).alarm_sensor_fault_enabled !== undefined) setAlarmSensorFaultEnabled(Boolean((conf as any).alarm_sensor_fault_enabled));
        if ((conf as any).alarm_device_offline_enabled !== undefined) setAlarmDeviceOfflineEnabled(Boolean((conf as any).alarm_device_offline_enabled));
        if ((conf as any).alarm_modem_failure_enabled !== undefined) setAlarmModemFailureEnabled(Boolean((conf as any).alarm_modem_failure_enabled));
        if ((conf as any).alarm_overflow_enabled !== undefined) setAlarmOverflowEnabled(Boolean((conf as any).alarm_overflow_enabled));
        if ((conf as any).alarm_voltage_enabled !== undefined) setAlarmVoltageEnabled(Boolean((conf as any).alarm_voltage_enabled));
        setHasUnsavedChanges(false);
      }
    } catch (e: any) {
      console.warn('Failed to load settings:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
    const onSettingsUpdated = () => {
      loadConfig();
    };
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('panorama:settings-updated', onSettingsUpdated);
      return () => {
        window.removeEventListener('panorama:settings-updated', onSettingsUpdated);
      };
    }
  }, []);

  const handleDimensionChange = (height: number, diameter: number) => {
    setTankHeight(height);
    setTankDiameter(diameter);
    setHasUnsavedChanges(true);

    if (height > 0 && diameter > 0) {
      const radiusCm = diameter / 2.0;
      const volumeLiters = (Math.PI * Math.pow(radiusCm, 2) * height) / 1000.0;
      const areaM2 = Math.PI * Math.pow(radiusCm / 100.0, 2);
      setTankCapacity(parseFloat(volumeLiters.toFixed(2)));
      setTankArea(parseFloat(areaM2.toFixed(4)));
    }
  };

  const isThresholdOrderingValid = alarmCritical < alarmWarning && alarmWarning < alarmOverflow;

  const handleTestMqtt = async () => {
    try {
      setMqttTestResult('Testing broker connection...');
      const res = await ApiClient.testMqttConnection();
      setMqttTestResult(`Status: ${res.status} (${res.connected ? 'Connected' : 'Offline'}) — Host: ${res.broker}`);
    } catch (e: any) {
      setMqttTestResult(`Test Failed: ${e.message}`);
    }
  };

  const handleTestDevice = async () => {
    try {
      setDeviceTestResult('Testing Water Monitoring Device REST endpoint...');
      const res = await ApiClient.testDeviceConnection();
      setDeviceTestResult(`Status: ${res.status} — ${res.message} (${res.response_time_ms}ms)`);
    } catch (e: any) {
      setDeviceTestResult(`Device Unreachable: ${e.message}`);
    }
  };

  const handleReadFromDevice = async () => {
    try {
      setLoading(true);
      const res = await ApiClient.readDeviceConfig();
      if (res && res.geometry) {
        setTankCapacity(res.geometry.capacity_liters);
        setTankHeight(res.geometry.height_cm);
        setTankArea(res.geometry.area_m2);
        setAlarmWarning(res.alarm_thresholds.warning_percent);
        setAlarmCritical(res.alarm_thresholds.critical_percent);
        setAlarmOverflow(res.alarm_thresholds.overflow_percent);
        setActionMessage({
          text: `Successfully read verified parameters from Edge Node UID: ${res.device_uid}`,
          isError: false,
        });
        setTimeout(() => setActionMessage(null), 4000);
      }
    } catch (e: any) {
      setActionMessage({ text: `Failed to read from device: ${e.message}`, isError: true });
    } finally {
      setLoading(false);
    }
  };

  const handleTestBackend = async () => {
    setTestingBackend(true);
    setBackendTestStatus('Connecting to backend health probe...');
    try {
      const res = await fetch(resolveHealthUrl(backendUrl), {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (res.ok) {
        const json = await res.json().catch(() => ({}));
        setBackendTestStatus(`✓ Connected: HTTP 200 OK — ${json.app || 'Panorama Backend'} (${json.version || 'v2'})`);
      } else {
        setBackendTestStatus(`✗ Server responded with HTTP ${res.status}: ${res.statusText}`);
      }
    } catch (err: any) {
      setBackendTestStatus(`✗ Unreachable: ${err?.message || 'Connection refused / CORS blocked'}`);
    } finally {
      setTestingBackend(false);
    }
  };

  const handleApply = async () => {
    if (!isThresholdOrderingValid) {
      setActionMessage({
        text: 'Validation Error: Critical threshold must be lower than Warning, and Warning must be lower than Overflow.',
        isError: true,
      });
      return;
    }

    try {
      setLoading(true);
      const payload = {
        mqtt_broker: mqttBroker.trim(),
        mqtt_port: Number(mqttPort),
        mqtt_use_tls: mqttUseTls,
        mqtt_topic: mqttTopic.trim(),
        device_host: deviceHost.trim(),
        device_port: Number(devicePort),
        device_refresh_interval: Number(refreshInterval),
        ubidots_host: ubidotsHost.trim(),
        ubidots_device_label: ubidotsLabel.trim(),
        ubidots_token: ubidotsToken.trim(),
        tank_shape: tankShape,
        tank_height_cm: Number(tankHeight),
        tank_diameter_cm: Number(tankDiameter),
        tank_capacity_liters: Number(tankCapacity),
        tank_area_m2: Number(tankArea),
        sensor_type: sensorType,
        sensor_zero_offset_cm: Number(sensorZeroOffset),
        sensor_span_cm: Number(sensorSpan),
        sensor_filter_constant_sec: Number(sensorFilterConstant),
        sensor_invert: sensorInvert,
        alarm_warning_percent: Number(alarmWarning),
        alarm_critical_percent: Number(alarmCritical),
        alarm_overflow_percent: Number(alarmOverflow),
        alarm_master_enabled: alarmMasterEnabled,
        alarm_low_water_enabled: alarmLowWaterEnabled,
        alarm_sensor_fault_enabled: alarmSensorFaultEnabled,
        alarm_device_offline_enabled: alarmDeviceOfflineEnabled,
        alarm_modem_failure_enabled: alarmModemFailureEnabled,
        alarm_overflow_enabled: alarmOverflowEnabled,
        alarm_voltage_enabled: alarmVoltageEnabled,
      };

      await ApiClient.applyUnifiedConfig(payload);
      setCustomApiUrl(backendUrl);
      updateAlertConfig({
        masterEnabled: alarmMasterEnabled,
        criticalThreshold: Number(alarmCritical),
        warningThreshold: Number(alarmWarning),
        overflowThreshold: Number(alarmOverflow),
        lowWaterEnabled: alarmLowWaterEnabled,
        sensorFaultEnabled: alarmSensorFaultEnabled,
        deviceOfflineEnabled: alarmDeviceOfflineEnabled,
        modemFailureEnabled: alarmModemFailureEnabled,
        overflowEnabled: alarmOverflowEnabled,
        voltageEnabled: alarmVoltageEnabled,
      });
      setHasUnsavedChanges(false);
      setActionMessage({
        text: 'Configuration successfully validated and persisted to database & device entity.',
        isError: false,
      });
      setTimeout(() => setActionMessage(null), 4000);
      await refreshData();
    } catch (e: any) {
      setActionMessage({ text: `Save Failed: ${e.message}`, isError: true });
    } finally {
      setLoading(false);
    }
  };

  const handleFactoryResetConfirm = async () => {
    if (!isAdmin) {
      alert('Only administrators can perform a system factory reset.');
      return;
    }
    try {
      setLoading(true);
      await ApiClient.factoryResetConfig();
      setIsFactoryResetModalOpen(false);
      await loadConfig();
      setActionMessage({
        text: 'Factory reset completed. System restored to standard 20L / 50cm baseline.',
        isError: false,
      });
      setTimeout(() => setActionMessage(null), 4000);
      await refreshData();
    } catch (e: any) {
      setActionMessage({ text: `Factory reset failed: ${e.message}`, isError: true });
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmClearHistory = async () => {
    try {
      setLoading(true);
      await clearAlertHistory();
      setIsClearAlertHistoryModalOpen(false);
      setActionMessage({
        text: 'Alert history cleared successfully.',
        isError: false,
      });
      setTimeout(() => setActionMessage(null), 4000);
    } catch (e: any) {
      setActionMessage({ text: `Failed to clear alert history: ${e.message}`, isError: true });
    } finally {
      setLoading(false);
    }
  };

  const sections = [
    { id: 'all', title: 'All 7 Sections', icon: Sliders },
    { id: 'general', title: '1. General Settings', icon: Globe },
    { id: 'appearance', title: '2. Appearance & Display', icon: Monitor },
    { id: 'device', title: '3. Device Configuration', icon: Cpu },
    { id: 'network', title: '4. Network & Cloud Telemetry', icon: Radio },
    { id: 'map', title: '5. Map & Location Settings', icon: MapPin },
    { id: 'notifications', title: '6. Notifications & Alerts', icon: Bell },
    { id: 'user', title: '7. User Preferences', icon: User },
  ];

  return (
    <>
      {/* 1. Top Action & Status Bar */}
      <div
        style={{
          backgroundColor: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: `${metrics.cardRadius}px`,
          padding: isMobile ? '12px' : '14px 18px',
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          alignItems: isMobile ? 'stretch' : 'center',
          justifyContent: 'space-between',
          gap: isMobile ? '12px' : '16px',
          boxShadow: colors.shadowSubtle,
        }}
      >
        <div>
          <h2
            style={{
              fontSize: isMobile ? '16px' : '18px',
              fontWeight: 700,
              color: colors.textPrimary,
              margin: '0 0 2px 0',
              fontFamily: typography.fontFamily,
            }}
          >
            System Settings & Architecture
          </h2>
          <span style={{ fontSize: '11px', color: colors.textMuted }}>
            {systemName} • {isAdmin ? 'Administrator Access' : 'Operator Access (Read-Only Hardware)'}
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '8px',
            width: isMobile ? '100%' : 'auto',
          }}
        >
          {hasUnsavedChanges && (
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: colors.warning,
                backgroundColor: colors.warningSurface,
                padding: '6px 10px',
                borderRadius: '6px',
                border: `1px solid ${colors.warningBorder}`,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                width: isMobile ? '100%' : 'auto',
                justifyContent: isMobile ? 'center' : 'flex-start',
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: colors.warning }} />
              <span>Unsaved Changes</span>
            </span>
          )}

          <button
            onClick={handleReadFromDevice}
            disabled={loading}
            style={{
              flex: isMobile ? '1 1 calc(50% - 8px)' : 'none',
              minHeight: '44px',
              backgroundColor: colors.surfaceAlt,
              border: `1px solid ${colors.borderStrong}`,
              color: colors.textPrimary,
              padding: '8px 14px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <RefreshCw size={13} /> <span>Read Device</span>
          </button>

          <button
            onClick={loadConfig}
            style={{
              flex: isMobile ? '1 1 calc(50% - 8px)' : 'none',
              minHeight: '44px',
              backgroundColor: colors.surfaceAlt,
              border: `1px solid ${colors.borderStrong}`,
              color: colors.textSecondary,
              padding: '8px 14px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            Reset
          </button>

          <button
            onClick={handleApply}
            disabled={loading || !isAdmin}
            title={!isAdmin ? 'Administrator privileges required to persist hardware changes' : 'Save all settings'}
            style={{
              flex: isMobile ? '1 1 100%' : 'none',
              minHeight: '44px',
              backgroundColor: isAdmin ? colors.primary : '#94A3B8',
              border: 'none',
              color: colors.textOnPrimary,
              padding: '8px 18px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: isAdmin ? 'pointer' : 'not-allowed',
              boxShadow: '0 1px 2px rgba(37, 99, 235, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {loading ? 'Applying...' : 'Apply Configuration'}
          </button>

          {isAdmin && (
            <button
              onClick={() => setIsFactoryResetModalOpen(true)}
              style={{
                flex: isMobile ? '1 1 100%' : 'none',
                minHeight: '40px',
                backgroundColor: '#FFF1F2',
                border: '1px solid #FECDD3',
                color: '#E11D48',
                padding: '8px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              Factory Reset
            </button>
          )}
        </div>
      </div>

      {actionMessage && (
        <div
          style={{
            backgroundColor: actionMessage.isError ? colors.criticalSurface : colors.successSurface,
            border: `1px solid ${actionMessage.isError ? colors.criticalBorder : colors.successBorder}`,
            color: actionMessage.isError ? colors.critical : colors.success,
            borderRadius: `${metrics.cardRadius}px`,
            padding: '10px 16px',
            fontSize: '12px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          {actionMessage.isError ? <AlertCircle size={15} /> : <CheckCircle2 size={15} />}
          <span>{actionMessage.text}</span>
        </div>
      )}

      {/* 2. Navigation Tabs for the 7 Sections */}
      <div
        className="settings-section-pills"
        style={{
          display: 'flex',
          gap: '6px',
          backgroundColor: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: `${metrics.cardRadius}px`,
          padding: '6px',
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          flexWrap: isMobile ? 'nowrap' : 'wrap',
          boxSizing: 'border-box',
          width: '100%',
        }}
      >
        {sections.map((sec) => {
          const Icon = sec.icon;
          const isActive = selectedSectionTab === sec.id;
          return (
            <button
              key={sec.id}
              onClick={() => setSelectedSectionTab(sec.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 14px',
                minHeight: '44px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: isActive ? '#EFF6FF' : 'transparent',
                color: isActive ? '#1D4ED8' : colors.textSecondary,
                fontSize: '12px',
                fontWeight: isActive ? 700 : 500,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                transition: 'all 0.15s ease',
              }}
            >
              <Icon size={14} color={isActive ? '#2563EB' : colors.textMuted} />
              <span>{sec.title}</span>
            </button>
          );
        })}
      </div>

      {/* ========================================================================= */}
      {/* SECTION 1: General Settings */}
      {/* ========================================================================= */}
      {(selectedSectionTab === 'all' || selectedSectionTab === 'general') && (
        <div
          id="section-1-general"
          style={{
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: `${metrics.cardRadius}px`,
            padding: `${metrics.cardPadding}px`,
            boxShadow: colors.shadowSubtle,
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: colors.textPrimary }}>
              1. General System Settings
            </h3>
            <span style={{ fontSize: '11px', color: colors.textMuted }}>
              Core SCADA identity, operating mode, primary consist selection, and time display standards.
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: colors.textSecondary, marginBottom: '6px' }}>
                SCADA Facility & System Name
              </label>
              <input
                type="text"
                value={systemName}
                onChange={(e) => {
                  setSystemName(e.target.value);
                  setHasUnsavedChanges(true);
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: `1px solid ${colors.borderStrong}`,
                  fontSize: '13px',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: colors.textSecondary, marginBottom: '6px' }}>
                Operational Mode
              </label>
              <select
                value={scadaMode}
                onChange={(e) => {
                  setScadaMode(e.target.value as any);
                  setHasUnsavedChanges(true);
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: `1px solid ${colors.borderStrong}`,
                  fontSize: '13px',
                  backgroundColor: '#FFFFFF',
                }}
              >
                <option value="PRODUCTION">Production Fleet Monitoring</option>
                <option value="SIMULATION">Digital Twin Simulation</option>
                <option value="MAINTENANCE">Maintenance & Calibration Bench</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: colors.textSecondary, marginBottom: '6px' }}>
                Primary Train Consist
              </label>
              <select
                value={selectedTrainNumber}
                onChange={(e) => {
                  setSelectedTrainNumber(e.target.value);
                  setHasUnsavedChanges(true);
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: `1px solid ${colors.borderStrong}`,
                  fontSize: '13px',
                  backgroundColor: '#FFFFFF',
                }}
              >
                {configuredTrains.length === 0 ? (
                  <option value="">No trains configured</option>
                ) : (
                  configuredTrains.map((t) => (
                    <option key={t.train_number} value={t.train_number}>
                      Train {t.train_number} ({t.name})
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: colors.textSecondary, marginBottom: '6px' }}>
                Device Telemetry Cycle Rate (seconds)
              </label>
              <input
                type="number"
                step="0.5"
                min="0.5"
                max="60"
                value={refreshInterval}
                onChange={(e) => {
                  setRefreshInterval(parseFloat(e.target.value) || 3.0);
                  setHasUnsavedChanges(true);
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: `1px solid ${colors.borderStrong}`,
                  fontSize: '13px',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: colors.textSecondary, marginBottom: '6px' }}>
                Clock & Timestamp Standard
              </label>
              <div style={{ display: 'flex', gap: '10px' }}>
                {(['12H', '24H'] as const).map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => {
                      setClockFormat(fmt);
                      setHasUnsavedChanges(true);
                    }}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: `1px solid ${clockFormat === fmt ? '#2563EB' : colors.borderStrong}`,
                      backgroundColor: clockFormat === fmt ? '#EFF6FF' : '#FFFFFF',
                      color: clockFormat === fmt ? '#1D4ED8' : colors.textPrimary,
                      fontWeight: clockFormat === fmt ? 700 : 500,
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    {fmt === '12H' ? '12-Hour (AM/PM)' : '24-Hour (Railway)'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 2: Appearance & Display (User Core Requirement) */}
      {/* ========================================================================= */}
      {(selectedSectionTab === 'all' || selectedSectionTab === 'appearance') && (
        <div
          id="section-2-appearance"
          style={{
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: `${metrics.cardRadius}px`,
            padding: `${metrics.cardPadding}px`,
            boxShadow: colors.shadowSubtle,
            display: 'flex',
            flexDirection: 'column',
            gap: '22px',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: colors.textPrimary }}>
              2. Appearance & Display Settings
            </h3>
            <span style={{ fontSize: '11px', color: colors.textMuted }}>
              Adjust application typography, visual zoom scale, layout density, and contrast across the entire system.
            </span>
          </div>

          {/* Core Feature: Global Display Size Selection & Slider */}
          <div
            style={{
              backgroundColor: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '8px',
              padding: '18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <strong style={{ fontSize: '14px', color: '#0F172A' }}>Global Display Size & Scaling</strong>
                <p style={{ margin: '3px 0 0 0', fontSize: '11px', color: '#64748B' }}>
                  Scales Header, Sidebar, titles, cards, tables, buttons, inputs, dialogs, and map controls globally.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span
                  style={{
                    backgroundColor: '#EFF6FF',
                    color: '#1D4ED8',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 700,
                    border: '1px solid #BFDBFE',
                  }}
                >
                  Current: {displayScale}
                </span>

                <button
                  id="btn-reset-display-scale"
                  onClick={resetDisplayPreferences}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#FFFFFF',
                    color: colors.textPrimary,
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                  title="Reset to 100% default scale"
                >
                  <RotateCcw size={12} />
                  <span>Reset to Default</span>
                </button>
              </div>
            </div>

            {/* Scale Options Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                gap: '10px',
              }}
            >
              {scalePresets.map((preset) => {
                const isSelected = displayScale === preset.value;
                return (
                  <button
                    key={preset.value}
                    id={`btn-scale-preset-${preset.value.replace('%', '')}`}
                    onClick={() => setDisplayScale(preset.value as ScalePreset)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '12px 8px',
                      borderRadius: '8px',
                      border: isSelected ? '2px solid #2563EB' : '1px solid #CBD5E1',
                      backgroundColor: isSelected ? '#EFF6FF' : '#FFFFFF',
                      color: isSelected ? '#1D4ED8' : colors.textPrimary,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      position: 'relative',
                      boxShadow: isSelected ? '0 2px 8px rgba(37, 99, 235, 0.15)' : 'none',
                    }}
                  >
                    <span style={{ fontSize: '13px', fontWeight: 700 }}>{preset.label}</span>
                    <span style={{ fontSize: '15px', fontWeight: 800, marginTop: '2px' }}>{preset.value}</span>
                    {preset.isDefault && (
                      <span
                        style={{
                          marginTop: '4px',
                          fontSize: '9px',
                          fontWeight: 700,
                          backgroundColor: isSelected ? '#2563EB' : '#E2E8F0',
                          color: isSelected ? '#FFFFFF' : '#475569',
                          padding: '1px 5px',
                          borderRadius: '3px',
                        }}
                      >
                        DEFAULT
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Interactive Scale Slider */}
            <div style={{ marginTop: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748B', marginBottom: '6px' }}>
                <span>90% (Compact)</span>
                <span style={{ fontWeight: 700, color: '#2563EB' }}>100% (Small • Default)</span>
                <span>110% (Normal)</span>
                <span>120% (Large)</span>
                <span>130% (Extra Large)</span>
                <span>150% (Maximum)</span>
              </div>
              <input
                type="range"
                min="90"
                max="150"
                step="10"
                value={parseInt(displayScale) || 100}
                onChange={(e) => setDisplayScale(`${e.target.value}%` as ScalePreset)}
                style={{
                  width: '100%',
                  cursor: 'pointer',
                  accentColor: '#2563EB',
                }}
              />
            </div>
          </div>

          {/* Theme & Contrast Preferences */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: colors.textSecondary, marginBottom: '6px' }}>
                Visual Contrast Mode
              </label>
              <div style={{ display: 'flex', gap: '10px' }}>
                {[
                  { id: 'STANDARD', label: 'Standard Industrial' },
                  { id: 'HIGH_CONTRAST', label: 'High Contrast (Darker Lines)' },
                ].map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setContrastMode(c.id as any)}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: `1px solid ${contrastMode === c.id ? '#2563EB' : colors.borderStrong}`,
                      backgroundColor: contrastMode === c.id ? '#EFF6FF' : '#FFFFFF',
                      color: contrastMode === c.id ? '#1D4ED8' : colors.textPrimary,
                      fontWeight: contrastMode === c.id ? 700 : 500,
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: colors.textSecondary, marginBottom: '6px' }}>
                Layout Density
              </label>
              <div style={{ display: 'flex', gap: '10px' }}>
                {[
                  { id: 'COMFORTABLE', label: 'Comfortable' },
                  { id: 'COMPACT', label: 'Compact SCADA' },
                ].map((d) => (
                  <button
                    key={d.id}
                    onClick={() => setLayoutDensity(d.id as any)}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: `1px solid ${layoutDensity === d.id ? '#2563EB' : colors.borderStrong}`,
                      backgroundColor: layoutDensity === d.id ? '#EFF6FF' : '#FFFFFF',
                      color: layoutDensity === d.id ? '#1D4ED8' : colors.textPrimary,
                      fontWeight: layoutDensity === d.id ? 700 : 500,
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 3: Device Configuration */}
      {/* ========================================================================= */}
      {(selectedSectionTab === 'all' || selectedSectionTab === 'device') && (
        <div
          id="section-3-device"
          style={{
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: `${metrics.cardRadius}px`,
            padding: `${metrics.cardPadding}px`,
            boxShadow: colors.shadowSubtle,
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: colors.textPrimary }}>
                3. Device Configuration & Calibration
              </h3>
              <span style={{ fontSize: '11px', color: colors.textMuted }}>
                Edge gateway REST endpoints, physical tank geometry, sensor types & hydrostatic calibration.
              </span>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={handleTestDevice}
                style={{
                  backgroundColor: colors.surfaceAlt,
                  border: `1px solid ${colors.borderStrong}`,
                  padding: '5px 12px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <Cpu size={12} /> Test REST Endpoint
              </button>
            </div>
          </div>

          {deviceTestResult && (
            <div style={{ padding: '8px 12px', borderRadius: '6px', backgroundColor: '#F8FAFC', border: '1px solid #CBD5E1', fontSize: '11px', color: '#334155' }}>
              {deviceTestResult}
            </div>
          )}

          {/* Device REST Connection */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: colors.textSecondary, marginBottom: '6px' }}>
                Device Host / IP
              </label>
              <input
                type="text"
                disabled={!isAdmin}
                value={deviceHost}
                onChange={(e) => {
                  setDeviceHost(e.target.value);
                  setHasUnsavedChanges(true);
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: `1px solid ${colors.borderStrong}`,
                  fontSize: '13px',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: colors.textSecondary, marginBottom: '6px' }}>
                Device Port
              </label>
              <input
                type="number"
                disabled={!isAdmin}
                value={devicePort}
                onChange={(e) => {
                  setDevicePort(parseInt(e.target.value) || 80);
                  setHasUnsavedChanges(true);
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: `1px solid ${colors.borderStrong}`,
                  fontSize: '13px',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: colors.textSecondary, marginBottom: '6px' }}>
                Tank Physical Shape
              </label>
              <select
                disabled={!isAdmin}
                value={tankShape}
                onChange={(e) => {
                  setTankShape(e.target.value as any);
                  setHasUnsavedChanges(true);
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: `1px solid ${colors.borderStrong}`,
                  fontSize: '13px',
                  backgroundColor: '#FFFFFF',
                }}
              >
                <option value="CYLINDRICAL">Cylindrical (Vertical)</option>
                <option value="RECTANGULAR">Rectangular Prism</option>
              </select>
            </div>
          </div>

          {/* Tank Geometry */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: colors.textSecondary, marginBottom: '6px' }}>
                Tank Height (cm)
              </label>
              <input
                type="number"
                disabled={!isAdmin}
                step="0.1"
                value={tankHeight}
                onChange={(e) => handleDimensionChange(parseFloat(e.target.value) || 0, tankDiameter)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: `1px solid ${colors.borderStrong}`,
                  fontSize: '13px',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: colors.textSecondary, marginBottom: '6px' }}>
                Tank Diameter (cm)
              </label>
              <input
                type="number"
                disabled={!isAdmin}
                step="0.1"
                value={tankDiameter}
                onChange={(e) => handleDimensionChange(tankHeight, parseFloat(e.target.value) || 0)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: `1px solid ${colors.borderStrong}`,
                  fontSize: '13px',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: colors.textSecondary, marginBottom: '6px' }}>
                Capacity (Liters)
              </label>
              <input
                type="number"
                disabled={!isAdmin}
                step="0.1"
                value={tankCapacity}
                onChange={(e) => {
                  setTankCapacity(parseFloat(e.target.value) || 0);
                  setHasUnsavedChanges(true);
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: `1px solid ${colors.borderStrong}`,
                  fontSize: '13px',
                  backgroundColor: '#F8FAFC',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: colors.textSecondary, marginBottom: '6px' }}>
                Cross-Sectional Area (m²)
              </label>
              <input
                type="number"
                disabled
                value={tankArea}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: `1px solid ${colors.borderStrong}`,
                  fontSize: '13px',
                  backgroundColor: '#F1F5F9',
                }}
              />
            </div>
          </div>

          {/* Sensor Calibration */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: colors.textSecondary, marginBottom: '6px' }}>
                Sensor Type
              </label>
              <select
                disabled={!isAdmin}
                value={sensorType}
                onChange={(e) => {
                  setSensorType(e.target.value);
                  setHasUnsavedChanges(true);
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: `1px solid ${colors.borderStrong}`,
                  fontSize: '13px',
                  backgroundColor: '#FFFFFF',
                }}
              >
                <option value="HYDROSTATIC_4_20MA">Hydrostatic 4-20mA Pressure</option>
                <option value="ULTRASONIC_RS485">Ultrasonic Modbus RS485</option>
                <option value="SUBMERSIBLE_PRESSURE">Submersible Level Probe</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: colors.textSecondary, marginBottom: '6px' }}>
                Zero Offset (cm)
              </label>
              <input
                type="number"
                disabled={!isAdmin}
                step="0.1"
                value={sensorZeroOffset}
                onChange={(e) => {
                  setSensorZeroOffset(parseFloat(e.target.value) || 0);
                  setHasUnsavedChanges(true);
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: `1px solid ${colors.borderStrong}`,
                  fontSize: '13px',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: colors.textSecondary, marginBottom: '6px' }}>
                Calibration Span (cm)
              </label>
              <input
                type="number"
                disabled={!isAdmin}
                step="0.1"
                value={sensorSpan}
                onChange={(e) => {
                  setSensorSpan(parseFloat(e.target.value) || 50.0);
                  setHasUnsavedChanges(true);
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: `1px solid ${colors.borderStrong}`,
                  fontSize: '13px',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: colors.textSecondary, marginBottom: '6px' }}>
                Filter Constant (seconds)
              </label>
              <input
                type="number"
                disabled={!isAdmin}
                step="0.1"
                value={sensorFilterConstant}
                onChange={(e) => {
                  setSensorFilterConstant(parseFloat(e.target.value) || 1.0);
                  setHasUnsavedChanges(true);
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: `1px solid ${colors.borderStrong}`,
                  fontSize: '13px',
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 4: Network & Cloud Telemetry */}
      {/* ========================================================================= */}
      {(selectedSectionTab === 'all' || selectedSectionTab === 'network') && (
        <div
          id="section-4-network"
          style={{
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: `${metrics.cardRadius}px`,
            padding: `${metrics.cardPadding}px`,
            boxShadow: colors.shadowSubtle,
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: colors.textPrimary }}>
                4. Network & Cloud Telemetry
              </h3>
              <span style={{ fontSize: '11px', color: colors.textMuted }}>
                MQTT Broker configurations, TLS encryption, and Ubidots Industrial Cloud Gateway.
              </span>
            </div>

            <button
              onClick={handleTestMqtt}
              style={{
                backgroundColor: colors.surfaceAlt,
                border: `1px solid ${colors.borderStrong}`,
                padding: '5px 12px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <Radio size={12} /> Test MQTT Broker
            </button>
          </div>

          {mqttTestResult && (
            <div style={{ padding: '8px 12px', borderRadius: '6px', backgroundColor: '#F8FAFC', border: '1px solid #CBD5E1', fontSize: '11px', color: '#334155' }}>
              {mqttTestResult}
            </div>
          )}

          {/* Central REST API Backend Gateway */}
          <div style={{ backgroundColor: colors.surfaceAlt, padding: '14px', borderRadius: '8px', border: `1px solid ${colors.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <span style={{ fontSize: '13px', fontWeight: 700, color: colors.textPrimary }}>
                  Central SCADA REST API Gateway
                </span>
                <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: colors.textMuted }}>
                  Authoritative endpoint for trains, coach consists, physical tank parameters, and SCADA alarms.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => { setBackendUrl(DEFAULT_LOCAL_API_URL); setHasUnsavedChanges(true); }}
                  style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '4px', border: `1px solid ${colors.border}`, backgroundColor: colors.surface, cursor: 'pointer', color: colors.textPrimary }}
                >
                  Local (8000)
                </button>
                <button
                  type="button"
                  onClick={() => { setBackendUrl(DEFAULT_PRODUCTION_API_URL); setHasUnsavedChanges(true); }}
                  style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '4px', border: `1px solid ${colors.border}`, backgroundColor: colors.surface, cursor: 'pointer', color: colors.textPrimary }}
                >
                  Render Cloud
                </button>
                <button
                  type="button"
                  onClick={handleTestBackend}
                  disabled={testingBackend}
                  style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '4px', border: 'none', backgroundColor: '#2563EB', color: '#fff', cursor: 'pointer', fontWeight: 600 }}
                >
                  {testingBackend ? 'Probing...' : 'Test API'}
                </button>
              </div>
            </div>
            <input
              type="text"
              disabled={!isAdmin}
              value={backendUrl}
              onChange={(e) => {
                setBackendUrl(e.target.value);
                setHasUnsavedChanges(true);
              }}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                border: `1px solid ${colors.borderStrong}`,
                backgroundColor: colors.surface,
                color: colors.textPrimary,
                fontSize: '12px',
                fontFamily: 'monospace',
                boxSizing: 'border-box',
              }}
              placeholder="e.g. http://127.0.0.1:8000/api/v1"
            />
            {backendTestStatus && (
              <div style={{ marginTop: '8px', fontSize: '11px', color: backendTestStatus.startsWith('✓') ? '#16A34A' : '#DC2626', fontWeight: 600 }}>
                {backendTestStatus}
              </div>
            )}
          </div>

          {/* MQTT Settings */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: colors.textSecondary, marginBottom: '6px' }}>
                MQTT Broker Host
              </label>
              <input
                type="text"
                disabled={!isAdmin}
                value={mqttBroker}
                onChange={(e) => {
                  setMqttBroker(e.target.value);
                  setHasUnsavedChanges(true);
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: `1px solid ${colors.borderStrong}`,
                  fontSize: '13px',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: colors.textSecondary, marginBottom: '6px' }}>
                Broker Port
              </label>
              <input
                type="number"
                disabled={!isAdmin}
                value={mqttPort}
                onChange={(e) => {
                  setMqttPort(parseInt(e.target.value) || 1883);
                  setHasUnsavedChanges(true);
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: `1px solid ${colors.borderStrong}`,
                  fontSize: '13px',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: colors.textSecondary, marginBottom: '6px' }}>
                Telemetry Topic Pattern
              </label>
              <input
                type="text"
                disabled={!isAdmin}
                value={mqttTopic}
                onChange={(e) => {
                  setMqttTopic(e.target.value);
                  setHasUnsavedChanges(true);
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: `1px solid ${colors.borderStrong}`,
                  fontSize: '13px',
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '24px' }}>
              <input
                type="checkbox"
                id="tls-checkbox"
                disabled={!isAdmin}
                checked={mqttUseTls}
                onChange={(e) => {
                  setMqttUseTls(e.target.checked);
                  setHasUnsavedChanges(true);
                }}
                style={{ width: 16, height: 16, accentColor: colors.primary }}
              />
              <label htmlFor="tls-checkbox" style={{ fontSize: '13px', fontWeight: 600, color: colors.textPrimary, cursor: 'pointer' }}>
                Enforce MQTTS TLS (Port 8883)
              </label>
            </div>
          </div>

          {/* Ubidots Cloud Integration */}
          <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: colors.textPrimary }}>
              Ubidots Cloud Industrial Gateway
            </h4>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: colors.textSecondary, marginBottom: '6px' }}>
                  Cloud API Endpoint
                </label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={ubidotsHost}
                  onChange={(e) => {
                    setUbidotsHost(e.target.value);
                    setHasUnsavedChanges(true);
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: `1px solid ${colors.borderStrong}`,
                    fontSize: '13px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: colors.textSecondary, marginBottom: '6px' }}>
                  Device Label
                </label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={ubidotsLabel}
                  onChange={(e) => {
                    setUbidotsLabel(e.target.value);
                    setHasUnsavedChanges(true);
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: `1px solid ${colors.borderStrong}`,
                    fontSize: '13px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: colors.textSecondary, marginBottom: '6px' }}>
                  Ubidots Auth Token
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showToken ? 'text' : 'password'}
                    disabled={!isAdmin}
                    value={ubidotsToken}
                    onChange={(e) => {
                      setUbidotsToken(e.target.value);
                      setHasUnsavedChanges(true);
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 36px 8px 12px',
                      borderRadius: '6px',
                      border: `1px solid ${colors.borderStrong}`,
                      fontSize: '13px',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    style={{
                      position: 'absolute',
                      right: '8px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: colors.textMuted,
                    }}
                  >
                    {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 5: Map & Location Settings */}
      {/* ========================================================================= */}
      {(selectedSectionTab === 'all' || selectedSectionTab === 'map') && (
        <div
          id="section-5-map"
          style={{
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: `${metrics.cardRadius}px`,
            padding: `${metrics.cardPadding}px`,
            boxShadow: colors.shadowSubtle,
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: colors.textPrimary }}>
              5. Map & Location Settings
            </h3>
            <span style={{ fontSize: '11px', color: colors.textMuted }}>
              Railway corridor definitions, cartography layers, GNSS polling, and track winding models.
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: colors.textSecondary, marginBottom: '6px' }}>
                Default Map Tracking Mode
              </label>
              <select
                value={defaultCorridor}
                onChange={(e) => {
                  setDefaultCorridor(e.target.value);
                  setHasUnsavedChanges(true);
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: `1px solid ${colors.borderStrong}`,
                  fontSize: '13px',
                  backgroundColor: '#FFFFFF',
                }}
              >
                <option value="ACTIVE_TRAIN_GPS">Follow Active Train MQTT GPS Telemetry</option>
                <option value="ALL_INDIA_NETWORK">All-India Fleet Telemetry Overview</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: colors.textSecondary, marginBottom: '6px' }}>
                Default Map Engine & Cartography
              </label>
              <div style={{ display: 'flex', gap: '10px' }}>
                {[
                  { id: 'OSM', label: 'OpenStreetMap Standard' },
                  { id: 'ESRI', label: 'Esri Satellite Imagery' },
                ].map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      setDefaultMapEngine(m.id as any);
                      setHasUnsavedChanges(true);
                    }}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: `1px solid ${defaultMapEngine === m.id ? '#2563EB' : colors.borderStrong}`,
                      backgroundColor: defaultMapEngine === m.id ? '#EFF6FF' : '#FFFFFF',
                      color: defaultMapEngine === m.id ? '#1D4ED8' : colors.textPrimary,
                      fontWeight: defaultMapEngine === m.id ? 700 : 500,
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: colors.textSecondary, marginBottom: '6px' }}>
                GNSS Telemetry Polling Rate (seconds)
              </label>
              <input
                type="number"
                min="1"
                max="60"
                value={gnssPollRate}
                onChange={(e) => {
                  setGnssPollRate(parseInt(e.target.value) || 4);
                  setHasUnsavedChanges(true);
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: `1px solid ${colors.borderStrong}`,
                  fontSize: '13px',
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 6: Notifications & Alerts */}
      {/* ========================================================================= */}
      {(selectedSectionTab === 'all' || selectedSectionTab === 'notifications') && (
        <div
          id="section-6-notifications"
          style={{
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: `${metrics.cardRadius}px`,
            padding: `${metrics.cardPadding}px`,
            boxShadow: colors.shadowSubtle,
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: colors.textPrimary }}>
              6. Notifications & Alarm Setpoints
            </h3>
            <span style={{ fontSize: '11px', color: colors.textMuted }}>
              Industrial water level thresholds, master alert engine, category filtering, and telemetry event ledger.
            </span>
          </div>

          {/* Master Enable/Disable All Alerts Toggle */}
          <div
            style={{
              backgroundColor: alarmMasterEnabled ? '#F0FDF4' : '#F8FAFC',
              border: `1.5px solid ${alarmMasterEnabled ? '#86EFAC' : '#CBD5E1'}`,
              borderRadius: '8px',
              padding: '14px',
              display: 'flex',
              flexDirection: isMobile ? 'column' : 'row',
              alignItems: isMobile ? 'flex-start' : 'center',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  backgroundColor: alarmMasterEnabled ? '#DCFCE7' : '#E2E8F0',
                  color: alarmMasterEnabled ? '#16A34A' : '#64748B',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Power size={18} />
              </div>
              <div>
                <strong style={{ fontSize: '13px', color: alarmMasterEnabled ? '#15803D' : '#334155' }}>
                  Master SCADA Alert Engine
                </strong>
                <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: alarmMasterEnabled ? '#166534' : '#64748B' }}>
                  {alarmMasterEnabled
                    ? 'Active: Real-time telemetry monitoring, audio chimes, and UI banner dispatches enabled.'
                    : 'Muted: All audio and visual alarm notifications are currently silenced.'}
                </p>
              </div>
            </div>

            <button
              onClick={() => {
                setAlarmMasterEnabled(!alarmMasterEnabled);
                setHasUnsavedChanges(true);
              }}
              disabled={!isAdmin}
              style={{
                minHeight: '44px',
                padding: '8px 18px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: alarmMasterEnabled ? '#16A34A' : '#64748B',
                color: '#FFFFFF',
                fontSize: '12px',
                fontWeight: 700,
                cursor: isAdmin ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                width: isMobile ? '100%' : 'auto',
              }}
            >
              <Power size={14} />
              <span>{alarmMasterEnabled ? 'ENABLED (Click to Mute)' : 'MUTED (Click to Enable)'}</span>
            </button>
          </div>

          {/* Threshold Inputs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: colors.critical, marginBottom: '6px' }}>
                Critical Low Alarm (&lt; 10%)
              </label>
              <input
                type="number"
                disabled={!isAdmin}
                step="1"
                min="1"
                max="90"
                value={alarmCritical}
                onChange={(e) => {
                  setAlarmCritical(parseFloat(e.target.value) || 0);
                  setHasUnsavedChanges(true);
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: `1px solid ${colors.criticalBorder}`,
                  fontSize: '13px',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: colors.warning, marginBottom: '6px' }}>
                Warning Low Alarm (&lt; 20%)
              </label>
              <input
                type="number"
                disabled={!isAdmin}
                step="1"
                min="5"
                max="95"
                value={alarmWarning}
                onChange={(e) => {
                  setAlarmWarning(parseFloat(e.target.value) || 0);
                  setHasUnsavedChanges(true);
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: `1px solid ${colors.warningBorder}`,
                  fontSize: '13px',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: colors.primary, marginBottom: '6px' }}>
                Overflow High Alarm (&ge; 100%)
              </label>
              <input
                type="number"
                disabled={!isAdmin}
                step="1"
                min="90"
                max="120"
                value={alarmOverflow}
                onChange={(e) => {
                  setAlarmOverflow(parseFloat(e.target.value) || 100);
                  setHasUnsavedChanges(true);
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: `1px solid ${colors.primaryBorder}`,
                  fontSize: '13px',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* Visual Threshold Bar */}
          <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '14px', boxSizing: 'border-box' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: colors.textSecondary }}>
              Visual Threshold Hierarchy:
            </span>
            <div style={{ display: 'flex', height: '14px', borderRadius: '7px', overflow: 'hidden', marginTop: '8px' }}>
              <div style={{ width: `${Math.min(100, Math.max(0, alarmCritical))}%`, backgroundColor: '#EF4444' }} title={`Critical Low: < ${alarmCritical}%`} />
              <div style={{ width: `${Math.min(100, Math.max(0, alarmWarning - alarmCritical))}%`, backgroundColor: '#F59E0B' }} title={`Warning Low: ${alarmCritical}% to ${alarmWarning}%`} />
              <div style={{ width: `${Math.min(100, Math.max(0, alarmOverflow - alarmWarning))}%`, backgroundColor: '#10B981' }} title={`Normal: ${alarmWarning}% to ${alarmOverflow}%`} />
              <div style={{ width: '10%', backgroundColor: '#3B82F6' }} title={`Overflow: >= ${alarmOverflow}%`} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#64748B', marginTop: '4px', flexWrap: 'wrap' }}>
              <span>0%</span>
              <span>Critical: &lt;{alarmCritical}%</span>
              <span>Warning: &lt;{alarmWarning}%</span>
              <span>Overflow: &ge;{alarmOverflow}%</span>
            </div>
          </div>

          {/* Monitored Alert Categories Grid */}
          <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '14px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: colors.textPrimary, display: 'block', marginBottom: '8px' }}>
              Monitored Alert Categories:
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: '10px' }}>
              {[
                { key: 'lowWater', label: 'Low Water Level Alert', desc: 'Trigger on <10% (Critical) and <20% (Warning)', checked: alarmLowWaterEnabled, set: setAlarmLowWaterEnabled },
                { key: 'sensorFault', label: 'Sensor Fault & Disconnect', desc: 'Trigger on invalid ADC reading or unseated probe', checked: alarmSensorFaultEnabled, set: setAlarmSensorFaultEnabled },
                { key: 'deviceOffline', label: 'Device Offline Detection', desc: 'Trigger on missing telemetry heartbeats', checked: alarmDeviceOfflineEnabled, set: setAlarmDeviceOfflineEnabled },
                { key: 'modemFailure', label: 'Modem & Cellular Failure', desc: 'Trigger on carrier network disconnect', checked: alarmModemFailureEnabled, set: setAlarmModemFailureEnabled },
                { key: 'overflow', label: 'Tank Overflow Protection', desc: 'Trigger when fill level reaches >=100%', checked: alarmOverflowEnabled, set: setAlarmOverflowEnabled },
                { key: 'voltage', label: 'Low Voltage & Power Bus', desc: 'Trigger when battery < 40% or bus < 10.5V', checked: alarmVoltageEnabled, set: setAlarmVoltageEnabled },
              ].map((cat) => (
                <label
                  key={cat.key}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    backgroundColor: cat.checked ? '#F0F9FF' : '#F8FAFC',
                    border: `1px solid ${cat.checked ? '#BAE6FD' : '#E2E8F0'}`,
                    cursor: isAdmin ? 'pointer' : 'default',
                    boxSizing: 'border-box',
                  }}
                >
                  <input
                    type="checkbox"
                    disabled={!isAdmin}
                    checked={cat.checked}
                    onChange={(e) => {
                      cat.set(e.target.checked);
                      setHasUnsavedChanges(true);
                    }}
                    style={{ width: 18, height: 18, marginTop: '2px', accentColor: colors.primary }}
                  />
                  <div>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: cat.checked ? '#0369A1' : colors.textPrimary, display: 'block' }}>
                      {cat.label}
                    </span>
                    <span style={{ fontSize: '10px', color: colors.textMuted }}>
                      {cat.desc}
                    </span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Alarm Action Toggles */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderTop: '1px solid #E2E8F0', paddingTop: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                id="chime-checkbox"
                checked={chimeEnabled}
                onChange={(e) => {
                  setChimeEnabled(e.target.checked);
                  setHasUnsavedChanges(true);
                }}
                style={{ width: 16, height: 16, accentColor: colors.primary }}
              />
              <label htmlFor="chime-checkbox" style={{ fontSize: '12px', fontWeight: 600, color: colors.textPrimary, cursor: 'pointer' }}>
                Sound audible acoustic chime on Critical Low Alarm events
              </label>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                id="sms-checkbox"
                checked={emergencySms}
                onChange={(e) => {
                  setEmergencySms(e.target.checked);
                  setHasUnsavedChanges(true);
                }}
                style={{ width: 16, height: 16, accentColor: colors.primary }}
              />
              <label htmlFor="sms-checkbox" style={{ fontSize: '12px', fontWeight: 600, color: colors.textPrimary, cursor: 'pointer' }}>
                Transmit emergency SMS/Email notification to Depot Superintendant on tank empty (&lt; 5%)
              </label>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                id="auto-ack-checkbox"
                checked={autoAckTransients}
                onChange={(e) => {
                  setAutoAckTransients(e.target.checked);
                  setHasUnsavedChanges(true);
                }}
                style={{ width: 16, height: 16, accentColor: colors.primary }}
              />
              <label htmlFor="auto-ack-checkbox" style={{ fontSize: '12px', fontWeight: 600, color: colors.textPrimary, cursor: 'pointer' }}>
                Auto-acknowledge transient sensor sloshing spikes once level returns to nominal
              </label>
            </div>
          </div>

          {/* Real-Time Telemetry Alert History Viewer */}
          <div
            style={{
              borderTop: '1px solid #E2E8F0',
              paddingTop: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: isMobile ? 'column' : 'row',
                alignItems: isMobile ? 'flex-start' : 'center',
                justifyContent: 'space-between',
                gap: '8px',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: colors.textPrimary }}>
                    Real-Time Telemetry Alert History
                  </h4>
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      backgroundColor: '#F1F5F9',
                      color: '#475569',
                      padding: '2px 8px',
                      borderRadius: '12px',
                    }}
                  >
                    {alertHistory.length} Recorded Events
                  </span>
                </div>
                <span style={{ fontSize: '11px', color: colors.textMuted }}>
                  Authoritative telemetry audit trail across fleet coaches and physical edge devices.
                </span>
              </div>

              <button
                onClick={() => setIsClearAlertHistoryModalOpen(true)}
                disabled={!isAdmin || alertHistory.length === 0}
                style={{
                  minHeight: '44px',
                  padding: '8px 14px',
                  borderRadius: '6px',
                  border: `1px solid ${alertHistory.length === 0 ? '#E2E8F0' : '#FECDD3'}`,
                  backgroundColor: alertHistory.length === 0 ? '#F8FAFC' : '#FFF1F2',
                  color: alertHistory.length === 0 ? '#94A3B8' : '#E11D48',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: (isAdmin && alertHistory.length > 0) ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  width: isMobile ? '100%' : 'auto',
                }}
              >
                <Trash2 size={13} />
                <span>Clear Alert History</span>
              </button>
            </div>

            {/* Alert History Items */}
            {alertHistory.length === 0 ? (
              <div
                style={{
                  padding: '24px',
                  backgroundColor: '#F8FAFC',
                  borderRadius: '8px',
                  border: '1px dashed #CBD5E1',
                  textAlign: 'center',
                  color: '#64748B',
                  fontSize: '12px',
                }}
              >
                <CheckCircle2 size={24} color="#10B981" style={{ margin: '0 auto 6px auto', display: 'block' }} />
                <span>No alert events recorded. All telemetry channels operating nominally.</span>
              </div>
            ) : (
              <div
                style={{
                  maxHeight: '300px',
                  overflowY: 'auto',
                  borderRadius: '8px',
                  border: '1px solid #E2E8F0',
                  boxSizing: 'border-box',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {alertHistory.map((item, idx) => {
                    const isCrit = item.severity === 'CRITICAL';
                    const isWarn = item.severity === 'WARNING';
                    const badgeBg = isCrit ? '#FEF2F2' : isWarn ? '#FFFBEB' : '#ECFDF5';
                    const badgeColor = isCrit ? '#DC2626' : isWarn ? '#D97706' : '#16A34A';
                    const badgeBorder = isCrit ? '#FECACA' : isWarn ? '#FDE68A' : '#A7F3D0';

                    return (
                      <div
                        key={item.id || idx}
                        style={{
                          padding: '10px 12px',
                          borderBottom: idx === alertHistory.length - 1 ? 'none' : '1px solid #F1F5F9',
                          backgroundColor: idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC',
                          display: 'flex',
                          flexDirection: isMobile ? 'column' : 'row',
                          alignItems: isMobile ? 'flex-start' : 'center',
                          justifyContent: 'space-between',
                          gap: '6px',
                          fontSize: '12px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: 700,
                              backgroundColor: badgeBg,
                              color: badgeColor,
                              border: `1px solid ${badgeBorder}`,
                              padding: '2px 8px',
                              borderRadius: '4px',
                            }}
                          >
                            {item.severity}
                          </span>
                          <span style={{ fontWeight: 600, color: colors.textPrimary }}>
                            {item.alertType.replace(/_/g, ' ')}
                          </span>
                          <span style={{ color: colors.textMuted, fontSize: '11px' }}>
                            • {item.target}
                          </span>
                          {item.waterLevel != null && (
                            <span style={{ fontWeight: 600, color: badgeColor, fontSize: '11px' }}>
                              ({item.waterLevel.toFixed(1)}%)
                            </span>
                          )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: isMobile ? '100%' : 'auto', justifyContent: isMobile ? 'space-between' : 'flex-end' }}>
                          <span style={{ fontSize: '11px', color: '#64748B' }}>
                            {item.description}
                          </span>
                          <span style={{ fontSize: '10px', color: '#94A3B8', whiteSpace: 'nowrap' }}>
                            {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 7: User Preferences */}
      {/* ========================================================================= */}
      {(selectedSectionTab === 'all' || selectedSectionTab === 'user') && (
        <div
          id="section-7-user"
          style={{
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: `${metrics.cardRadius}px`,
            padding: `${metrics.cardPadding}px`,
            boxShadow: colors.shadowSubtle,
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: colors.textPrimary }}>
              7. User Preferences & Session Profile
            </h3>
            <span style={{ fontSize: '11px', color: colors.textMuted }}>
              Signed-in operator details, default startup view, sound effects, and administrative factory restoration.
            </span>
          </div>

          {/* User Profile Card */}
          <div
            style={{
              backgroundColor: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '8px',
              padding: '16px',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
              gap: '14px',
            }}
          >
            <div>
              <span style={{ fontSize: '11px', color: '#64748B' }}>User Identifier</span>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>
                {currentUser?.username || 'admin'}
              </div>
            </div>

            <div>
              <span style={{ fontSize: '11px', color: '#64748B' }}>Full Name</span>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>
                {currentUser?.full_name || 'System Administrator'}
              </div>
            </div>

            <div>
              <span style={{ fontSize: '11px', color: '#64748B' }}>Role Authorization</span>
              <div style={{ marginTop: '2px' }}>
                <span
                  style={{
                    backgroundColor: isAdmin ? '#ECFDF5' : '#EFF6FF',
                    color: isAdmin ? '#16A34A' : '#2563EB',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 700,
                  }}
                >
                  {currentUser?.role || 'ADMIN'}
                </span>
              </div>
            </div>

            <div>
              <span style={{ fontSize: '11px', color: '#64748B' }}>Registered Contact</span>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A', marginTop: '2px' }}>
                {currentUser?.email || 'admin@panorama.railways.gov'}
              </div>
            </div>
          </div>

          {/* Startup & Feedback Preferences */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: colors.textSecondary, marginBottom: '6px' }}>
                Default Startup Landing Screen
              </label>
              <select
                value={defaultStartupScreen}
                onChange={(e) => setDefaultStartupScreen(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: `1px solid ${colors.borderStrong}`,
                  fontSize: '13px',
                  backgroundColor: '#FFFFFF',
                }}
              >
                <option value="dashboard">Operations Overview Dashboard</option>
                <option value="trains">Train Fleet Management</option>
                <option value="watertank">Water Tank Telemetry</option>
                <option value="location">GPS Tracking & Railway Corridor Map</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '24px' }}>
              <input
                type="checkbox"
                id="sound-fx-checkbox"
                checked={soundEffects}
                onChange={(e) => setSoundEffects(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: colors.primary }}
              />
              <label htmlFor="sound-fx-checkbox" style={{ fontSize: '13px', fontWeight: 600, color: colors.textPrimary, cursor: 'pointer' }}>
                Enable telemetry heartbeat click feedback
              </label>
            </div>
          </div>

          {/* Administrative Factory Reset */}
          {isAdmin && (
            <div
              style={{
                borderTop: '1px solid #FECDD3',
                paddingTop: '16px',
                marginTop: '10px',
                display: 'flex',
                flexDirection: isMobile ? 'column' : 'row',
                alignItems: isMobile ? 'flex-start' : 'center',
                justifyContent: 'space-between',
                gap: '12px',
              }}
            >
              <div>
                <strong style={{ fontSize: '13px', color: '#E11D48' }}>Factory Configuration Reset</strong>
                <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: '#9F1239' }}>
                  Restores all geometric measurements, sensor offsets, and alarm thresholds back to the calibrated 20L / 50cm baseline.
                </p>
              </div>

              <button
                onClick={() => setIsFactoryResetModalOpen(true)}
                style={{
                  minHeight: '44px',
                  backgroundColor: '#E11D48',
                  border: 'none',
                  color: '#FFFFFF',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  width: isMobile ? '100%' : 'auto',
                }}
              >
                Perform Factory Reset
              </button>
            </div>
          )}
        </div>
      )}

      {/* Clear Alert History Modal */}
      {isClearAlertHistoryModalOpen && (
        <div
          className="modal-backdrop"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(4px)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            boxSizing: 'border-box',
          }}
        >
          <div
            className="modal-dialog"
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '12px',
              padding: isMobile ? '16px' : '24px',
              width: '460px',
              maxWidth: 'calc(100vw - 32px)',
              boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              boxSizing: 'border-box',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  backgroundColor: '#FFE4E6',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Trash2 size={20} color="#E11D48" />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0F172A' }}>
                  Clear Alert History
                </h3>
                <span style={{ fontSize: '11px', color: '#64748B' }}>
                  Irreversible action. Purges local cache and database history.
                </span>
              </div>
            </div>

            <p style={{ margin: 0, fontSize: '13px', color: '#334155', lineHeight: 1.5 }}>
              Are you sure you want to permanently clear all recorded alert history events? This will reset the alert history ledger across desktop and mobile consoles.
            </p>

            <div style={{ display: 'flex', flexDirection: isMobile ? 'column-reverse' : 'row', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
              <button
                onClick={() => setIsClearAlertHistoryModalOpen(false)}
                style={{
                  padding: '8px 16px',
                  minHeight: '44px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#FFFFFF',
                  color: '#334155',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  width: isMobile ? '100%' : 'auto',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmClearHistory}
                disabled={loading}
                style={{
                  padding: '8px 18px',
                  minHeight: '44px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: '#E11D48',
                  color: '#FFFFFF',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  width: isMobile ? '100%' : 'auto',
                }}
              >
                {loading ? 'Clearing...' : 'Yes, Clear Alert History'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Factory Reset Modal */}
      {isFactoryResetModalOpen && (
        <div
          className="modal-backdrop"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(4px)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            boxSizing: 'border-box',
          }}
        >
          <div
            className="modal-dialog"
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '12px',
              padding: isMobile ? '16px' : '24px',
              width: '460px',
              maxWidth: 'calc(100vw - 32px)',
              boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              boxSizing: 'border-box',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  backgroundColor: '#FFE4E6',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <AlertTriangle size={20} color="#E11D48" />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0F172A' }}>
                  Confirm Factory Reset
                </h3>
                <span style={{ fontSize: '11px', color: '#64748B' }}>
                  This action is irreversible and overwrites active sensor geometry.
                </span>
              </div>
            </div>

            <p style={{ margin: 0, fontSize: '13px', color: '#334155', lineHeight: 1.5 }}>
              Are you sure you want to reset all parameters to default factory specifications? This will reset the tank capacity to <strong>20.0 Liters</strong>, height to <strong>50.0 cm</strong>, and threshold alarms to standard setpoints.
            </p>

            <div style={{ display: 'flex', flexDirection: isMobile ? 'column-reverse' : 'row', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
              <button
                onClick={() => setIsFactoryResetModalOpen(false)}
                style={{
                  padding: '8px 16px',
                  minHeight: '44px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#FFFFFF',
                  color: '#334155',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  width: isMobile ? '100%' : 'auto',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleFactoryResetConfirm}
                disabled={loading}
                style={{
                  padding: '8px 18px',
                  minHeight: '44px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: '#E11D48',
                  color: '#FFFFFF',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  width: isMobile ? '100%' : 'auto',
                }}
              >
                {loading ? 'Resetting...' : 'Yes, Restore Baseline'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
