# Panorama Water Tank NextGen — Deployment Workflow & Operational Guide

## 1. Overview & System Architecture

This document establishes the official production deployment architecture and continuous deployment workflow for **Panorama Water Tank Monitor NextGen**.

```
+-----------------------------------------------------------------------------------+
|                            DEVELOPMENT & DEPLOYMENT LIFECYCLE                     |
|                                                                                   |
|   [1] LOCAL DEVELOPMENT          [2] LOCAL VERIFICATION         [3] GITHUB REPO   |
|   C:\...\PanoramaWaterTank_NextGen  npm run build (Vite 6.x)     origin/main       |
|            |                              |                          |            |
|            +------------------------------+--------------------------+            |
|                                                                      |            |
|                                                                      v            |
|   [5] LIVE VERIFICATION          [4] PRODUCTION HOSTING    <--- PUSH TRIGGER      |
|   Browser / Mobile / Desktop      Vercel Global CDN                               |
|   https://<project>.vercel.app    Edge Network SPA                                |
+-----------------------------------------------------------------------------------+
```

---

## 2. Core Repository & Deployment Metadata

| Attribute | Specification |
|---|---|
| **Local Project Path** | `C:\Users\User\Documents\Antigravity_soumik\PanoramaWaterTank_NextGen` |
| **GitHub Repository** | `https://github.com/soumikbur/PanoramaWaterTank_NextGen` |
| **Default Production Branch** | `main` |
| **Target Hosting Platform** | Local Industrial HMI / Standalone Electron & Embedded Server (Vercel Disabled) |
| **Project Name** | `panoramawatertank-nextgen` |
| **Deployment Mode** | Local Desktop HMI, SCADA Edge, and Local Web Services |
| **Frontend Framework** | React 18 + TypeScript + esbuild standalone |
| **Build Command** | `npm run build` |
| **Output Directory** | `dist` |

---

## 3. Environment Variable Configuration

All environment variables used by the client-side single page application follow standard Vite conventions (`VITE_` prefix). **Secrets and sensitive private keys must never be prefixed with `VITE_` or bundled into client code.**

| Variable Name | Required | Default / Fallback | Purpose |
|---|---|---|---|
| `VITE_API_URL` | Optional | `http://127.0.0.1:8000` | Target URL for REST API backend (ESP32 telemetry, system logs, configuration) |
| `VITE_WS_URL` | Optional | `ws://127.0.0.1:8000/ws` | Target URL for real-time WebSocket telemetry stream |
| `VITE_MQTT_BROKER_URL` | Optional | Broker WSS endpoint | Direct WebSocket MQTT connection URL (when browser-direct MQTT is active) |
| `VITE_APP_ENV` | Optional | `production` | Runtime mode flag (`development`, `staging`, `production`) |

---

## 4. Routine Development & Deployment Workflow

### Step 1: Local Development
All source modifications must be made inside:
```bash
cd C:\Users\User\Documents\Antigravity_soumik\PanoramaWaterTank_NextGen
```

### Step 2: Local Verification & Pre-flight Build
Before committing any changes, run the local build to ensure zero compilation or bundling errors:
```bash
# Navigate to web/HMI workspace
cd apps/mobile

# Run production build
npm run build

# Preview production artifacts locally
npm run preview
```

### Step 3: Git Commit & Push
Commit clean changes and push to `origin/main`:
```bash
git add .
git commit -m "feat(module): description of verified improvements"
git push origin main
```

### Step 4: Local Packaging & Verification
The repository is maintained exclusively as a GitHub-hosted development and desktop/embedded SCADA project. All cloud/Vercel continuous deployment activities are permanently disabled:
- Standalone builds are executed locally via `npm run build`.
- Electron and native packaging are handled via `npm run package:all` or `npm run electron`.
- The repository does not trigger cloud deployments upon push.

---

## 5. Live Production Verification Procedure

After deployment succeeds:
1. Open the production URL in the browser (e.g. `https://panoramawatertank-nextgen.vercel.app`).
2. Verify responsive desktop resolutions:
   - **1920 × 1080 (Full HD Desktop)**
   - **1600 × 900 (Standard Desktop)**
   - **1366 × 768 (Laptop View)**
3. Verify unauthenticated route guards (unauthenticated requests redirect to `/login`).
4. Test login with Administrator and Employee profiles.
5. Verify key dashboards:
   - **Train Management**: Active train cards, coach list, filling metrics.
   - **All Tanks**: Live tank gauges, fill percentages, sensor telemetry.
   - **Location & GPS**: OpenStreetMap tile rendering, train coordinates.
   - **Alerts & History**: Threshold alerts and event timelines.
   - **Settings**: Tank geometry and alarm threshold forms.
6. Open browser DevTools (`F12`) and confirm:
   - Zero uncaught JavaScript runtime exceptions.
   - No failed local network calls to `localhost` in production mode.

---

## 6. Rollback Procedure

If a breaking defect is detected in a build:
1. **Rollback via Git**:
   ```bash
   git revert HEAD
   git push origin main
   ```
2. Re-run local build and tests:
   ```bash
   npm run build
   ```

---

## 7. Backend & MQTT Operational Architecture

- **Local Industrial SCADA / HMI**: The NextGen web application operates as a high-performance local HMI and Electron desktop client interfacing with real-time hardware telemetry.
- **Backend Architecture**: The Python/FastAPI backend (`backend/app/main.py`) contains a persistent, long-running MQTT client (`app.mqtt.client.mqtt_service`) and SQLite storage (`panorama_dev.db`).
- **Client Fallback**: The NextGen web client gracefully handles backend connectivity: when the live backend/broker is temporarily unreachable, the UI displays clear disconnection badges rather than crashing.

