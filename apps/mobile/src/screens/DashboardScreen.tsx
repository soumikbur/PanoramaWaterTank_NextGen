import React from 'react';
import { EmployeeDashboard } from './EmployeeDashboard';

/**
 * Dedicated SCADA Dashboard Screen for Panorama Water Tank Monitor.
 * Displays Active Train Summary, Coach Consist, Dual Water Tanks,
 * Telemetry Stream, GPS Tracking, and Diagnostic Trends.
 */
export const DashboardScreen: React.FC = () => {
  return <EmployeeDashboard />;
};

export default DashboardScreen;
