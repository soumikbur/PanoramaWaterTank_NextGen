import React, { useState, useEffect } from 'react';
import { colors, typography, metrics } from '../theme';
import { useApp } from '../state/AppContext';
import { ApiClient } from '../api/client';
import { Settings as SettingsIcon, AlertTriangle, AlertCircle, CheckCircle2, ShieldAlert, Radio, Cpu, RefreshCw, Save, RotateCcw, Eye, EyeOff } from 'lucide-react';

export const SettingsScreen: React.FC = () => {
  const { liveTank, refreshData, currentUser, connectionStatus } = useApp();

  if (currentUser?.role !== 'ADMIN') {
    return (
      <div
        style={{
          padding: '48px',
          textAlign: 'center',
          backgroundColor: '#FFFFFF',
          borderRadius: '8px',
          border: '1px solid #E2E8F0',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <ShieldAlert size={40} color={colors.critical} />
        <h2 style={{ color: '#0F172A', fontSize: '18px', fontWeight: 700, margin: 0 }}>
          Access Restricted
        </h2>
        <p style={{ color: '#64748B', fontSize: '13px', margin: 0, maxWidth: '400px' }}>
          System configuration and calibration parameters require administrator authorization. Please sign in as an Administrator to adjust hardware geometry and MQTT broker settings.
        </p>
      </div>
    );
  }

  // Unified Configuration States
  const [mqttBroker, setMqttBroker] = useState('broker.hivemq.com');
  const [mqttPort, setMqttPort] = useState(1883);
  const [mqttUseTls, setMqttUseTls] = useState(false);
  const [mqttTopic, setMqttTopic] = useState('panorama/telemetry/+');

  const [deviceHost, setDeviceHost] = useState('192.168.4.1');
  const [devicePort, setDevicePort] = useState(80);
  const [refreshInterval, setRefreshInterval] = useState(3.0);

  const [ubidotsHost, setUbidotsHost] = useState('https://industrial.api.ubidots.com');
  const [ubidotsLabel, setUbidotsLabel] = useState('wli');
  const [ubidotsToken, setUbidotsToken] = useState('BBUS-sample-token-live-telemetry');
  const [showToken, setShowToken] = useState(false);

  // Tank Geometry
  const [tankShape, setTankShape] = useState<'CYLINDRICAL' | 'RECTANGULAR'>('CYLINDRICAL');
  const [tankHeight, setTankHeight] = useState(50.0);
  const [tankDiameter, setTankDiameter] = useState(22.56);
  const [tankCapacity, setTankCapacity] = useState(20.0);
  const [tankArea, setTankArea] = useState(0.04);

  // Calibration
  const [sensorType, setSensorType] = useState('HYDROSTATIC_4_20MA');
  const [sensorZeroOffset, setSensorZeroOffset] = useState(0.0);
  const [sensorSpan, setSensorSpan] = useState(50.0);
  const [sensorFilterConstant, setSensorFilterConstant] = useState(1.0);
  const [sensorInvert, setSensorInvert] = useState(false);

  // Alarm Thresholds
  const [alarmWarning, setAlarmWarning] = useState(20.0);
  const [alarmCritical, setAlarmCritical] = useState(10.0);
  const [alarmOverflow, setAlarmOverflow] = useState(100.0);

  // Diagnostics & Status
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [mqttTestResult, setMqttTestResult] = useState<string | null>(null);
  const [deviceTestResult, setDeviceTestResult] = useState<string | null>(null);
  const [isFactoryResetModalOpen, setIsFactoryResetModalOpen] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

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
  }, []);

  // Live Recalculate capacity for cylindrical tank when height or diameter changes
  const handleDimensionChange = (height: number, diameter: number) => {
    setTankHeight(height);
    setTankDiameter(diameter);
    setHasUnsavedChanges(true);

    if (height > 0 && diameter > 0) {
      const radiusCm = diameter / 2.0;
      // V = pi * r^2 * h in cm3. 1 liter = 1000 cm3.
      const volumeLiters = (Math.PI * Math.pow(radiusCm, 2) * height) / 1000.0;
      const areaM2 = (Math.PI * Math.pow(radiusCm / 100.0, 2));
      setTankCapacity(parseFloat(volumeLiters.toFixed(2)));
      setTankArea(parseFloat(areaM2.toFixed(4)));
    }
  };

  // Threshold ordering validation
  const isThresholdOrderingValid = alarmCritical < alarmWarning && alarmWarning < alarmOverflow;

  // Test MQTT Connection
  const handleTestMqtt = async () => {
    try {
      setMqttTestResult('Testing broker connection...');
      const res = await ApiClient.testMqttConnection();
      setMqttTestResult(`Status: ${res.status} (${res.connected ? 'Connected' : 'Offline'}) — Host: ${res.broker}`);
    } catch (e: any) {
      setMqttTestResult(`Test Failed: ${e.message}`);
    }
  };

  // Test Device REST Connection
  const handleTestDevice = async () => {
    try {
      setDeviceTestResult('Testing ESP32-S3 REST endpoint...');
      const res = await ApiClient.testDeviceConnection();
      setDeviceTestResult(`Status: ${res.status} — ${res.message} (${res.response_time_ms}ms)`);
    } catch (e: any) {
      setDeviceTestResult(`Device Unreachable: ${e.message}`);
    }
  };

  // Read From Device
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

  // Apply Configuration
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
      };

      await ApiClient.applyUnifiedConfig(payload);
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

  // Factory Reset
  const handleFactoryResetConfirm = async () => {
    if (currentUser.role !== 'ADMIN') {
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

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: `${metrics.cardSpacing}px`,
        backgroundColor: colors.background,
        boxSizing: 'border-box',
        minHeight: '100%',
      }}
    >
      {/* 1. Top Action & Status Bar */}
      <div
        style={{
          backgroundColor: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: `${metrics.cardRadius}px`,
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: colors.shadowSubtle,
        }}
      >
        <div>
          <h2
            style={{
              fontSize: '17px',
              fontWeight: 700,
              color: colors.textPrimary,
              margin: '0 0 2px 0',
              fontFamily: typography.fontFamily,
            }}
          >
            System Settings & SCADA Architecture
          </h2>
          <span style={{ fontSize: '11px', color: colors.textMuted }}>
            Edge Gateway telemetry routes, hydrostatic tank geometry, sensor calibration & alarm setpoints
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {hasUnsavedChanges && (
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: colors.warning,
                backgroundColor: colors.warningSurface,
                padding: '4px 10px',
                borderRadius: '6px',
                border: `1px solid ${colors.warningBorder}`,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
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
              backgroundColor: colors.surfaceAlt,
              border: `1px solid ${colors.borderStrong}`,
              color: colors.textPrimary,
              padding: '6px 14px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <RefreshCw size={13} /> Read From Device
          </button>

          <button
            onClick={loadConfig}
            style={{
              backgroundColor: colors.surfaceAlt,
              border: `1px solid ${colors.borderStrong}`,
              color: colors.textSecondary,
              padding: '6px 14px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reset Changes
          </button>

          <button
            onClick={handleApply}
            disabled={loading}
            style={{
              backgroundColor: colors.primary,
              border: 'none',
              color: colors.textOnPrimary,
              padding: '6px 18px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(37, 99, 235, 0.25)',
            }}
          >
            {loading ? 'Applying...' : 'Apply Configuration'}
          </button>

          {currentUser.role === 'ADMIN' && (
            <button
              onClick={() => setIsFactoryResetModalOpen(true)}
              style={{
                backgroundColor: '#FFF1F2',
                border: '1px solid #FECDD3',
                color: '#E11D48',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
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

      {/* 2. SECTION A: Device & Connectivity */}
      <div
        style={{
          backgroundColor: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: `${metrics.cardRadius}px`,
          padding: `${metrics.cardPadding}px`,
          boxShadow: colors.shadowSubtle,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: colors.textPrimary }}>
              A. Device & Telemetry Connectivity
            </h3>
            <span style={{ fontSize: '11px', color: colors.textMuted }}>
              Authoritative edge data sources: Primary broker over MQTT TLS and fallback HTTP REST Gateway
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                backgroundColor: connectionStatus === 'CONNECTED' ? colors.successSurface : colors.criticalSurface,
                color: connectionStatus === 'CONNECTED' ? colors.success : colors.critical,
                border: `1px solid ${connectionStatus === 'CONNECTED' ? colors.successBorder : colors.criticalBorder}`,
                borderRadius: '12px',
                padding: '2px 8px',
                fontSize: '10px',
                fontWeight: 700,
              }}
            >
              MQTT: {connectionStatus}
            </span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
          {/* MQTT Broker */}
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: colors.textSecondary, marginBottom: '4px' }}>
              MQTT Broker Hostname
            </label>
            <input
              type="text"
              value={mqttBroker}
              onChange={(e) => { setMqttBroker(e.target.value); setHasUnsavedChanges(true); }}
              style={{
                width: '100%',
                height: `${metrics.inputHeight}px`,
                padding: '0 10px',
                borderRadius: '6px',
                border: `1px solid ${colors.borderStrong}`,
                fontSize: '12px',
                color: colors.textPrimary,
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* MQTT Port & TLS */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: colors.textSecondary, marginBottom: '4px' }}>
                Broker Port
              </label>
              <input
                type="number"
                value={mqttPort}
                onChange={(e) => { setMqttPort(Number(e.target.value)); setHasUnsavedChanges(true); }}
                style={{
                  width: '100%',
                  height: `${metrics.inputHeight}px`,
                  padding: '0 10px',
                  borderRadius: '6px',
                  border: `1px solid ${colors.borderStrong}`,
                  fontSize: '12px',
                  color: colors.textPrimary,
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: colors.textSecondary, marginBottom: '4px' }}>
                TLS Protocol
              </label>
              <select
                value={mqttUseTls ? 'true' : 'false'}
                onChange={(e) => { setMqttUseTls(e.target.value === 'true'); setHasUnsavedChanges(true); }}
                style={{
                  width: '100%',
                  height: `${metrics.inputHeight}px`,
                  padding: '0 8px',
                  borderRadius: '6px',
                  border: `1px solid ${colors.borderStrong}`,
                  fontSize: '12px',
                  backgroundColor: colors.surface,
                  color: colors.textPrimary,
                  boxSizing: 'border-box',
                }}
              >
                <option value="false">Standard (1883)</option>
                <option value="true">TLS / SSL (8883)</option>
              </select>
            </div>
          </div>

          {/* Telemetry Topic */}
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: colors.textSecondary, marginBottom: '4px' }}>
              Subscription Topic Pattern
            </label>
            <input
              type="text"
              value={mqttTopic}
              onChange={(e) => { setMqttTopic(e.target.value); setHasUnsavedChanges(true); }}
              style={{
                width: '100%',
                height: `${metrics.inputHeight}px`,
                padding: '0 10px',
                borderRadius: '6px',
                border: `1px solid ${colors.borderStrong}`,
                fontSize: '12px',
                color: colors.textPrimary,
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* ESP32 IP Host */}
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: colors.textSecondary, marginBottom: '4px' }}>
              ESP32-S3 Edge IP / Hostname
            </label>
            <input
              type="text"
              value={deviceHost}
              onChange={(e) => { setDeviceHost(e.target.value); setHasUnsavedChanges(true); }}
              style={{
                width: '100%',
                height: `${metrics.inputHeight}px`,
                padding: '0 10px',
                borderRadius: '6px',
                border: `1px solid ${colors.borderStrong}`,
                fontSize: '12px',
                color: colors.textPrimary,
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* ESP32 Port & Refresh */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: colors.textSecondary, marginBottom: '4px' }}>
                REST Port
              </label>
              <input
                type="number"
                value={devicePort}
                onChange={(e) => { setDevicePort(Number(e.target.value)); setHasUnsavedChanges(true); }}
                style={{
                  width: '100%',
                  height: `${metrics.inputHeight}px`,
                  padding: '0 10px',
                  borderRadius: '6px',
                  border: `1px solid ${colors.borderStrong}`,
                  fontSize: '12px',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: colors.textSecondary, marginBottom: '4px' }}>
                Refresh (sec)
              </label>
              <input
                type="number"
                step="0.5"
                value={refreshInterval}
                onChange={(e) => { setRefreshInterval(Number(e.target.value)); setHasUnsavedChanges(true); }}
                style={{
                  width: '100%',
                  height: `${metrics.inputHeight}px`,
                  padding: '0 10px',
                  borderRadius: '6px',
                  border: `1px solid ${colors.borderStrong}`,
                  fontSize: '12px',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* Test Buttons Row */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
            <button
              onClick={handleTestMqtt}
              style={{
                flex: 1,
                height: `${metrics.buttonHeight}px`,
                backgroundColor: colors.surfaceAlt,
                border: `1px solid ${colors.borderStrong}`,
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 600,
                color: colors.textPrimary,
                cursor: 'pointer',
              }}
            >
              Test MQTT Broker
            </button>
            <button
              onClick={handleTestDevice}
              style={{
                flex: 1,
                height: `${metrics.buttonHeight}px`,
                backgroundColor: colors.surfaceAlt,
                border: `1px solid ${colors.borderStrong}`,
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 600,
                color: colors.textPrimary,
                cursor: 'pointer',
              }}
            >
              Test Edge REST
            </button>
          </div>
        </div>

        {/* Test Results Output */}
        {(mqttTestResult || deviceTestResult) && (
          <div style={{ marginTop: '10px', display: 'flex', gap: '14px', fontSize: '11px' }}>
            {mqttTestResult && (
              <span style={{ backgroundColor: colors.surfaceAlt, padding: '4px 10px', borderRadius: '4px', color: colors.textSecondary }}>
                MQTT: <strong>{mqttTestResult}</strong>
              </span>
            )}
            {deviceTestResult && (
              <span style={{ backgroundColor: colors.surfaceAlt, padding: '4px 10px', borderRadius: '4px', color: colors.textSecondary }}>
                Edge: <strong>{deviceTestResult}</strong>
              </span>
            )}
          </div>
        )}

        {/* Ubidots Bridge Secondary Section */}
        <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: `1px solid ${colors.borderSubtle}` }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: colors.textSecondary, display: 'block', marginBottom: '8px' }}>
            Secondary Cloud Bridge (Ubidots Telematics Relay)
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '10px', color: colors.textMuted }}>Ubidots API Host</label>
              <input
                type="text"
                value={ubidotsHost}
                onChange={(e) => { setUbidotsHost(e.target.value); setHasUnsavedChanges(true); }}
                style={{ width: '100%', height: '32px', padding: '0 8px', borderRadius: '4px', border: `1px solid ${colors.borderStrong}`, fontSize: '11px', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '10px', color: colors.textMuted }}>Device API Label</label>
              <input
                type="text"
                value={ubidotsLabel}
                onChange={(e) => { setUbidotsLabel(e.target.value); setHasUnsavedChanges(true); }}
                style={{ width: '100%', height: '32px', padding: '0 8px', borderRadius: '4px', border: `1px solid ${colors.borderStrong}`, fontSize: '11px', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ position: 'relative' }}>
              <label style={{ fontSize: '10px', color: colors.textMuted }}>API Token (Masked)</label>
              <input
                type={showToken ? 'text' : 'password'}
                value={ubidotsToken}
                onChange={(e) => { setUbidotsToken(e.target.value); setHasUnsavedChanges(true); }}
                style={{ width: '100%', height: '32px', padding: '0 8px', paddingRight: '45px', borderRadius: '4px', border: `1px solid ${colors.borderStrong}`, fontSize: '11px', boxSizing: 'border-box' }}
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                style={{ position: 'absolute', right: '6px', top: '22px', border: 'none', background: 'transparent', fontSize: '11px', cursor: 'pointer', color: colors.primary }}
              >
                {showToken ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 3. SECTION B: Tank Geometry */}
      <div
        style={{
          backgroundColor: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: `${metrics.cardRadius}px`,
          padding: `${metrics.cardPadding}px`,
          boxShadow: colors.shadowSubtle,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: colors.textPrimary }}>
              B. Tank Physical Geometry & Volumetric Formula
            </h3>
            <span style={{ fontSize: '11px', color: colors.textMuted }}>
              Mathematical formulation: V = π × (D / 2)² × H / 1000 Litres (Cylindrical)
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', color: colors.textMuted }}>Shape:</span>
            <select
              value={tankShape}
              onChange={(e) => { setTankShape(e.target.value as any); setHasUnsavedChanges(true); }}
              style={{
                padding: '4px 8px',
                borderRadius: '4px',
                border: `1px solid ${colors.borderStrong}`,
                fontSize: '11px',
                backgroundColor: colors.surface,
                fontWeight: 600,
              }}
            >
              <option value="CYLINDRICAL">Cylindrical Reservoir</option>
              <option value="RECTANGULAR">Rectangular Reservoir</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
          {/* Height */}
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: colors.textSecondary, marginBottom: '4px' }}>
              Total Height (cm)
            </label>
            <input
              type="number"
              step="0.5"
              value={tankHeight}
              onChange={(e) => handleDimensionChange(Number(e.target.value), tankDiameter)}
              style={{
                width: '100%',
                height: `${metrics.inputHeight}px`,
                padding: '0 10px',
                borderRadius: '6px',
                border: `1px solid ${colors.borderStrong}`,
                fontSize: '13px',
                fontWeight: 600,
                color: colors.textPrimary,
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Diameter */}
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: colors.textSecondary, marginBottom: '4px' }}>
              Diameter (cm)
            </label>
            <input
              type="number"
              step="0.1"
              value={tankDiameter}
              onChange={(e) => handleDimensionChange(tankHeight, Number(e.target.value))}
              style={{
                width: '100%',
                height: `${metrics.inputHeight}px`,
                padding: '0 10px',
                borderRadius: '6px',
                border: `1px solid ${colors.borderStrong}`,
                fontSize: '13px',
                fontWeight: 600,
                color: colors.textPrimary,
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Calculated Capacity */}
          <div style={{ backgroundColor: colors.surfaceAlt, padding: '8px 12px', borderRadius: '6px', border: `1px solid ${colors.border}` }}>
            <span style={{ fontSize: '10px', color: colors.textMuted, fontWeight: 600 }}>CALCULATED CAPACITY</span>
            <div style={{ fontSize: '17px', fontWeight: 800, color: colors.primary, marginTop: '2px' }}>
              {tankCapacity.toFixed(2)} Litres
            </div>
            <span style={{ fontSize: '10px', color: colors.textSecondary }}>
              Saved Entity: {liveTank?.capacityLiters ?? 20.0} L
            </span>
          </div>

          {/* Cross Sectional Area */}
          <div style={{ backgroundColor: colors.surfaceAlt, padding: '8px 12px', borderRadius: '6px', border: `1px solid ${colors.border}` }}>
            <span style={{ fontSize: '10px', color: colors.textMuted, fontWeight: 600 }}>CROSS-SECTIONAL AREA</span>
            <div style={{ fontSize: '17px', fontWeight: 800, color: colors.textPrimary, marginTop: '2px' }}>
              {tankArea.toFixed(4)} m²
            </div>
            <span style={{ fontSize: '10px', color: colors.textSecondary }}>
              π × r² area constant
            </span>
          </div>
        </div>
      </div>

      {/* 4. SECTION C & D: Calibration & Alarm Thresholds */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: `${metrics.cardSpacing}px` }}>
        {/* SECTION C: Sensor Calibration */}
        <div
          style={{
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: `${metrics.cardRadius}px`,
            padding: `${metrics.cardPadding}px`,
            boxShadow: colors.shadowSubtle,
          }}
        >
          <h3 style={{ margin: '0 0 4px 0', fontSize: '15px', fontWeight: 700, color: colors.textPrimary }}>
            C. Sensor Calibration & Damping
          </h3>
          <span style={{ fontSize: '11px', color: colors.textMuted, display: 'block', marginBottom: '14px' }}>
            Transducer zero-drift compensation and digital filtering
          </span>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: colors.textSecondary, marginBottom: '4px' }}>
                Zero Offset (cm)
              </label>
              <input
                type="number"
                step="0.1"
                value={sensorZeroOffset}
                onChange={(e) => { setSensorZeroOffset(Number(e.target.value)); setHasUnsavedChanges(true); }}
                style={{ width: '100%', height: '34px', padding: '0 8px', borderRadius: '6px', border: `1px solid ${colors.borderStrong}`, fontSize: '12px', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: colors.textSecondary, marginBottom: '4px' }}>
                Full-Scale Span (cm)
              </label>
              <input
                type="number"
                step="0.5"
                value={sensorSpan}
                onChange={(e) => { setSensorSpan(Number(e.target.value)); setHasUnsavedChanges(true); }}
                style={{ width: '100%', height: '34px', padding: '0 8px', borderRadius: '6px', border: `1px solid ${colors.borderStrong}`, fontSize: '12px', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: colors.textSecondary, marginBottom: '4px' }}>
                Damping Constant (sec)
              </label>
              <input
                type="number"
                step="0.1"
                value={sensorFilterConstant}
                onChange={(e) => { setSensorFilterConstant(Number(e.target.value)); setHasUnsavedChanges(true); }}
                style={{ width: '100%', height: '34px', padding: '0 8px', borderRadius: '6px', border: `1px solid ${colors.borderStrong}`, fontSize: '12px', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: colors.textSecondary, marginBottom: '4px' }}>
                Sensor Polarity
              </label>
              <select
                value={sensorInvert ? 'true' : 'false'}
                onChange={(e) => { setSensorInvert(e.target.value === 'true'); setHasUnsavedChanges(true); }}
                style={{ width: '100%', height: '34px', padding: '0 8px', borderRadius: '6px', border: `1px solid ${colors.borderStrong}`, fontSize: '12px', backgroundColor: colors.surface, boxSizing: 'border-box' }}
              >
                <option value="false">Standard (Positive Slope)</option>
                <option value="true">Inverted (Reverse Slope)</option>
              </select>
            </div>
          </div>
        </div>

        {/* SECTION D: Alarm Thresholds */}
        <div
          style={{
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: `${metrics.cardRadius}px`,
            padding: `${metrics.cardPadding}px`,
            boxShadow: colors.shadowSubtle,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: colors.textPrimary }}>
              D. Operational Alarm Thresholds
            </h3>
            <span
              style={{
                fontSize: '10px',
                fontWeight: 700,
                color: isThresholdOrderingValid ? colors.success : colors.critical,
                backgroundColor: isThresholdOrderingValid ? colors.successSurface : colors.criticalSurface,
                padding: '2px 8px',
                borderRadius: '4px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              {isThresholdOrderingValid ? (
                <>
                  <CheckCircle2 size={11} />
                  <span>Valid Threshold Ordering</span>
                </>
              ) : (
                <>
                  <AlertCircle size={11} />
                  <span>Invalid Order</span>
                </>
              )}
            </span>
          </div>
          <span style={{ fontSize: '11px', color: colors.textMuted, display: 'block', marginBottom: '14px' }}>
            Rule enforcement: Critical Low &lt; Warning Low &lt; Overflow Setpoint
          </span>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Critical Low */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 600, marginBottom: '2px' }}>
                <span style={{ color: colors.critical }}>Critical Low Threshold (%)</span>
                <span style={{ color: colors.critical }}>{alarmCritical}%</span>
              </div>
              <input
                type="range"
                min="1"
                max="30"
                step="0.5"
                value={alarmCritical}
                onChange={(e) => { setAlarmCritical(Number(e.target.value)); setHasUnsavedChanges(true); }}
                style={{ width: '100%', accentColor: colors.critical }}
              />
            </div>

            {/* Warning Low */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 600, marginBottom: '2px' }}>
                <span style={{ color: colors.warning }}>Low Warning Threshold (%)</span>
                <span style={{ color: colors.warning }}>{alarmWarning}%</span>
              </div>
              <input
                type="range"
                min="10"
                max="50"
                step="0.5"
                value={alarmWarning}
                onChange={(e) => { setAlarmWarning(Number(e.target.value)); setHasUnsavedChanges(true); }}
                style={{ width: '100%', accentColor: colors.warning }}
              />
            </div>

            {/* Overflow */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 600, marginBottom: '2px' }}>
                <span style={{ color: colors.textPrimary }}>Overflow Level Setpoint (%)</span>
                <span style={{ color: colors.textPrimary }}>{alarmOverflow}%</span>
              </div>
              <input
                type="range"
                min="90"
                max="110"
                step="0.5"
                value={alarmOverflow}
                onChange={(e) => { setAlarmOverflow(Number(e.target.value)); setHasUnsavedChanges(true); }}
                style={{ width: '100%', accentColor: colors.primary }}
              />
            </div>

            {/* Visual Operational Representation Bar */}
            <div style={{ marginTop: '4px' }}>
              <span style={{ fontSize: '10px', color: colors.textMuted }}>Visual Operational Scale:</span>
              <div style={{ width: '100%', height: '10px', borderRadius: '5px', backgroundColor: colors.surfaceAlt, display: 'flex', overflow: 'hidden', marginTop: '2px', border: `1px solid ${colors.border}` }}>
                <div style={{ width: `${alarmCritical}%`, backgroundColor: colors.critical }} title={`Critical Zone (0 - ${alarmCritical}%)`} />
                <div style={{ width: `${alarmWarning - alarmCritical}%`, backgroundColor: colors.warning }} title={`Warning Zone (${alarmCritical}% - ${alarmWarning}%)`} />
                <div style={{ width: `${100 - alarmWarning}%`, backgroundColor: colors.success }} title={`Normal Operating Zone (${alarmWarning}% - 100%)`} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 5. SECTION E: Device Status & Diagnostics */}
      <div
        style={{
          backgroundColor: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: `${metrics.cardRadius}px`,
          padding: `${metrics.cardPadding}px`,
          boxShadow: colors.shadowSubtle,
        }}
      >
        <h3 style={{ margin: '0 0 4px 0', fontSize: '15px', fontWeight: 700, color: colors.textPrimary }}>
          E. Edge Diagnostics & Firmware Synchronization
        </h3>
        <span style={{ fontSize: '11px', color: colors.textMuted, display: 'block', marginBottom: '14px' }}>
          Physical edge hardware registry and persistent synchronization health
        </span>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
          <div style={{ backgroundColor: colors.surfaceAlt, padding: '10px', borderRadius: '6px', border: `1px solid ${colors.border}` }}>
            <span style={{ fontSize: '10px', color: colors.textMuted }}>GATEWAY UID</span>
            <div style={{ fontSize: '12px', fontWeight: 700, color: colors.textPrimary, marginTop: '2px', fontFamily: 'monospace' }}>
              {liveTank?.deviceUid || '0026004D4B42501120353332'}
            </div>
          </div>

          <div style={{ backgroundColor: colors.surfaceAlt, padding: '10px', borderRadius: '6px', border: `1px solid ${colors.border}` }}>
            <span style={{ fontSize: '10px', color: colors.textMuted }}>FIRMWARE VERSION</span>
            <div style={{ fontSize: '12px', fontWeight: 700, color: colors.textPrimary, marginTop: '2px' }}>
              ESP32-S3 / v2.0.0-PROD
            </div>
          </div>

          <div style={{ backgroundColor: colors.surfaceAlt, padding: '10px', borderRadius: '6px', border: `1px solid ${colors.border}` }}>
            <span style={{ fontSize: '10px', color: colors.textMuted }}>BATTERY VOLTAGE</span>
            <div style={{ fontSize: '12px', fontWeight: 700, color: colors.primary, marginTop: '2px' }}>
              {liveTank?.batteryVoltage != null ? `${liveTank.batteryVoltage.toFixed(2)} V` : 'N/A'}
            </div>
          </div>

          <div style={{ backgroundColor: colors.surfaceAlt, padding: '10px', borderRadius: '6px', border: `1px solid ${colors.border}` }}>
            <span style={{ fontSize: '10px', color: colors.textMuted }}>CONFIGURATION STATE</span>
            <div style={{ fontSize: '12px', fontWeight: 700, color: hasUnsavedChanges ? colors.warning : colors.success, marginTop: '2px' }}>
              {hasUnsavedChanges ? 'Pending Unapplied Changes' : 'Synchronized with DB'}
            </div>
          </div>
        </div>
      </div>

      {/* FACTORY RESET CONFIRMATION MODAL */}
      {isFactoryResetModalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(15, 23, 42, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: colors.surface,
              borderRadius: '10px',
              padding: '24px',
              width: '460px',
              maxWidth: '90%',
              boxShadow: colors.shadowModal,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <AlertTriangle size={24} color={colors.critical} />
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: colors.critical }}>
                  Confirm Factory Reset
                </h3>
                <span style={{ fontSize: '11px', color: colors.textMuted }}>
                  Administrative Authorization Required
                </span>
              </div>
            </div>

            <p style={{ fontSize: '12px', color: colors.textSecondary, lineHeight: '1.5', margin: '0 0 16px 0' }}>
              This operation will permanently reset all tank physical geometries (to 20.0 L / 50.0 cm), restore default HiveMQ broker credentials, recalibrate sensor offsets, and revert alarm thresholds.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setIsFactoryResetModalOpen(false)}
                style={{
                  backgroundColor: colors.surfaceAlt,
                  border: `1px solid ${colors.borderStrong}`,
                  color: colors.textSecondary,
                  borderRadius: '6px',
                  padding: '8px 16px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleFactoryResetConfirm}
                style={{
                  backgroundColor: colors.critical,
                  border: 'none',
                  color: colors.textOnPrimary,
                  borderRadius: '6px',
                  padding: '8px 20px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Confirm Factory Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
