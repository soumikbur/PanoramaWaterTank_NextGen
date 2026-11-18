/**
 * Static Hardware, Firmware & Communication Metadata Service for WLI Edge Devices.
 *
 * Strictly separates static hardware metadata from live MQTT telemetry.
 * Never fabricates MCU models, firmware versions, or live sensor readings.
 * Unverified values are explicitly marked per SCADA audit rules:
 *  - "Not Configured" when absent from firmware/device config
 *  - "Unknown" when live runtime status cannot be determined
 *  - "Configured – Hardware Verification Pending" when documented in source/flow but not physically verified
 */

import { resolveApiBaseUrl } from '../config/apiConfig';
import { ManagedDevice } from './deviceRegistry';
import { MqttBrokerDiagnostics } from './mqttService';

export interface ControllerMetadata {
  model: string;
  architecture: string;
  frequency: string;
  flashMemory: string;
  ram: string;
  firmwareVersion: string;
  firmwareBuildDate: string;
  verificationNote: string;
}

export interface DeviceHardwareOverrides {
  deviceName?: string;
  deviceType?: string;
  hardwareModel?: string;
  mcuModel?: string;
  mcuArchitecture?: string;
  processorFrequency?: string;
  flashMemory?: string;
  ram?: string;
  firmwareVersion?: string;
  firmwareBuildDate?: string;
  modemVariant?: string;
  bleServiceUuid?: string;
  updatedAt?: string;
}

export interface DeviceMetadataModel {
  uid: string;
  deviceName: string;
  deviceType: string;
  hardwareModel: string;
  hardware: {
    controller: ControllerMetadata;
    sensors: Array<{
      id: 'ads1115' | 'bme280' | 'hydrostatic';
      name: string;
      interface: string;
      specs: Array<{ label: string; value: string }>;
      verificationStatus: string;
    }>;
    communicationInterfaces: Array<{
      id: 'ec200u' | 'rs485' | 'ble';
      name: string;
      interface: string;
      specs: Array<{ label: string; value: string }>;
      verificationStatus: string;
    }>;
    peripherals: Array<{
      name: string;
      spec: string;
      verificationStatus: string;
    }>;
  };
  firmware: {
    version: string;
    buildDate: string;
    sensorProcessing: Array<{ label: string; value: string; status: string }>;
    freertosTasks: Array<{
      name: string;
      interval: string;
      priority: string;
      core: string;
      stack: string;
      verificationStatus: string;
    }>;
    safetyDiagnostics: Array<{
      name: string;
      status: string;
      sourceNote: string;
    }>;
  };
  broker: {
    host: string;
    port: number;
    protocol: string;
    mqttVersion: string;
    topic: string;
  };
  updatedAt?: string;
}

const OVERRIDES_STORAGE_KEY = 'panorama_device_hardware_metadata_v1';
const FORBIDDEN_KEYS = new Set(['password', 'passwd', 'secret', 'token', 'api_key', 'apikey', 'private_key', 'credentials']);

function stripSecrets<T extends Record<string, any>>(obj: T): T {
  const out: Record<string, any> = {};
  Object.keys(obj || {}).forEach((k) => {
    if (!FORBIDDEN_KEYS.has(k.toLowerCase())) {
      out[k] = obj[k];
    }
  });
  return out as T;
}

export function loadLocalHardwareOverrides(uid: string): DeviceHardwareOverrides {
  if (typeof window === 'undefined' || !window.localStorage || !uid) return {};
  try {
    const raw = localStorage.getItem(OVERRIDES_STORAGE_KEY);
    if (!raw) return {};
    const map = JSON.parse(raw);
    return stripSecrets(map[uid.trim()] || {});
  } catch {
    return {};
  }
}

export function saveLocalHardwareOverrides(uid: string, overrides: DeviceHardwareOverrides): DeviceHardwareOverrides {
  const clean = stripSecrets({ ...overrides, updatedAt: new Date().toISOString() });
  if (typeof window !== 'undefined' && window.localStorage && uid) {
    try {
      const raw = localStorage.getItem(OVERRIDES_STORAGE_KEY);
      const map = raw ? JSON.parse(raw) : {};
      map[uid.trim()] = clean;
      localStorage.setItem(OVERRIDES_STORAGE_KEY, JSON.stringify(map));
    } catch {
      // ignore storage quota failures
    }
  }
  return clean;
}

