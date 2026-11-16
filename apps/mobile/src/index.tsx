import React from 'react';
import { createRoot } from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import './styles/index.css';
import './styles/capacitor-android-adaptive.css';
import App from './App';
import { nativeBridge } from './services/nativeBridge';
import { adaptiveUiService } from './services/adaptiveUiService';
import { alertNotificationService } from './services/alertNotificationService';
import { ApiClient } from './api/client';
import { localFleetStore } from './services/localFleetStore';
import { deviceRegistry } from './services/deviceRegistry';
import { Logger } from './services/logger';
import { wsService } from './services/websocket';

// Expose services for automated verification scripts and SCADA diagnostic instrumentation
if (typeof window !== 'undefined') {
  (window as any).alertNotificationService = alertNotificationService;
  (window as any).nativeBridge = nativeBridge;
  (window as any).adaptiveUiService = adaptiveUiService;
  (window as any).__testModules = {
    alertNotificationService,
    nativeBridge,
    adaptiveUiService,
    ApiClient,
    localFleetStore,
    deviceRegistry,
    Logger,
    wsService,
  };
}

// Initialize Capacitor native subsystems and adaptive UI scaling if running on Android/iOS
void nativeBridge.initialize();
adaptiveUiService.initialize();

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
