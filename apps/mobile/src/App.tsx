import React, { useEffect, useRef } from 'react';
import { colors, typography } from './theme';
import { AppProvider, useApp } from './state/AppContext';
import { Header } from './components/common/Header';
import { Sidebar } from './components/common/Sidebar';
import { Footer } from './components/common/Footer';
import { DisplayPreferencesProvider } from './context/DisplayPreferencesContext';
import { AppLayout } from './components/layout/AppLayout';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { AlertToastBanner } from './components/common/AlertToastBanner';
import { ActiveAlertBanner } from './components/common/ActiveAlertBanner';
import { isNativeCapacitorApp } from './services/nativeBridge';
import { ShieldAlert } from 'lucide-react';

// Screens
import { LoginScreen } from './screens/LoginScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { TrainManagementScreen } from './screens/TrainManagementScreen';
import { CoachManagementScreen } from './screens/CoachManagementScreen';
import { CoachDetailsScreen } from './screens/CoachDetailsScreen';
import { WaterTankScreen } from './screens/WaterTankScreen';
import { DevicesScreen } from './screens/DevicesScreen';
import { DeviceMappingScreen } from './screens/DeviceMappingScreen';
import { LocationScreen } from './screens/LocationScreen';
import { MonitoringScreen } from './screens/MonitoringScreen';
import { AlertsScreen } from './screens/AlertsScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { ReportsScreen } from './screens/ReportsScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { UsersScreen } from './screens/UsersScreen';
import { LogsScreen } from './screens/LogsScreen';
import { MqttMonitorScreen } from './screens/MqttMonitorScreen';

const AccessDeniedScreen: React.FC = () => {
  const { setActiveScreen } = useApp();
  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '8px',
        border: '1px solid #FECACA',
        padding: '40px 20px',
        textAlign: 'center',
        maxWidth: '500px',
        margin: '60px auto',
        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
      }}
    >
      <div
        style={{
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          backgroundColor: '#FEE2E2',
          color: '#DC2626',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 16px auto',
        }}
      >
        <ShieldAlert size={26} />
      </div>
      <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: '0 0 8px 0' }}>
        Access Restricted
      </h2>
      <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 20px 0', lineHeight: 1.5 }}>
        Administrator privileges are required to access this system configuration module. Your Employee session is logged and restricted to operational fleet commands.
      </p>
      <button
        onClick={() => setActiveScreen('dashboard')}
        style={{
          padding: '8px 18px',
          backgroundColor: '#2563EB',
          color: '#FFFFFF',
          border: 'none',
          borderRadius: '6px',
          fontSize: '12px',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Return to Dashboard
      </button>
    </div>
  );
};

const MainContent: React.FC = () => {
  const { activeScreen, setActiveScreen, currentUser } = useApp();
  const storedRole = typeof window !== 'undefined' ? (() => {
    try {
      return JSON.parse(localStorage.getItem('panorama_demo_user') || '{}')?.role ||
             localStorage.getItem('panorama_user_role') ||
             JSON.parse(localStorage.getItem('panorama_user') || '{}')?.role;
    } catch {
      return '';
    }
  })() : '';
  const effectiveRole = currentUser?.role || storedRole || '';
  const isAdmin = String(effectiveRole).toUpperCase() === 'ADMIN';

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        backgroundColor: colors.background,
      }}
    >
      <main
        key={activeScreen}
        className='page-transition'
        style={{
          flex: 1,
          padding: '16px 16px 36px 16px',
          overflowY: 'auto',
          backgroundColor: colors.background,
          boxSizing: 'border-box',
        }}
      >
        <ErrorBoundary fallbackTitle="Screen Error" onReset={() => setActiveScreen('dashboard')}>
          {activeScreen === 'dashboard' && <DashboardScreen />}
          {activeScreen === 'trains' && <TrainManagementScreen />}
          {activeScreen === 'coaches' && <CoachManagementScreen />}
          {activeScreen === 'coach-details' && <CoachDetailsScreen />}
          {activeScreen === 'watertank' && <WaterTankScreen />}
          {activeScreen === 'devices' && <DevicesScreen />}
          {activeScreen === 'device-mapping' && <DeviceMappingScreen />}
          {(activeScreen === 'raw-data' || activeScreen === 'mqtt-monitor') && (isAdmin ? <MqttMonitorScreen /> : <AccessDeniedScreen />)}
          {activeScreen === 'location' && <LocationScreen />}
          {activeScreen === 'monitoring' && <MonitoringScreen />}
          {activeScreen === 'alerts' && <AlertsScreen />}
          {activeScreen === 'history' && <HistoryScreen />}
          {activeScreen === 'reports' && <ReportsScreen />}
          {activeScreen === 'settings' && <SettingsScreen />}
          {activeScreen === 'users' && (isAdmin ? <UsersScreen /> : <AccessDeniedScreen />)}
          {activeScreen === 'logs' && (isAdmin ? <LogsScreen /> : <AccessDeniedScreen />)}
        </ErrorBoundary>
      </main>
      <Footer />
    </div>
  );
};

