# Panorama Water Tank NextGen — Browser Execution & Operating Guide

**Document Version**: 2.0.0  
**Application Architecture**: Modern Web HMI (React Native Web + Vite + TypeScript) + Real-time Async REST/WebSocket SCADA Backend (FastAPI + SQLAlchemy + Paho MQTT + SQLite)  
**Date**: October 31, 2026  
**Status**: 100% Operational & Verified  

---

## 1. Executive Summary & Architecture Overview

The **Panorama Water Tank NextGen** system has evolved beyond the legacy single-desktop binary into a high-performance, web-first distributed SCADA architecture:

```text
+----------------------------------------------------------------------------------------------------+
|                                      WEB BROWSER CLIENT (HMI)                                      |
|                                    URL: http://127.0.0.1:3001                                      |
|                                                                                                    |
|  [Header: 72px]   Train Management | Global Search | [ADMIN] [ONLINE] | Clock                      |
|  [Sidebar: 224px] 7 Operations Screens (Trains, Dashboard, Tanks, Devices, GPS, Alerts, Reports)  |
|                   3 System Screens (Settings, Users & RBAC, Logs)                                  |
|  [Content Canvas] 4 Region Cards (NORTH, SOUTH, EAST, WEST), Consist Trees, Fluid Sine Animations  |
+-------------------------------------------------+--------------------------------------------------+
                                                  ▲
                       WebSocket Stream (/ws)     │     HTTP REST API (/api/v1)
                                                  ▼
+----------------------------------------------------------------------------------------------------+
|                                FASTAPI SCADA BACKEND SERVICE                                        |
|                                    URL: http://127.0.0.1:8000                                      |
|                                                                                                    |
|  - REST Endpoints: /trains/regions, /trains, /tanks, /devices, /location, /alarms, /users, /export |
|  - WebSocket Dispatcher: Broadcasts real-time TELEMETRY_UPDATE, ALARM_TRIGGERED, ALARM_RESOLVED    |
|  - Async ORM: SQLite Engine (panorama_dev.db) with connection pooling and schema migrations        |
|  - Background MQTT Client: Paho-MQTT loop thread connected to broker.hivemq.com:1883               |
+-------------------------------------------------+--------------------------------------------------+
                                                  ▲
                                                  │ MQTT Topics: panorama/telemetry/+
                                                  ▼
+----------------------------------------------------------------------------------------------------+
|                           EDGE MONITORING FLEET & TELEMETRY SIMULATOR                              |
|                                                                                                    |
|  - Real ESP32-S3 + EC200U 4G IoT Gateway Nodes / simulate_telemetry.py                             |
|  - Publishes continuous hydrostatic water level, battery voltage, Doppler velocity, GNSS GPS fix  |
+----------------------------------------------------------------------------------------------------+
```

---

## 2. Quick-Start Guide (Running in Any Modern Browser)

### 2.1 Live Service Endpoints

| Service / Component | Live Local URL | Purpose |
| :--- | :--- | :--- |
| **NextGen Web Application** | **`http://127.0.0.1:3001/`** | Full Industrial SCADA Dashboard & Fleet Operations |
| **Backend API Gateway** | **`http://127.0.0.1:8000/`** | High-performance FastAPI asynchronous server |
| **Interactive API Documentation** | **`http://127.0.0.1:8000/docs`** | OpenAPI / Swagger interactive testing interface |
| **WebSocket Telemetry Stream** | **`ws://127.0.0.1:8000/ws`** | Sub-second real-time sensor frame broadcast |

---

### 2.2 Startup Commands

To start the services manually or restart after code updates:

#### Step 1: Start the Backend Service
From the repository root (`PanoramaWaterTank_NextGen`):
```powershell
& ".\backend\venv\Scripts\python.exe" ".\backend\run_server.py"
```
*Port*: `8000` | *Log output*: Confirms SQLite connection and MQTT subscription to HiveMQ.

#### Step 2: Start the Web Frontend (Vite)
From `PanoramaWaterTank_NextGen\apps\mobile`:
```powershell
npm run dev
```
*Port*: `3001` | *Log output*: `VITE ready in ~300ms ➜ Local: http://127.0.0.1:3001/`

#### Step 3: Open in Web Browser
Open your browser of choice (Chrome, Edge, Firefox, Brave) and navigate to:
```
http://127.0.0.1:3001
```

#### Step 4 (Optional): Start Continuous Edge Telemetry Feed
To observe live fluid wave oscillations, drain simulation, and moving GPS coordinates along the Delhi-Bhopal corridor:
```powershell
& ".\backend\venv\Scripts\python.exe" ".\backend\scripts\simulate_telemetry.py" --interval 3.0
```

