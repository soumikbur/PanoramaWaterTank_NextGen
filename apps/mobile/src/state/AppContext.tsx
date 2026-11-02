/**
 * Global Application Context and State Management.
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  TankLiveStatus,
  Device,
  AlarmItem,
  AlarmStats,
  UserProfile,
  RegionSummary
} from '../types';
import { ApiClient } from '../api/client';
import { wsService } from '../services/websocket';

export type ScreenName =
  | 'login'
  | 'dashboard'
  | 'trains'
  | 'watertank'
  | 'devices'
  | 'location'
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
  activeAlarms: AlarmItem[];
  alarmStats: AlarmStats;
  connectionStatus: 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED';
  currentTime: string;
  currentDate: string;
  currentUser: UserProfile | null;
  setCurrentUser: (user: UserProfile | null) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  selectedTrainNumber: string;
  setSelectedTrainNumber: (trainNum: string) => void;
  selectedTankId: string | null;
  setSelectedTankId: (id: string | null) => void;
  selectedDeviceId: string | null;
  setSelectedDeviceId: (id: string | null) => void;
  selectedStationCode: string | null;
  setSelectedStationCode: (code: string | null) => void;
  regions: RegionSummary[];
  refreshData: () => Promise<void>;
  refreshRegions: () => Promise<void>;
  acknowledgeAlarm: (alarmId: string, comment?: string) => Promise<void>;
  login: (u: string, p: string) => Promise<void>;
  logout: () => void;
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
  const [devices, setDevices] = useState<Device[]>([]);
  const [activeAlarms, setActiveAlarms] = useState<AlarmItem[]>([]);
  const [alarmStats, setAlarmStats] = useState<AlarmStats>(defaultStats);
  const [connectionStatus, setConnectionStatus] = useState<'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED'>('DISCONNECTED');
  const [currentTime, setCurrentTime] = useState<string>('');
  const [currentDate, setCurrentDate] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [selectedTrainNumber, setSelectedTrainNumber] = useState<string>('12002');
  const [selectedTankId, setSelectedTankId] = useState<string | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [selectedStationCode, setSelectedStationCode] = useState<string | null>(null);
  const [regions, setRegions] = useState<RegionSummary[]>([]);

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
        setActiveScreen('dashboard');
      } catch (err) {
        console.warn('[AppContext] Stale or invalid session token. Resetting to login:', err);
        ApiClient.logout();
        setIsAuthenticated(false);
        setCurrentUser(null);
        setActiveScreen('login');
      } finally {
        setAuthLoading(false);
      }
    };

    checkAuthSession();
  }, []);

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

  const refreshRegions = async () => {
    try {
      const data = await ApiClient.fetchRegionsSummary();
      setRegions(data);
    } catch (e) {
      console.warn('[AppContext] Error fetching regions:', e);
    }
  };

  // Fetch initial REST data
  const refreshData = async () => {
    try {
      const [tank, allTanks, devList, alarms, stats, regs] = await Promise.all([
        ApiClient.fetchLiveTank().catch(() => null),
        ApiClient.fetchTanks().catch(() => []),
        ApiClient.fetchDevices().catch(() => []),
        ApiClient.fetchAlarms('ACTIVE').catch(() => []),
        ApiClient.fetchAlarmStats().catch(() => defaultStats),
        ApiClient.fetchRegionsSummary().catch(() => []),
      ]);

      if (tank) setLiveTank(tank);
      if (allTanks && allTanks.length > 0) setTanks(allTanks);
      setDevices(devList);
      setActiveAlarms(alarms);
      setAlarmStats(stats);
      if (regs.length > 0) setRegions(regs);
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
      setLiveTank((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          levelPercent: data.primaryLevel ?? prev.levelPercent,
          rawLevelPercent: data.rawLevel ?? prev.rawLevelPercent,
          volumeLiters: data.primaryVolume ?? prev.volumeLiters,
          heightCm: data.primaryHeight ?? prev.heightCm,
          rank: data.primaryRank ?? prev.rank,
          alarmStatus: data.status ?? prev.alarmStatus,
          batteryVoltage: data.batteryVoltage ?? prev.batteryVoltage,
          isOnline: data.isOnline ?? true,
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
              isOnline: data.isOnline ?? true,
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

  const acknowledgeAlarm = async (alarmId: string, comment?: string) => {
    await ApiClient.acknowledgeAlarm(alarmId, comment);
    await refreshData();
  };

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => !prev);
  };

  const handleSetActiveScreen = (screen: ScreenName) => {
    if (!isAuthenticated && screen !== 'login') {
      setActiveScreen('login');
      return;
    }
    const adminOnlyScreens: ScreenName[] = ['settings', 'users', 'logs'];
    if (adminOnlyScreens.includes(screen) && currentUser?.role !== 'ADMIN') {
      alert('Access Restricted: Administrator privileges are required to access this system module.');
      return;
    }
    setActiveScreen(screen);
  };

  const login = async (u: string, p: string) => {
    const res = await ApiClient.login(u, p);
    setCurrentUser(res.user);
    setIsAuthenticated(true);
    setActiveScreen('dashboard');
    await refreshData();
  };

  const logout = () => {
    ApiClient.logout();
    setIsAuthenticated(false);
    setCurrentUser(null);
    setActiveScreen('login');
  };

  return (
    <AppContext.Provider
      value={{
        activeScreen,
        setActiveScreen: handleSetActiveScreen,
        isAuthenticated,
        authLoading,
        liveTank,
        tanks,
        devices,
        activeAlarms,
        alarmStats,
        connectionStatus,
        currentTime,
        currentDate,
        currentUser,
        setCurrentUser,
        searchQuery,
        setSearchQuery,
        sidebarCollapsed,
        toggleSidebar,
        selectedTrainNumber,
        setSelectedTrainNumber,
        selectedTankId,
        setSelectedTankId,
        selectedDeviceId,
        setSelectedDeviceId,
        selectedStationCode,
        setSelectedStationCode,
        regions,
        refreshData,
        refreshRegions,
        acknowledgeAlarm,
        login,
        logout,
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