export async function fetchBackendDeviceMetadata(uid: string): Promise<DeviceHardwareOverrides | null> {
  if (!uid) return null;
  try {
    const base = resolveApiBaseUrl();
    if (!base) return null;
    const token = typeof window !== 'undefined' ? (localStorage.getItem('panorama_auth_token') || localStorage.getItem('auth_token') || '') : '';
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${base}/devices/${encodeURIComponent(uid)}/metadata`, { headers });
    if (!res.ok) return null;
    const data = await res.json();
    const ctrl = data?.hardware?.controller || {};
    const fw = data?.firmware || {};
    const comms = data?.hardware?.communicationInterfaces || {};
    const merged: DeviceHardwareOverrides = stripSecrets({
      deviceName: data.deviceName || undefined,
      deviceType: data.deviceType || undefined,
      hardwareModel: data.hardwareModel || undefined,
      mcuModel: ctrl.model && ctrl.model !== 'Not Configured' ? ctrl.model : undefined,
      mcuArchitecture: ctrl.architecture && ctrl.architecture !== 'Not Configured' ? ctrl.architecture : undefined,
      processorFrequency: ctrl.frequency && ctrl.frequency !== 'Not Configured' ? ctrl.frequency : undefined,
      flashMemory: ctrl.flashMemory && ctrl.flashMemory !== 'Not Configured' ? ctrl.flashMemory : undefined,
      ram: ctrl.ram && ctrl.ram !== 'Not Configured' ? ctrl.ram : undefined,
      firmwareVersion: fw.version && fw.version !== 'Not Configured' ? fw.version : undefined,
      firmwareBuildDate: fw.buildDate && fw.buildDate !== 'Not Configured' ? fw.buildDate : undefined,
      modemVariant: comms.modemVariant || undefined,
      bleServiceUuid: comms.bleServiceUuid || undefined,
      updatedAt: data.updatedAt || undefined,
    });
    return merged;
  } catch {
    return null;
  }
}

export async function persistBackendDeviceMetadata(
  uid: string,
  overrides: DeviceHardwareOverrides,
  brokerDiag: MqttBrokerDiagnostics,
  activeTopic: string
): Promise<boolean> {
  if (!uid) return false;
  try {
    const base = resolveApiBaseUrl();
    if (!base) return false;
    const token = typeof window !== 'undefined' ? (localStorage.getItem('panorama_auth_token') || localStorage.getItem('auth_token') || '') : '';
    if (!token) return false;
    const body = {
      deviceName: overrides.deviceName || undefined,
      deviceType: overrides.deviceType || undefined,
      hardwareModel: overrides.hardwareModel || undefined,
      hardware: {
        controller: {
          model: overrides.mcuModel || 'Not Configured',
          architecture: overrides.mcuArchitecture || 'Not Configured',
          frequency: overrides.processorFrequency || 'Not Configured',
          flashMemory: overrides.flashMemory || 'Not Configured',
          ram: overrides.ram || 'Not Configured',
        },
        communicationInterfaces: {
          modemVariant: overrides.modemVariant || '',
          bleServiceUuid: overrides.bleServiceUuid || '',
        },
      },
      firmware: {
        version: overrides.firmwareVersion || 'Not Configured',
        buildDate: overrides.firmwareBuildDate || 'Not Configured',
      },
      broker: {
        host: brokerDiag.host,
        port: brokerDiag.port,
        protocol: brokerDiag.protocol,
        mqttVersion: brokerDiag.mqttVersion,
        topic: activeTopic,
      },
    };
    const res = await fetch(`${base}/devices/${encodeURIComponent(uid)}/metadata`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Construct verified device hardware & firmware metadata combining:
 *  - Registered device record (if any)
 *  - Admin-associated overrides (local / backend)
 *  - Cross-checked repository & firmware-flow specifications (never guessed)
 */
export function buildDeviceMetadata(
  uid: string,
  managedDevice: ManagedDevice | null,
  apiDevice: any | null,
  overrides: DeviceHardwareOverrides,
  brokerDiag: MqttBrokerDiagnostics,
  activeTopic: string
): DeviceMetadataModel {
  const cleanUid = uid.trim();
  const deviceName = overrides.deviceName || apiDevice?.name || managedDevice?.name || `Device ${cleanUid.slice(-6)}`;
  const deviceType = overrides.deviceType || apiDevice?.deviceType || apiDevice?.device_type || 'Not Configured';
  const hardwareModel = overrides.hardwareModel || apiDevice?.hardwareVersion || apiDevice?.hardware_version || managedDevice?.hardwareModel || 'Not Configured';
  const fwVersion = overrides.firmwareVersion || apiDevice?.firmwareVersion || apiDevice?.firmware_version || 'Not Configured';
  const fwBuildDate = overrides.firmwareBuildDate || 'Not Configured';

  // MCU details MUST NOT be assumed from pin assignments — display "Not Configured" unless explicitly configured
  const controller: ControllerMetadata = {
    model: overrides.mcuModel || 'Not Configured',
    architecture: overrides.mcuArchitecture || 'Not Configured',
    frequency: overrides.processorFrequency || 'Not Configured',
    flashMemory: overrides.flashMemory || 'Not Configured',
    ram: overrides.ram || 'Not Configured',
    firmwareVersion: fwVersion,
    firmwareBuildDate: fwBuildDate,
    verificationNote: overrides.mcuModel
      ? 'Configured via Device Metadata'
      : 'Not Configured — Firmware flow does not identify exact MCU model; verify physical board and associate via Edit Metadata.',
  };

  return {
    uid: cleanUid,
    deviceName,
    deviceType,
    hardwareModel,
    hardware: {
      controller,
      sensors: [
        {
          id: 'ads1115',
          name: 'ADS1115 16-bit ADC',
          interface: 'I2C (Address 0x48)',
          specs: [
            { label: 'I2C Address', value: '0x48' },
            { label: 'Input Mode', value: 'Differential A0-A1' },
            { label: 'Programmable Gain', value: '±4.096V' },
            { label: 'Data Rate', value: '128 SPS' },
          ],
          verificationStatus: 'Configured – Hardware Verification Pending',
        },
        {
          id: 'bme280',
          name: 'BME280 Environmental Sensor',
          interface: 'I2C (Pins 14, 15)',
          specs: [
            { label: 'Interface', value: 'I2C' },
            { label: 'Measurements', value: 'Temperature, Atmospheric Pressure, Humidity' },
            { label: 'Repo Audit Note', value: 'Present in firmware flow; deprecated in Rev 2.1 doc — verify hardware' },
          ],
          verificationStatus: 'Configured – Hardware Verification Pending',
        },
        {
          id: 'hydrostatic',
          name: 'Hydrostatic Pressure Sensor',
          interface: 'Analog via ADS1115 (Diff A0-A1)',
          specs: [
            { label: 'Sensor Type', value: 'Submersible Hydrostatic Pressure Transducer' },
            { label: 'ADC Channel', value: 'ADS1115 Differential A0-A1' },
            { label: 'Calibration Status', value: 'Configured – Hardware Verification Pending' },
          ],
          verificationStatus: 'Configured – Hardware Verification Pending',
        },
      ],
      communicationInterfaces: [
        {
          id: 'ec200u',
          name: 'EC200U LTE Modem',
          interface: 'UART (AT Commands)',
          specs: [
            { label: 'Model / Variant', value: overrides.modemVariant || 'EC200U (EC200U-CN in repo docs – Verify on hardware)' },
            { label: 'Interface', value: 'UART (115200 bps in EC200U/ec200u_config.h)' },
            { label: 'TX / RX Pins', value: 'Pins 7, 8 (Firmware Flow) • Verify against PCB' },
            { label: 'Protocol', value: 'AT Commands (4G LTE Cat-1 / GNSS)' },
          ],
          verificationStatus: 'Configured – Hardware Verification Pending',
        },
        {
          id: 'rs485',
          name: 'RS485 Industrial Bus',
          interface: 'UART / RS485',
          specs: [
            { label: 'TX / RX Pins', value: 'Pins 18, 17 (Firmware Flow) • Verify against PCB' },
            { label: 'Protocol', value: 'Modbus RTU' },
            { label: 'Slave ID', value: '1' },
            { label: 'Baud Rate', value: '9600 bps' },
          ],
          verificationStatus: 'Configured – Hardware Verification Pending',
        },
        {
          id: 'ble',
          name: 'Bluetooth Low Energy (BLE)',
          interface: 'BLE GATT Server',
          specs: [
            { label: 'Device Name', value: 'Water Level Sensor' },
            { label: 'Mode', value: 'BLE Server' },
            { label: 'Service UUID', value: overrides.bleServiceUuid || 'Not Configured' },
          ],
          verificationStatus: 'Configured – Hardware Verification Pending',
        },
      ],
      peripherals: [
        { name: 'Buzzer', spec: 'GPIO 22', verificationStatus: 'Configured – Hardware Verification Pending' },
        { name: 'RGB LED', spec: 'GPIO 2', verificationStatus: 'Configured – Hardware Verification Pending' },
        { name: 'EEPROM', spec: '512 Bytes', verificationStatus: 'Configured – Hardware Verification Pending' },
        { name: 'I2C Bus Pins', spec: 'Pins 14, 15 (SDA/SCL)', verificationStatus: 'Configured – Hardware Verification Pending' },
      ],
    },
    firmware: {
      version: fwVersion,
      buildDate: fwBuildDate,
      sensorProcessing: [
        { label: 'ADC Sampling', value: 'ADS1115 128 SPS (Diff A0-A1)', status: 'Configured – Hardware Verification Pending' },
        { label: 'Number of Samples', value: 'Not Configured', status: 'Not Confirmed in Source' },
        { label: 'Exponential Filter Alpha', value: 'Not Configured', status: 'Not Confirmed in Source' },
        { label: 'Air Baseline', value: 'Not Configured', status: 'Not Confirmed in Source' },
        { label: 'Water Level Calculation', value: 'Hydrostatic pressure-to-cm conversion', status: 'Configured – Hardware Verification Pending' },
        { label: 'Maximum Configured Height', value: '50.0 cm (SCADA default) / 150.0 cm (EC200U test)', status: 'Configured – Hardware Verification Pending' },
        { label: 'Calibration Status', value: 'Not Verified Against Physical Tank', status: 'Configured – Hardware Verification Pending' },
      ],
      freertosTasks: [
        { name: 'SensorTask', interval: '50 ms', priority: 'Not Configured', core: 'Not Configured', stack: 'Not Configured', verificationStatus: 'Configured – Hardware Verification Pending' },
        { name: 'ModbusTask', interval: '10 ms', priority: 'Not Configured', core: 'Not Configured', stack: 'Not Configured', verificationStatus: 'Configured – Hardware Verification Pending' },
        { name: 'AlertTask', interval: '100 ms', priority: 'Not Configured', core: 'Not Configured', stack: 'Not Configured', verificationStatus: 'Configured – Hardware Verification Pending' },
        { name: 'BLETask', interval: '100 ms', priority: 'Not Configured', core: 'Not Configured', stack: 'Not Configured', verificationStatus: 'Configured – Hardware Verification Pending' },
        { name: 'UploadTask', interval: '90 seconds', priority: '2 (EC200U/ec200u_config.h)', core: 'Not Configured', stack: '1024 words / 4096 B (ec200u_config.h)', verificationStatus: 'Configured – Hardware Verification Pending' },
        { name: 'BMERetryTask', interval: '5 seconds', priority: 'Not Configured', core: 'Not Configured', stack: 'Not Configured', verificationStatus: 'Configured – Hardware Verification Pending' },
      ],
      safetyDiagnostics: [
        { name: 'Watchdog Status', status: 'Configured – Hardware Verification Pending', sourceNote: 'Watchdog hook present in EC200U/ec200u_freertos.cpp; hardware TWDT unverified' },
        { name: 'Sensor Disconnect Detection', status: 'Configured – Hardware Verification Pending', sourceNote: '<0.200V / >4.850V fault trap in EC200U test harness; physical MCU unverified' },
        { name: 'BME280 Fallback Status', status: 'Unknown', sourceNote: 'BMERetryTask (5s) documented in firmware flow; runtime telemetry does not report fallback flag' },
        { name: 'Modem Reconnection Status', status: 'Configured – Hardware Verification Pending', sourceNote: 'Max 3 retries + 5s–60s exponential backoff in EC200U/ec200u_config.h' },
        { name: 'Shared Data Mutex Status', status: 'Configured – Hardware Verification Pending', sourceNote: 'Atomic snapshot mutex implemented in EC200U/ec200u_freertos.cpp' },
      ],
    },
    broker: {
      host: brokerDiag.host,
      port: brokerDiag.port,
      protocol: brokerDiag.protocol,
      mqttVersion: brokerDiag.mqttVersion,
      topic: activeTopic,
    },
    updatedAt: overrides.updatedAt,
  };
}
