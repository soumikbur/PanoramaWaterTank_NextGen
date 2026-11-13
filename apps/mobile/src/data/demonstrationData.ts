/**
 * DEPRECATED: Demonstration data has been completely eliminated in favor of
 * live MQTT telemetry on topic 0023004D4B42501120353332.
 * This file is retained as an empty type-compatible stub.
 */

import { TrainOverviewItem, TankLiveStatus, Device } from '../types';

export interface DemoCoach {
  coachNumber: string;
  coachType: string;
  deviceId: string;
  deviceStatus: 'Online' | 'Offline';
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
  operationalStatus: string;
  latitude: number;
  longitude: number;
  speedKmh: number;
  nearestStation: string;
  lastUpdate: string;
  coaches: DemoCoach[];
  isDemo?: boolean;
}