---

## 3. Screen-by-Screen Feature Walkthrough

### 3.1 Train Management (`/trains`)
- **Visual Design**: Strict match to `WLI_DOCS/UI_REFERENCE.md`.
- **Level 1 (Regions Overview)**:
  - 4 Region Cards: **NORTH** (Northern Railway), **SOUTH** (Southern Railway), **EAST** (Eastern Railway), **WEST** (Western Railway).
  - Metrics per card: Configured Trains, Coaches count, Tanks count, Online Trains, Status badge (`All Normal`, `Warning`, or `Critical`).
  - Action link: `View Trains in Region →`.
- **Level 2 (Trains in Region)**:
  - Displays consist list for selected zone (e.g. 12002 Shatabdi, 12301 Rajdhani).
  - Train status pills, consist coach/tank counts, `Consist →` inspect action, and delete train action.
- **Level 3 (Consist Hierarchy Drill-Down)**:
  - Inspect coaches assigned to train (UID, hardware version, gateway status).
  - Inspect coach tanks: Primary and Auxiliary tank capacities, current level %, volume in Liters, and color-coded status fill bars.
  - One-click navigation to inspect live telemetry in the Water Tank Monitor.
- **Add Train Fleet Modal**:
  - Modal form to register 5-digit train number, name/route, regional zone, initial coach, and tank capacity.

### 3.2 Real-Time Dashboard (`/dashboard`)
- **Fluid Animation (`TankVisualization.tsx`)**: Dual sine-wave animated fluid reservoir illustrating real water motion.
- **Level Trend Card (`LevelTrendCard.tsx`)**: Recent 24h level gradient and volume readout.
- **Tank Info Card (`TankInfoCard.tsx`)**: Gateway UID, train number, coach number, battery voltage, and connection state.
- **Rank Indicator Bar (`RankIndicator.tsx`)**: 4-tier capacity indicator (**EMPTY**, **LOW**, **MEDIUM**, **HIGH**).
- **Summary Grid (`SummaryGrid.tsx`)**: 5 high-contrast diagnostic tiles (Volume, Height, Voltage, Status, Last Seen).

### 3.3 Water Tank Monitor (`/watertank`)
- Dual tank support (Primary + Auxiliary water systems).
- Real-time geometric volume calculation using $V = A \times h$ and $h = H_{\max} \times (\% / 100)$.
- Tank geometry configuration dialog (Height, Cross-sectional area, Total capacity).

### 3.4 Edge Device Fleet (`/devices`)
- Fleet inventory of all ESP32-S3 + EC200U 4G LTE gateways.
- Telemetry health, signal quality, hardware and firmware version readouts.
- Search filter by UID, Train Number, or Coach.

### 3.5 GNSS / GPS Fleet Tracking (`/location`)
- Real-time GPS coordinates: Latitude, Longitude, Doppler Ground Speed (km/h), Altitude above sea level, and Satellite count.
- Interactive SVG railway corridor map showing Delhi (NDLS) to Bhopal (BPL) track with active pulsing train position beacon and speed callout.

### 3.6 Alerts & Alarms (`/alerts`)
- Active alarms list (Low Level Warnings, Critical Outages, Sensor Disconnects).
- Severity color codes: Emerald (`NORMAL`), Amber (`WARNING`), Crimson (`CRITICAL`).
- One-click alarm acknowledgment with operator audit comments.

### 3.7 Historical Telemetry & CSV Export (`/history` & `/reports`)
- Downsampled time series charts (12 Hours, 24 Hours, 7 Days).
- LTTB downsampling preserving min/max extreme spikes.
- Live one-click CSV export via `/api/v1/export/csv`.
- Water consumption audit and yard refill logs.

### 3.8 User Management & Role-Based Access Control (`/users`)
- Operator and Administrator account management.
- Quick role-switch / impersonation for field testing operator view vs administrative view.
- Admin-only protection on system geometry modifications and fleet deletion.

### 3.9 System Logs & MQTT Telemetry Inspector (`/logs`)
- Live event stream showing MQTT subscription handshakes, frame delivery status, and sensor validation audit.

---

## 4. Stopping and Managing Background Processes

To list or terminate background services:

```powershell
# In PowerShell:
Get-Process | Where-Object { $_.ProcessName -like "*python*" -or $_.ProcessName -like "*node*" }

# Terminate backend:
Stop-Process -Name python -Force

# Terminate frontend Vite:
Stop-Process -Name node -Force
```

