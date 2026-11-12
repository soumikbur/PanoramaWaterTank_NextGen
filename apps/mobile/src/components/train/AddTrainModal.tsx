import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  Train as TrainIcon,
  X,
} from 'lucide-react';
import { ApiClient } from '../../api/client';
import { trainLookupService } from '../../services/trainLookupService';
import { TrainCreatePayload, TrainLookupResult } from '../../types/train';

export interface AddTrainModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTrainAdded: (
    trainNumber: string,
    summary?: { name: string; region: string }
  ) => Promise<void> | void;
}

const REGION_OPTIONS = [
  { key: 'NORTH', label: 'NORTH — Northern Railway (NR)' },
  { key: 'SOUTH', label: 'SOUTH — Southern Railway (SR)' },
  { key: 'EAST', label: 'EAST — Eastern Railway (ER)' },
  { key: 'WEST', label: 'WEST — Western Railway (WR)' },
];

export const AddTrainModal: React.FC<AddTrainModalProps> = ({
  isOpen,
  onClose,
  onTrainAdded,
}) => {
  const [trainNumber, setTrainNumber] = useState('');
  const [trainName, setTrainName] = useState('');
  const [sourceStation, setSourceStation] = useState('');
  const [sourceCode, setSourceCode] = useState('');
  const [destinationStation, setDestinationStation] = useState('');
  const [destinationCode, setDestinationCode] = useState('');
  const [region, setRegion] = useState('NORTH');
  const [railwayZone, setRailwayZone] = useState('NR');
  const [trainType, setTrainType] = useState('Express');
  const [initialCoach, setInitialCoach] = useState('B1');
  const [tankCapacity, setTankCapacity] = useState('20');
  const [useOfficialConsist, setUseOfficialConsist] = useState(true);

  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupResult, setLookupResult] = useState<TrainLookupResult | null>(null);
  const [autoFilledFields, setAutoFilledFields] = useState<Set<string>>(new Set());
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetForm = () => {
    setTrainNumber('');
    setTrainName('');
    setSourceStation('');
    setSourceCode('');
    setDestinationStation('');
    setDestinationCode('');
    setRegion('NORTH');
    setRailwayZone('NR');
    setTrainType('Express');
    setInitialCoach('B1');
    setTankCapacity('20');
    setUseOfficialConsist(true);
    setLookupLoading(false);
    setLookupResult(null);
    setAutoFilledFields(new Set());
    setSubmitError(null);
  };

  useEffect(() => {
    if (!isOpen) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      trainLookupService.abortActive();
      return;
    }
    resetForm();
  }, [isOpen]);

  const applyLookupData = (res: TrainLookupResult) => {
    setLookupResult(res);
    setSubmitError(null);
    if (res.status !== 'VERIFIED') {
      return;
    }

    const filled = new Set<string>();
    if (res.train_name) {
      setTrainName(res.train_name);
      filled.add('name');
    }
    if (res.source_station || res.source_code) {
      const label = res.source_station
        ? res.source_code
          ? `${res.source_station} (${res.source_code})`
          : res.source_station
        : res.source_code || '';
      setSourceStation(label);
      setSourceCode(res.source_code || '');
      filled.add('source');
    } else {
      setSourceStation('');
      setSourceCode('');
    }
    if (res.destination_station || res.destination_code) {
      const label = res.destination_station
        ? res.destination_code
          ? `${res.destination_station} (${res.destination_code})`
          : res.destination_station
        : res.destination_code || '';
      setDestinationStation(label);
      setDestinationCode(res.destination_code || '');
      filled.add('destination');
    } else {
      setDestinationStation('');
      setDestinationCode('');
    }
    if (res.region) {
      setRegion(res.region);
      filled.add('region');
    }
    if (res.railway_zone) {
      setRailwayZone(res.railway_zone);
      filled.add('zone');
    }
    if (res.train_type) {
      setTrainType(res.train_type);
      filled.add('type');
    }
    if (res.has_official_composition && res.coach_composition.length > 0) {
      setInitialCoach(res.coach_composition[0].coach_number);
      setUseOfficialConsist(true);
      filled.add('coaches');
    }
    setAutoFilledFields(filled);
  };

  const runLookup = async (value: string, refresh = false) => {
    const clean = value.trim();
    if (!clean) {
      setLookupResult(null);
      setLookupLoading(false);
      return;
    }

    if (!trainLookupService.isValidTrainNumberFormat(clean)) {
      setLookupLoading(false);
      setLookupResult({
        status: 'INVALID_FORMAT',
        train_number: clean,
        route: [],
        coach_composition: [],
        has_official_composition: false,
        cached: false,
        latency_ms: 0,
        missing_fields: [],
        already_exists: false,
        message: 'Enter a valid 4- or 5-digit Indian Railways train number.',
        provider_attempts: [],
      });
      return;
    }

    setLookupLoading(true);
    setSubmitError(null);
    const { result, stale } = await trainLookupService.lookup(clean, { refresh });
    if (stale) return;
    setLookupLoading(false);
    applyLookupData(result);
  };

  const handleTrainNumberChange = (raw: string) => {
    const next = raw.replace(/\s+/g, '');
    setTrainNumber(next);
    setSubmitError(null);
    setAutoFilledFields(new Set());

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!next) {
      trainLookupService.abortActive();
      setLookupLoading(false);
      setLookupResult(null);
      return;
    }

    // Immediate lookup on 5 digits, brief debounce for 4 digits or incomplete typing
    if (/^\d{5}$/.test(next)) {
      debounceRef.current = setTimeout(() => {
        void runLookup(next);
      }, 150);
    } else if (/^\d{4}$/.test(next)) {
      debounceRef.current = setTimeout(() => {
        void runLookup(next);
      }, 450);
    } else if (/^\d{1,3}$/.test(next)) {
      trainLookupService.abortActive();
      setLookupLoading(false);
      setLookupResult(null);
    } else {
      // Contains non-digits or >5 chars: show immediate format error
      void runLookup(next);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNum = trainNumber.trim();
    if (!trainLookupService.isValidTrainNumberFormat(cleanNum)) {
      setSubmitError('Please enter a valid 4- or 5-digit train number.');
      return;
    }
    if (lookupResult?.status === 'NOT_FOUND') {
      setSubmitError('Invalid Train Number – Cannot register a non-existent train number.');
      return;
    }
    if (lookupResult?.already_exists) {
      setSubmitError(`Train ${cleanNum} is already registered in the fleet.`);
      return;
    }
    if (!trainName.trim()) {
      setSubmitError('Train Name is required before adding to the fleet.');
      return;
    }

    setSubmitLoading(true);
    setSubmitError(null);
    try {
      const stripCodeSuffix = (text: string) => text.replace(/\s*\([A-Z0-9]+\)\s*$/, '').trim();
      const hasOfficial =
        Boolean(lookupResult?.has_official_composition) &&
        Boolean(lookupResult?.coach_composition?.length) &&
        useOfficialConsist;

      const payload: TrainCreatePayload = {
        train_number: cleanNum,
        name: trainName.trim(),
        region,
        railway_zone: railwayZone.trim().toUpperCase() || undefined,
        source_station: sourceStation ? stripCodeSuffix(sourceStation) : null,
        source_code: sourceCode || null,
        destination_station: destinationStation ? stripCodeSuffix(destinationStation) : null,
        destination_code: destinationCode || null,
        train_type: trainType.trim() || 'Express',
        running_days: lookupResult?.running_days || null,
        route: lookupResult?.route || [],
        total_coaches: hasOfficial ? lookupResult?.coach_composition.length : 1,
        has_official_composition: hasOfficial,
        api_provider: lookupResult?.status === 'VERIFIED' ? lookupResult.provider : 'Manual Entry',
        last_verified_at: lookupResult?.status === 'VERIFIED' ? lookupResult.verified_at : null,
        tank_capacity: parseFloat(tankCapacity) || 20.0,
        ...(hasOfficial
          ? {
              coaches: lookupResult!.coach_composition.map((c) => ({
                coach_number: c.coach_number,
                coach_category: c.coach_category,
                coach_type: c.coach_type,
              })),
            }
          : { coach_number: initialCoach.trim().toUpperCase() || 'B1' }),
      };

      await ApiClient.createTrain(payload);
      trainLookupService.clearCache(cleanNum);
      await onTrainAdded(cleanNum, { name: payload.name, region: payload.region });
      onClose();
    } catch (err: any) {
      setSubmitError(err?.message || 'Failed to register train.');
    } finally {
      setSubmitLoading(false);
    }
  };

  if (!isOpen) return null;

  const isVerified = lookupResult?.status === 'VERIFIED';
  const isErrorStatus =
    lookupResult?.status === 'NOT_FOUND' ||
    lookupResult?.status === 'INVALID_FORMAT' ||
    lookupResult?.status === 'UNAVAILABLE';
  const isDuplicate = Boolean(lookupResult?.already_exists);
  const canConfirm =
    !submitLoading &&
    !lookupLoading &&
    !isDuplicate &&
    lookupResult?.status !== 'NOT_FOUND' &&
    lookupResult?.status !== 'INVALID_FORMAT' &&
    Boolean(trainNumber.trim()) &&
    Boolean(trainName.trim());

  const autoTag = (field: string) =>
    autoFilledFields.has(field) ? (
      <span
        style={{
          marginLeft: '6px',
          fontSize: '9px',
          fontWeight: 700,
          color: '#0369A1',
          backgroundColor: '#E0F2FE',
          padding: '1px 6px',
          borderRadius: '999px',
          letterSpacing: '0.3px',
          textTransform: 'uppercase',
        }}
      >
        Auto-filled
      </span>
    ) : null;

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    borderRadius: '6px',
    border: '1px solid #CBD5E1',
    fontSize: '13px',
    boxSizing: 'border-box',
    backgroundColor: '#FFFFFF',
    color: '#0F172A',
  };

  const modalContent = (
    <div
      data-testid="add-train-modal"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.58)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        padding: '16px',
      }}
    >
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '12px',
          padding: '20px',
          width: '620px',
          maxWidth: '100%',
          maxHeight: 'calc(100vh - 32px)',
          overflowY: 'auto',
          boxShadow: '0 24px 40px -12px rgba(15, 23, 42, 0.28)',
          border: '1px solid #E2E8F0',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '14px',
            borderBottom: '1px solid #F1F5F9',
            paddingBottom: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '8px',
                backgroundColor: '#EFF6FF',
                color: '#2563EB',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <TrainIcon size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0F172A' }}>
                Add Train to Fleet
              </h3>
              <div style={{ fontSize: '11px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Sparkles size={11} color="#2563EB" />
                Automatic Indian Railways lookup & verification
              </div>
            </div>
          </div>

          <button
            type="button"
            data-testid="close-add-train-btn"
            onClick={onClose}
            aria-label="Close Add Train modal"
            style={{
              border: 'none',
              background: '#F8FAFC',
              borderRadius: '6px',
              cursor: 'pointer',
              color: '#64748B',
              padding: '6px',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Train Number + Verify Trigger */}
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
              Train Number (4 or 5 digits) *
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <input
                data-testid="train-number-input"
                type="text"
                inputMode="numeric"
                maxLength={6}
                required
                placeholder="e.g. 12002, 12301, 12951"
                value={trainNumber}
                onChange={(e) => handleTrainNumberChange(e.target.value)}
                onBlur={() => {
                  if (/^\d{4}$/.test(trainNumber.trim()) && !lookupResult && !lookupLoading) {
                    void runLookup(trainNumber);
                  }
                }}
                style={{
                  ...inputStyle,
                  flex: '1 1 180px',
                  fontWeight: 700,
                  letterSpacing: '0.4px',
                  borderColor: isVerified ? '#16A34A' : isErrorStatus ? '#DC2626' : '#CBD5E1',
                }}
              />
              <button
                type="button"
                data-testid="verify-train-btn"
                onClick={() => void runLookup(trainNumber, Boolean(lookupResult))}
                disabled={lookupLoading || !trainNumber.trim()}
                title="Verify train number via Railway APIs"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#F8FAFC',
                  color: '#0F172A',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: lookupLoading || !trainNumber.trim() ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {lookupResult ? <RefreshCw size={13} /> : <Search size={13} />}
                {lookupResult ? 'Re-verify' : 'Verify'}
              </button>
            </div>
          </div>

          {/* Lookup Status Banner */}
          {lookupLoading && (
            <div
              data-testid="train-lookup-status"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '9px 12px',
                borderRadius: '8px',
                backgroundColor: '#EFF6FF',
                border: '1px solid #BFDBFE',
                color: '#1D4ED8',
                fontSize: '12px',
                fontWeight: 600,
              }}
            >
              <Loader2 size={15} className="animate-spin" />
              Searching Indian Railways database...
            </div>
          )}

          {!lookupLoading && isVerified && lookupResult && (
            <div
              data-testid="train-lookup-status"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                padding: '10px 12px',
                borderRadius: '8px',
                backgroundColor: isDuplicate ? '#FEF3C7' : '#F0FDF4',
                border: `1px solid ${isDuplicate ? '#FCD34D' : '#86EFAC'}`,
                color: isDuplicate ? '#92400E' : '#166534',
                fontSize: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}>
                  <CheckCircle2 size={15} />
                  {isDuplicate
                    ? `Train ${lookupResult.train_number} is already registered in the fleet.`
                    : 'Train verified successfully.'}
                </span>
                <span style={{ fontSize: '10px', fontWeight: 600, opacity: 0.9 }}>
                  Source: {lookupResult.provider} · {lookupResult.cached ? 'Cached' : 'Live'} ({lookupResult.latency_ms} ms)
                </span>
              </div>
              {lookupResult.missing_fields.length > 0 && (
                <div style={{ fontSize: '11px', opacity: 0.88 }}>
                  Provider note: {lookupResult.missing_fields.join(', ')} not supplied by {lookupResult.provider}; manual/app defaults preserved.
                </div>
              )}
            </div>
          )}

          {!lookupLoading && isErrorStatus && lookupResult && (
            <div
              data-testid="train-lookup-error"
              role="alert"
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                padding: '10px 12px',
                borderRadius: '8px',
                backgroundColor: lookupResult.status === 'UNAVAILABLE' ? '#FFFBEB' : '#FEF2F2',
                border: `1px solid ${lookupResult.status === 'UNAVAILABLE' ? '#FDE68A' : '#FCA5A5'}`,
                color: lookupResult.status === 'UNAVAILABLE' ? '#92400E' : '#B91C1C',
                fontSize: '12px',
              }}
            >
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
              <div>
                <div style={{ fontWeight: 700 }}>{lookupResult.message}</div>
                {lookupResult.status === 'UNAVAILABLE' && (
                  <div style={{ fontSize: '11px', marginTop: '2px' }}>
                    You can retry verification or complete the fields manually below.
                  </div>
                )}
              </div>
            </div>
          )}

          {submitError && (
            <div
              data-testid="add-train-submit-error"
              role="alert"
              style={{
                backgroundColor: '#FEE2E2',
                border: '1px solid #FCA5A5',
                color: '#B91C1C',
                padding: '8px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
              }}
            >
              {submitError}
            </div>
          )}

          {/* Auto-populated Train Metadata Fields */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
            <div>
              <label style={{ display: 'flex', alignItems: 'center', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                Train Name * {autoTag('name')}
              </label>
              <input
                data-testid="train-name-input"
                type="text"
                required
                placeholder="e.g. BHOPAL SHATABDI"
                value={trainName}
                onChange={(e) => setTrainName(e.target.value)}
                style={inputStyle}
              />
            </div>

            <div>
              <label style={{ display: 'flex', alignItems: 'center', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                Train Type {autoTag('type')}
              </label>
              <input
                data-testid="train-type-input"
                type="text"
                placeholder="e.g. Shatabdi Express, Rajdhani, Superfast"
                value={trainType}
                onChange={(e) => setTrainType(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
            <div>
              <label style={{ display: 'flex', alignItems: 'center', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                Source Station {autoTag('source')}
              </label>
              <input
                data-testid="train-source-input"
                type="text"
                placeholder="Starting station"
                value={sourceStation}
                onChange={(e) => setSourceStation(e.target.value)}
                style={inputStyle}
              />
            </div>

            <div>
              <label style={{ display: 'flex', alignItems: 'center', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                Destination Station {autoTag('destination')}
              </label>
              <input
                data-testid="train-destination-input"
                type="text"
                placeholder="Final destination"
                value={destinationStation}
                onChange={(e) => setDestinationStation(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px' }}>
            <div>
              <label style={{ display: 'flex', alignItems: 'center', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                Railway Region * {autoTag('region')}
              </label>
              <select
                data-testid="train-region-select"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                style={inputStyle}
              >
                {REGION_OPTIONS.map((opt) => (
                  <option key={opt.key} value={opt.key}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'flex', alignItems: 'center', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                Railway Zone {autoTag('zone')}
              </label>
              <input
                data-testid="train-zone-input"
                type="text"
                placeholder="NR / WR / SR / SER"
                value={railwayZone}
                onChange={(e) => setRailwayZone(e.target.value)}
                style={inputStyle}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                Tank Capacity (L)
              </label>
              <input
                data-testid="train-capacity-input"
                type="number"
                step="0.5"
                min="1"
                value={tankCapacity}
                onChange={(e) => setTankCapacity(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Running Days & Route Summary (when API supplies them) */}
          {isVerified && lookupResult && (lookupResult.running_days?.length || lookupResult.route.length > 0) && (
            <div
              style={{
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '8px',
                padding: '10px 12px',
                fontSize: '11px',
                color: '#334155',
              }}
            >
              {lookupResult.running_days && lookupResult.running_days.length > 0 && (
                <div style={{ marginBottom: lookupResult.route.length > 0 ? '6px' : 0 }}>
                  <strong>Running Days:</strong> {lookupResult.running_days.join(', ')}
                </div>
              )}
              {lookupResult.route.length > 0 && (
                <div>
                  <strong>Route ({lookupResult.route.length} stops):</strong>{' '}
                  {lookupResult.route
                    .slice(0, 6)
                    .map((s) => `${s.station_name} (${s.station_code})`)
                    .join(' → ')}
                  {lookupResult.route.length > 6 ? ` → +${lookupResult.route.length - 6} more` : ''}
                </div>
              )}
            </div>
          )}

          {/* Coach Composition / Initial Coach */}
          {isVerified && lookupResult?.has_official_composition && lookupResult.coach_composition.length > 0 ? (
            <div
              data-testid="official-consist-preview"
              style={{
                backgroundColor: '#F0F9FF',
                border: '1px solid #BAE6FD',
                borderRadius: '8px',
                padding: '10px 12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#0369A1' }}>
                  Official Coach Composition ({lookupResult.coach_composition.length} coaches)
                </span>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#0C4A6E', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={useOfficialConsist}
                    onChange={(e) => setUseOfficialConsist(e.target.checked)}
                  />
                  Provision all official coaches
                </label>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', maxHeight: '78px', overflowY: 'auto' }}>
                {lookupResult.coach_composition.map((c) => (
                  <span
                    key={`${c.position}-${c.coach_number}`}
                    style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      padding: '3px 7px',
                      borderRadius: '5px',
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #7DD3FC',
                      color: '#0369A1',
                    }}
                  >
                    {c.coach_number} ({c.coach_type || c.coach_category})
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                Initial Coach Number (App-managed consist)
              </label>
              <input
                data-testid="train-coach-input"
                type="text"
                placeholder="B1, C1, A1..."
                value={initialCoach}
                onChange={(e) => setInitialCoach(e.target.value)}
                style={inputStyle}
              />
            </div>
          )}

          {/* Actions */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              marginTop: '6px',
              paddingTop: '12px',
              borderTop: '1px solid #F1F5F9',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              style={{
                backgroundColor: '#F1F5F9',
                border: '1px solid #CBD5E1',
                borderRadius: '6px',
                padding: '8px 16px',
                fontSize: '12px',
                color: '#475569',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Cancel
            </button>
            <button
              data-testid="confirm-add-train-btn"
              type="submit"
              disabled={!canConfirm}
              style={{
                backgroundColor: canConfirm ? '#2563EB' : '#94A3B8',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 20px',
                fontSize: '12px',
                color: '#FFFFFF',
                cursor: canConfirm ? 'pointer' : 'not-allowed',
                fontWeight: 700,
              }}
            >
              {submitLoading ? 'Adding Train...' : 'Confirm & Add Train'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};
