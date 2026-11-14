import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Cpu, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { ApiClient } from '../../api/client';
import { useApp } from '../../state/AppContext';

export interface AddDeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
  presetTrainNumber?: string;
  presetCoachNumber?: string;
  onSuccess?: () => void;
}

export const AddDeviceModal: React.FC<AddDeviceModalProps> = ({
  isOpen,
  onClose,
  presetTrainNumber,
  presetCoachNumber,
  onSuccess,
}) => {
  const { devices, refreshData, configuredTrains, selectedTrainNumber, selectedCoachNumber } = useApp();

  // 11 Form Fields
  const [name, setName] = useState('Coach Water Monitor');
  const [uid, setUid] = useState('');
  const [deviceType, setDeviceType] = useState('Quectel EC200U 4G LTE');
  const [protocol, setProtocol] = useState('MQTT over TLS/WSS (Port 8884)');
  const [mqttClientId, setMqttClientId] = useState('');
  const [mqttTopic, setMqttTopic] = useState('');
  const [trainNumber, setTrainNumber] = useState('');
  const [coachNumber, setCoachNumber] = useState('');
  const [tankAssignment, setTankAssignment] = useState<'BOTH' | 'Tank 1' | 'Tank 2'>('BOTH');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('AVAILABLE');

  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize or reset form values when opening
  useEffect(() => {
    if (isOpen) {
      const randomHex = Math.random().toString(16).substring(2, 8).toUpperCase();
      const generatedUid = `DEV-WLI-${randomHex}`;
      const tr = (presetTrainNumber || selectedTrainNumber || configuredTrains[0]?.train_number || '').trim();
      const ch = (presetCoachNumber || selectedCoachNumber || 'C1').trim().toUpperCase();

      setUid(generatedUid);
      setName(`Coach ${ch} Water Monitor`);
      setDeviceType('Quectel EC200U 4G LTE');
      setProtocol('MQTT over TLS/WSS (Port 8884)');
      setMqttClientId(`panorama-wli-${generatedUid.toLowerCase()}`);
      setMqttTopic(`panorama/telemetry/${generatedUid}`);
      setTrainNumber(tr);
      setCoachNumber(ch);
      setTankAssignment('BOTH');
      setDescription('Standard hydrostatic pressure telemetry node');
      setStatus('AVAILABLE');
      setFormError(null);
    }
  }, [isOpen, presetTrainNumber, presetCoachNumber, selectedTrainNumber, selectedCoachNumber, configuredTrains]);

  // Keep MQTT client ID and topic synced with UID changes
  const handleUidChange = (val: string) => {
    setUid(val);
    const clean = val.trim().toLowerCase();
    if (clean) {
      setMqttClientId(`panorama-wli-${clean}`);
      setMqttTopic(`panorama/telemetry/${val.trim()}`);
    }
  };

  const handleGenerateUid = () => {
    const randomHex = Math.random().toString(16).substring(2, 8).toUpperCase();
    const newUid = `DEV-WLI-${randomHex}`;
    handleUidChange(newUid);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanUid = uid.trim().toUpperCase();
    const cleanName = name.trim();
    const cleanTrain = trainNumber.trim();
    const cleanCoach = coachNumber.trim().toUpperCase();

    if (!cleanName) {
      setFormError('Device Name is required.');
      return;
    }
    if (!cleanUid) {
      setFormError('Hardware UID is required.');
      return;
    }

    // Local UID uniqueness check
    if (devices.some((d) => d.uid.toUpperCase() === cleanUid)) {
      setFormError(`A device with UID "${cleanUid}" is already registered.`);
      return;
    }

    setIsSubmitting(true);
    try {
      await ApiClient.createDevice({
        uid: cleanUid,
        name: cleanName,
        train_number: cleanTrain || undefined,
        coach_number: cleanCoach || undefined,
        device_type: deviceType,
        protocol: protocol,
        mqtt_client_id: mqttClientId.trim() || undefined,
        mqtt_topic: mqttTopic.trim() || undefined,
        tank_assignment: tankAssignment,
        description: description.trim() || undefined,
        status: status,
      });

      await refreshData();
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      setFormError(err?.message || 'Failed to register device. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: '16px',
        boxSizing: 'border-box',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '560px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: '#F8FAFC',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '6px',
                backgroundColor: '#EFF6FF',
                color: '#2563EB',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Cpu size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0F172A' }}>
                Register Hardware Device
              </h3>
              <p style={{ margin: 0, fontSize: '11px', color: '#64748B' }}>
                Provision an edge telemetry device with train & coach mapping (Admin & Employee)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#64748B',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form
          onSubmit={handleSubmit}
          style={{
            padding: '20px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          {formError && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '6px',
                backgroundColor: '#FEF2F2',
                border: '1px solid #FECACA',
                color: '#DC2626',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <AlertCircle size={16} />
              <span>{formError}</span>
            </div>
          )}

          {/* 1. Device Name & 2. Hardware UID */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                1. Device Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Coach C1 Water Monitor"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  fontSize: '13px',
                  boxSizing: 'border-box',
                }}
                required
              />
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>
                  2. Hardware UID *
                </label>
                <button
                  type="button"
                  onClick={handleGenerateUid}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#2563EB',
                    fontSize: '10px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  Generate UID
                </button>
              </div>
              <input
                type="text"
                value={uid}
                onChange={(e) => handleUidChange(e.target.value)}
                placeholder="e.g. DEV-WLI-A9F3"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  fontSize: '13px',
                  boxSizing: 'border-box',
                  fontFamily: 'monospace',
                }}
                required
              />
            </div>
          </div>

          {/* 3. Device Type & 4. Protocol */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                3. Hardware Type
              </label>
              <select
                value={deviceType}
                onChange={(e) => setDeviceType(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  fontSize: '13px',
                  boxSizing: 'border-box',
                  backgroundColor: '#FFFFFF',
                }}
              >
                <option value="Quectel EC200U 4G LTE">Quectel EC200U 4G LTE</option>
                <option value="ESP32-S3 WLI Edge Node">ESP32-S3 WLI Edge Node</option>
                <option value="STM32 Dual-Sensor Modbus Node">STM32 Dual-Sensor Modbus Node</option>
                <option value="Standard WLI Telemetry Node">Standard WLI Telemetry Node</option>
                <option value="Hydrostatic Pressure Sensor Node">Hydrostatic Pressure Sensor Node</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                4. Protocol
              </label>
              <select
                value={protocol}
                onChange={(e) => setProtocol(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  fontSize: '13px',
                  boxSizing: 'border-box',
                  backgroundColor: '#FFFFFF',
                }}
              >
                <option value="MQTT over TLS/WSS (Port 8884)">MQTT over TLS/WSS (Port 8884)</option>
                <option value="MQTT Standard (Port 1883)">MQTT Standard (Port 1883)</option>
                <option value="HTTP REST Gateway (/api/status)">HTTP REST Gateway (/api/status)</option>
                <option value="Modbus RTU / RS485 Industrial Loop">Modbus RTU / RS485 Industrial Loop</option>
              </select>
            </div>
          </div>

          {/* 5. MQTT Client ID & 6. MQTT Topic */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                5. MQTT Client ID
              </label>
              <input
                type="text"
                value={mqttClientId}
                onChange={(e) => setMqttClientId(e.target.value)}
                placeholder="e.g. panorama-wli-a9f3"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  fontSize: '12px',
                  boxSizing: 'border-box',
                  fontFamily: 'monospace',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                6. Telemetry Topic
              </label>
              <input
                type="text"
                value={mqttTopic}
                onChange={(e) => setMqttTopic(e.target.value)}
                placeholder="e.g. panorama/telemetry/DEV-WLI-A9F3"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  fontSize: '12px',
                  boxSizing: 'border-box',
                  fontFamily: 'monospace',
                }}
              />
            </div>
          </div>

          {/* 7. Train # & 8. Coach # */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                7. Train Number *
              </label>
              <input
                type="text"
                value={trainNumber}
                onChange={(e) => setTrainNumber(e.target.value)}
                placeholder="e.g. 12002"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  fontSize: '13px',
                  boxSizing: 'border-box',
                }}
                required
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                8. Coach Number *
              </label>
              <input
                type="text"
                value={coachNumber}
                onChange={(e) => setCoachNumber(e.target.value)}
                placeholder="e.g. C1"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  fontSize: '13px',
                  boxSizing: 'border-box',
                }}
                required
              />
            </div>
          </div>

          {/* 9. Tank Assignment & 11. Status */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                9. Tank Assignment
              </label>
              <select
                value={tankAssignment}
                onChange={(e) => setTankAssignment(e.target.value as any)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  fontSize: '13px',
                  boxSizing: 'border-box',
                  backgroundColor: '#FFFFFF',
                }}
              >
                <option value="BOTH">BOTH (Arrival &amp; Departure)</option>
                <option value="Tank 1">Tank 1 Only (Arrival Side)</option>
                <option value="Tank 2">Tank 2 Only (Departure Side)</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                11. Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  fontSize: '13px',
                  boxSizing: 'border-box',
                  backgroundColor: '#FFFFFF',
                }}
              >
                <option value="AVAILABLE">AVAILABLE (In Pool)</option>
                <option value="ENGAGED">ENGAGED (Active in Consist)</option>
                <option value="IN_USE">IN_USE (Active Telemetry)</option>
                <option value="MAINTENANCE">MAINTENANCE (Workshop)</option>
                <option value="OFFLINE">OFFLINE</option>
              </select>
            </div>
          </div>

          {/* 10. Description */}
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
              10. Hardware Description &amp; Notes
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Hydrostatic pressure sensor node mounted on underframe junction box"
              rows={2}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                fontSize: '12px',
                boxSizing: 'border-box',
                fontFamily: 'inherit',
              }}
            />
          </div>

          {/* Action Buttons */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              marginTop: '8px',
              paddingTop: '12px',
              borderTop: '1px solid #E2E8F0',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFFFFF',
                color: '#475569',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                padding: '8px 20px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: '#2563EB',
                color: '#FFFFFF',
                fontSize: '13px',
                fontWeight: 600,
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 1px 2px rgba(37,99,235,0.2)',
              }}
            >
              {isSubmitting ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  <span>Registering...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={14} />
                  <span>Register Device</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

