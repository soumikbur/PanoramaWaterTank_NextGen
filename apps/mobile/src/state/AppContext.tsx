/**
 * Global Application Context and State Management.
 */

import React, { createContext, useContext, useState, useEffect, useMemo, useRef, ReactNode } from 'react';
import {
  TankLiveStatus,
  Device,
  AlarmItem,
  AlarmStats,
  UserProfile,
  RegionSummary,
  LiveTelemetryPayload,
  MqttConnectionStatus,
  MqttGpsFix,
  TrainOverviewItem,
  TrainConsist,
  CoachFormInput
} from '../types';
import { ApiClient, BackendConnectivityStatus } from '../api/client';
import { wsService, WebSocketStatus } from '../services/websocket';
import { mqttService } from '../services/mqttService';
import { syncService, SyncState } from '../services/syncService';
import { DisplayPreferencesService, ScalePreset } from '../services/displayPreferencesService';
import { AppRouter } from '../services/router';
import { deviceRegistry, ManagedDevice } from '../services/deviceRegistry';
import { localFleetStore, FLEET_STORAGE_KEY, FLEET_UPDATED_EVENT } from '../services/localFleetStore';
import {
  computeConsistData,
  getTelemetryTimeoutSeconds,
  setTelemetryTimeoutSeconds,
  ConsistMetrics,
  ConsistCoachItem,
  ConsistTankItem,
} from '../services/tankStatusService';
import {
  alertNotificationService,
  AlertToast,
  AlertHistoryEntry,
  AlertConfig,
  ManagedAlertRecord,
} from '../services/alertNotificationService';
import {
  browserNotificationBridge,
  BrowserNotificationPermission,
} from '../services/browserNotificationBridge';

export type ScreenName =
  | 'login'
  | 'dashboard'
  | 'trains'
  | 'coaches'
  | 'coach-details'
  | 'watertank'
  | 'devices'
  | 'location'
  | 'monitoring'
  | 'alerts'
  | 'history'
  | 'reports'
  | 'settings'
  | 'users'
  | 'logs';

interface AppContextType {
  activeScreen: ScreenName;
  setActiveScreen: (screen: ScreenName) => void;
  isAuthenticated: boolean;
  authLoading: boolean;
  liveTank: TankLiveStatus | null;
  tanks: TankLiveStatus[];
  devices: Device[];
  managedDevices: ManagedDevice[];
  activeAlarms: AlarmItem[];
  alarmStats: AlarmStats;
  connectionStatus: WebSocketStatus;
  backendApiStatus: BackendConnectivityStatus;
  mqttBrokerStatus: 'CONNECTED' | 'DISCONNECTED' | 'UNKNOWN';
  mqttConnectionStatus: MqttConnectionStatus;
  liveTelemetry: LiveTelemetryPayload | null;
  lastValidGps: MqttGpsFix | null;
  gpsWaypoints: MqttGpsFix[];
  currentTime: string;
  currentDate: string;
  currentUser: UserProfile | null;
  setCurrentUser: (user: UserProfile | null) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  isMobileNavOpen: boolean;
  setIsMobileNavOpen: (open: boolean) => void;
  toggleMobileNav: () => void;
  selectedTrainNumber: string;
  setSelectedTrainNumber: (trainNum: string) => void;
  selectedCoachNumber: string;
  setSelectedCoachNumber: (coachNum: string) => void;
  selectedTankId: string | null;
  setSelectedTankId: (id: string | null) => void;
  selectedDeviceId: string | null;
  setSelectedDeviceId: (id: string | null) => void;
  selectedStationCode: string | null;
  setSelectedStationCode: (code: string | null) => void;
  regions: RegionSummary[];
  configuredTrains: TrainOverviewItem[];
  activeConsist: TrainConsist | null;
  displayScale: string;
  setDisplayScale: (scale: string) => void;
  resetDisplayScale: () => void;
  refreshData: () => Promise<void>;
  refreshRegions: () => Promise<void>;
  acknowledgeAlarm: (alarmId: string, comment?: string) => Promise<void>;
  login: (u: string, p: string) => Promise<void>;
  logout: () => void;
  consistMetrics: ConsistMetrics;
  consistCoaches: ConsistCoachItem[];
  consistTanks: ConsistTankItem[];
  telemetryTimeoutSeconds: number;
  setTelemetryTimeoutSeconds: (seconds: number) => void;
  alertToast: AlertToast | null;
  dismissAlertToast: () => void;
  alertHistory: AlertHistoryEntry[];
  managedAlerts: ManagedAlertRecord[];
  alertConfig: AlertConfig;
  updateAlertConfig: (cfg: Partial<AlertConfig>) => void;
  clearAlertHistory: () => Promise<void>;
  notificationPermission: BrowserNotificationPermission;
  requestNotificationPermission: () => Promise<BrowserNotificationPermission>;
  addCoach: (trainNumber: string, data: CoachFormInput) => Promise<any>;
  updateCoach: (trainNumber: string, coachNumber: string, data: CoachFormInput) => Promise<any>;
  renameCoach: (trainNumber: string, oldCoachNumber: string, newCoachNumber: string) => Promise<any>;
  deleteCoach: (trainNumber: string, coachNumber: string) => Promise<any>;
  reorderCoaches: (trainNumber: string, coachNumbers: string[]) => Promise<any>;
  syncState: SyncState;
  lastSyncTime: Date | null;
  triggerSync: () => Promise<boolean>;
}

