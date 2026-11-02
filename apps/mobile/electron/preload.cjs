/**
 * Electron Preload Script with Context Isolation.
 * Exposes a minimal, secure API surface to the renderer process.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
  getVersion: () => ipcRenderer.invoke('app:version'),
  getBackendStatus: () => ipcRenderer.invoke('backend:status'),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  restartBackend: () => ipcRenderer.invoke('backend:restart'),
});

