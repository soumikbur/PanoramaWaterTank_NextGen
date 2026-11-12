import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Train as TrainIcon,
  X,
} from 'lucide-react';
import { ApiClient } from '../../api/client';
import { trainLookupService } from '../../services/trainLookupService';
import { TrainCreatePayload, TrainLookupErrorCode, TrainLookupResult } from '../../types/train';

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

const ERROR_TITLES: Record<TrainLookupErrorCode, string> = {
  INVALID_FORMAT: 'Invalid Format',
  NOT_FOUND: 'Invalid Train Number',
  NON_EXPRESS_TRAIN: 'Non-Express Train Excluded',
  TIMEOUT: 'Network Timeout',
  RATE_LIMITED: 'Rate Limit Exceeded',
  AUTH_ERROR: 'Invalid API Credentials',
  INVALID_RESPONSE: 'Unexpected API Response',
  SERVER_UNAVAILABLE: 'API Server Unavailable',
};

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
  const [lookupProgressText, setLookupProgressText] = useState('Verifying train information...');
  const [lookupResult, setLookupResult] = useState<TrainLookupResult | null>(null);
  const [verifiedTrainNumber, setVerifiedTrainNumber] = useState<string | null>(null);
  const [autoFilledFields, setAutoFilledFields] = useState<Set<string>>(new Set());
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const clearPopulatedMetadata = () => {
    setTrainName('');
    setSourceStation('');
    setSourceCode('');
    setDestinationStation('');
    setDestinationCode('');
    setRegion('NORTH');
    setRailwayZone('');
    setTrainType('');
    setInitialCoach('B1');
    setAutoFilledFields(new Set());
  };

  const resetForm = () => {
    setTrainNumber('');
    clearPopulatedMetadata();
    setTankCapacity('20');
    setUseOfficialConsist(true);
    setLookupLoading(false);
    setLookupResult(null);
    setVerifiedTrainNumber(null);
    setSubmitError(null);
  };

  useEffect(() => {
    if (!isOpen) {
      trainLookupService.abortActive();
      return;
    }
    resetForm();
  }, [isOpen]);

  const applyLookupData = (res: TrainLookupResult) => {
    setLookupResult(res);
    setSubmitError(null);
    if (res.status !== 'VERIFIED') {
      setVerifiedTrainNumber(null);
      clearPopulatedMetadata();
      return;
    }

    setVerifiedTrainNumber(res.train_number);
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
    } else {
      setRailwayZone('');
    }
    if (res.train_type) {
      setTrainType(res.train_type);
      filled.add('type');
    } else {
      setTrainType('');
    }
    if (res.has_official_composition && res.coach_composition.length > 0) {
      setInitialCoach(res.coach_composition[0].coach_number);
      setUseOfficialConsist(true);
      filled.add('coaches');
    }
    setAutoFilledFields(filled);
  };

  // Executes railway API verification ONLY when the user clicks Verify.
  const handleVerifyClick = async () => {
    if (lookupLoading) return;

    const clean = trainNumber.trim();
    if (!clean) {
      setSubmitError('Please enter a train number before clicking Verify.');
      return;
    }

    if (!trainLookupService.isValidTrainNumberFormat(clean)) {
      setVerifiedTrainNumber(null);
      clearPopulatedMetadata();
      setLookupLoading(false);
      setLookupResult({
        status: 'INVALID_FORMAT',
        error_code: 'INVALID_FORMAT',
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
    setLookupProgressText('Verifying train information...');
    setSubmitError(null);
    const shouldRefresh = Boolean(lookupResult && lookupResult.train_number === clean);
    try {
      const { result, stale } = await trainLookupService.lookup(clean, {
        refresh: shouldRefresh,
        onProgress: (label) => setLookupProgressText(label),
      });
      if (stale) return;
      applyLookupData(result);
    } finally {
      setLookupLoading(false);
    }
  };

  // Typing or editing train number invalidates any prior verification without firing API requests.
  const handleTrainNumberChange = (raw: string) => {
    const next = raw.replace(/\s+/g, '');
    setTrainNumber(next);
    setSubmitError(null);
    if (lookupLoading) {
      trainLookupService.abortActive();
      setLookupLoading(false);
    }
    if (lookupResult !== null || verifiedTrainNumber !== null || autoFilledFields.size > 0) {
      setLookupResult(null);
      setVerifiedTrainNumber(null);
      clearPopulatedMetadata();
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
      setSubmitError('Invalid Train Number. No matching train information was found.');
      return;
    }
    if (lookupResult?.status !== 'VERIFIED' || verifiedTrainNumber !== cleanNum) {
      setSubmitError('Train number must be verified via the Verify button before adding to the fleet.');
      return;
    }
    if (lookupResult?.already_exists) {
      setSubmitError(`Train ${cleanNum} is already registered in the fleet.`);
      return;
    }
    if (!trainName.trim() || !region.trim()) {
      setSubmitError('Train Name and Railway Region are required before adding to the fleet.');
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
        api_provider: lookupResult.provider || 'DataMeet OpenData',
        last_verified_at: lookupResult.verified_at || new Date().toISOString(),
        tank_capacity: parseFloat(tankCapacity) || 20.0,
        ...(hasOfficial
          ? {
              coaches: lookupResult.coach_composition.map((c) => ({
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

  const cleanInputNum = trainNumber.trim();
  const isVerified = lookupResult?.status === 'VERIFIED' && verifiedTrainNumber === cleanInputNum;
  const isErrorStatus =
    lookupResult?.status === 'NOT_FOUND' ||
    lookupResult?.status === 'INVALID_FORMAT' ||
    lookupResult?.status === 'UNAVAILABLE' ||
    lookupResult?.status === 'UNSUPPORTED_TYPE';
  const isDuplicate = Boolean(lookupResult?.already_exists);
  const canConfirm =
    !submitLoading &&
    !lookupLoading &&
    isVerified &&
    !isDuplicate &&
    Boolean(cleanInputNum) &&
    Boolean(trainName.trim()) &&
    Boolean(region.trim());

  const errorCode: TrainLookupErrorCode =
    lookupResult?.error_code ||
    (lookupResult?.status === 'NOT_FOUND'
      ? 'NOT_FOUND'
      : lookupResult?.status === 'UNSUPPORTED_TYPE'
        ? 'NON_EXPRESS_TRAIN'
        : lookupResult?.status === 'INVALID_FORMAT'
          ? 'INVALID_FORMAT'
          : 'SERVER_UNAVAILABLE');
  const errorTitle = ERROR_TITLES[errorCode] || 'Verification Failed';

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
        Verified
      </span>
    ) : null;

  const inputStyle: React.CSSProperties = {
    width: '100%',
    minWidth: 0,
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
        padding: '12px',
      }}
    >
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '12px',
          padding: '20px',
          width: '620px',
          maxWidth: '100%',
          maxHeight: 'calc(100vh - 24px)',
          overflowY: 'auto',
          boxShadow: '0 24px 40px -12px rgba(15, 23, 42, 0.28)',
          border: '1px solid #E2E8F0',
          boxSizing: 'border-box',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            marginBottom: '14px',
            borderBottom: '1px solid #F1F5F9',
            paddingBottom: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
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
            <div style={{ minWidth: 0 }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0F172A' }}>
                Add Train to Fleet
              </h3>
              <div style={{ fontSize: '11px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <ShieldCheck size={12} color="#2563EB" />
                Enter train number and click Verify to fetch Indian Railways details
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
              flexShrink: 0,
            }}
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Train Number + Explicit Verify Button */}
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
              Train Number (4 or 5 digits) *
            </label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'stretch' }}>
              <input
                data-testid="train-number-input"
                type="text"
                inputMode="numeric"
                maxLength={6}
                required
                placeholder="e.g. 15102, 12002, 12951"
                value={trainNumber}
                onChange={(e) => handleTrainNumberChange(e.target.value)}
                style={{
                  ...inputStyle,
                  flex: '1 1 auto',
                  fontWeight: 700,
                  letterSpacing: '0.4px',
                  borderColor: isVerified ? '#16A34A' : isErrorStatus ? '#DC2626' : '#CBD5E1',
                }}
              />
              <button
                type="button"
                data-testid="verify-train-btn"
                onClick={() => void handleVerifyClick()}
                disabled={lookupLoading || !cleanInputNum}
                title="Verify train number via Railway API"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '8px 14px',
                  borderRadius: '6px',
                  border: isVerified ? '1px solid #86EFAC' : '1px solid #2563EB',
                  backgroundColor: lookupLoading || !cleanInputNum
                    ? '#F1F5F9'
                    : isVerified
                      ? '#F0FDF4'
                      : '#2563EB',
                  color: lookupLoading || !cleanInputNum
                    ? '#94A3B8'
                    : isVerified
                      ? '#166534'
                      : '#FFFFFF',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: lookupLoading || !cleanInputNum ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                {lookupLoading ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : isVerified ? (
                  <RefreshCw size={13} />
                ) : (
                  <Search size={13} />
                )}
                {lookupLoading ? 'Verifying...' : isVerified ? 'Re-verify' : 'Verify'}
              </button>
            </div>
          </div>

          {/* Lookup Loading Banner */}
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
              <span>{lookupProgressText}</span>
            </div>
          )}

          {/* Verified State Banner */}
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
                    : 'Train successfully verified.'}
                </span>
                <span style={{ fontSize: '10px', fontWeight: 600, opacity: 0.9 }}>
                  Source: {lookupResult.provider} · {lookupResult.cached ? 'Cached' : 'Live'} ({lookupResult.latency_ms} ms)
                </span>
              </div>
              {lookupResult.missing_fields.length > 0 && (
                <div style={{ fontSize: '11px', opacity: 0.88 }}>
                  Provider note: {lookupResult.missing_fields.join(', ')} not supplied by {lookupResult.provider}; app defaults preserved.
                </div>
              )}
            </div>
          )}

          {/* Differentiated Verification Error Popup */}
          {!lookupLoading && isErrorStatus && lookupResult && (
            <div
              data-testid="train-lookup-error"
              data-error-code={errorCode}
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
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{errorTitle}</div>
                <div style={{ marginTop: '2px' }}>{lookupResult.message}</div>
              </div>
              {lookupResult.status === 'UNAVAILABLE' && (
                <button
                  type="button"
                  data-testid="retry-verify-btn"
                  onClick={() => void handleVerifyClick()}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    border: '1px solid #F59E0B',
                    backgroundColor: '#FFFFFF',
                    color: '#92400E',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  <RefreshCw size={11} />
                  Retry
                </button>
              )}
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

          {/* Train Metadata Fields */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '10px' }}>
            <div style={{ minWidth: 0 }}>
              <label style={{ display: 'flex', alignItems: 'center', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                Train Name * {autoTag('name')}
              </label>
              <input
                data-testid="train-name-input"
                type="text"
                required
                readOnly={isVerified && autoFilledFields.has('name')}
                placeholder="Populated after clicking Verify"
                value={trainName}
                onChange={(e) => setTrainName(e.target.value)}
                style={{
                  ...inputStyle,
                  backgroundColor: isVerified && autoFilledFields.has('name') ? '#F8FAFC' : '#FFFFFF',
                }}
              />
            </div>

            <div style={{ minWidth: 0 }}>
              <label style={{ display: 'flex', alignItems: 'center', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                Train Type {autoTag('type')}
              </label>
              <input
                data-testid="train-type-input"
                type="text"
                readOnly={isVerified && autoFilledFields.has('type')}
                placeholder="Express, Rajdhani, Shatabdi..."
                value={trainType}
                onChange={(e) => setTrainType(e.target.value)}
                style={{
                  ...inputStyle,
                  backgroundColor: isVerified && autoFilledFields.has('type') ? '#F8FAFC' : '#FFFFFF',
                }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '10px' }}>
            <div style={{ minWidth: 0 }}>
              <label style={{ display: 'flex', alignItems: 'center', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                Source Station {autoTag('source')}
              </label>
              <input
                data-testid="train-source-input"
                type="text"
                readOnly={isVerified && autoFilledFields.has('source')}
                placeholder="Starting station"
                value={sourceStation}
                onChange={(e) => setSourceStation(e.target.value)}
                style={{
                  ...inputStyle,
                  backgroundColor: isVerified && autoFilledFields.has('source') ? '#F8FAFC' : '#FFFFFF',
                }}
              />
            </div>

            <div style={{ minWidth: 0 }}>
              <label style={{ display: 'flex', alignItems: 'center', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                Destination Station {autoTag('destination')}
              </label>
              <input
                data-testid="train-destination-input"
                type="text"
                readOnly={isVerified && autoFilledFields.has('destination')}
                placeholder="Final destination"
                value={destinationStation}
                onChange={(e) => setDestinationStation(e.target.value)}
                style={{
                  ...inputStyle,
                  backgroundColor: isVerified && autoFilledFields.has('destination') ? '#F8FAFC' : '#FFFFFF',
                }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
            <div style={{ minWidth: 0 }}>
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

            <div style={{ minWidth: 0 }}>
              <label style={{ display: 'flex', alignItems: 'center', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                Railway Zone {autoTag('zone')}
              </label>
              <input
                data-testid="train-zone-input"
                type="text"
                readOnly={isVerified && autoFilledFields.has('zone')}
                placeholder={isVerified && !autoFilledFields.has('zone') ? 'Optional (not in API)' : 'NR / WR / SR / NER'}
                value={railwayZone}
                onChange={(e) => setRailwayZone(e.target.value)}
                style={{
                  ...inputStyle,
                  backgroundColor: isVerified && autoFilledFields.has('zone') ? '#F8FAFC' : '#FFFFFF',
                }}
              />
            </div>

            <div style={{ minWidth: 0 }}>
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

          {/* Running Days & Route Summary */}
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
                Initial Coach Number
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
              flexWrap: 'wrap',
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
