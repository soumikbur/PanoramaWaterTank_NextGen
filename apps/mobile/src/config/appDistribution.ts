// Centralized Application Distribution & Version Management Configuration
// Panorama Water Tank Monitor SCADA Platform

export interface AppDistributionConfig {
  appName: string;
  version: string;
  versionCode: number;
  releaseDate: string;
  minAndroidVersion: string;
  targetAndroidVersion: string;
  framework: string;
  apkFileName: string;
  apkRelativeUrl: string;
  apkSizeMb: number;
  apkSizeFormatted: string;
  gitHubReleaseUrl: string;
  releaseNotes: string[];
  features: string[];
}

export const APP_DISTRIBUTION: AppDistributionConfig = {
  appName: 'Panorama Water Tank Monitor',
  version: 'v1.0.0',
  versionCode: 100,
  releaseDate: 'November 2026',
  minAndroidVersion: 'Android 8.0 (API 26) or higher',
  targetAndroidVersion: 'Android 15 (API 35)',
  framework: 'Capacitor 6 + React 18',
  apkFileName: 'panorama-water-tank-monitor.apk',
  apkRelativeUrl: './downloads/panorama-water-tank-monitor.apk',
  apkSizeMb: 26.43,
  apkSizeFormatted: '26.43 MB',
  gitHubReleaseUrl: 'https://github.com/panorama-scada/water-tank-monitor/releases/tag/v1.0.0',
  releaseNotes: [
    'Official production release for Indian Railways coach water level telemetry.',
    'Multi-train live GIS map tracking with online/offline state indicators.',
    'Direct MQTT broker telemetry subscription over TLS with auto-failover.',
    'Offline-first SQLite local fleet cache with automatic cloud synchronization.',
    'Integrated Coach Editing & Consist Editor with admin authorization.'
  ],
  features: [
    'Real-time Tank 1 & Tank 2 Level Monitoring (Liters & %)',
    'Full Consist & Coach Editing (Add, Edit, Rename, Reorder)',
    'Multi-Train Live Map Tracking with Offline Fallback',
    'Audible & Visual Push Alerts for Critical Water Depletion',
    'Hardware Modem & Sensor Fault Diagnostics'
  ]
};

