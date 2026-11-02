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
        gap: `${metrics.cardSpacing}px`,
        boxSizing: 'border-box',
      }}
    >
      {/* SECTION 1: Top 3-Card Row (Responsive Auto-Fit) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: `${metrics.cardSpacing}px`,
          alignItems: 'stretch',
        }}
      >
        <TankVisualization tank={liveTank} />
        <LevelTrendCard tankId={liveTank?.tankId} />
        <TankInfoCard
          tank={liveTank}
          connectionState={connectionStatus === 'CONNECTED' ? 'Connected' : 'Offline'}
        />
      </div>

      {/* SECTION 2: Water Level Indicator (Rank) Bar (124px height) */}
      <RankIndicator fillPercentage={liveTank?.levelPercent ?? 0} />

      {/* SECTION 3: Bottom 5-Card Summary Grid (122px height) */}
      <SummaryGrid tank={liveTank} />
    </div>
  );
};
