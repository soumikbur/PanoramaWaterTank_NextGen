/**
 * Global Application Context and State Management.
 */

import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import {
  TankLiveStatus,
  Device,
  AlarmItem,
  AlarmStats,
  UserProfile,
  RegionSummary,
  LiveTelemetryPayload,
  MqttConnectionStatus
} from '../types';
import { ApiClient } from '../api/client';
import { wsService } from '../services/websocket';
import { mqttService } from '../services/mqttService';
import { DisplayPreferencesService, ScalePreset } from '../services/displayPreferencesService';
import { AppRouter } from '../services/router';
import { deviceRegistry, ManagedDevice } from '../services/deviceRegistry';
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
} from '../services/alertNotificationService';

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
  connectionStatus: 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED';
  mqttBrokerStatus: 'CONNECTED' | 'DISCONNECTED' | 'UNKNOWN';
  mqttConnectionStatus: MqttConnectionStatus;
  liveTelemetry: LiveTelemetryPayload | null;
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
  alertConfig: AlertConfig;
  updateAlertConfig: (cfg: Partial<AlertConfig>) => void;
  clearAlertHistory: () => Promise<void>;
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
  const [connectionStatus, setConnectionStatus] = useState<'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED'>('DISCONNECTED');
  const [mqttBrokerStatus, setMqttBrokerStatus] = useState<'CONNECTED' | 'DISCONNECTED' | 'UNKNOWN'>('UNKNOWN');
  const [mqttConnectionStatus, setMqttConnectionStatus] = useState<MqttConnectionStatus>('DISCONNECTED');
  const [liveTelemetry, setLiveTelemetry] = useState<LiveTelemetryPayload | null>(null);
  const [currentTime, setCurrentTime] = useState<string>('');
  const [currentDate, setCurrentDate] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState<boolean>(false);
  const toggleMobileNav = () => setIsMobileNavOpen((prev) => !prev);
  const [selectedTrainNumber, setSelectedTrainNumber] = useState<string>('225256');
  const [selectedCoachNumber, setSelectedCoachNumber] = useState<string>('CR123456');
  const [selectedTankId, setSelectedTankId] = useState<string | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [selectedStationCode, setSelectedStationCode] = useState<string | null>(null);
  const [regions, setRegions] = useState<RegionSummary[]>([]);

  const [telemetryTimeoutSec, setTelemetryTimeoutSec] = useState<number>(() => getTelemetryTimeoutSeconds());
  const [telemetryTick, setTelemetryTick] = useState<number>(0);

  const [alertToast, setAlertToast] = useState<AlertToast | null>(null);
  const [alertHistory, setAlertHistory] = useState<AlertHistoryEntry[]>(() => alertNotificationService.getHistory());
  const [alertConfig, setAlertConfigState] = useState<AlertConfig>(() => alertNotificationService.getConfig());

  useEffect(() => {
    const unsub = alertNotificationService.onToast((toast) => {
      setAlertToast(toast);
      setAlertHistory(alertNotificationService.getHistory());
    });
    return unsub;
  }, []);

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

  const consistData = useMemo(() => {
    return computeConsistData({
      trainNumber: selectedTrainNumber || '225256',
      totalCoaches: 24,
      managedDevices,
      liveTelemetry,
      mqttStatus: mqttConnectionStatus,
      timeoutSeconds: telemetryTimeoutSec,
      now: Date.now(),
    });
  }, [selectedTrainNumber, managedDevices, liveTelemetry, mqttConnectionStatus, telemetryTimeoutSec, telemetryTick]);

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
    const checkAuthSession = async () => {
      const token = localStorage.getItem('panorama_token');
      if (!token) {
        setIsAuthenticated(false);
        setCurrentUser(null);
        setActiveScreen('login');
        setAuthLoading(false);
        return;
      }

      try {
        const user = await ApiClient.fetchCurrentUser();
        setCurrentUser(user);
        setIsAuthenticated(true);
        const parsed = AppRouter.parseCurrentRoute();
        if (parsed.trainNumber) setSelectedTrainNumber(parsed.trainNumber);
        if (parsed.coachNumber) setSelectedCoachNumber(parsed.coachNumber);
        const targetScreen = (parsed.screen && parsed.screen !== 'login' ? parsed.screen : 'dashboard') as ScreenName;
        setActiveScreen(targetScreen);
        AppRouter.navigate(targetScreen, parsed.trainNumber || selectedTrainNumber, parsed.coachNumber || selectedCoachNumber);
      } catch (err) {
        console.warn('[AppContext] Stale or invalid session token. Resetting to login:', err);
        ApiClient.logout();
        setIsAuthenticated(false);
        setCurrentUser(null);
        setActiveScreen('login');
        AppRouter.navigate('login');
      } finally {
        setAuthLoading(false);
      }
    };

    checkAuthSession();
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

    window.addEventListener('hashchange', handleUrlChange);
    window.addEventListener('popstate', handleUrlChange);
    return () => {
      window.removeEventListener('hashchange', handleUrlChange);
      window.removeEventListener('popstate', handleUrlChange);
    };
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
      setRegions(Array.isArray(data) ? data : []);
    } catch (e) {
      console.warn('[AppContext] Error fetching regions:', e);
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
        ApiClient.fetchRegionsSummary().catch(() => []),
        ApiClient.fetchHealth().catch(() => null),
      ]);

      if (tank) setLiveTank(tank);
      if (allTanks && allTanks.length > 0) setTanks(allTanks);
      setDevices(devList);
      setActiveAlarms(alarms);
      setAlarmStats(stats);
      if (Array.isArray(regs) && regs.length > 0) setRegions(regs);
      if (health?.mqttBroker) {
        setMqttBrokerStatus(health.mqttBroker === 'CONNECTED' ? 'CONNECTED' : 'DISCONNECTED');
      }
    } catch (e) {
      console.warn('[AppContext] Error refreshing data:', e);
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

  // Setup WebSocket stream
  useEffect(() => {
    wsService.connect();

    const unsubStatus = wsService.onStatusChange((status) => {
      setConnectionStatus(status);
    });

    const unsubTelemetry = wsService.addEventListener('TELEMETRY_UPDATE', (data: any) => {
      setMqttBrokerStatus('CONNECTED');
      setLiveTank((prev) => {
        const base = prev || {
          tankId: data.tankId || 'primary-tank',
          deviceId: data.deviceId || '',
          deviceUid: data.deviceUid || 'DEV-WLI-01',
          trainNumber: data.trainNumber || '12002',
          coachNumber: data.coachNumber || 'C1',
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
    });

    const unsubAlarmTriggered = wsService.addEventListener('ALARM_TRIGGERED', () => {
      refreshData();
    });

    const unsubAlarmResolved = wsService.addEventListener('ALARM_RESOLVED', () => {
      refreshData();
    });

    return () => {
      unsubStatus();
      unsubTelemetry();
      unsubAlarmTriggered();
      unsubAlarmResolved();
      wsService.disconnect();
    };
  }, []);

  // Setup Live MQTT Client stream (Topic: 0023004D4B42501120353332)
  useEffect(() => {
    mqttService.connect();

    const unsubMqttStatus = mqttService.onStatusChange((st) => {
      setMqttConnectionStatus(st);
      if (st === 'CONNECTED') {
        setConnectionStatus('CONNECTED');
        setMqttBrokerStatus('CONNECTED');
      } else if (st === 'CONNECTING') {
        setConnectionStatus('RECONNECTING');
      } else if (st === 'DISCONNECTED') {
        setMqttBrokerStatus('DISCONNECTED');
      }
    });

    const unsubMqttTelemetry = mqttService.onTelemetry((telemetry) => {
      setLiveTelemetry(telemetry);
      setMqttBrokerStatus('CONNECTED');
      setConnectionStatus('CONNECTED');

      // Record / update discovered device in registry without duplicates
      deviceRegistry.recordDiscoveredDevice(telemetry);
      const mappedDev = deviceRegistry.getDeviceByUid(telemetry.uid);
      const activeTrno = mappedDev?.trainNumber || telemetry.trno;
      const activeChno = mappedDev?.coachNumber || telemetry.chno;

      // 1. Calculate water level percentages based on configured maximum height (150 cm)
      const configuredMaxHeightCm = 150.0;
      const arrivalLevelPct = telemetry.cm1 != null && configuredMaxHeightCm > 0
        ? Number(Math.min(100, Math.max(0, (telemetry.cm1 / configuredMaxHeightCm) * 100)).toFixed(1))
        : (telemetry.wlp1 != null ? Number(telemetry.wlp1.toFixed(1)) : null);

      const departureLevelPct = telemetry.cm2 != null && configuredMaxHeightCm > 0
        ? Number(Math.min(100, Math.max(0, (telemetry.cm2 / configuredMaxHeightCm) * 100)).toFixed(1))
        : (telemetry.wlp2 != null ? Number(telemetry.wlp2.toFixed(1)) : null);

      const arrivalVolume = arrivalLevelPct != null ? Number(((arrivalLevelPct / 100) * 500).toFixed(1)) : null;
      const departureVolume = departureLevelPct != null ? Number(((departureLevelPct / 100) * 500).toFixed(1)) : null;

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
        capacityLiters: 500,
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
        capacityLiters: 500,
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
        coachNumber: activeChno,
        levelPercent: arrivalLevelPct,
        isOnline: arrivalTank.isOnline,
      });
      alertNotificationService.evaluateWaterLevel({
        tankId: departureTank.tankId,
        coachNumber: activeChno,
        levelPercent: departureLevelPct,
        isOnline: departureTank.isOnline,
      });
      alertNotificationService.evaluateDeviceConnectivity({
        deviceId: telemetry.uid,
        coachNumber: activeChno,
        isOnline: !telemetry.isStale,
      });
      alertNotificationService.evaluateSensorHealth({
        sensorId: `s1-${telemetry.uid}`,
        coachNumber: activeChno,
        isValid: !!telemetry.wlv1,
        sensorName: 'Arrival Sensor 1',
      });
      alertNotificationService.evaluateSensorHealth({
        sensorId: `s2-${telemetry.uid}`,
        coachNumber: activeChno,
        isValid: !!telemetry.wlv2,
        sensorName: 'Departure Sensor 2',
      });
      alertNotificationService.evaluateModemStatus({
        deviceId: telemetry.uid,
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

      // 3. Dynamic train & coach selection
      setSelectedTrainNumber((prev) => (!prev || prev === '12841' ? telemetry.trno : prev));
      setSelectedCoachNumber((prev) => (!prev || prev === 'C4' ? telemetry.chno : prev));
    });

    return () => {
      unsubMqttStatus();
      unsubMqttTelemetry();
      mqttService.disconnect();
    };
  }, []);

  const acknowledgeAlarm = async (alarmId: string, comment?: string) => {
    await ApiClient.acknowledgeAlarm(alarmId, comment);
    await refreshData();
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
        mqttBrokerStatus,
        mqttConnectionStatus,
        liveTelemetry,
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
        alertConfig,
        updateAlertConfig,
        clearAlertHistory,
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
