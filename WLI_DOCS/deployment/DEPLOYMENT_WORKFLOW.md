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
| **Target Hosting Platform** | Vercel (Edge Network / Web Application) |
| **Project Name** | `panoramawatertank-nextgen` |
| **Deployment URL** | `https://panoramawatertank-nextgen.vercel.app` (or temporary claim: `https://brisk-granite-l88zzc8.tmp.now`) |
| **Frontend Framework** | Vite + React 18 + TypeScript + Tailwind CSS |
| **Root Directory** | `apps/mobile` (or repository root with configured `vercel.json`) |
| **Install Command** | `npm install` |
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

### Step 4: Automatic Vercel Deployment
Pushes to the `main` branch automatically trigger Vercel continuous deployment:
- Vercel checks out the latest commit.
- Runs `cd apps/mobile && npm install`.
- Executes `npm run build`.
- Deploys static bundles to global CDN edges.
- Routes all virtual paths to `index.html` via SPA rewrites.

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

If a breaking defect is detected in production:
1. **Instant Rollback via Vercel Dashboard**:
   - Navigate to **Deployments** in the Vercel dashboard.
   - Select the last known stable deployment.
   - Click the three dots (`...`) and select **Promote to Production**.
2. **Rollback via Git**:
   ```bash
   git revert HEAD
   git push origin main
   ```
   Vercel will immediately build and deploy the reverted state.

---

## 7. Backend & MQTT Hosting Requirements

- **Frontend on Vercel**: The React/Vite web application operates as a static Single Page Application distributed globally via Vercel's edge network.
- **Backend Architecture**: The Python/FastAPI backend (`backend/app/main.py`) contains a persistent, long-running MQTT client (`app.mqtt.client.mqtt_service`) and SQLite storage (`panorama_dev.db`). Because Vercel serverless functions terminate execution upon request completion, long-running MQTT daemon threads must be hosted on a persistent container or VM runtime (e.g., Railway, Fly.io, AWS EC2, or on-premise industrial server).
- **Client Fallback**: The NextGen web client gracefully handles backend connectivity: when the live backend/broker is temporarily unreachable, the UI displays clear disconnection badges rather than crashing.

---

## 8. Known Limitations & Upgrades
- *Anonymous Deployment Expiration*: The temporary deployment claim URL expires 60 minutes after creation. Permanent deployments require linking the GitHub repository in the Vercel dashboard or logging in via `vercel login`.
- *Browser Direct MQTT*: Browsers cannot establish raw TCP sockets (`mqtt://`); browser-direct MQTT requires an MQTT-over-WebSocket broker listener (`ws://` or `wss://`) configured with appropriate CORS/TLS policies.

