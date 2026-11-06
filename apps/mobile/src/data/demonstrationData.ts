/**
 * Isolated Demonstration Structure for Employee Panel.
 * Demonstrates: 1 Railway Region, 1 Train, 1 Coach, 1 Device, 2 Water Tanks.
 * Strictly flagged as demonstration data to avoid cognitive confusion with live telemetry.
 */

import { TrainOverviewItem, TankLiveStatus, Device } from '../types';

export interface DemoCoach {
  coachNumber: string;
  coachType: string;
  deviceId: string;
  deviceStatus: 'Online' | 'Offline' | 'Warning';
  batteryPercent: number;
  arrivalTankLevel: number;
  arrivalHeightCm: number;
  departureTankLevel: number;
  departureHeightCm: number;
  isDemo?: boolean;
}

export interface DemoTrain {
  trainNumber: string;
  name: string;
  source: string;
  destination: string;
  region: string;
  operationalStatus: 'Running' | 'Scheduled' | 'Depot' | 'Maintenance';
  latitude: number;
  longitude: number;
  speedKmh: number;
  nearestStation: string;
  lastUpdate: string;
  coaches: DemoCoach[];
  isDemo: true;
}

export const DEMO_TRAIN: DemoTrain = {
  trainNumber: '12841',
  name: 'Coromandel Express',
  source: 'Chennai Central (MAS)',
  destination: 'Howrah Junction (HWH)',
  region: 'South East',
  operationalStatus: 'Running',
  latitude: 13.0827,
  longitude: 80.2707,
  speedKmh: 78.5,
  nearestStation: 'Chennai Central',
  lastUpdate: new Date().toISOString(),
  isDemo: true,
  coaches: [
    {
      coachNumber: 'C4',
      coachType: 'AC Chair Car',
      deviceId: 'Device-1',
      deviceStatus: 'Online',
      batteryPercent: 88,
      arrivalTankLevel: 75.0,
      arrivalHeightCm: 37.5,
      departureTankLevel: 68.0,
      departureHeightCm: 34.0,
      isDemo: true,
    },
  ],
};

export const DEMO_DEVICE: Device = {
  id: 'demo-dev-1',
  uid: 'Device-1',
  name: 'Device-1 (Coromandel C4)',
  trainNumber: '12841',
  coachNumber: 'C4',
  isOnline: true,
  batteryVoltage: 3.92,
  batteryPercent: 88,
  temperature: 28.4,
  firmwareVersion: '2.2.0-demo',
  hardwareVersion: 'WLI-RevB',
  primaryLevel: 75.0,
  secondaryLevel: 68.0,
  hasActiveAlarm: false,
  lastSeenAt: '2026-11-06T12:00:00Z',
  lastHeartbeat: new Date().toISOString(),
};

export const DEMO_ARRIVAL_TANK: TankLiveStatus = {
  tankId: 'demo-tank-arrival',
  tankIndex: 1,
  deviceId: 'demo-dev-1',
  deviceUid: 'Device-1',
  trainNumber: '12841',
  coachNumber: 'C4',
  tankName: 'Arrival Tank',
  capacityLiters: 20.0,
  maxHeightCm: 50.0,
  crossSectionalAreaM2: 0.04,
  levelPercent: 75.0,
  rawLevelPercent: 75.0,
  volumeLiters: 15.0,
  heightCm: 37.5,
  rank: 'GOOD',
  alarmStatus: 'NORMAL',
  batteryVoltage: 3.92,
  temperature: 28.4,
  latitude: 13.0827,
  longitude: 80.2707,
  isOnline: true,
  hasTelemetry: true,
  isStale: false,
  lastUpdate: new Date().toISOString(),
};

export const DEMO_DEPARTURE_TANK: TankLiveStatus = {
  tankId: 'demo-tank-departure',
  tankIndex: 2,
  deviceId: 'demo-dev-1',
  deviceUid: 'Device-1',
  trainNumber: '12841',
  coachNumber: 'C4',
  tankName: 'Departure Tank',
  capacityLiters: 20.0,
  maxHeightCm: 50.0,
  crossSectionalAreaM2: 0.04,
  levelPercent: 68.0,
  rawLevelPercent: 68.0,
  volumeLiters: 13.6,
  heightCm: 34.0,
  rank: 'GOOD',
  alarmStatus: 'NORMAL',
  batteryVoltage: 3.92,
  temperature: 28.4,
  latitude: 13.0827,
  longitude: 80.2707,
  isOnline: true,
  hasTelemetry: true,
  isStale: false,
  lastUpdate: new Date().toISOString(),
};
