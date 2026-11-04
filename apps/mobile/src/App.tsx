import React from 'react';
import { colors, typography } from './theme';
import { AppProvider, useApp } from './state/AppContext';
import { Header } from './components/common/Header';
import { Sidebar } from './components/common/Sidebar';
import { Footer } from './components/common/Footer';
import { DisplayPreferencesProvider } from './context/DisplayPreferencesContext';
import { AppLayout } from './components/layout/AppLayout';

// Screens
import { LoginScreen } from './screens/LoginScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { TrainManagementScreen } from './screens/TrainManagementScreen';
import { WaterTankScreen } from './screens/WaterTankScreen';
import { DevicesScreen } from './screens/DevicesScreen';
import { LocationScreen } from './screens/LocationScreen';
import { AlertsScreen } from './screens/AlertsScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { ReportsScreen } from './screens/ReportsScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { UsersScreen } from './screens/UsersScreen';
import { LogsScreen } from './screens/LogsScreen';

const MainContent: React.FC = () => {
  const { activeScreen } = useApp();

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
        style={{
          flex: 1,
          padding: '16px',
          overflowY: 'auto',
          backgroundColor: colors.background,
          boxSizing: 'border-box',
        }}
      >
        {activeScreen === 'trains' && <TrainManagementScreen />}
        {activeScreen === 'dashboard' && <DashboardScreen />}
        {activeScreen === 'watertank' && <WaterTankScreen />}
        {activeScreen === 'devices' && <DevicesScreen />}
        {activeScreen === 'location' && <LocationScreen />}
        {activeScreen === 'alerts' && <AlertsScreen />}
        {activeScreen === 'history' && <HistoryScreen />}
        {activeScreen === 'reports' && <ReportsScreen />}
        {activeScreen === 'settings' && <SettingsScreen />}
        {activeScreen === 'users' && <UsersScreen />}
        {activeScreen === 'logs' && <LogsScreen />}
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
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
};

export default App;
