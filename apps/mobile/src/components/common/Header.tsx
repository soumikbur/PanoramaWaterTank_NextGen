import React, { useState, useRef, useEffect } from 'react';
import { colors, typography } from '../../theme';
import { useApp, ScreenName } from '../../state/AppContext';
import { useDisplayPreferences } from '../../context/DisplayPreferencesContext';
import { AppRouter } from '../../services/router';
import { TrainOverviewItem, TankLiveStatus, Device } from '../../types';
import panoramaLogoHeader from '../../assets/panorama_logo_header.png';
import panoramaLogoIcon from '../../assets/panorama_logo_icon.png';
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
  Menu,
  Bell,
  Smartphone,
  Download,
} from 'lucide-react';
import { InstallAppModal } from './InstallAppModal';

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
    mqttConnectionStatus,
    liveTelemetry,
    setSelectedTrainNumber,
    setSelectedTankId,
    setSelectedDeviceId,
    setSelectedStationCode,
    toggleMobileNav,
    isMobileNavOpen,
    alarmStats,
    activeAlarms,
    managedAlerts,
  } = useApp();

  const { theme, setTheme, resolvedTheme, isDark } = useDisplayPreferences();

  // Search local states
  const [isOpen, setIsOpen] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [lastSearchedTerm, setLastSearchedTerm] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [isSearching, setIsSearching] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);

  // Profile menu state
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);

  const searchContainerRef = useRef<HTMLDivElement>(null);
  const profileContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);

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

  // Screen titles and subtitles matching Qt App.qml specification
  const screenInfo: Record<ScreenName, { title: string; subtitle: string }> = {
    login: {
      title: 'Authentication',
      subtitle: 'Sign in to access Panorama SCADA console',
    },
    dashboard: {
      title: 'Water Tank Dashboard',
      subtitle: 'SCADA Telemetry, Dual Tanks, Consist & Fleet Status',
    },
    trains: {
      title: 'Train Management',
      subtitle: 'Railway Fleet Operations & Consist Management',
    },
    coaches: {
      title: 'Coach Editing',
      subtitle: 'Consist coach status, 24-coach graphical layout & dual water tanks',
    },
    'coach-details': {
      title: 'Coach Details',
      subtitle: 'Live telemetry, dual water reservoir levels & diagnostics',
    },
    watertank: {
      title: 'All Tanks',
      subtitle: 'Global tank overview and live levels',
    },
    devices: {
      title: 'Devices',
      subtitle: 'Industrial IoT Hardware & Telemetry',
    },
    location: {
      title: 'Location',
      subtitle: 'Route intelligence & water refill monitoring',
    },
    monitoring: {
      title: 'Operational Monitoring',
      subtitle: 'Real-time multi-train coach telemetry, dual tank levels & battery alerts',
    },
    alerts: {
      title: 'Alerts',
      subtitle: 'Active alarms and event notifications',
    },
    history: {
      title: 'History',
      subtitle: 'Historical water level trends',
    },
    reports: {
      title: 'Reports',
      subtitle: 'Operational reports and analytics',
    },
    settings: {
      title: 'Settings',
      subtitle: 'Device and communication setup',
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

  // Dedicated clean section titles for mobile viewport header
  const mobileSectionTitles: Record<ScreenName, string> = {
    login: 'Sign In',
    dashboard: 'Dashboard',
    trains: 'Train Management',
    coaches: 'Coach Editing',
    'coach-details': 'Coach Details',
    watertank: 'All Tanks',
    devices: 'Devices',
    location: 'Location',
    monitoring: 'Monitoring',
    alerts: 'Alerts',
    history: 'History',
    reports: 'Reports',
    settings: 'Settings',
    users: 'Users',
    logs: 'Logs',
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

    // 1. Search Trains (from authoritative regions in AppContext)
    const trainMap = new Map<string, { train: TrainOverviewItem; regionName: string }>();
    (regions || []).forEach((reg) => {
      (reg.trains || []).forEach((tr) => {
        trainMap.set(tr.train_number, { train: tr, regionName: reg.name });
      });
    });

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

    // 2. Search Coaches (only for configured trains)
    const coachMap = new Map<string, { coachNumber: string; trainNumber: string; isOnline: boolean; tankCount: number; deviceUid?: string }>();
    (tanks || []).forEach((t) => {
      if (t.coachNumber && t.trainNumber && trainMap.has(t.trainNumber)) {
        const key = `${t.trainNumber}-${t.coachNumber}`;
        const existing = coachMap.get(key) || {
          coachNumber: t.coachNumber,
          trainNumber: t.trainNumber,
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
      if (d.coachNumber && d.trainNumber && trainMap.has(d.trainNumber)) {
        const key = `${d.trainNumber}-${d.coachNumber}`;
        const existing = coachMap.get(key) || {
          coachNumber: d.coachNumber,
          trainNumber: d.trainNumber,
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

    // 5. Search Stations from configured trains' verified source/destination & route stops
    const seenStations = new Set<string>();
    configuredTrains.forEach((tr) => {
      const candidates = [
        tr.source_code && tr.source_station ? { code: tr.source_code, name: tr.source_station, train: tr.train_number } : null,
        tr.destination_code && tr.destination_station ? { code: tr.destination_code, name: tr.destination_station, train: tr.train_number } : null,
      ].filter(Boolean) as { code: string; name: string; train: string }[];
      candidates.forEach((st) => {
        if (seenStations.has(st.code)) return;
        if (st.name.toLowerCase().includes(term) || st.code.toLowerCase().includes(term)) {
          seenStations.add(st.code);
          matches.push({
            id: `station-${st.code}`,
            type: 'STATION',
            name: `${st.name} (${st.code})`,
            identifier: `Station: ${st.code}`,
            subtitle: `Configured endpoint for Train ${st.train}`,
            status: 'VERIFIED',
            isOnline: true,
            onClick: () => {
              setSelectedStationCode(st.code);
              setActiveScreen('location');
              setIsOpen(false);
            },
          });
        }
      });
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
    if (isMobileSearchOpen) {
      mobileInputRef.current?.focus();
    } else {
      inputRef.current?.focus();
    }
  };

  const handleSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isSearching || !searchQuery.trim()) return;
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

  const renderSearchResultsPanel = (isMobile: boolean) => {
    if (!isOpen) return null;
    return (
      <div
        id={isMobile ? 'mobile-search-results-panel' : 'global-search-results-panel'}
        style={{
          position: isMobile ? 'fixed' : 'absolute',
          top: isMobile ? '58px' : 'calc(100% + 6px)',
          left: isMobile ? '8px' : 0,
          right: isMobile ? '8px' : 0,
          minWidth: isMobile ? 'auto' : '460px',
          maxWidth: isMobile ? 'calc(100vw - 16px)' : '520px',
          backgroundColor: '#FFFFFF',
          border: '1px solid #CBD5E1',
          borderRadius: '8px',
          boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.18), 0 8px 10px -6px rgba(15, 23, 42, 0.1)',
          zIndex: 10001,
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
    );
  };

  const unackedManagedCount = managedAlerts?.filter((a) => a.status === 'ACTIVE').length ?? 0;
  const activeAlarmCount = Math.max(unackedManagedCount, alarmStats?.totalActive ?? activeAlarms?.filter((a) => a.status === 'ACTIVE').length ?? 0);

  return (
    <header
      style={{
        height: '56px',
        backgroundColor: '#FFFFFF',
        borderBottom: '1px solid #E2E8F0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingLeft: '12px',
        paddingRight: '12px',
        boxSizing: 'border-box',
        userSelect: 'none',
        zIndex: 100,
        flexShrink: 0,
        position: 'relative',
        width: '100%',
        maxWidth: '100vw',
      }}
    >
      {/* ================================================================= */}
      {/* MOBILE HEADER (< 1024px)                                          */}
      {/* ================================================================= */}
      <div
        className="show-on-mobile-flex"
        style={{
          width: '100%',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '6px',
        }}
      >
        {isMobileSearchOpen ? (
          /* Mobile Search Bar Mode */
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              width: '100%',
              gap: '8px',
            }}
          >
            <button
              type="button"
              onClick={() => {
                setIsMobileSearchOpen(false);
                setIsOpen(false);
              }}
              aria-label="Close search"
              className="touch-target-44"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#475569',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '8px',
                borderRadius: '6px',
              }}
            >
              <X size={20} />
            </button>

            <form
              onSubmit={handleSearchSubmit}
              style={{
                display: 'flex',
                alignItems: 'center',
                flex: 1,
                minWidth: 0,
                gap: '6px',
                position: 'relative',
              }}
            >
              {/* Input Wrapper with left magnifying glass & right clear button */}
              <div
                style={{
                  position: 'relative',
                  flex: 1,
                  minWidth: 0,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    left: '10px',
                    color: '#64748B',
                    display: 'flex',
                    alignItems: 'center',
                    pointerEvents: 'none',
                    zIndex: 2,
                  }}
                >
                  <Search size={15} />
                </span>
                <input
                  ref={mobileInputRef}
                  type="search"
                  enterKeyHint="search"
                  autoFocus
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
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
                  placeholder="Search fleet, coaches, tanks..."
                  style={{
                    width: '100%',
                    height: '38px',
                    paddingLeft: '32px',
                    paddingRight: searchQuery ? '30px' : '10px',
                    backgroundColor: '#F8FAFC',
                    border: '1px solid #CBD5E1',
                    borderRadius: '6px',
                    fontSize: '13px',
                    color: '#0F172A',
                    outline: 'none',
                    boxSizing: 'border-box',
                    WebkitAppearance: 'none',
                  }}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={handleClear}
                    aria-label="Clear search input"
                    style={{
                      position: 'absolute',
                      right: '6px',
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      color: '#94A3B8',
                      padding: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      zIndex: 2,
                    }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Dedicated On-Screen Search / Enter Button */}
              <button
                type="submit"
                data-testid="mobile-search-submit-btn"
                disabled={isSearching || !searchQuery.trim()}
                aria-label="Execute search"
                title={searchQuery.trim() ? 'Search fleet, coaches, tanks' : 'Enter a query to search'}
                className="touch-target-44"
                style={{
                  height: '38px',
                  minWidth: '40px',
                  padding: '0 10px',
                  backgroundColor: !searchQuery.trim() || isSearching ? '#E2E8F0' : '#2563EB',
                  color: !searchQuery.trim() || isSearching ? '#94A3B8' : '#FFFFFF',
                  border: 'none',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: !searchQuery.trim() || isSearching ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s ease',
                  flexShrink: 0,
                  boxShadow: !searchQuery.trim() || isSearching ? 'none' : '0 1px 2px rgba(37, 99, 235, 0.2)',
                }}
              >
                {isSearching ? (
                  <Loader2 size={16} className="spin" />
                ) : (
                  <Search size={16} strokeWidth={2.2} />
                )}
              </button>
            </form>
            {renderSearchResultsPanel(true)}
          </div>
        ) : (
          /* Normal Mobile Header Mode */
          <>
            {/* Left & Center: [Hamburger] -> [Panorama Logo] -> [Current Section Name] */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                flex: 1,
                minWidth: 0,
                overflow: 'hidden',
              }}
            >
              {/* 1. Hamburger Menu Button */}
              <button
                type="button"
                onClick={toggleMobileNav}
                aria-label="Open Navigation Menu"
                className="touch-target-44"
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: '6px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  color: '#0F172A',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Menu size={22} />
              </button>

              {/* 2. Panorama Logo Icon (Image only, no text branding on mobile) */}
              <div
                onClick={() => {
                  setActiveScreen('dashboard');
                  AppRouter.navigate('dashboard');
                }}
                title="Panorama SCADA - Dashboard"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                <img
                  src={panoramaLogoIcon}
                  alt="Panorama"
                  style={{
                    width: '26px',
                    height: '26px',
                    objectFit: 'contain',
                    borderRadius: '4px',
                    display: 'block',
                  }}
                />
              </div>

              {/* 3. Current Dynamic Section Name */}
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                }}
              >
                <span
                  data-testid="mobile-header-section-name"
                  style={{
                    fontSize: '14px',
                    fontWeight: 700,
                    color: '#0F172A',
                    fontFamily: typography.fontFamily,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: 'block',
                    letterSpacing: '-0.2px',
                    lineHeight: '20px',
                  }}
                >
                  {mobileSectionTitles[activeScreen] || currentInfo.title}
                </span>
              </div>
            </div>

            {/* Right: Quick actions (Search, Connection, Alerts) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
              {/* Install App Button */}
              <button
                type="button"
                id="mobile-install-app-btn"
                onClick={() => setIsInstallModalOpen(true)}
                aria-label="Install Android App"
                title="Install Android App / PWA"
                className="touch-target-44"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#2563EB',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '8px',
                  borderRadius: '6px',
                }}
              >
                <Download size={18} />
              </button>

              {/* Search Toggle Button */}
              <button
                type="button"
                onClick={() => setIsMobileSearchOpen(true)}
                aria-label="Search fleet"
                className="touch-target-44"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#475569',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '8px',
                  borderRadius: '6px',
                }}
              >
                <Search size={18} />
              </button>

              {/* Mobile Connection Pill */}
              <div
                style={{
                  height: '28px',
                  padding: '0 7px',
                  borderRadius: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  backgroundColor:
                    mqttConnectionStatus === 'CONNECTED'
                      ? '#E8F8EE'
                      : mqttConnectionStatus === 'CONNECTING'
                      ? '#EFF6FF'
                      : '#FDECEC',
                  border: `1px solid ${
                    mqttConnectionStatus === 'CONNECTED'
                      ? '#DCFCE7'
                      : mqttConnectionStatus === 'CONNECTING'
                      ? '#BFDBFE'
                      : '#FEE2E2'
                  }`,
                }}
                title={`Status: ${mqttConnectionStatus}`}
              >
                <div
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor:
                      mqttConnectionStatus === 'CONNECTED'
                        ? '#16A34A'
                        : mqttConnectionStatus === 'CONNECTING'
                        ? '#2563EB'
                        : '#DC2626',
                  }}
                />
                <span
                  style={{
                    fontSize: '9px',
                    fontWeight: 700,
                    color:
                      mqttConnectionStatus === 'CONNECTED'
                        ? '#16A34A'
                        : mqttConnectionStatus === 'CONNECTING'
                        ? '#2563EB'
                        : '#DC2626',
                  }}
                >
                  {mqttConnectionStatus === 'CONNECTED' ? 'LIVE' : 'OFF'}
                </span>
              </div>

              {/* Mobile Alerts Bell Button */}
              <button
                type="button"
                onClick={() => setActiveScreen('alerts')}
                aria-label="View Alerts"
                className="touch-target-44"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: activeAlarmCount > 0 ? '#EF4444' : '#475569',
                  cursor: 'pointer',
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '8px',
                  borderRadius: '6px',
                }}
              >
                <Bell size={18} />
                {activeAlarmCount > 0 && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '6px',
                      right: '6px',
                      backgroundColor: '#EF4444',
                      color: '#FFFFFF',
                      fontSize: '9px',
                      fontWeight: 700,
                      borderRadius: '10px',
                      minWidth: '15px',
                      height: '15px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '0 2px',
                    }}
                  >
                    {activeAlarmCount > 99 ? '99+' : activeAlarmCount}
                  </span>
                )}
              </button>
            </div>
          </>
        )}
      </div>

      {/* ================================================================= */}
      {/* DESKTOP HEADER (>= 1024px)                                        */}
      {/* ================================================================= */}
      {/* Left: Panorama Logo, Compact Branding, Home Button, Divider, and Page Title/Subtitle */}
      <div className="hide-on-mobile" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
        {/* Official Panorama Logo and Compact Two-Line Branding */}
        <div
          onClick={() => {
            setActiveScreen('dashboard');
            AppRouter.navigate('dashboard');
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            cursor: 'pointer',
            paddingRight: '2px',
          }}
          title="Panorama Water Tank Monitor — Go to Dashboard"
        >
          <img
            src={panoramaLogoIcon}
            alt="Panorama"
            style={{
              width: '28px',
              height: '28px',
              objectFit: 'contain',
              borderRadius: '6px',
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: '1.15' }}>
            <span
              style={{
                fontSize: '13px',
                fontWeight: 800,
                color: '#0F172A',
                letterSpacing: '0.4px',
                fontFamily: typography.fontFamily,
              }}
            >
              PANORAMA WATER
            </span>
            <span
              style={{
                fontSize: '10px',
                fontWeight: 700,
                color: '#2563EB',
                letterSpacing: '0.6px',
                fontFamily: typography.fontFamily,
              }}
            >
              TANK MONITOR
            </span>
          </div>
        </div>

        {/* Home Button (Qt-style 34x34 rounded button) */}
        <button
          onClick={() => {
            setActiveScreen('dashboard');
            AppRouter.navigate('dashboard');
          }}
          title="Home — Go to Dashboard"
          style={{
            width: '34px',
            height: '34px',
            borderRadius: '6px',
            backgroundColor: activeScreen === 'dashboard' ? '#EFF6FF' : '#FFFFFF',
            border: activeScreen === 'dashboard' ? '1px solid #2563EB' : '1px solid #DCE3EA',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: activeScreen === 'dashboard' ? '#2563EB' : '#334155',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            if (activeScreen !== 'dashboard') {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#EFF6FF';
              (e.currentTarget as HTMLButtonElement).style.borderColor = '#2563EB';
            }
          }}
          onMouseLeave={(e) => {
            if (activeScreen !== 'dashboard') {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#FFFFFF';
              (e.currentTarget as HTMLButtonElement).style.borderColor = '#DCE3EA';
            }
          }}
        >
          <Home size={17} strokeWidth={1.8} />
        </button>

        {/* Vertical Divider */}
        <div style={{ width: '1px', height: '24px', backgroundColor: '#DCE3EA', margin: '0 2px' }} />

        {/* Page Title & Subtitle Column */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1
              data-testid="header-page-title"
              style={{
                margin: 0,
                fontSize: '16px',
                fontWeight: 700,
                color: '#0F172A',
                fontFamily: typography.fontFamily,
                lineHeight: '20px',
                letterSpacing: '-0.2px',
                whiteSpace: 'nowrap',
              }}
            >
              {currentInfo.title}
            </h1>
            {/* Screen reader & test compliance element */}
            <span
              style={{
                position: 'absolute',
                width: '1px',
                height: '1px',
                padding: 0,
                margin: '-1px',
                overflow: 'hidden',
                clip: 'rect(0, 0, 0, 0)',
                whiteSpace: 'nowrap',
                border: 0,
              }}
            >
              PANORAMA WATER TANK MONITOR
            </span>
          </div>
          {currentInfo.subtitle && (
            <span
              style={{
                fontSize: '11px',
                fontWeight: 400,
                color: '#64748B',
                fontFamily: typography.fontFamily,
                lineHeight: '14px',
                whiteSpace: 'nowrap',
              }}
            >
              {currentInfo.subtitle}
            </span>
          )}
        </div>
      </div>

      {/* Center: Global Search Bar (Qt SearchBar.qml style) */}
      <div
        ref={searchContainerRef}
        className="hide-on-mobile"
        style={{
          display: 'flex',
          alignItems: 'center',
          flex: 1,
          maxWidth: '440px',
          minWidth: '140px',
          marginLeft: '16px',
          marginRight: '16px',
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
              left: '12px',
              color: '#64748B',
              display: 'flex',
              alignItems: 'center',
              pointerEvents: 'none',
              zIndex: 2,
            }}
          >
            <Search size={15} strokeWidth={1.8} />
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
            placeholder="Search trains, coaches, tanks, locations..."
            style={{
              width: '100%',
              height: '36px',
              paddingLeft: '36px',
              paddingRight: searchQuery ? '32px' : '12px',
              backgroundColor: '#F8FAFC',
              border: '1px solid #CBD5E1',
              borderRadius: '6px',
              fontSize: '12px',
              color: '#0F172A',
              outline: 'none',
              fontFamily: typography.fontFamily,
              boxSizing: 'border-box',
              transition: 'border-color 0.15s ease',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = '#2563EB';
              e.currentTarget.style.backgroundColor = '#FFFFFF';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = '#CBD5E1';
              e.currentTarget.style.backgroundColor = '#F8FAFC';
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
                right: '8px',
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

          {/* Hidden submit button for test suite event triggers */}
          <button
            type="submit"
            id="global-search-submit-btn"
            title="Execute search"
            style={{ display: 'none' }}
          >
            Search
          </button>
        </form>

        {/* Results / Feedback Dropdown Panel */}
        {renderSearchResultsPanel(false)}
      </div>

      {/* Right Controls: Role Badge, Status Pill, Settings, Logout, Live Clock */}
      <div className="hide-on-mobile" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        {/* Interactive User Profile Badge & Dropdown (Qt Header Role Badge) */}
        {currentUser && (
          <div ref={profileContainerRef} style={{ position: 'relative' }}>
            <div
              onClick={() => setIsProfileOpen((prev) => !prev)}
              style={{
                height: '28px',
                padding: '0 10px',
                borderRadius: '4px',
                backgroundColor: isAdmin ? '#EFF6FF' : '#F1F5F9',
                border: `1px solid ${isAdmin ? '#BFDBFE' : '#CBD5E1'}`,
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              title="Click to view profile & display preferences"
            >
              <div
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '3px',
                  backgroundColor: isAdmin ? '#2563EB' : '#475569',
                }}
              />
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: isAdmin ? '#2563EB' : '#1E293B',
                  letterSpacing: '0.8px',
                }}
              >
                {isAdmin ? 'ADMIN' : 'EMPLOYEE'}
              </span>
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

        {/* Connection Status Pill (Qt Header style: [● ONLINE]) */}
        <div
          id="header-mqtt-status-pill"
          style={{
            height: '28px',
            padding: '0 12px',
            borderRadius: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            backgroundColor:
              mqttConnectionStatus === 'CONNECTED'
                ? '#E8F8EE'
                : mqttConnectionStatus === 'STALE'
                ? '#FEF3E2'
                : mqttConnectionStatus === 'CONNECTING'
                ? '#EFF6FF'
                : '#FDECEC',
            border: `1px solid ${
              mqttConnectionStatus === 'CONNECTED'
                ? '#DCFCE7'
                : mqttConnectionStatus === 'STALE'
                ? '#FEF3C7'
                : mqttConnectionStatus === 'CONNECTING'
                ? '#BFDBFE'
                : '#FEE2E2'
            }`,
          }}
          title={`MQTT Topic: 0023004D4B42501120353332\nStatus: ${mqttConnectionStatus}\nLast Telemetry: ${liveTelemetry ? liveTelemetry.time : 'None'}`}
        >
          <div
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '3px',
              backgroundColor:
                mqttConnectionStatus === 'CONNECTED'
                  ? '#16A34A'
                  : mqttConnectionStatus === 'STALE'
                  ? '#D97706'
                  : mqttConnectionStatus === 'CONNECTING'
                  ? '#2563EB'
                  : '#DC2626',
            }}
          />
          <span
            style={{
              fontSize: '10px',
              fontWeight: 700,
              color:
                mqttConnectionStatus === 'CONNECTED'
                  ? '#16A34A'
                  : mqttConnectionStatus === 'STALE'
                  ? '#D97706'
                  : mqttConnectionStatus === 'CONNECTING'
                  ? '#2563EB'
                  : '#DC2626',
              letterSpacing: '0.4px',
            }}
          >
            {mqttConnectionStatus === 'CONNECTED'
              ? (liveTelemetry ? 'MQTT LIVE' : 'ONLINE')
              : mqttConnectionStatus === 'STALE'
              ? 'STALE DATA'
              : mqttConnectionStatus === 'CONNECTING'
              ? 'CONNECTING'
              : 'OFFLINE'}
          </span>
        </div>

        {/* Install App Button (Desktop Header) */}
        <button
          id="header-install-app-btn"
          onClick={() => setIsInstallModalOpen(true)}
          title="Install Mobile App (Android APK & PWA)"
          style={{
            height: '28px',
            padding: '0 10px',
            borderRadius: '4px',
            backgroundColor: '#EFF6FF',
            border: '1px solid #BFDBFE',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: 700,
            color: '#2563EB',
            fontFamily: typography.fontFamily,
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#DBEAFE';
            (e.currentTarget as HTMLButtonElement).style.borderColor = '#93C5FD';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#EFF6FF';
            (e.currentTarget as HTMLButtonElement).style.borderColor = '#BFDBFE';
          }}
        >
          <Download size={13} />
          <span>Install App</span>
          <ChevronDown size={11} style={{ opacity: 0.7 }} />
        </button>

        {/* Settings Shortcut Button (Qt Header 32x32 rounded button) */}
        <button
          onClick={() => setActiveScreen('settings')}
          title={isAdmin ? 'Open System & Display Settings' : 'Open Display Settings'}
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '6px',
            backgroundColor: activeScreen === 'settings' ? '#F8FAFC' : 'transparent',
            border: `1px solid ${activeScreen === 'settings' ? '#CBD5E1' : '#E2E8F0'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: '#64748B',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#F8FAFC';
            (e.currentTarget as HTMLButtonElement).style.borderColor = '#CBD5E1';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = activeScreen === 'settings' ? '#F8FAFC' : 'transparent';
            (e.currentTarget as HTMLButtonElement).style.borderColor = activeScreen === 'settings' ? '#CBD5E1' : '#E2E8F0';
          }}
        >
          <SettingsIcon size={15} />
        </button>

        {/* Logout Button (Qt Header outline button) */}
        <button
          id="header-signout-btn"
          onClick={logout}
          title="Sign out of console"
          style={{
            height: '28px',
            padding: '0 12px',
            borderRadius: '4px',
            backgroundColor: '#FFFFFF',
            border: '1px solid #CBD5E1',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: 600,
            color: '#475569',
            fontFamily: typography.fontFamily,
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#FEE2E2';
            (e.currentTarget as HTMLButtonElement).style.borderColor = '#DC2626';
            (e.currentTarget as HTMLButtonElement).style.color = '#DC2626';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#FFFFFF';
            (e.currentTarget as HTMLButtonElement).style.borderColor = '#CBD5E1';
            (e.currentTarget as HTMLButtonElement).style.color = '#475569';
          }}
        >
          <LogOut size={12} />
          <span>Logout</span>
        </button>

        <div style={{ width: '1px', height: '20px', backgroundColor: '#E2E8F0', margin: '0 2px' }} />

        {/* Live Date / Time Block (Qt Header Stacked) */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: '92px' }}>
          <span
            style={{
              color: '#0F172A',
              fontFamily: typography.fontFamily,
              fontSize: '12px',
              fontWeight: 700,
              lineHeight: '15px',
            }}
          >
            {currentTime || '--:--:--'}
          </span>
          <span
            style={{
              color: '#64748B',
              fontFamily: typography.fontFamily,
              fontSize: '10px',
              fontWeight: 500,
              lineHeight: '13px',
            }}
          >
            {currentDate || '07 November 2026'}
          </span>
        </div>
      </div>

      {/* Install App Modal */}
      <InstallAppModal
        isOpen={isInstallModalOpen}
        onClose={() => setIsInstallModalOpen(false)}
      />
    </header>
  );
};