const AppShell: React.FC = () => {
  const {
    isAuthenticated,
    authLoading,
    activeScreen,
    setActiveScreen,
    currentUser,
    alertToast,
    dismissAlertToast,
    acknowledgeAlarm,
    isMobileNavOpen,
    setIsMobileNavOpen,
  } = useApp();

  const isMobileNavOpenRef = useRef(isMobileNavOpen);
  isMobileNavOpenRef.current = isMobileNavOpen;

  const activeScreenRef = useRef(activeScreen);
  activeScreenRef.current = activeScreen;

  const screenHistoryRef = useRef<string[]>(['dashboard']);
  const isBackNavigatingRef = useRef(false);

  // Synchronize navigation history stack
  useEffect(() => {
    if (!isAuthenticated || activeScreen === 'login') {
      screenHistoryRef.current = ['login'];
      return;
    }
    if (!isBackNavigatingRef.current) {
      const hist = screenHistoryRef.current;
      if (hist.length === 0 || hist[hist.length - 1] !== activeScreen) {
        screenHistoryRef.current = [...hist, activeScreen];
      }
    }
    isBackNavigatingRef.current = false;
  }, [activeScreen, isAuthenticated]);

  // Android Hardware Back Button listener (dispatched from nativeBridge)
  useEffect(() => {
    const handleHardwareBack = () => {
      // Priority 0: If unauthenticated or on login screen, immediately exit application
      if (!isAuthenticated || activeScreenRef.current === 'login') {
        const AppPlugin = (window as any).Capacitor?.Plugins?.App;
        if (AppPlugin && typeof AppPlugin.exitApp === 'function') {
          AppPlugin.exitApp();
        }
        return;
      }

      // Priority 1: If mobile navigation drawer is open, close it first without navigating screens
      if (isMobileNavOpenRef.current) {
        setIsMobileNavOpen(false);
        return;
      }

      // Priority 2: Close any open popups, search overlays, or dialogs
      const dismissEvent = new CustomEvent('panorama:dismiss_popups', { cancelable: true });
      window.dispatchEvent(dismissEvent);
      if (dismissEvent.defaultPrevented) {
        return;
      }

      // Priority 3: Return to previous screen in history stack
      if (screenHistoryRef.current.length > 1) {
        screenHistoryRef.current.pop(); // Remove current screen
        const prev = screenHistoryRef.current[screenHistoryRef.current.length - 1];
        if (prev && prev !== 'login') {
          isBackNavigatingRef.current = true;
          setActiveScreen(prev as any);
          return;
        }
      }

      // Priority 4: Return to dashboard if not already on dashboard
      if (activeScreenRef.current !== 'dashboard') {
        isBackNavigatingRef.current = true;
        setActiveScreen('dashboard');
        return;
      }

      // Priority 5: If on dashboard with no open drawer/dialogs, exit application
      const AppPlugin = (window as any).Capacitor?.Plugins?.App;
      if (AppPlugin && typeof AppPlugin.exitApp === 'function') {
        AppPlugin.exitApp();
      }
    };

    window.addEventListener('panorama:hardware_back', handleHardwareBack);
    return () => {
      window.removeEventListener('panorama:hardware_back', handleHardwareBack);
    };
  }, [setIsMobileNavOpen, setActiveScreen, isAuthenticated]);

  if (authLoading) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          width: '100vw',
          backgroundColor: colors.background,
          fontFamily: typography.fontFamily,
          color: colors.textSecondary,
          fontSize: '13px',
          gap: '12px',
        }}
      >
        <div
          style={{
            width: '32px',
            height: '32px',
            border: `3px solid ${colors.borderStrong}`,
            borderTopColor: colors.primary,
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        <div>Initializing Panorama SCADA Console...</div>
      </div>
    );
  }

  if (!isAuthenticated || activeScreen === 'login') {
    return <LoginScreen />;
  }

  return (
    <DisplayPreferencesProvider activeUsername={currentUser?.username}>
      <AppLayout>
        {/* On desktop browsers, retain alert banner reminders; on mobile and native apps, notifications are delivered natively */}
        {!isNativeCapacitorApp() && (
          <div className="hide-on-mobile">
            <AlertToastBanner
              toast={alertToast}
              onDismiss={dismissAlertToast}
              onViewAlerts={() => setActiveScreen('alerts')}
              onAcknowledge={(id) => void acknowledgeAlarm(id, 'Acknowledged from alert banner')}
            />
            <ActiveAlertBanner />
          </div>
        )}
        <Header />
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <Sidebar />
          <MainContent />
        </div>
      </AppLayout>
    </DisplayPreferencesProvider>
  );
};

export const App: React.FC = () => {
  return (
    <ErrorBoundary fallbackTitle="Application Initialization Error">
      <AppProvider>
        <AppShell />
      </AppProvider>
    </ErrorBoundary>
  );
};

export default App;