const defaultStats: AlarmStats = {
  totalActive: 0,
  criticalCount: 0,
  warningCount: 0,
  resolvedToday: 0,
};

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [activeScreen, setActiveScreen] = useState<ScreenName>('login');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);

  const [liveTank, setLiveTank] = useState<TankLiveStatus | null>(null);
  const [tanks, setTanks] = useState<TankLiveStatus[]>([]);
  const [managedDevices, setManagedDevices] = useState<ManagedDevice[]>(() => deviceRegistry.getDevices());
  const [devices, setDevices] = useState<Device[]>(() =>
    deviceRegistry.getDevices().map((m) => ({
      id: m.uid,
      uid: m.uid,
      name: m.name,
      trainNumber: m.trainNumber || '',
      coachNumber: m.coachNumber || '',
      train_number: m.trainNumber || '',
      coach_number: m.coachNumber || '',
      hardwareVersion: m.hardwareModel,
      hardware_version: m.hardwareModel,
      firmwareVersion: 'v2.2.0',
      firmware_version: 'v2.2.0',
      isOnline: m.isOnline,
      is_online: m.isOnline,
      lastSeenAt: m.lastSeen,
      last_seen_at: m.lastSeen,
      lastHeartbeat: m.lastSeen,
      batteryPercent: m.batteryPercent,
      batteryVoltage: m.batteryVoltage,
      primaryLevel: m.tank1Level ?? undefined,
      secondaryLevel: m.tank2Level ?? undefined,
      hasActiveAlarm: !m.valve1Normal || !m.valve2Normal || m.batteryPercent < 20,
    }))
  );
  const [activeAlarms, setActiveAlarms] = useState<AlarmItem[]>([]);
  const [alarmStats, setAlarmStats] = useState<AlarmStats>(defaultStats);
  const [connectionStatus, setConnectionStatus] = useState<WebSocketStatus>('DISCONNECTED');
  const [backendApiStatus, setBackendApiStatus] = useState<BackendConnectivityStatus>(() => ApiClient.getBackendStatus());
  const [mqttBrokerStatus, setMqttBrokerStatus] = useState<'CONNECTED' | 'DISCONNECTED' | 'UNKNOWN'>('UNKNOWN');
  const [mqttConnectionStatus, setMqttConnectionStatus] = useState<MqttConnectionStatus>('DISCONNECTED');
  const [liveTelemetry, setLiveTelemetry] = useState<LiveTelemetryPayload | null>(null);
  const [lastValidGps, setLastValidGps] = useState<MqttGpsFix | null>(() => mqttService.getLastValidGps());
  const [gpsWaypoints, setGpsWaypoints] = useState<MqttGpsFix[]>(() => mqttService.getGpsWaypoints());
  const [currentTime, setCurrentTime] = useState<string>('');
  const [currentDate, setCurrentDate] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState<boolean>(false);
  const toggleMobileNav = () => setIsMobileNavOpen((prev) => !prev);
  const [selectedTrainNumber, setSelectedTrainNumber] = useState<string>('');
  const [selectedCoachNumber, setSelectedCoachNumber] = useState<string>('');
  const [selectedTankId, setSelectedTankId] = useState<string | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [selectedStationCode, setSelectedStationCode] = useState<string | null>(null);
  const [regions, setRegions] = useState<RegionSummary[]>([]);
  const [activeConsist, setActiveConsist] = useState<TrainConsist | null>(null);
  const regionsLoadedRef = useRef<boolean>(false);
  const [syncState, setSyncState] = useState<SyncState>(() => syncService.getState());
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(() => syncService.getLastSyncTime());

  const [telemetryTimeoutSec, setTelemetryTimeoutSec] = useState<number>(() => getTelemetryTimeoutSeconds());
  const [telemetryTick, setTelemetryTick] = useState<number>(0);

  const [alertToast, setAlertToast] = useState<AlertToast | null>(null);
  const [alertHistory, setAlertHistory] = useState<AlertHistoryEntry[]>(() => alertNotificationService.getHistory());
  const [managedAlerts, setManagedAlerts] = useState<ManagedAlertRecord[]>(() => alertNotificationService.getManagedAlerts());
  const [alertConfig, setAlertConfigState] = useState<AlertConfig>(() => alertNotificationService.getConfig());
  const [notificationPermission, setNotificationPermission] = useState<BrowserNotificationPermission>(
    () => browserNotificationBridge.getPermission()
  );

  useEffect(() => {
    const unsubToast = alertNotificationService.onToast((toast) => {
      setAlertToast(toast);
      setAlertHistory(alertNotificationService.getHistory());
    });
    const unsubAlerts = alertNotificationService.onAlertsChange((alerts) => {
      setManagedAlerts(alerts);
      setAlertHistory(alertNotificationService.getHistory());
    });
    const unsubPerm = browserNotificationBridge.onPermissionChange((perm) => {
      setNotificationPermission(perm);
    });
    const unsubClick = browserNotificationBridge.onNotificationClick((data) => {
      if (data.trainNumber) setSelectedTrainNumber(data.trainNumber);
      if (data.coachNumber) setSelectedCoachNumber(data.coachNumber);
      if (data.tankId) setSelectedTankId(data.tankId);
      const target = (data.screen || 'alerts') as ScreenName;
      setActiveScreen(target);
      AppRouter.navigate(target, data.trainNumber || selectedTrainNumber, data.coachNumber || selectedCoachNumber);
    });

    browserNotificationBridge.registerServiceWorker().then(() => {
      setNotificationPermission(browserNotificationBridge.getPermission());
    });

    return () => {
      unsubToast();
      unsubAlerts();
      unsubPerm();
      unsubClick();
    };
  }, []);

  const requestNotificationPermission = async (): Promise<BrowserNotificationPermission> => {
    const perm = await alertNotificationService.requestBrowserPermission();
    setNotificationPermission(perm);
    return perm;
  };

  const dismissAlertToast = () => {
    setAlertToast(null);
  };

  useEffect(() => {
    if (!alertToast || !alertToast.autoDismissMs) return;
    const timer = setTimeout(() => {
      setAlertToast((curr) => (curr?.id === alertToast.id ? null : curr));
    }, alertToast.autoDismissMs);
    return () => clearTimeout(timer);
  }, [alertToast]);

  const updateAlertConfig = (cfg: Partial<AlertConfig>) => {
    const updated = alertNotificationService.setConfig(cfg);
    setAlertConfigState(updated);
  };

  const clearAlertHistory = async () => {
    alertNotificationService.clearHistory();
    setAlertHistory([]);
    try {
      await ApiClient.clearAlarmHistory();
    } catch {
      // offline/mock fallback
    }
    setActiveAlarms([]);
    setAlarmStats(defaultStats);
  };

  useEffect(() => {
    // 1-second ticker to re-evaluate telemetry timeout dynamically
    const interval = setInterval(() => {
      setTelemetryTick((t) => (t + 1) % 1000000);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleSetTelemetryTimeout = (seconds: number) => {
    setTelemetryTimeoutSeconds(seconds);
    setTelemetryTimeoutSec(seconds);
  };

  const configuredTrains: TrainOverviewItem[] = useMemo(() => {
    const seen = new Set<string>();
    const list: TrainOverviewItem[] = [];
    for (const reg of regions) {
      for (const t of reg.trains || []) {
        const num = (t.train_number || '').trim();
        if (num && !seen.has(num)) {
          seen.add(num);
          list.push({ ...t, region: t.region || reg.region });
        }
      }
    }
    return list;
  }, [regions]);

  const configuredTrainSetRef = useRef<Set<string>>(new Set());
  const configuredTrainsRef = useRef<TrainOverviewItem[]>([]);
  useEffect(() => {
    configuredTrainSetRef.current = new Set(configuredTrains.map((t) => t.train_number.trim()));
    configuredTrainsRef.current = configuredTrains;
  }, [configuredTrains]);

  const activeConsistRef = useRef<TrainConsist | null>(null);
  useEffect(() => {
    activeConsistRef.current = activeConsist;
  }, [activeConsist]);

  // Keep selected train/coach, active consist, URL params, and local caches strictly synced with configuredTrains
  useEffect(() => {
    // Authoritative fleet validator registration
    alertNotificationService.setFleetValidator(() => {
      const trainNumbers = new Set(configuredTrains.map((t) => t.train_number.trim()));
      const coachKeys = new Set<string>();
      for (const t of configuredTrains) {
        const consist = localFleetStore.getTrainConsist(t.train_number.trim());
        if (consist?.coaches) {
          for (const c of consist.coaches) {
            coachKeys.add(`${t.train_number.trim()}::${c.coach_number.trim().toUpperCase()}`);
          }
        }
      }
      const deviceUids = new Set<string>();
      for (const d of managedDevices) {
        if (d.trainNumber && d.assignmentStatus === 'ENGAGED' && trainNumbers.has(d.trainNumber.trim())) {
          deviceUids.add(d.uid.trim());
        }
      }
      return { trainNumbers, coachKeys, deviceUids };
    });

    if (!regionsLoadedRef.current) return;

    const validSet = new Set(configuredTrains.map((t) => t.train_number.trim()));
    if (configuredTrains.length === 0) {
      if (selectedTrainNumber) setSelectedTrainNumber('');
      if (selectedCoachNumber) setSelectedCoachNumber('');
      if (selectedTankId) setSelectedTankId(null);
      if (activeConsist) setActiveConsist(null);
      if (liveTank) setLiveTank(null);
      if (tanks.length > 0) setTanks([]);
      if (liveTelemetry) setLiveTelemetry(null);
      if (lastValidGps) setLastValidGps(null);
      if (gpsWaypoints.length > 0) setGpsWaypoints([]);
      setActiveAlarms([]);
      setAlarmStats((s) => ({ ...s, totalActive: 0, criticalCount: 0, warningCount: 0 }));
      alertNotificationService.reconcileWithFleet({
        trainNumbers: new Set(),
        coachKeys: new Set(),
        deviceUids: new Set(),
      });
      const parsed = AppRouter.parseCurrentRoute();
      if (parsed.trainNumber || parsed.coachNumber) {
        AppRouter.navigate(activeScreen);
      }
      return;
    }

    // Filter out active alarms from trains that no longer exist
    setActiveAlarms((prev) => {
      const filtered = prev.filter((a) => {
        const tr = (a.trainNumber || a.train_number || '').trim();
        return !tr || validSet.has(tr);
      });
      return filtered.length === prev.length ? prev : filtered;
    });

    if (!selectedTrainNumber || !validSet.has(selectedTrainNumber.trim())) {
      const nextTrain = configuredTrains[0].train_number.trim();
      setSelectedTrainNumber(nextTrain);
      setSelectedCoachNumber('');
      const parsed = AppRouter.parseCurrentRoute();
      if (parsed.trainNumber && !validSet.has(parsed.trainNumber.trim())) {
        AppRouter.navigate(activeScreen, nextTrain);
      }
    }
  }, [configuredTrains, selectedTrainNumber, activeScreen, managedDevices]);

  // Fetch authoritative consist whenever selectedTrainNumber changes or fleet refreshes
  useEffect(() => {
    const clean = (selectedTrainNumber || '').trim();
    if (!clean || !configuredTrains.some((t) => t.train_number.trim() === clean)) {
      setActiveConsist(null);
      return;
    }
    let cancelled = false;
    ApiClient.fetchTrainConsist(clean)
      .then((c) => {
        if (!cancelled) setActiveConsist(c);
      })
      .catch(() => {
        if (!cancelled) setActiveConsist(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedTrainNumber, configuredTrains]);

  const consistData = useMemo(() => {
    return computeConsistData({
      trainNumber: selectedTrainNumber,
      configuredTrains,
      activeConsist,
      managedDevices,
      liveTelemetry,
      mqttStatus: mqttConnectionStatus,
      timeoutSeconds: telemetryTimeoutSec,
      now: Date.now(),
    });
  }, [selectedTrainNumber, configuredTrains, activeConsist, managedDevices, liveTelemetry, mqttConnectionStatus, telemetryTimeoutSec, telemetryTick]);

  // Monitor mapped coaches for real-time disconnect & reconnect transitions (timeout / MQTT drop / recovery)
  const prevCoachOnlineMapRef = useRef<Map<string, boolean>>(new Map());
  useEffect(() => {
    const prevMap = prevCoachOnlineMapRef.current;
    const addedDisconnectAlarms: AlarmItem[] = [];
    const reconnectedIds = new Set<string>();

    for (const coach of consistData.coaches) {
      if (!coach.isMapped || !coach.deviceUid) continue;
      const key = `${coach.deviceUid}::${coach.coachNumber}`;
      const wasOnline = prevMap.get(key);

      if (wasOnline === undefined) {
        prevMap.set(key, coach.isOnline);
        if (coach.isOnline) {
          alertNotificationService.evaluateDeviceConnectivity({
            deviceId: coach.deviceUid,
            coachNumber: coach.coachNumber,
            isOnline: true,
            trainNumber: selectedTrainNumber,
          });
        }
        continue;
      }

      if (wasOnline && !coach.isOnline) {
        prevMap.set(key, false);
        alertNotificationService.evaluateDeviceConnectivity({
          deviceId: coach.deviceUid,
          coachNumber: coach.coachNumber,
          isOnline: false,
          trainNumber: selectedTrainNumber,
        });
        const alarmId = `alarm-conn-${coach.deviceUid}`;
        addedDisconnectAlarms.push({
          id: alarmId,
          deviceId: coach.deviceUid,
          coachNumber: coach.coachNumber,
          trainNumber: selectedTrainNumber,
          alarmType: 'DEVICE_OFFLINE',
          severity: 'WARNING',
          status: 'ACTIVE',
          message: `Coach ${coach.coachNumber} (${coach.deviceUid}) disconnected.`,
          triggeredAt: new Date().toISOString(),
        });
      } else if (!wasOnline && coach.isOnline) {
        prevMap.set(key, true);
        alertNotificationService.evaluateDeviceConnectivity({
          deviceId: coach.deviceUid,
          coachNumber: coach.coachNumber,
          isOnline: true,
          trainNumber: selectedTrainNumber,
        });
        reconnectedIds.add(`alarm-conn-${coach.deviceUid}`);
      }
    }

    if (addedDisconnectAlarms.length > 0 || reconnectedIds.size > 0) {
      setActiveAlarms((prev) => {
        const next = prev.filter((a) => !reconnectedIds.has(a.id));
        for (const item of addedDisconnectAlarms) {
          if (!next.some((a) => a.id === item.id)) {
            next.unshift(item);
          }
        }
        return next;
      });
      setAlarmStats((stats) => ({
        ...stats,
        totalActive: Math.max(0, stats.totalActive + addedDisconnectAlarms.length - reconnectedIds.size),
        warningCount: Math.max(0, stats.warningCount + addedDisconnectAlarms.length - reconnectedIds.size),
        resolvedToday: stats.resolvedToday + reconnectedIds.size,
      }));
    }
  }, [consistData.coaches, selectedTrainNumber]);

  // Global Display Scaling preferences (delegated to DisplayPreferencesService)
  const [displayScale, setDisplayScaleState] = useState<string>(() => {
    return DisplayPreferencesService.loadPreferences().scale;
  });

  const setDisplayScale = (newScale: string) => {
    setDisplayScaleState(newScale);
    const prefs = DisplayPreferencesService.loadPreferences(currentUser?.username);
    DisplayPreferencesService.savePreferences(
      {
        ...prefs,
        scale: newScale as ScalePreset,
        fontSize: DisplayPreferencesService.scaleToFontSize(newScale as ScalePreset),
      },
      currentUser?.username
    );
  };

  const resetDisplayScale = () => {
    const defaults = DisplayPreferencesService.resetPreferences(currentUser?.username);
    setDisplayScaleState(defaults.scale);
  };

  // Synchronize display scale whenever authenticated user session changes
  useEffect(() => {
    if (currentUser?.username) {
      const prefs = DisplayPreferencesService.loadPreferences(currentUser.username);
      setDisplayScaleState(prefs.scale);
    }
  }, [currentUser?.username]);

  // 1. Session verification on startup
  useEffect(() => {
    let completed = false;
    const safetyTimer = setTimeout(() => {
      if (!completed) {
        setAuthLoading(false);
      }
    }, 3500);

    const checkAuthSession = async () => {
      const token = localStorage.getItem('panorama_token');
      if (!token) {
        completed = true;
        clearTimeout(safetyTimer);
        setIsAuthenticated(false);
        setCurrentUser(null);
        setActiveScreen('login');
        setAuthLoading(false);
        return;
      }

      try {
        const user = await ApiClient.fetchCurrentUser();
        completed = true;
        clearTimeout(safetyTimer);
        setCurrentUser(user);
        setIsAuthenticated(true);
        const parsed = AppRouter.parseCurrentRoute();
        if (parsed.trainNumber) setSelectedTrainNumber(parsed.trainNumber);
        if (parsed.coachNumber) setSelectedCoachNumber(parsed.coachNumber);
        const targetScreen = (parsed.screen && parsed.screen !== 'login' ? parsed.screen : 'dashboard') as ScreenName;
        setActiveScreen(targetScreen);
        AppRouter.navigate(targetScreen, parsed.trainNumber || selectedTrainNumber, parsed.coachNumber || selectedCoachNumber);
      } catch (err) {
        completed = true;
        clearTimeout(safetyTimer);
        console.warn('[AppContext] Stale or invalid session token. Resetting to login:', err);
        ApiClient.logout();
        setIsAuthenticated(false);
        setCurrentUser(null);
        setActiveScreen('login');
        AppRouter.navigate('login');
      } finally {
        completed = true;
        clearTimeout(safetyTimer);
        setAuthLoading(false);
      }
    };

    checkAuthSession();
    return () => {
      completed = true;
      clearTimeout(safetyTimer);
    };
  }, []);

  // Listen to browser URL navigation (Back/Forward buttons, hashchange)
  useEffect(() => {
    const handleUrlChange = () => {
      const parsed = AppRouter.parseCurrentRoute();
      if (parsed.screen && parsed.screen !== activeScreen) {
        setActiveScreen(parsed.screen as ScreenName);
      }
      if (parsed.trainNumber && parsed.trainNumber !== selectedTrainNumber) {
        setSelectedTrainNumber(parsed.trainNumber);
      }
      if (parsed.coachNumber && parsed.coachNumber !== selectedCoachNumber) {
        setSelectedCoachNumber(parsed.coachNumber);
      }
    };

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('hashchange', handleUrlChange);
      window.addEventListener('popstate', handleUrlChange);
      return () => {
        window.removeEventListener('hashchange', handleUrlChange);
        window.removeEventListener('popstate', handleUrlChange);
      };
    }
  }, [activeScreen, selectedTrainNumber, selectedCoachNumber]);

  // Clock & Date ticker
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('en-US', {
          hour12: true,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
      setCurrentDate(
        now.toLocaleDateString('en-US', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
        })
      );
    };
    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  // Subscribe to persistent device registry updates
  useEffect(() => {
    const unsub = deviceRegistry.subscribe((list) => {
      setManagedDevices(list);
      setDevices(
        list.map((m) => ({
          id: m.uid,
          uid: m.uid,
          name: m.name,
          trainNumber: m.trainNumber || '',
          coachNumber: m.coachNumber || '',
          train_number: m.trainNumber || '',
          coach_number: m.coachNumber || '',
          hardwareVersion: m.hardwareModel,
          hardware_version: m.hardwareModel,
          firmwareVersion: 'v2.2.0',
          firmware_version: 'v2.2.0',
          isOnline: m.isOnline,
          is_online: m.isOnline,
          lastSeenAt: m.lastSeen,
          last_seen_at: m.lastSeen,
          lastHeartbeat: m.lastSeen,
          batteryPercent: m.batteryPercent,
          batteryVoltage: m.batteryVoltage,
          primaryLevel: m.tank1Level ?? undefined,
          secondaryLevel: m.tank2Level ?? undefined,
          hasActiveAlarm: !m.valve1Normal || !m.valve2Normal || m.batteryPercent < 20,
        }))
      );
    });
    return unsub;
  }, []);

  const refreshRegions = async () => {
    try {
      const data = await ApiClient.fetchRegionsSummary();
      if (!Array.isArray(data)) return;
      regionsLoadedRef.current = true;
      setRegions(data);

      const validTrains = new Set<string>();
      data.forEach((r) => (r.trains || []).forEach((t) => {
        if (t.train_number) validTrains.add(t.train_number.trim());
      }));

      // Synchronize tanks, active alarms, and live telemetry when trains are removed
      const allTanks = await ApiClient.fetchTanks().catch(() => []);
      const filteredTanks = (Array.isArray(allTanks) ? allTanks : []).filter(
        (t) => t.trainNumber && validTrains.has(t.trainNumber.trim())
      );
      setTanks(filteredTanks);
      setLiveTank((prev) => (prev && prev.trainNumber && validTrains.has(prev.trainNumber.trim()) ? prev : filteredTanks[0] ?? null));
      setLiveTelemetry((prev) => (prev && prev.trno && validTrains.has(prev.trno.trim()) ? prev : null));
      setActiveAlarms((prev) =>
        prev.filter((a) => !a.trainNumber || validTrains.has(a.trainNumber.trim()))
      );
      if (validTrains.size === 0) {
        setLastValidGps(null);
        setGpsWaypoints([]);
      }
      syncService.setState('SYNCHRONIZED');
    } catch (e) {
      console.warn('[AppContext] Error fetching regions, retaining current fleet state:', e);
    }
  };

  // Fetch initial REST data
  const refreshData = async () => {
    try {
      const [tank, allTanks, devList, alarms, stats, regs, health] = await Promise.all([
        ApiClient.fetchLiveTank().catch(() => null),
        ApiClient.fetchTanks().catch(() => []),
        ApiClient.fetchDevices().catch(() => []),
        ApiClient.fetchAlarms('ACTIVE').catch(() => []),
        ApiClient.fetchAlarmStats().catch(() => defaultStats),
        ApiClient.fetchRegionsSummary().catch(() => null),
        ApiClient.fetchHealth().catch(() => null),
      ]);

      if (Array.isArray(regs)) {
        regionsLoadedRef.current = true;
        setRegions(regs);

        const validTrains = new Set<string>();
        regs.forEach((r) => (r.trains || []).forEach((t) => {
          if (t.train_number) validTrains.add(t.train_number.trim());
        }));

        const filteredTanks = (Array.isArray(allTanks) ? allTanks : []).filter(
          (t) => t.trainNumber && validTrains.has(t.trainNumber.trim())
        );
        setTanks(filteredTanks);
        setLiveTank(
          tank && tank.trainNumber && validTrains.has(tank.trainNumber.trim())
            ? tank
            : filteredTanks[0] ?? null
        );
      } else if (Array.isArray(allTanks) && allTanks.length > 0) {
        setTanks(allTanks);
        if (tank) setLiveTank(tank);
      }

      if (Array.isArray(devList) && devList.length > 0) {
        setDevices(devList);
      }
      if (Array.isArray(alarms)) {
        setActiveAlarms(alarms);
        alertNotificationService.syncWithBackendAlarms(alarms);
      }
      if (stats) {
        setAlarmStats(stats);
      }
      if (health?.mqttBroker) {
        setMqttBrokerStatus(health.mqttBroker === 'CONNECTED' ? 'CONNECTED' : 'DISCONNECTED');
      }
      syncService.setState('SYNCHRONIZED');
    } catch (e) {
      console.warn('[AppContext] Error refreshing data, retaining current fleet state:', e);
    }
  };

  useEffect(() => {
    refreshData();
    if (typeof window === 'undefined') return;
    const centralChannel =
      typeof window !== 'undefined' && typeof (window as any).BroadcastChannel === 'function'
        ? new BroadcastChannel('panorama_central_sync')
        : null;
    const onChannelMessage = (e: MessageEvent) => {
      if (e.data?.type === 'FLEET_SYNC' || e.data?.type === 'FLEET_UPDATE') {
        refreshRegions();
        refreshData();
      } else if (e.data?.type === 'DEVICE_SYNC' || e.data?.type === 'DEVICE_UPDATE') {
        refreshData();
      }
    };
    if (centralChannel && typeof centralChannel.addEventListener === 'function') {
      centralChannel.addEventListener('message', onChannelMessage);
    }

    const onStorageSync = (e: StorageEvent) => {
      if (e.key === FLEET_STORAGE_KEY || e.key === 'panorama_fleet_sync_ts' || e.key === null) {
        refreshRegions();
      }
    };
    const onLocalFleetEvent = () => {
      refreshRegions();
    };
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('storage', onStorageSync);
      window.addEventListener(FLEET_UPDATED_EVENT, onLocalFleetEvent);
    }
    return () => {
      if (centralChannel && typeof centralChannel.removeEventListener === 'function') {
        centralChannel.removeEventListener('message', onChannelMessage);
      }
      try {
        centralChannel?.close();
      } catch {}
      if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
        window.removeEventListener('storage', onStorageSync);
        window.removeEventListener(FLEET_UPDATED_EVENT, onLocalFleetEvent);
      }
    };
  }, []);

  // Central authoritative synchronization listener
  useEffect(() => {
    const unsubSyncState = syncService.onStateChange((st, time) => {
      setSyncState(st);
      setLastSyncTime(time);
    });

    const unsubSyncEvents = syncService.onSyncEvent((evt) => {
      const type = evt.event_type;
      if (
        type === 'TRAIN_CREATED' ||
        type === 'TRAIN_UPDATED' ||
        type === 'TRAIN_DELETED' ||
        type === 'REGION_UPDATED' ||
        type === 'COACH_CREATED' ||
        type === 'COACH_UPDATED' ||
        type === 'COACH_DELETED' ||
        type === 'FLEET_SYNC'
      ) {
        refreshRegions();
        refreshData();
      } else if (
        type === 'DEVICE_CREATED' ||
        type === 'DEVICE_UPDATED' ||
        type === 'DEVICE_DELETED' ||
        type === 'DEVICE_SYNC'
      ) {
        refreshData();
      }
    });

    const handleReqSync = () => {
      refreshRegions();
      refreshData();
    };
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('panorama:request-authoritative-sync', handleReqSync);
    }

    return () => {
      unsubSyncState();
      unsubSyncEvents();
      if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
        window.removeEventListener('panorama:request-authoritative-sync', handleReqSync);
      }
    };
  }, []);

  // Subscribe to backend API connectivity status
  useEffect(() => {
    return ApiClient.onStatusChange((status) => {
      setBackendApiStatus(status);
    });
  }, []);

  // Setup WebSocket stream
  const wsHadConnectedRef = useRef(false);
  useEffect(() => {
    wsService.connect();

    const unsubStatus = wsService.onStatusChange((status) => {
      setConnectionStatus(status);
      if (status === 'CONNECTED') {
        wsHadConnectedRef.current = true;
        alertNotificationService.evaluateCommunicationFailure({
          channel: 'WebSocket',
          isHealthy: true,
        });
      } else if (status === 'DISCONNECTED' && wsHadConnectedRef.current) {
        alertNotificationService.evaluateCommunicationFailure({
          channel: 'WebSocket',
          isHealthy: false,
          reason: 'Backend WebSocket live stream disconnected.',
        });
      }
    });

    const unsubTelemetry = wsService.on('TELEMETRY_UPDATE', (data: any) => {
      const evtTrain = String(data.trainNumber || '').trim();
      if (!evtTrain || !configuredTrainSetRef.current.has(evtTrain)) {
        return;
      }
      setMqttBrokerStatus('CONNECTED');
      setLiveTank((prev) => {
        const base = prev || {
          tankId: data.tankId || 'primary-tank',
          deviceId: data.deviceId || '',
          deviceUid: data.deviceUid || 'DEV-WLI-01',
          trainNumber: evtTrain,
          coachNumber: data.coachNumber || '',
          tankName: data.tankName || 'Primary Storage Tank',
          capacityLiters: 20.0,
          maxHeightCm: 50.0,
          crossSectionalAreaM2: 0.04,
          rank: 'MODERATE' as const,
          alarmStatus: 'NORMAL' as const,
          isOnline: true,
          levelPercent: null,
          rawLevelPercent: null,
          volumeLiters: null,
          heightCm: null,
          batteryVoltage: null,
          temperature: null,
          latitude: null,
          longitude: null,
          lastUpdate: null,
        };
        return {
          ...base,
          levelPercent: data.primaryLevel ?? base.levelPercent,
          rawLevelPercent: data.rawLevel ?? base.rawLevelPercent,
          volumeLiters: data.primaryVolume ?? base.volumeLiters,
          heightCm: data.primaryHeight ?? base.heightCm,
          rank: data.primaryRank ?? base.rank,
          alarmStatus: data.status ?? base.alarmStatus,
          batteryVoltage: data.batteryVoltage ?? base.batteryVoltage,
          temperature: data.temperature ?? base.temperature,
          latitude: data.latitude ?? base.latitude,
          longitude: data.longitude ?? base.longitude,
          isOnline: data.isOnline ?? true,
          hasTelemetry: true,
          isStale: false,
          lastUpdate: data.timestamp ?? new Date().toISOString(),
        };
      });

      setTanks((prev) => {
        if (!prev || prev.length === 0) return prev;
        return prev.map((t) => {
          if (t.tankIndex === 1 && (data.deviceUid ? t.deviceUid === data.deviceUid : true)) {
            return {
              ...t,
              levelPercent: data.primaryLevel ?? t.levelPercent,
              rawLevelPercent: data.rawLevel ?? t.rawLevelPercent,
              volumeLiters: data.primaryVolume ?? t.volumeLiters,
              heightCm: data.primaryHeight ?? t.heightCm,
              rank: data.primaryRank ?? t.rank,
              alarmStatus: data.status ?? t.alarmStatus,
              batteryVoltage: data.batteryVoltage ?? t.batteryVoltage,
              temperature: data.temperature ?? t.temperature,
              isOnline: data.isOnline ?? true,
              hasTelemetry: true,
              isStale: false,
              lastUpdate: data.timestamp ?? new Date().toISOString(),
            };
          }
          return t;
        });
      });
      if (data.primaryLevel != null) {
        alertNotificationService.evaluateWaterLevel({
          tankId: data.tankId || `${data.deviceUid || 'DEV-WLI-01'}-arrival`,
          tankName: data.tankName || 'Primary Storage Tank',
          trainNumber: evtTrain,
          coachNumber: data.coachNumber || '',
          levelPercent: Number(data.primaryLevel),
          isOnline: data.isOnline ?? true,
        });
      }
      if (data.secondaryLevel != null) {
        alertNotificationService.evaluateWaterLevel({
          tankId: data.secondaryTankId || `${data.deviceUid || 'DEV-WLI-01'}-departure`,
          tankName: data.secondaryTankName || 'Departure Side (Tank 2)',
          trainNumber: evtTrain,
          coachNumber: data.coachNumber || '',
          levelPercent: Number(data.secondaryLevel),
          isOnline: data.isOnline ?? true,
        });
      }
    });

    const unsubAlarmTriggered = wsService.on('ALARM_TRIGGERED', () => {
      refreshData();
    });

    const unsubAlarmResolved = wsService.on('ALARM_RESOLVED', () => {
      refreshData();
    });

    const handleFleetChange = (evtName: string) => (data: any) => {
      console.info(`[AppContext] Received ${evtName} WebSocket broadcast:`, data);
      refreshRegions();
      refreshData();
    };

    const unsubFleetSync = wsService.on('FLEET_SYNC', handleFleetChange('FLEET_SYNC'));
    const unsubTrainCreated = wsService.on('TRAIN_CREATED', handleFleetChange('TRAIN_CREATED'));
    const unsubTrainUpdated = wsService.on('TRAIN_UPDATED', handleFleetChange('TRAIN_UPDATED'));
    const unsubTrainDeleted = wsService.on('TRAIN_DELETED', handleFleetChange('TRAIN_DELETED'));
    const unsubRegionUpdated = wsService.on('REGION_UPDATED', handleFleetChange('REGION_UPDATED'));
    const unsubCoachCreated = wsService.on('COACH_CREATED', handleFleetChange('COACH_CREATED'));
    const unsubCoachUpdated = wsService.on('COACH_UPDATED', handleFleetChange('COACH_UPDATED'));
    const unsubCoachDeleted = wsService.on('COACH_DELETED', handleFleetChange('COACH_DELETED'));
    const unsubCoachRenamed = wsService.on('COACH_RENAMED', handleFleetChange('COACH_RENAMED'));
    const unsubCoachReordered = wsService.on('COACH_REORDERED', handleFleetChange('COACH_REORDERED'));

    const unsubDeviceSync = wsService.on('DEVICE_SYNC', (data: any) => {
      console.info('[AppContext] Received DEVICE_SYNC WebSocket broadcast:', data);
      refreshData();
    });

    return () => {
      unsubStatus();
      unsubTelemetry();
      unsubAlarmTriggered();
      unsubAlarmResolved();
      unsubFleetSync();
      unsubTrainCreated();
      unsubTrainUpdated();
      unsubTrainDeleted();
      unsubRegionUpdated();
      unsubCoachCreated();
      unsubCoachUpdated();
      unsubCoachDeleted();
      unsubCoachRenamed();
      unsubCoachReordered();
      unsubDeviceSync();
      wsService.disconnect();
    };
  }, []);

  // Setup Live MQTT Client stream (Topic: 0023004D4B42501120353332)
  const mqttAttemptedRef = useRef(false);
  useEffect(() => {
    mqttService.connect();

    const unsubMqttStatus = mqttService.onStatusChange((st) => {
      setMqttConnectionStatus(st);
      if (st === 'CONNECTED') {
        mqttAttemptedRef.current = true;
        setConnectionStatus('CONNECTED');
        setMqttBrokerStatus('CONNECTED');
        alertNotificationService.evaluateBrokerConnectivity({ isConnected: true });
        // Real-time synchronization reconciliation on initial connect / reconnect
        refreshRegions();
        refreshData();
      } else if (st === 'CONNECTING') {
        mqttAttemptedRef.current = true;
        setConnectionStatus('RECONNECTING');
      } else if (st === 'DISCONNECTED') {
        setMqttBrokerStatus('DISCONNECTED');
        if (mqttAttemptedRef.current) {
          alertNotificationService.evaluateBrokerConnectivity({
            isConnected: false,
            reason: 'MQTT broker connection lost or unreachable.',
          });
        }
      }
    });

    // Real-time multi-client synchronization over MQTT broadcast topics
    const unsubMqttFleetSync = mqttService.onFleetSync((event) => {
      console.info('[AppContext] Received MQTT fleet sync broadcast:', event);
      refreshRegions();
      refreshData();
    });

    const unsubMqttCentralFleet = mqttService.onCentralFleetSync((event) => {
      console.info('[AppContext] Received MQTT central fleet sync broadcast:', event);
      refreshRegions();
      refreshData();
    });

    let deltaDebounceTimer: any = null;
    const debouncedRefresh = (isFleet = false) => {
      clearTimeout(deltaDebounceTimer);
      deltaDebounceTimer = setTimeout(() => {
        if (isFleet) refreshRegions();
        refreshData();
      }, 400);
    };

    const unsubMqttDeviceSync = mqttService.onDeviceSync((event) => {
      console.info('[AppContext] Received MQTT device sync broadcast:', event);
      debouncedRefresh(false);
    });

    const unsubMqttCentralDevice = mqttService.onCentralDeviceSync((event) => {
      console.info('[AppContext] Received MQTT central device sync broadcast:', event);
      debouncedRefresh(false);
    });

    const unsubMqttDeltaSync = mqttService.onCentralDeltaSync((event) => {
      console.info('[AppContext] Received MQTT central delta sync broadcast:', event);
      debouncedRefresh(event?.type === 'FLEET_UPDATE');
    });

    const unsubMqttTelemetry = mqttService.onTelemetry((telemetry) => {
      const mappedDev = deviceRegistry.getDeviceByUid(telemetry.uid);
      const activeTrno = (
        (mappedDev?.assignmentStatus === 'ENGAGED' && mappedDev.trainNumber)
          ? mappedDev.trainNumber
          : (telemetry.trno || '')
      ).trim();

      // Reject or ignore telemetry for unconfigured or deleted trains (never recreate deleted trains/coaches)
      if (!activeTrno || !configuredTrainSetRef.current.has(activeTrno)) {
        console.info('[AppContext] Ignoring telemetry for unconfigured/deleted train:', activeTrno || '<none>');
        return;
      }

      setLiveTelemetry(telemetry);
      setLastValidGps(mqttService.getLastValidGps());
      setGpsWaypoints(mqttService.getGpsWaypoints());
      setMqttBrokerStatus('CONNECTED');
      setConnectionStatus('CONNECTED');

      // Record / update discovered hardware device only for verified configured trains
      deviceRegistry.recordDiscoveredDevice(telemetry);
      const activeChno = (mappedDev?.coachNumber || telemetry.chno || '').trim();

      // 1. Calculate water level percentages based on configured maximum height and capacity
      const trainItem = configuredTrainsRef.current.find((t) => t.train_number.trim() === activeTrno);
      const configuredMaxHeightCm = (activeConsistRef.current && activeConsistRef.current.train_number.trim() === activeTrno && activeConsistRef.current.tank_height_cm)
        ? activeConsistRef.current.tank_height_cm
        : (trainItem?.tank_height_cm ?? 50.0);
      const configuredCapacityLiters = (activeConsistRef.current && activeConsistRef.current.train_number.trim() === activeTrno && activeConsistRef.current.tank_capacity_liters)
        ? activeConsistRef.current.tank_capacity_liters
        : (trainItem?.tank_capacity_liters ?? 20.0);

      const arrivalLevelPct = telemetry.cm1 != null && configuredMaxHeightCm > 0
        ? Number(Math.min(100, Math.max(0, (telemetry.cm1 / configuredMaxHeightCm) * 100)).toFixed(1))
        : (telemetry.wlp1 != null ? Number(telemetry.wlp1.toFixed(1)) : null);

      const departureLevelPct = telemetry.cm2 != null && configuredMaxHeightCm > 0
        ? Number(Math.min(100, Math.max(0, (telemetry.cm2 / configuredMaxHeightCm) * 100)).toFixed(1))
        : (telemetry.wlp2 != null ? Number(telemetry.wlp2.toFixed(1)) : null);

      const arrivalVolume = arrivalLevelPct != null ? Number(((arrivalLevelPct / 100) * configuredCapacityLiters).toFixed(1)) : null;
      const departureVolume = departureLevelPct != null ? Number(((departureLevelPct / 100) * configuredCapacityLiters).toFixed(1)) : null;

      // Construct Dual Tanks from validated MQTT telemetry
      const arrivalTank: TankLiveStatus = {
        tankId: `${telemetry.uid}-arrival`,
        tankName: 'Arrival Side (Tank 1)',
        tankIndex: 1,
        deviceUid: telemetry.uid,
        deviceId: telemetry.uid,
        trainNumber: activeTrno,
        coachNumber: activeChno,
        levelPercent: arrivalLevelPct,
        rawLevelPercent: telemetry.wlp1,
        volumeLiters: arrivalVolume,
        heightCm: telemetry.cm1,
        capacityLiters: configuredCapacityLiters,
        maxHeightCm: configuredMaxHeightCm,
        crossSectionalAreaM2: 0.33,
        rank: arrivalLevelPct && arrivalLevelPct > 70 ? 'GOOD' : arrivalLevelPct && arrivalLevelPct > 30 ? 'MODERATE' : 'LOW',
        alarmStatus: !telemetry.wlv1 ? 'VALVE_ALERT' : arrivalLevelPct != null && arrivalLevelPct < 10 ? 'CRITICAL_LOW' : arrivalLevelPct != null && arrivalLevelPct < 20 ? 'WARNING_LOW' : 'NORMAL',
        batteryVoltage: Number((3.2 + (telemetry.bat / 100) * 1.0).toFixed(2)),
        isOnline: !telemetry.isStale,
        hasTelemetry: true,
        isStale: !!telemetry.isStale,
        lastUpdate: telemetry.time,
        latitude: telemetry.lat,
        longitude: telemetry.long,
      };

      const departureTank: TankLiveStatus = {
        tankId: `${telemetry.uid}-departure`,
        tankName: 'Departure Side (Tank 2)',
        tankIndex: 2,
        deviceUid: telemetry.uid,
        deviceId: telemetry.uid,
        trainNumber: activeTrno,
        coachNumber: activeChno,
        levelPercent: departureLevelPct,
        rawLevelPercent: telemetry.wlp2,
        volumeLiters: departureVolume,
        heightCm: telemetry.cm2,
        capacityLiters: configuredCapacityLiters,
        maxHeightCm: configuredMaxHeightCm,
        crossSectionalAreaM2: 0.33,
        rank: departureLevelPct && departureLevelPct > 70 ? 'GOOD' : departureLevelPct && departureLevelPct > 30 ? 'MODERATE' : 'LOW',
        alarmStatus: !telemetry.wlv2 ? 'VALVE_ALERT' : departureLevelPct != null && departureLevelPct < 10 ? 'CRITICAL_LOW' : departureLevelPct != null && departureLevelPct < 20 ? 'WARNING_LOW' : 'NORMAL',
        batteryVoltage: Number((3.2 + (telemetry.bat / 100) * 1.0).toFixed(2)),
        isOnline: !telemetry.isStale,
        hasTelemetry: true,
        isStale: !!telemetry.isStale,
        lastUpdate: telemetry.time,
        latitude: telemetry.lat,
        longitude: telemetry.long,
      };

      setLiveTank(arrivalTank);
      setTanks([arrivalTank, departureTank]);

      // Deduplicated real-time alert evaluation and dispatch
      alertNotificationService.evaluateWaterLevel({
        tankId: arrivalTank.tankId,
        tankName: arrivalTank.tankName,
        trainNumber: activeTrno,
        coachNumber: activeChno,
        levelPercent: arrivalLevelPct,
        isOnline: arrivalTank.isOnline,
      });
      alertNotificationService.evaluateWaterLevel({
        tankId: departureTank.tankId,
        tankName: departureTank.tankName,
        trainNumber: activeTrno,
        coachNumber: activeChno,
        levelPercent: departureLevelPct,
        isOnline: departureTank.isOnline,
      });
      alertNotificationService.evaluateDeviceConnectivity({
        deviceId: telemetry.uid,
        trainNumber: activeTrno,
        coachNumber: activeChno,
        isOnline: !telemetry.isStale,
      });
      alertNotificationService.evaluateSensorHealth({
        sensorId: `s1-${telemetry.uid}`,
        trainNumber: activeTrno,
        coachNumber: activeChno,
        tankId: arrivalTank.tankId,
        tankName: arrivalTank.tankName,
        levelPercent: arrivalLevelPct,
        isValid: !!telemetry.wlv1,
        sensorName: 'Arrival Sensor 1',
      });
      alertNotificationService.evaluateSensorHealth({
        sensorId: `s2-${telemetry.uid}`,
        trainNumber: activeTrno,
        coachNumber: activeChno,
        tankId: departureTank.tankId,
        tankName: departureTank.tankName,
        levelPercent: departureLevelPct,
        isValid: !!telemetry.wlv2,
        sensorName: 'Departure Sensor 2',
      });
      alertNotificationService.evaluateModemStatus({
        deviceId: telemetry.uid,
        trainNumber: activeTrno,
        coachNumber: activeChno,
        modemOk: !telemetry.isStale,
      });

      // Dynamic real alarms evaluated from telemetry
      const dynamicAlarms: AlarmItem[] = [];
      if (!telemetry.wlv1) {
        dynamicAlarms.push({
          id: `alarm-s1-${telemetry.uid}`,
          deviceId: telemetry.uid,
          deviceUid: telemetry.uid,
          trainNumber: telemetry.trno,
          coachNumber: telemetry.chno,
          tankId: `${telemetry.uid}-arrival`,
          alarmType: 'SENSOR_FAULT',
          severity: 'WARNING',
          status: 'ACTIVE',
          triggerValue: telemetry.cm1,
          thresholdValue: 10,
          message: `Arrival Sensor 1 (Coach ${telemetry.chno}) fault signal`,
          triggeredAt: new Date(telemetry.receivedAt).toISOString(),
          isAcknowledged: false,
        });
      }
      if (!telemetry.wlv2) {
        dynamicAlarms.push({
          id: `alarm-s2-${telemetry.uid}`,
          deviceId: telemetry.uid,
          deviceUid: telemetry.uid,
          trainNumber: telemetry.trno,
          coachNumber: telemetry.chno,
          tankId: `${telemetry.uid}-departure`,
          alarmType: 'SENSOR_FAULT',
          severity: 'WARNING',
          status: 'ACTIVE',
          triggerValue: telemetry.cm2,
          thresholdValue: 10,
          message: `Departure Sensor 2 (Coach ${telemetry.chno}) fault / valve closed`,
          triggeredAt: new Date(telemetry.receivedAt).toISOString(),
          isAcknowledged: false,
        });
      }
      if (departureLevelPct != null && departureLevelPct < 10) {
        dynamicAlarms.push({
          id: `alarm-low-tank2-${telemetry.uid}`,
          deviceId: telemetry.uid,
          deviceUid: telemetry.uid,
          trainNumber: telemetry.trno,
          coachNumber: telemetry.chno,
          tankId: `${telemetry.uid}-departure`,
          alarmType: 'CRITICAL_LOW',
          severity: 'CRITICAL',
          status: 'ACTIVE',
          triggerValue: departureLevelPct,
          thresholdValue: 10,
          message: `Departure Tank 2 (Coach ${telemetry.chno}) critical low level: ${departureLevelPct}%`,
          triggeredAt: new Date(telemetry.receivedAt).toISOString(),
          isAcknowledged: false,
        });
      }
      if (telemetry.bat < 40) {
        dynamicAlarms.push({
          id: `alarm-bat-${telemetry.uid}`,
          deviceId: telemetry.uid,
          deviceUid: telemetry.uid,
          trainNumber: telemetry.trno,
          coachNumber: telemetry.chno,
          alarmType: 'LOW_BATTERY',
          severity: telemetry.bat < 20 ? 'CRITICAL' : 'WARNING',
          status: 'ACTIVE',
          triggerValue: telemetry.bat,
          thresholdValue: 40,
          message: `Device ${telemetry.uid} low battery: ${telemetry.bat}%`,
          triggeredAt: new Date(telemetry.receivedAt).toISOString(),
          isAcknowledged: false,
        });
      }

      if (dynamicAlarms.length > 0) {
        setActiveAlarms((prev) => {
          const merged = [...dynamicAlarms];
          prev.forEach((p) => {
            if (!merged.some((m) => m.id === p.id)) merged.push(p);
          });
          return merged;
        });
        setAlarmStats((prev) => ({
          ...prev,
          totalActive: dynamicAlarms.length,
          criticalCount: dynamicAlarms.filter((a) => a.severity === 'CRITICAL').length,
          warningCount: dynamicAlarms.filter((a) => a.severity === 'WARNING').length,
        }));
      }

      // 2. Dynamic Device registration from UID
      setDevices((prev) => {
        const updatedDevice: Device = {
          id: telemetry.uid,
          uid: telemetry.uid,
          name: `WLI-${telemetry.chno} (${telemetry.trno})`,
          trainNumber: telemetry.trno,
          coachNumber: telemetry.chno,
          isOnline: !telemetry.isStale,
          batteryPercent: telemetry.bat,
          batteryVoltage: Number((3.2 + (telemetry.bat / 100) * 1.0).toFixed(2)),
          temperature: 28.5,
          primaryLevel: arrivalLevelPct ?? telemetry.wlp1,
          secondaryLevel: departureLevelPct ?? telemetry.wlp2,
          lastSeenAt: new Date(telemetry.receivedAt).toISOString(),
          lastHeartbeat: new Date(telemetry.receivedAt).toISOString(),
          hasActiveAlarm: !telemetry.wlv1 || !telemetry.wlv2 || (arrivalLevelPct != null && arrivalLevelPct < 15),
          firmwareVersion: '2.2.0-prod',
          hardwareVersion: 'WLI-EC200U',
        };
        const exists = prev.find((d) => d.uid === telemetry.uid);
        if (exists) {
          return prev.map((d) => (d.uid === telemetry.uid ? updatedDevice : d));
        }
        return [updatedDevice, ...prev];
      });

      // 3. Select train & coach only if not already set to a valid configured train
      setSelectedTrainNumber((prev) => (prev && configuredTrainSetRef.current.has(prev) ? prev : activeTrno));
      setSelectedCoachNumber((prev) => (prev || telemetry.chno));
    });

    return () => {
      unsubMqttStatus();
      unsubMqttFleetSync();
      unsubMqttCentralFleet();
      unsubMqttDeviceSync();
      unsubMqttCentralDevice();
      unsubMqttDeltaSync();
      unsubMqttTelemetry();
      mqttService.disconnect();
    };
  }, []);

  const acknowledgeAlarm = async (alarmId: string, comment?: string) => {
    const ackedBy = currentUser?.username || 'Operator';
    const ackTime = new Date().toISOString();
    alertNotificationService.acknowledgeAlert(alarmId, ackedBy, comment);

    setActiveAlarms((prev) =>
      prev.map((a) =>
        a.id === alarmId
          ? {
              ...a,
              status: 'ACKNOWLEDGED',
              acknowledgedAt: ackTime,
              acknowledged_at: ackTime,
            }
          : a
      )
    );

    try {
      await ApiClient.acknowledgeAlarm(alarmId, comment);
    } catch {
      // Dynamic client-side MQTT alerts may not exist in backend DB yet
    }
  };

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => !prev);
  };

  const handleSetActiveScreen = (screen: ScreenName) => {
    setIsMobileNavOpen(false);
    const hasToken = typeof localStorage !== 'undefined' && Boolean(localStorage.getItem('panorama_token'));
    if (!isAuthenticated && !hasToken && screen !== 'login') {
      setActiveScreen('login');
      AppRouter.navigate('login');
      return;
    }
    const adminOnlyScreens: ScreenName[] = ['users', 'logs'];
    if (adminOnlyScreens.includes(screen) && currentUser?.role !== 'ADMIN') {
      setActiveScreen(screen); // App.tsx will gracefully render AccessDeniedScreen
      AppRouter.navigate(screen);
      return;
    }
    setActiveScreen(screen);
    AppRouter.navigate(screen, selectedTrainNumber, selectedCoachNumber);
  };

  const handleSetSelectedTrainNumber = (trainNum: string) => {
    setSelectedTrainNumber(trainNum);
    if (activeScreen === 'coach-details' || activeScreen === 'coaches') {
      AppRouter.navigate(activeScreen, trainNum, selectedCoachNumber);
    }
  };

  const handleSetSelectedCoachNumber = (coachNum: string) => {
    setSelectedCoachNumber(coachNum);
    if (activeScreen === 'coach-details' || activeScreen === 'coaches') {
      AppRouter.navigate(activeScreen, selectedTrainNumber, coachNum);
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).panoramaNavigate = (screen: ScreenName, train?: string, coach?: string) => {
        if (train) setSelectedTrainNumber(train);
        if (coach) setSelectedCoachNumber(coach);
        setActiveScreen(screen);
        AppRouter.navigate(screen, train || selectedTrainNumber, coach || selectedCoachNumber);
      };
    }
  }, [isAuthenticated, currentUser, selectedTrainNumber, selectedCoachNumber]);

  const login = async (u: string, p: string) => {
    const res = await ApiClient.login(u, p);
    setCurrentUser(res.user);
    setIsAuthenticated(true);
    const parsed = AppRouter.parseCurrentRoute();
    if (parsed.trainNumber) setSelectedTrainNumber(parsed.trainNumber);
    if (parsed.coachNumber) setSelectedCoachNumber(parsed.coachNumber);
    const targetScreen = (parsed.screen && parsed.screen !== 'login' ? parsed.screen : 'dashboard') as ScreenName;
    setActiveScreen(targetScreen);
    AppRouter.navigate(targetScreen, parsed.trainNumber || selectedTrainNumber, parsed.coachNumber || selectedCoachNumber);
    await refreshData();
  };

  const logout = () => {
    if (typeof document !== 'undefined') {
      document.documentElement.style.zoom = '';
      if (document.body) {
        document.body.style.zoom = '';
      }
    }
    ApiClient.logout();
    setIsAuthenticated(false);
    setCurrentUser(null);
    setActiveScreen('login');
    AppRouter.navigate('login');
  };

  const handleAddCoach = async (trainNumber: string, data: CoachFormInput) => {
    const res = await ApiClient.addCoach(trainNumber, data);
    await refreshRegions();
    if (selectedTrainNumber.trim() === trainNumber.trim()) {
      const updated = await ApiClient.fetchTrainConsist(trainNumber.trim()).catch(() => null);
      if (updated) setActiveConsist(updated);
    }
    return res;
  };

  const handleUpdateCoach = async (trainNumber: string, coachNumber: string, data: CoachFormInput) => {
    const res = await ApiClient.updateCoach(trainNumber, coachNumber, data);
    await refreshRegions();
    if (selectedTrainNumber.trim() === trainNumber.trim()) {
      const updated = await ApiClient.fetchTrainConsist(trainNumber.trim()).catch(() => null);
      if (updated) setActiveConsist(updated);
    }
    return res;
  };

  const handleRenameCoach = async (trainNumber: string, oldCoachNumber: string, newCoachNumber: string) => {
    const res = await ApiClient.renameCoach(trainNumber, oldCoachNumber, newCoachNumber);
    await refreshRegions();
    if (selectedCoachNumber.toUpperCase() === oldCoachNumber.trim().toUpperCase()) {
      setSelectedCoachNumber(newCoachNumber.trim().toUpperCase());
    }
    if (selectedTrainNumber.trim() === trainNumber.trim()) {
      const updated = await ApiClient.fetchTrainConsist(trainNumber.trim()).catch(() => null);
      if (updated) setActiveConsist(updated);
    }
    return res;
  };

  const handleDeleteCoach = async (trainNumber: string, coachNumber: string) => {
    alertNotificationService.resolveAlertsForCoach(trainNumber, coachNumber);
    const res = await ApiClient.deleteCoach(trainNumber, coachNumber);
    await refreshRegions();
    if (selectedTrainNumber.trim() === trainNumber.trim()) {
      const updated = await ApiClient.fetchTrainConsist(trainNumber.trim()).catch(() => null);
      if (updated) {
        setActiveConsist(updated);
        if (selectedCoachNumber.toUpperCase() === coachNumber.trim().toUpperCase()) {
          const nextCoach = updated.coaches[0]?.coach_number || '';
          setSelectedCoachNumber(nextCoach);
        }
      }
    }
    return res;
  };

  const handleReorderCoaches = async (trainNumber: string, coachNumbers: string[]) => {
    const res = await ApiClient.reorderCoaches(trainNumber, coachNumbers);
    if (selectedTrainNumber.trim() === trainNumber.trim()) {
      const updated = await ApiClient.fetchTrainConsist(trainNumber.trim()).catch(() => null);
      if (updated) setActiveConsist(updated);
    }
    return res;
  };

  return (
    <AppContext.Provider
      value={{
        activeScreen,
        setActiveScreen: handleSetActiveScreen,
        isAuthenticated,
        authLoading,
        liveTank,
        tanks: consistData.tanks,
        devices,
        managedDevices,
        activeAlarms,
        alarmStats,
        connectionStatus,
        backendApiStatus,
        mqttBrokerStatus,
        mqttConnectionStatus,
        liveTelemetry,
        lastValidGps,
        gpsWaypoints,
        currentTime,
        currentDate,
        currentUser,
        setCurrentUser,
        searchQuery,
        setSearchQuery,
        sidebarCollapsed,
        toggleSidebar,
        isMobileNavOpen,
        setIsMobileNavOpen,
        toggleMobileNav,
        selectedTrainNumber,
        setSelectedTrainNumber: handleSetSelectedTrainNumber,
        selectedCoachNumber,
        setSelectedCoachNumber: handleSetSelectedCoachNumber,
        selectedTankId,
        setSelectedTankId,
        selectedDeviceId,
        setSelectedDeviceId,
        selectedStationCode,
        setSelectedStationCode,
        regions,
        configuredTrains,
        activeConsist,
        displayScale,
        setDisplayScale,
        resetDisplayScale,
        refreshData,
        refreshRegions,
        acknowledgeAlarm,
        login,
        logout,
        consistMetrics: consistData.metrics,
        consistCoaches: consistData.coaches,
        consistTanks: consistData.tanks,
        telemetryTimeoutSeconds: telemetryTimeoutSec,
        setTelemetryTimeoutSeconds: handleSetTelemetryTimeout,
        alertToast,
        dismissAlertToast,
        alertHistory,
        managedAlerts,
        alertConfig,
        updateAlertConfig,
        clearAlertHistory,
        notificationPermission,
        requestNotificationPermission,
        addCoach: handleAddCoach,
        updateCoach: handleUpdateCoach,
        renameCoach: handleRenameCoach,
        deleteCoach: handleDeleteCoach,
        reorderCoaches: handleReorderCoaches,
        syncState,
        lastSyncTime,
        triggerSync: () => syncService.reconcileWithServer(),
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = (): AppContextType => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
