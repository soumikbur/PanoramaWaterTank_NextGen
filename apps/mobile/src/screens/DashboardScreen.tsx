import React from 'react';
import { metrics } from '../theme';
import { useApp } from '../state/AppContext';
import { TankVisualization } from '../components/tank/TankVisualization';
import { LevelTrendCard } from '../components/charts/LevelTrendCard';
import { TankInfoCard } from '../components/dashboard/TankInfoCard';
import { RankIndicator } from '../components/dashboard/RankIndicator';
import { SummaryGrid } from '../components/dashboard/SummaryGrid';

export const DashboardScreen: React.FC = () => {
  const { liveTank, connectionStatus } = useApp();

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-14, 14px)',
        boxSizing: 'border-box',
        width: '100%',
      }}
    >
      {/* SECTION 1: Top 3-Card Row (Responsive Auto-Fit Grid) */}
      <div className="dashboard-main-grid">
        <TankVisualization tank={liveTank} />
        <LevelTrendCard tankId={liveTank?.tankId} />
        <TankInfoCard
          tank={liveTank}
          connectionState={connectionStatus === 'CONNECTED' ? 'Connected' : 'Offline'}
        />
      </div>

      {/* SECTION 2: Water Level Indicator (Rank) Bar */}
      <RankIndicator fillPercentage={liveTank?.levelPercent ?? 0} />

      {/* SECTION 3: Bottom 5-Card Summary Grid */}
      <SummaryGrid tank={liveTank} />
    </div>
  );
};
