import React from 'react';
import { createRoot } from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import './styles/index.css';
import App from './App';
import { nativeBridge } from './services/nativeBridge';

// Initialize Capacitor native subsystems if running on Android/iOS
void nativeBridge.initialize();

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
