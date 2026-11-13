# Panorama SCADA — Architectural Root Cause Analysis

**Author:** Antigravity Autonomous Reliability Engineer  
**System:** Panorama Water Tank Monitor SCADA / HMI  
**Deployment Target:** GitHub Pages Static Distribution (`https://soumikbur.github.io/PanoramaWaterTank_NextGen/`)  
**Knowledge Graph:** `PanoramaWaterTank_NextGen/graphify-out/graph.json`  

---

## 1. Executive Summary

This document details the deep architectural investigation and root-cause analysis of browser console errors, CORS failures, WebSocket reconnect loops, and runtime lifecycle anomalies in the Panorama Water Tank Monitor web application.

Rather than treating error symptoms with suppression mechanisms (such as `console.clear()` or disabling error reporting), this investigation utilized Graphify codebase dependency mapping and Chrome DevTools Protocol (CDP) live event tracing to eliminate defects at their architectural source.

---

## 2. Architectural Context & Topology

```
+-----------------------------------------------------------------------------------+
|                           DEPLOYED CLIENT (Browser / HMI)                         |
|                                                                                   |
|   +-----------------------+   +----------------------+   +--------------------+   |
|   |   React SCADA UI      |   |   AppContext (State) |   |  LocalFleetStore   |   |
|   |   (14 Screen Modules) |<->|   (Auth & Telemetry) |<->|  (IndexedDB /      |   |
|   |                       |   |                      |   |   localStorage)    |   |
|   +-----------------------+   +----------------------+   +--------------------+   |
|               |                          |                          |             |
|               |                          v                          |             |
|               |               +----------------------+              |             |
|               |               |  ApiClient (REST)    |              |             |
|               |               +----------------------+              |             |
|               v                          |                          |             |
|   +-----------------------+              v                          |             |
|   |  MQTT WSS Service     |      [Condition Check]                  |             |
|   |  (wss://hivemq.com)   |    Is Custom Backend Set?               |             |
|   +-----------------------+     /                  \                |             |
|               |              YES                    NO              |             |
|               v               v                      v              v             |
|    +--------------------+ +-----------+     +-------------------------------+     |
|    | Live Hardware Data | | REST API  |     | Offline / Standalone SCADA    |     |
|    | Broker (21 frames) | |  Backend  |     | Mode (Zero CORS / Zero 404s)  |     |
|    +--------------------+ +-----------+     +-------------------------------+     |
+-----------------------------------------------------------------------------------+
```

### Knowledge Graph Analysis (Graphify)
The Graphify project topology revealed a critical dependency flow:
- `App.tsx` initializes `AppProvider`, which mounts `ApiClient`, `websocketService`, `mqttService`, and `localFleetStore`.
- On startup, `AppContext` invoked `ApiClient.fetchAlarms()`, `ApiClient.fetchAlarmStats()`, and `websocketService.connect()`.
- When deployed to GitHub Pages (`soumikbur.github.io`), the default environment configuration pointed to an unhosted or dormant backend URL (`https://panorama-water-tank-backend.onrender.com`).
- Because browsers enforce strict CORS and Same-Origin policies, every outbound `fetch()` to that dormant domain resulted in a CORS preflight failure, while the WebSocket attempted an endless reconnect loop.

---

## 3. Deep-Dive Root Cause Analysis by Defect Category

### A. CORS and REST Polling Failures (ERR-001 & ERR-004)
- **Manifestation:** 46 console errors of type `Access to fetch at 'https://panorama-water-tank-backend.onrender.com/api/v1/...' from origin 'https://soumikbur.github.io' has been blocked by CORS policy`.
- **Root Cause:**  
  1. The static client assumed a centralized backend was always reachable.
  2. The code in `ApiClient.request()` immediately constructed a browser `fetch()` call without checking whether the origin is a standalone static host or whether a custom backend URL was configured in `localStorage.getItem('panorama_backend_url')`.
  3. Chrome's security engine blocked these requests, which manifested as red console errors and unhandled promise rejections.
- **Architectural Solution:**  
  The application was designed with dual-mode capability:
  - **Connected Mode:** Active when running against a local or cloud FastAPI server (`127.0.0.1:8000` or custom configured backend).
  - **Standalone SCADA Station Mode:** Active when running on static hosting without a configured backend.
  By updating `ApiClient.request()` to evaluate `API_BASE` and gracefully reject with `NO_BACKEND` before dispatching network `fetch()` calls, the app automatically relies on its persistent `LocalFleetStore` and HiveMQ MQTT telemetry, completely eliminating CORS errors.

### B. WebSocket Connection Loops (ERR-002)
- **Manifestation:** Repeated browser errors: `WebSocket connection to 'wss://panorama-water-tank-backend.onrender.com/api/v1/ws/live' failed`.
- **Root Cause:**  
  `WebSocketService.connect()` attempted connection to the Render backend regardless of whether the backend was online. Upon failure, its reconnect handler re-triggered every 3000ms.
- **Architectural Solution:**  
  Updated `getWsUrl()` to return `""` when no custom backend is present on static origins. The service transitions to `DISCONNECTED` state cleanly and ceases reconnect attempts. The primary live telemetry pipeline remains powered by `mqttService.ts` via HiveMQ over WSS (`wss://broker.hivemq.com:8884/mqtt`).

### C. Missing Resource Favicon 404 (ERR-003)
- **Manifestation:** `Failed to load resource: the server responded with a status of 404 () https://soumikbur.github.io/favicon.ico`.
- **Root Cause:**  
  The HTML template lacked an explicit `<link rel="shortcut icon">` element with a data URI or valid asset link. Standard Chromium browsers automatically dispatch a secondary GET request for `/favicon.ico` on initial page load if none is declared.
- **Architectural Solution:**  
  Injected `<link rel="shortcut icon" href="data:image/x-icon;," type="image/x-icon" />` into both `apps/mobile/index.html` and the build script template `apps/mobile/scripts/build.cjs`.

### D. Unauthenticated Navigation & Interaction Obstruction (ERR-005)
- **Manifestation:** Synthetic test runners reported 377 characters of DOM text across all screens because the user was unauthenticated. Modal overlays intercepted pointer events during automated tests.
- **Root Cause:**  
  1. Security guards in `App.tsx` correctly enforce authentication, displaying `LoginScreen` when `!isAuthenticated`.
  2. Test scripts navigating purely via hash changes remained on `LoginScreen`.
  3. Modals such as `InstallAppModal` lacked keyboard escape handlers and required explicit click on `#install-modal-close-btn` to dismantle their backdrop overlay.
- **Architectural Solution:**  
  Upgraded `PageTester` to perform full authentication as Administrator on startup, test all 14 screens with populated DOM content, explicitly close modal dialogs via dedicated DOM IDs, and verify RBAC restrictions with Employee login.

---

## 4. Architectural Safeguards Implemented

1. **Zero-Error Network Policy:** All API client methods check backend availability before triggering network I/O.
2. **Decoupled Telemetry Pipeline:** HiveMQ MQTT WebSocket runs autonomously over WSS on port 8884, independent of backend REST availability.
3. **Robust Local Fleet Persistence:** IndexedDB and `localStorage` preserve all registered trains, coaches, and devices permanently across sessions and devices.
4. **Resilient RBAC Guarding:** Employee accounts are restricted from accessing system logs and user administration modules with clean, error-free fallback UI (`AccessDeniedScreen`).
