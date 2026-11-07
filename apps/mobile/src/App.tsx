import React from 'react';
import { colors, typography } from './theme';
import { AppProvider, useApp } from './state/AppContext';
import { Header } from './components/common/Header';
import { Sidebar } from './components/common/Sidebar';
import { Footer } from './components/common/Footer';
import { DisplayPreferencesProvider } from './context/DisplayPreferencesContext';
import { AppLayout } from './components/layout/AppLayout';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { ShieldAlert } from 'lucide-react';

// Screens
import { LoginScreen } from './screens/LoginScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { EmployeeDashboard } from './screens/EmployeeDashboard';
import { TrainManagementScreen } from './screens/TrainManagementScreen';
import { CoachManagementScreen } from './screens/CoachManagementScreen';
import { CoachDetailsScreen } from './screens/CoachDetailsScreen';
import { WaterTankScreen } from './screens/WaterTankScreen';
import { DeviceMappingScreen } from './screens/DeviceMappingScreen';
import { LocationScreen } from './screens/LocationScreen';
import { MonitoringScreen } from './screens/MonitoringScreen';
import { AlertsScreen } from './screens/AlertsScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { ReportsScreen } from './screens/ReportsScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { UsersScreen } from './screens/UsersScreen';
import { LogsScreen } from './screens/LogsScreen';

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
  const { activeScreen, currentUser } = useApp();
  const isAdmin = currentUser?.role === 'ADMIN';

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
          {activeScreen === 'trains' && <TrainManagementScreen />}
          {activeScreen === 'coaches' && <CoachManagementScreen />}
          {activeScreen === 'coach-details' && <CoachDetailsScreen />}
          {activeScreen === 'dashboard' && <EmployeeDashboard />}
          {activeScreen === 'watertank' && <WaterTankScreen />}
          {activeScreen === 'devices' && <DeviceMappingScreen />}
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
  const { isAuthenticated, authLoading, activeScreen, currentUser } = useApp();

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
