import React, { useState, useRef, useEffect } from 'react';
import { colors, typography } from '../../theme';
import { useApp, ScreenName } from '../../state/AppContext';
import { useDisplayPreferences } from '../../context/DisplayPreferencesContext';
import { DEFAULT_CORRIDOR_STATIONS, TrainOverviewItem, TankLiveStatus, Device } from '../../types';
import {
  Droplet,
  Home,
  Search,
  X,
  Settings as SettingsIcon,
  LogOut,
  User as UserIcon,
  Train,
  Layers,
  Cpu,
  MapPin,
  Compass,
  ArrowRight,
  AlertCircle,
  Loader2,
  Sun,
  Moon,
  Monitor,
  Sliders,
  ChevronDown,
} from 'lucide-react';

interface SearchResultItem {
  id: string;
  type: 'TRAIN' | 'COACH' | 'TANK' | 'DEVICE' | 'STATION' | 'LOCATION';
  name: string;
  subtitle: string;
  identifier: string;
  status?: string;
  isOnline?: boolean;
  onClick: () => void;
}

export const Header: React.FC = () => {
  const {
    activeScreen,
    setActiveScreen,
    connectionStatus,
    currentTime,
    currentDate,
    currentUser,
    searchQuery,
    setSearchQuery,
    logout,
    tanks,
    liveTank,
    devices,
    regions,
    mqttBrokerStatus,
    setSelectedTrainNumber,
    setSelectedTankId,
    setSelectedDeviceId,
    setSelectedStationCode,
  } = useApp();

  const { theme, setTheme, resolvedTheme, isDark } = useDisplayPreferences();

  // Search local states
  const [isOpen, setIsOpen] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [lastSearchedTerm, setLastSearchedTerm] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [isSearching, setIsSearching] = useState(false);

  // Profile menu state
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  const searchContainerRef = useRef<HTMLDivElement>(null);
  const profileContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Outside click listener to dismiss search panel and profile menu
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
      if (profileContainerRef.current && !profileContainerRef.current.contains(e.target as Node)) {
        setIsProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Screen titles and subtitles
  const screenInfo: Record<ScreenName, { title: string; subtitle: string }> = {
    login: {
      title: 'Authentication',
      subtitle: 'Sign in to access Panorama SCADA console',
    },
    dashboard: {
      title: 'Water Tank Dashboard',
      subtitle: 'Real-time telemetry, capacity level & diagnostic indicators',
    },
    trains: {
      title: 'Train Management',
      subtitle: 'Railway fleet operations & regional consist management',
    },
    coaches: {
      title: 'Coach Management',
      subtitle: 'Consist coach status, 24-coach graphical layout & dual water tanks',
    },
    watertank: {
      title: 'All Tanks',
      subtitle: 'Fleet-wide water reservoir level & volume monitoring',
    },
    devices: {
      title: 'Device Mapping',
      subtitle: 'Operational device assignments, engaged vs free status & telemetry link',
    },
    location: {
      title: 'Location & GPS Tracking',
      subtitle: 'Live train coordinates, speed, route map & corridor intelligence',
    },
    monitoring: {
      title: 'Operational Monitoring',
      subtitle: 'Real-time multi-train coach telemetry, dual tank levels & battery alerts',
    },
    alerts: {
      title: 'Alerts & Alarm Management',
      subtitle: 'Active system alarms, critical thresholds & acknowledgments',
    },
    history: {
      title: 'Historical Telemetry Logs',
      subtitle: 'Downsampled multi-interval sensor time-series & CSV export',
    },
    reports: {
      title: 'Operational Reports',
      subtitle: 'Water consumption analysis, refill logs & compliance audit',
    },
    settings: {
      title: 'Settings',
      subtitle: 'Tank geometry, alarm thresholds & device configuration',
    },
    users: {
      title: 'User Management & RBAC',
      subtitle: 'Operator accounts, security policies & role-based permissions',
    },
    logs: {
      title: 'Diagnostics & Event Logs',
      subtitle: 'System telemetry payloads, connection handshakes & audit trails',
    },
  };

  const currentInfo = screenInfo[activeScreen] || {
    title: 'Panorama SCADA',
    subtitle: 'Railway IoT Water Monitoring Platform',
  };

  const isConnected = connectionStatus === 'CONNECTED';
  const isReconnecting = connectionStatus === 'RECONNECTING';
  const isAdmin = currentUser?.role === 'ADMIN';

  // Core Search Execution across all authoritative data sources
  const executeSearch = (rawQuery?: string) => {
    const q = (rawQuery !== undefined ? rawQuery : searchQuery).trim();
    if (!q) {
      setIsOpen(false);
      setResults([]);
      setHasSearched(false);
      return;
    }

    const term = q.toLowerCase();
    setHasSearched(true);
    setLastSearchedTerm(q);
    setIsSearching(true);

    const matches: SearchResultItem[] = [];

    // 1. Search Trains (from regions and AppContext)
    const trainMap = new Map<string, { train: TrainOverviewItem; regionName: string }>();
    (regions || []).forEach((reg) => {
      (reg.trains || []).forEach((tr) => {
        trainMap.set(tr.train_number, { train: tr, regionName: reg.name });
      });
    });

    // Fallback if train 12002 is loaded by default
    if (trainMap.size === 0) {
      trainMap.set('12002', {
        train: {
          train_number: '12002',
          name: 'Bhopal Shatabdi Express',
          type: 'Shatabdi Express',
          coaches_count: 8,
          tanks_count: 16,
          is_online: true,
          status: 'RUNNING',
          active_alarms: 0,
        },
        regionName: 'Northern Railway',
      });
    }

    trainMap.forEach(({ train, regionName }) => {
      const matchNum = train.train_number.toLowerCase().includes(term);
      const matchName = (train.name || '').toLowerCase().includes(term);
      const matchType = (train.type || '').toLowerCase().includes(term);
      const matchRegion = regionName.toLowerCase().includes(term);

      if (matchNum || matchName || matchType || matchRegion) {
        matches.push({
          id: `train-${train.train_number}`,
          type: 'TRAIN',
          name: `${train.train_number} — ${train.name || 'Express'}`,
          identifier: `Train #${train.train_number}`,
          subtitle: `Region: ${regionName} • ${train.coaches_count || 0} Coaches • ${train.tanks_count || 0} Tanks`,
          status: train.is_online ? 'ONLINE' : 'OFFLINE',
          isOnline: train.is_online,
          onClick: () => {
            setSelectedTrainNumber(train.train_number);
            setActiveScreen('trains');
            setIsOpen(false);
          },
        });
      }
    });

    // 2. Search Coaches (from tanks, devices, trains)
    const coachMap = new Map<string, { coachNumber: string; trainNumber: string; isOnline: boolean; tankCount: number; deviceUid?: string }>();
    (tanks || []).forEach((t) => {
      if (t.coachNumber) {
        const key = `${t.trainNumber || '12002'}-${t.coachNumber}`;
        const existing = coachMap.get(key) || {
          coachNumber: t.coachNumber,
          trainNumber: t.trainNumber || '12002',
          isOnline: false,
          tankCount: 0,
          deviceUid: t.deviceUid,
        };
        existing.tankCount += 1;
        if (t.isOnline) existing.isOnline = true;
        coachMap.set(key, existing);
      }
    });
    (devices || []).forEach((d) => {
      if (d.coachNumber) {
        const key = `${d.trainNumber || '12002'}-${d.coachNumber}`;
        const existing = coachMap.get(key) || {
          coachNumber: d.coachNumber,
          trainNumber: d.trainNumber || '12002',
          isOnline: false,
          tankCount: 0,
          deviceUid: d.uid,
        };
        if (d.isOnline) existing.isOnline = true;
        existing.deviceUid = d.uid;
        coachMap.set(key, existing);
      }
    });

    coachMap.forEach(({ coachNumber, trainNumber, isOnline, tankCount, deviceUid }) => {
      const matchCoach = coachNumber.toLowerCase().includes(term) || `coach ${coachNumber}`.toLowerCase().includes(term);
      const matchTrain = trainNumber.toLowerCase().includes(term);

      if (matchCoach || matchTrain) {
        matches.push({
          id: `coach-${trainNumber}-${coachNumber}`,
          type: 'COACH',
          name: `Coach ${coachNumber}`,
          identifier: `Coach ${coachNumber} (${trainNumber})`,
          subtitle: `Train ${trainNumber} • ${tankCount} Tanks • Sensor: ${deviceUid ? (deviceUid.length > 12 ? deviceUid.substring(0, 10) + '...' : deviceUid) : 'Configured'}`,
          status: isOnline ? 'ONLINE' : 'OFFLINE',
          isOnline,
          onClick: () => {
            setSelectedTrainNumber(trainNumber);
            setActiveScreen('trains');
            setIsOpen(false);
          },
        });
      }
    });

    // 3. Search Tanks (from tanks array or liveTank)
    const allTanks = tanks && tanks.length > 0 ? tanks : (liveTank ? [liveTank] : []);
    allTanks.forEach((t) => {
      const matchId = (t.tankId || '').toLowerCase().includes(term);
      const matchName = (t.tankName || '').toLowerCase().includes(term);
      const matchCoach = (t.coachNumber || '').toLowerCase().includes(term);
      const matchTrain = (t.trainNumber || '').toLowerCase().includes(term);
      const matchDevice = (t.deviceUid || '').toLowerCase().includes(term) || (t.deviceId || '').toLowerCase().includes(term);

      if (matchId || matchName || matchCoach || matchTrain || matchDevice) {
        const levelStr = t.levelPercent != null ? `${t.levelPercent}%` : '—';
        const volStr = t.volumeLiters != null ? `${t.volumeLiters} L` : '—';
        matches.push({
          id: `tank-${t.tankId}`,
          type: 'TANK',
          name: t.tankName || `Tank ${t.tankId.slice(0, 8)}`,
          identifier: t.tankId.length > 16 ? `${t.tankId.slice(0, 8)}...` : t.tankId,
          subtitle: `Coach ${t.coachNumber || '—'} • Train ${t.trainNumber || '—'} • Level: ${levelStr} (${volStr}) • Cap: ${t.capacityLiters || 20}L`,
          status: t.isOnline ? (t.alarmStatus || 'NORMAL') : 'OFFLINE',
          isOnline: t.isOnline,
          onClick: () => {
            setSelectedTankId(t.tankId);
            setActiveScreen('watertank');
            setIsOpen(false);
          },
        });
      }
    });

    // 4. Search Devices (from devices array)
    (devices || []).forEach((d) => {
      const matchId = (d.id || '').toLowerCase().includes(term);
      const matchUid = (d.uid || '').toLowerCase().includes(term);
      const matchName = (d.name || '').toLowerCase().includes(term);
      const matchTrain = (d.trainNumber || '').toLowerCase().includes(term);
      const matchCoach = (d.coachNumber || '').toLowerCase().includes(term);
      const matchHw = (d.hardwareVersion || '').toLowerCase().includes(term);
      const matchFw = (d.firmwareVersion || '').toLowerCase().includes(term);

      if (matchId || matchUid || matchName || matchTrain || matchCoach || matchHw || matchFw) {
        matches.push({
          id: `device-${d.id || d.uid}`,
          type: 'DEVICE',
          name: d.name || `Device ${d.uid.slice(0, 8)}`,
          identifier: d.uid.length > 16 ? `${d.uid.slice(0, 10)}...` : d.uid,
          subtitle: `${d.coachNumber ? 'Coach ' + d.coachNumber + ' • ' : ''}${d.trainNumber ? 'Train ' + d.trainNumber + ' • ' : ''}Firmware: ${d.firmwareVersion || '2.0.0'}`,
          status: d.isOnline ? 'ONLINE' : 'OFFLINE',
          isOnline: d.isOnline,
          onClick: () => {
            setSelectedDeviceId(d.id || d.uid);
            setActiveScreen('devices');
            setIsOpen(false);
          },
        });
      }
    });

    // 5. Search Stations (from DEFAULT_CORRIDOR_STATIONS)
    DEFAULT_CORRIDOR_STATIONS.forEach((st) => {
      const matchName = st.name.toLowerCase().includes(term);
      const matchCode = st.code.toLowerCase().includes(term);
      const matchRoute = 'eastern railway corridor howrah asansol'.includes(term);

      if (matchName || matchCode || matchRoute) {
        matches.push({
          id: `station-${st.code}`,
          type: 'STATION',
          name: `${st.name} (${st.code})`,
          identifier: `Station: ${st.code}`,
          subtitle: `Route: Eastern Railway Corridor • ${st.water_refill_available ? 'Water Refill Hub (' + st.water_capacity_liters.toLocaleString() + ' L)' : 'No Water Facility'}`,
          status: st.water_refill_available ? 'REFILL READY' : 'NO FACILITY',
          isOnline: st.operational_status === 'Operational',
          onClick: () => {
            setSelectedStationCode(st.code);
            setActiveScreen('location');
            setIsOpen(false);
          },
        });
      }
    });

    // 6. Search Locations (Corridors & Yards)
    const configuredLocations = [
      { name: 'Eastern Railway Main Line (HWH - ASN)', code: 'HWH-ASN', desc: 'Active 200 km monitoring corridor between Howrah & Asansol' },
      { name: 'Howrah Coaching Yard & Depot', code: 'HWH-DEPOT', desc: 'Eastern Railway carriage and wagon water filling depot' },
      { name: 'Asansol Electric Locomotive Shed', code: 'ASN-SHED', desc: 'Water refill facility & terminal maintenance hub' },
    ];
    configuredLocations.forEach((loc) => {
      if (loc.name.toLowerCase().includes(term) || loc.code.toLowerCase().includes(term) || loc.desc.toLowerCase().includes(term)) {
        matches.push({
          id: `loc-${loc.code}`,
          type: 'LOCATION',
          name: loc.name,
          identifier: loc.code,
          subtitle: loc.desc,
          status: 'CONFIGURED',
          isOnline: true,
          onClick: () => {
            setActiveScreen('location');
            setIsOpen(false);
          },
        });
      }
    });

    setResults(matches);
    setIsSearching(false);
    setIsOpen(true);
    setSelectedIndex(-1);
  };

  const handleClear = () => {
    setSearchQuery('');
    setResults([]);
    setHasSearched(false);
    setIsOpen(false);
    setSelectedIndex(-1);
    inputRef.current?.focus();
  };

  const handleSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    executeSearch();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
    } else if (e.key === 'ArrowDown') {
      if (!isOpen && results.length > 0) {
        setIsOpen(true);
        setSelectedIndex(0);
      } else if (results.length > 0) {
        e.preventDefault();
        setSelectedIndex((prev) => (prev === -1 || prev >= results.length - 1 ? 0 : prev + 1));
      }
    } else if (e.key === 'ArrowUp') {
      if (results.length > 0) {
        e.preventDefault();
        setSelectedIndex((prev) => (prev <= 0 ? results.length - 1 : prev - 1));
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (isOpen && results.length > 0 && selectedIndex >= 0 && selectedIndex < results.length) {
        results[selectedIndex].onClick();
      } else {
        executeSearch();
      }
    }
  };

  const getEntityStyle = (type: SearchResultItem['type']) => {
    switch (type) {
      case 'TRAIN':
        return {
          icon: <Train size={15} color="#2563EB" />,
          bg: '#EFF6FF',
          border: '#BFDBFE',
          tagBg: '#DBEAFE',
          tagColor: '#1E40AF',
        };
      case 'COACH':
        return {
          icon: <Layers size={15} color="#4F46E5" />,
          bg: '#EEF2FF',
          border: '#C7D2FE',
          tagBg: '#E0E7FF',
          tagColor: '#3730A3',
        };
      case 'TANK':
        return {
          icon: <Droplet size={15} color="#0284C7" />,
          bg: '#F0F9FF',
          border: '#BAE6FD',
          tagBg: '#E0F2FE',
          tagColor: '#0369A1',
        };
      case 'DEVICE':
        return {
          icon: <Cpu size={15} color="#9333EA" />,
          bg: '#FAF5FF',
          border: '#E9D5FF',
          tagBg: '#F3E8FF',
          tagColor: '#6B21A8',
        };
      case 'STATION':
        return {
          icon: <MapPin size={15} color="#D97706" />,
          bg: '#FFFBEB',
          border: '#FDE68A',
          tagBg: '#FEF3C7',
          tagColor: '#92400E',
        };
      case 'LOCATION':
        return {
          icon: <Compass size={15} color="#059669" />,
          bg: '#ECFDF5',
          border: '#A7F3D0',
          tagBg: '#D1FAE5',
          tagColor: '#065F46',
        };
    }
  };

  return (
    <header
      style={{
        height: '72px',
        backgroundColor: '#FFFFFF',
        borderBottom: '1px solid #E2E8F0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingLeft: '20px',
        paddingRight: '20px',
        boxSizing: 'border-box',
        userSelect: 'none',
        zIndex: 100,
        flexShrink: 0,
      }}
    >
      {/* Left: Brand Emblem + Home + Screen Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
        {/* Brand Emblem */}
        <div
          onClick={() => setActiveScreen('dashboard')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            cursor: 'pointer',
          }}
          title="WLI – Water Level Indicator (Railway)"
        >
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              backgroundColor: '#EFF6FF',
              border: '1px solid #BFDBFE',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#2563EB',
            }}
          >
            <Droplet size={20} strokeWidth={2.2} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A', letterSpacing: '0.4px', lineHeight: 1.15 }}>
              WLI – RAILWAY
            </span>
            <span style={{ fontSize: '9px', fontWeight: 600, color: '#2563EB' }}>
              Water Level Indicator
            </span>
          </div>
        </div>

        {/* Home Button */}
        <button
          onClick={() => setActiveScreen('dashboard')}
          title="Return to Home Dashboard"
          style={{
            background: activeScreen === 'dashboard' ? '#EFF6FF' : '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: '6px',
            width: '34px',
            height: '34px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: activeScreen === 'dashboard' ? '#2563EB' : '#64748B',
            transition: 'all 0.15s ease',
          }}
        >
          <Home size={16} />
        </button>

        {/* Vertical Divider */}
        <div style={{ width: '1px', height: '32px', backgroundColor: '#E2E8F0' }} />

        {/* Screen Title & Subtitle */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1
              style={{
                margin: 0,
                fontSize: '17px',
                fontWeight: 700,
                color: '#0F172A',
                fontFamily: typography.fontFamily,
                lineHeight: '22px',
                letterSpacing: '-0.2px',
              }}
            >
              {currentInfo.title}
            </h1>
            <span
              style={{
                fontSize: '10px',
                fontWeight: 600,
                color: '#2563EB',
                backgroundColor: '#EFF6FF',
                padding: '2px 7px',
                borderRadius: '4px',
                letterSpacing: '0.4px',
              }}
            >
              SCADA HMI
            </span>
          </div>
          <span
            style={{
              fontSize: '11px',
              color: '#64748B',
              fontFamily: typography.fontFamily,
              marginTop: '1px',
              lineHeight: '15px',
            }}
          >
            {currentInfo.subtitle}
          </span>
        </div>
      </div>

      {/* Center: Global Search Bar */}
      <div
        ref={searchContainerRef}
        style={{
          display: 'flex',
          alignItems: 'center',
          flex: 1,
          maxWidth: '420px',
          minWidth: '120px',
          marginLeft: '12px',
          marginRight: '12px',
          position: 'relative',
        }}
      >
        <form
          onSubmit={handleSearchSubmit}
          style={{
            display: 'flex',
            alignItems: 'center',
            width: '100%',
            position: 'relative',
          }}
        >
          {/* Left search icon inside input */}
          <span
            style={{
              position: 'absolute',
              left: '11px',
              color: '#94A3B8',
              display: 'flex',
              alignItems: 'center',
              pointerEvents: 'none',
              zIndex: 2,
            }}
          >
            <Search size={14} />
          </span>

          <input
            ref={inputRef}
            type="text"
            id="global-search-input"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSelectedIndex(-1);
              if (!e.target.value.trim()) {
                setIsOpen(false);
                setResults([]);
                setHasSearched(false);
              }
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search trains, coaches, tanks, devices..."
            style={{
              width: '100%',
              height: '36px',
              paddingLeft: '34px',
              paddingRight: searchQuery ? '32px' : '10px',
              backgroundColor: '#F8FAFC',
              border: '1px solid #CBD5E1',
              borderRadius: '6px 0 0 6px',
              borderRight: 'none',
              fontSize: '12px',
              color: '#1E293B',
              outline: 'none',
              fontFamily: typography.fontFamily,
              boxSizing: 'border-box',
              transition: 'border-color 0.15s ease',
            }}
          />

          {/* Clear button (X) inside input if text present */}
          {searchQuery && (
            <button
              type="button"
              id="global-search-clear-input-btn"
              onClick={handleClear}
              title="Clear search query"
              style={{
                position: 'absolute',
                right: '84px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: '#94A3B8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '4px',
                borderRadius: '50%',
                zIndex: 2,
              }}
            >
              <X size={13} />
            </button>
          )}

          {/* Search Button */}
          <button
            type="submit"
            id="global-search-submit-btn"
            title="Execute search"
            style={{
              height: '36px',
              padding: '0 14px',
              backgroundColor: '#2563EB',
              color: '#FFFFFF',
              border: '1px solid #2563EB',
              borderRadius: '0 6px 6px 0',
              fontSize: '12px',
              fontWeight: 600,
              fontFamily: typography.fontFamily,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              flexShrink: 0,
              transition: 'background-color 0.15s ease',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#1D4ED8';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#2563EB';
            }}
          >
            {isSearching ? <Loader2 size={13} className="spin" /> : <Search size={13} />}
            <span>Search</span>
          </button>
        </form>

        {/* Results / Feedback Dropdown Panel */}
        {isOpen && (
          <div
            id="global-search-results-panel"
            style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              left: 0,
              right: 0,
              minWidth: '460px',
              backgroundColor: '#FFFFFF',
              border: '1px solid #CBD5E1',
              borderRadius: '8px',
              boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.18), 0 8px 10px -6px rgba(15, 23, 42, 0.1)',
              zIndex: 1000,
              overflow: 'hidden',
            }}
          >
            {/* Case A: No Results Found */}
            {hasSearched && results.length === 0 && (
              <div style={{ padding: '24px 20px', textAlign: 'center' }}>
                <div
                  style={{
                    width: '46px',
                    height: '46px',
                    borderRadius: '50%',
                    backgroundColor: '#FEF2F2',
                    border: '1px solid #FECACA',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#DC2626',
                    marginBottom: '12px',
                  }}
                >
                  <AlertCircle size={24} />
                </div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>
                  No results found
                </div>
                <div
                  style={{
                    fontSize: '12px',
                    color: '#64748B',
                    maxWidth: '380px',
                    margin: '0 auto 16px auto',
                    lineHeight: '18px',
                  }}
                >
                  No train, coach, tank, device, or location matches <strong style={{ color: '#0F172A' }}>"{lastSearchedTerm}"</strong>.
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                  <button
                    type="button"
                    id="search-clear-btn"
                    onClick={handleClear}
                    style={{
                      padding: '7px 14px',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#475569',
                      backgroundColor: '#F1F5F9',
                      border: '1px solid #CBD5E1',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    Clear Search
                  </button>
                  <button
                    type="button"
                    id="search-return-dashboard-btn"
                    onClick={() => {
                      handleClear();
                      setActiveScreen('dashboard');
                    }}
                    style={{
                      padding: '7px 14px',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#FFFFFF',
                      backgroundColor: '#2563EB',
                      border: '1px solid #1D4ED8',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    Return to Dashboard
                  </button>
                </div>
              </div>
            )}

            {/* Case B: Matching Results Found */}
            {hasSearched && results.length > 0 && (
              <div>
                {/* Panel Header */}
                <div
                  style={{
                    padding: '10px 14px',
                    backgroundColor: '#F8FAFC',
                    borderBottom: '1px solid #E2E8F0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A' }}>
                      Search results for "{lastSearchedTerm}"
                    </span>
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        backgroundColor: '#EFF6FF',
                        color: '#2563EB',
                        border: '1px solid #BFDBFE',
                        padding: '1px 7px',
                        borderRadius: '12px',
                      }}
                    >
                      {results.length} found
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      color: '#94A3B8',
                      display: 'flex',
                      alignItems: 'center',
                      padding: '2px',
                    }}
                    title="Dismiss"
                  >
                    <X size={14} />
                  </button>
                </div>

                {/* Results List */}
                <div style={{ maxHeight: '340px', overflowY: 'auto' }}>
                  {results.map((item, idx) => {
                    const style = getEntityStyle(item.type);
                    const isSelected = selectedIndex === idx;

                    return (
                      <div
                        key={item.id}
                        id={`search-result-item-${idx}`}
                        onClick={item.onClick}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        style={{
                          padding: '10px 14px',
                          borderBottom: idx < results.length - 1 ? '1px solid #F1F5F9' : 'none',
                          backgroundColor: isSelected ? '#EFF6FF' : '#FFFFFF',
                          borderLeft: isSelected ? '3px solid #2563EB' : '3px solid transparent',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          cursor: 'pointer',
                          transition: 'background-color 0.1s ease',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                          {/* Entity Icon */}
                          <div
                            style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '6px',
                              backgroundColor: style.bg,
                              border: `1px solid ${style.border}`,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            {style.icon}
                          </div>

                          {/* Details */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                              <span
                                style={{
                                  fontSize: '13px',
                                  fontWeight: 700,
                                  color: '#0F172A',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}
                              >
                                {item.name}
                              </span>
                              <span
                                style={{
                                  fontSize: '9px',
                                  fontWeight: 700,
                                  backgroundColor: style.tagBg,
                                  color: style.tagColor,
                                  padding: '1px 6px',
                                  borderRadius: '3px',
                                  letterSpacing: '0.3px',
                                  flexShrink: 0,
                                }}
                              >
                                {item.type}
                              </span>
                            </div>
                            <div
                              style={{
                                fontSize: '11px',
                                color: '#64748B',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {item.subtitle}
                            </div>
                          </div>
                        </div>

                        {/* Status badge + arrow */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '12px', flexShrink: 0 }}>
                          {item.status && (
                            <span
                              style={{
                                fontSize: '10px',
                                fontWeight: 700,
                                padding: '2px 8px',
                                borderRadius: '12px',
                                backgroundColor:
                                  item.status === 'ONLINE' || item.status === 'REFILL READY' || item.status === 'OPERATIONAL'
                                    ? '#DCFCE7'
                                    : item.status === 'OFFLINE' || item.status === 'NO FACILITY'
                                    ? '#FEE2E2'
                                    : '#FEF3C7',
                                color:
                                  item.status === 'ONLINE' || item.status === 'REFILL READY' || item.status === 'OPERATIONAL'
                                    ? '#15803D'
                                    : item.status === 'OFFLINE' || item.status === 'NO FACILITY'
                                    ? '#B91C1C'
                                    : '#B45309',
                                border: `1px solid ${
                                  item.status === 'ONLINE' || item.status === 'REFILL READY' || item.status === 'OPERATIONAL'
                                    ? '#BBF7D0'
                                    : item.status === 'OFFLINE' || item.status === 'NO FACILITY'
                                    ? '#FECACA'
                                    : '#FDE68A'
                                }`,
                              }}
                            >
                              {item.status}
                            </span>
                          )}
                          <ArrowRight size={14} color={isSelected ? '#2563EB' : '#94A3B8'} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Panel Footer */}
                <div
                  style={{
                    padding: '6px 14px',
                    backgroundColor: '#F8FAFC',
                    borderTop: '1px solid #E2E8F0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '10px',
                    color: '#94A3B8',
                  }}
                >
                  <span>Press ↑ / ↓ to navigate • Enter to select • Esc to dismiss</span>
                  <span>{results.length} records</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right Controls: Role Badge, Status Pill, Settings, Logout, Live Clock */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        {/* Interactive User Profile Badge & Dropdown */}
        {currentUser && (
          <div ref={profileContainerRef} style={{ position: 'relative' }}>
            <div
              onClick={() => setIsProfileOpen((prev) => !prev)}
              style={{
                backgroundColor: isAdmin ? 'var(--color-primary-surface, #EFF6FF)' : 'var(--color-surface-alt, #F1F5F9)',
                border: `1px solid ${isAdmin ? 'var(--color-primary-border, #BFDBFE)' : 'var(--color-border-strong, #CBD5E1)'}`,
                borderRadius: '6px',
                padding: '4px 9px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              title="Click to view profile & display preferences"
            >
              <UserIcon size={12} color={isAdmin ? 'var(--color-primary, #2563EB)' : 'var(--color-text-muted, #64748B)'} />
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  color: isAdmin ? 'var(--color-primary, #2563EB)' : 'var(--color-text-secondary, #475569)',
                  letterSpacing: '0.4px',
                }}
              >
                [{currentUser.role}]
              </span>
              <span style={{ fontSize: '11px', color: 'var(--color-text-primary, #1E293B)', fontWeight: 500 }}>
                {currentUser.username}
              </span>
              <ChevronDown size={11} color="var(--color-text-muted, #64748B)" />
            </div>

            {/* Profile & Display Settings Dropdown Menu */}
            {isProfileOpen && (
              <div
                className="dialog-content"
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  right: 0,
                  width: '260px',
                  backgroundColor: 'var(--color-surface, #FFFFFF)',
                  border: '1px solid var(--color-border, #E2E8F0)',
                  borderRadius: '8px',
                  boxShadow: 'var(--shadow-modal, 0 10px 25px rgba(0,0,0,0.15))',
                  padding: '12px',
                  zIndex: 1000,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                {/* User Identity Info */}
                <div style={{ borderBottom: '1px solid var(--color-divider, #E2E8F0)', paddingBottom: '10px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary, #0F172A)' }}>
                    {currentUser.full_name || currentUser.username}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-muted, #64748B)' }}>
                    {currentUser.designation || (isAdmin ? 'System Administrator' : 'Station Operator')}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--color-primary, #2563EB)', marginTop: '2px', fontWeight: 600 }}>
                    {currentUser.department || 'Eastern Railway (Howrah Division)'}
                  </div>
                </div>

                {/* Quick Theme Switcher */}
                <div>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-text-muted, #64748B)', marginBottom: '6px' }}>
                    THEME MODE
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
                    <button
                      onClick={() => setTheme('light')}
                      style={{
                        padding: '5px',
                        borderRadius: '4px',
                        border: `1px solid ${theme === 'light' ? 'var(--color-primary)' : 'var(--color-border)'}`,
                        backgroundColor: theme === 'light' ? 'var(--color-primary-surface)' : 'var(--color-surface-alt)',
                        color: theme === 'light' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                        fontSize: '10px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                      }}
                    >
                      <Sun size={12} />
                      <span>Light</span>
                    </button>

                    <button
                      onClick={() => setTheme('dark')}
                      style={{
                        padding: '5px',
                        borderRadius: '4px',
                        border: `1px solid ${theme === 'dark' ? 'var(--color-primary)' : 'var(--color-border)'}`,
                        backgroundColor: theme === 'dark' ? 'var(--color-primary-surface)' : 'var(--color-surface-alt)',
                        color: theme === 'dark' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                        fontSize: '10px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                      }}
                    >
                      <Moon size={12} />
                      <span>Dark</span>
                    </button>

                    <button
                      onClick={() => setTheme('system')}
                      style={{
                        padding: '5px',
                        borderRadius: '4px',
                        border: `1px solid ${theme === 'system' ? 'var(--color-primary)' : 'var(--color-border)'}`,
                        backgroundColor: theme === 'system' ? 'var(--color-primary-surface)' : 'var(--color-surface-alt)',
                        color: theme === 'system' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                        fontSize: '10px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                      }}
                    >
                      <Monitor size={12} />
                      <span>Auto</span>
                    </button>
                  </div>
                </div>

                {/* Open Display Settings Button */}
                <button
                  onClick={() => {
                    setActiveScreen('settings');
                    setIsProfileOpen(false);
                  }}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '6px',
                    backgroundColor: 'var(--color-surface-alt, #F8FAFC)',
                    border: '1px solid var(--color-border, #CBD5E1)',
                    color: 'var(--color-text-primary, #0F172A)',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    textAlign: 'left',
                  }}
                >
                  <Sliders size={13} color="var(--color-primary, #2563EB)" />
                  <span>{isAdmin ? 'System & Display Settings' : 'Display Preferences'}</span>
                </button>

                {/* Sign Out Button in Dropdown */}
                <button
                  onClick={() => {
                    setIsProfileOpen(false);
                    logout();
                  }}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                    color: '#EF4444',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    textAlign: 'left',
                  }}
                >
                  <LogOut size={13} />
                  <span>Sign Out Session</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Online Status Pill */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: isConnected ? 'var(--color-success-surface, #ECFDF5)' : isReconnecting ? 'var(--color-warning-surface, #FEF3C7)' : 'var(--color-critical-surface, #FEE2E2)',
            border: `1px solid ${isConnected ? 'var(--color-success-border, #DCFCE7)' : isReconnecting ? 'var(--color-warning-border, #FDE68A)' : 'var(--color-critical-border, #FCA5A5)'}`,
            borderRadius: '16px',
            padding: '3px 10px',
          }}
          title={`SCADA Link: ${connectionStatus}\nMQTT Broker: ${mqttBrokerStatus}\nTelemetry Stream: ${liveTank?.hasTelemetry !== false && liveTank?.levelPercent != null ? 'Active' : 'Awaiting Telemetry'}`}
        >
          <div
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              backgroundColor: isConnected ? 'var(--color-success, #16A34A)' : isReconnecting ? 'var(--color-warning, #D97706)' : 'var(--color-critical, #DC2626)',
            }}
          />
          <span
            style={{
              fontSize: '10px',
              fontWeight: 700,
              color: isConnected ? 'var(--color-success, #16A34A)' : isReconnecting ? 'var(--color-warning, #D97706)' : 'var(--color-critical, #DC2626)',
              letterSpacing: '0.4px',
            }}
          >
            {isConnected ? 'ONLINE' : isReconnecting ? 'RECONNECT' : 'OFFLINE'}
          </span>
        </div>

        {/* Quick Theme Toggle Icon Button */}
        <button
          onClick={() => {
            const nextTheme: ThemeMode = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
            setTheme(nextTheme);
          }}
          title={`Theme: ${theme.toUpperCase()} (Click to toggle Light / Dark / Auto)`}
          style={{
            backgroundColor: 'var(--color-surface-alt, #F8FAFC)',
            border: '1px solid var(--color-border, #E2E8F0)',
            borderRadius: '6px',
            width: '32px',
            height: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: isDark ? '#38BDF8' : '#D97706',
            transition: 'all 0.15s ease',
          }}
        >
          {theme === 'system' ? <Monitor size={15} /> : isDark ? <Moon size={15} /> : <Sun size={15} />}
        </button>

        {/* Settings Shortcut Button (Accessible to ALL authenticated roles) */}
        <button
          onClick={() => setActiveScreen('settings')}
          title={isAdmin ? 'Open System & Display Settings' : 'Open Display Settings'}
          style={{
            backgroundColor: activeScreen === 'settings' ? 'var(--color-primary-surface, #EFF6FF)' : 'var(--color-surface-alt, #F8FAFC)',
            border: `1px solid ${activeScreen === 'settings' ? 'var(--color-primary-border, #BFDBFE)' : 'var(--color-border, #E2E8F0)'}`,
            borderRadius: '6px',
            width: '32px',
            height: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: activeScreen === 'settings' ? 'var(--color-primary, #2563EB)' : 'var(--color-text-muted, #64748B)',
            transition: 'all 0.15s ease',
          }}
        >
          <SettingsIcon size={16} />
        </button>

        {/* Logout Button */}
        <button
          id="header-signout-btn"
          onClick={logout}
          title="Sign out of console"
          style={{
            backgroundColor: '#F8FAFC',
            border: '1px solid #CBD5E1',
            borderRadius: '6px',
            padding: '5px 10px',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: 600,
            color: '#475569',
            fontFamily: typography.fontFamily,
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            transition: 'all 0.15s ease',
          }}
        >
          <LogOut size={13} />
          <span>Sign Out</span>
        </button>

        <div style={{ width: '1px', height: '24px', backgroundColor: '#E2E8F0', margin: '0 2px' }} />

        {/* Live Clock & Date */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: '95px' }}>
          <span
            style={{
              color: '#0F172A',
              fontFamily: typography.fontFamily,
              fontSize: '13px',
              fontWeight: 700,
              lineHeight: '16px',
              letterSpacing: '0.3px',
            }}
          >
            {currentTime || '--:--:--'}
          </span>
          <span
            style={{
              color: '#64748B',
              fontFamily: typography.fontFamily,
              fontSize: '10px',
              fontWeight: 400,
              lineHeight: '13px',
            }}
          >
            {currentDate || 'October 2026'}
          </span>
        </div>
      </div>
    </header>
  );
};
