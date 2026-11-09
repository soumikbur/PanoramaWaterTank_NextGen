# 01. Complete Project Inventory & Asset Catalog
## Panorama Water Tank Monitor (WLI Next-Generation SCADA / HMI)

**Audit Date:** November 9, 2026  
**Target Environment:** Railway Corporation / Industrial SCADA Monitoring  
**Repository Root:** `c:\Users\soumi\OneDrive\Documents\Antigravity\PanoramaWaterTank_NextGen`  
**Current Audit Branch:** `audit/enterprise-security-remediation`  

---

### 1. Repository Overview & Module Decomposition

The Panorama Water Tank Monitor (WLI) is a multi-tier industrial IoT monitoring system engineered for passenger railway rakes and rolling stock water management. The repository comprises four distinct execution tiers:

| Tier | Directory / Workspace | Primary Language / Technology | Purpose |
|---|---|---|---|
| **Frontend Web / Mobile / Desktop HMI** | `apps/mobile/` | TypeScript, React 18, React Native Web, Vite, esbuild | Responsive SCADA operator console for Mobile, Tablet, and Desktop viewports |
| **Desktop Native Wrapper** | `apps/mobile/electron/` | JavaScript (CommonJS), Electron 30 | Industrial HMI standalone desktop application with supervised background daemon |
| **Backend SCADA Engine** | `backend/` | Python 3.12, FastAPI, SQLAlchemy 2.0, Alembic, Uvicorn | Telemetry ingestion, REST API, WebSocket pub/sub, RBAC authentication, SQLite/PostgreSQL persistence |
| **Legacy Desktop Application** | `src/`, `qml/` | C++17, Qt6, QML, CMake | Legacy C++ desktop workstation reference application |

---

### 2. Frontend Component & Screen Inventory

The frontend application (`apps/mobile/src/`) is structured as a component-driven Single Page Application (SPA):

#### Primary Screens (`apps/mobile/src/screens/`):
- `EmployeeDashboard.tsx`: Chief SCADA overview with KPI metrics, 2-column train summary, active coach telemetry, and responsive train list.
- `TrainManagementScreen.tsx`: Fleet overview across Northern, Southern, Eastern, and Western railway regions with train creation/editing.
- `WaterTankScreen.tsx`: Real-time tank fill levels, dynamic volume calculations, and capacity rank indicators across all coaches.
- `CoachDetailsScreen.tsx`: In-depth coach-level visualization with dual-tank geometry and threshold status.
- `DeviceMappingScreen.tsx`: 8-column SCADA device-to-tank association matrix with 6-tab hardware status filtering.
- `AlertsScreen.tsx`: SCADA alarm management console with severity filtering (Critical, Warning, Normal) and acknowledgment workflows.
- `HistoryScreen.tsx`: Historical telemetry viewer with LTTB downsampling, time window filters (12h, 24h, 7d), and CSV export.
- `ReportsScreen.tsx`: Operational report generator with multi-parameter filtering and export formatting.
- `LocationScreen.tsx`: Real-time GPS train tracking along the Howrah–Asansol railway corridor with water refilling station status.
- `SettingsScreen.tsx`: 5-section unified system configuration console (Connectivity, Tank Geometry, Sensor Calibration, Alarms, Display).
- `LoginScreen.tsx`: Dual-mode authentication screen (Standard operator login and new employee registration workflow).
- `EmployeeManagementScreen.tsx`: Administrator user provisioning, approval queue, and account lifecycle management.

#### Core Services & Shared Modules (`apps/mobile/src/services/` & `state/`):
- `tankStatusService.ts`: Pure centralized 4-point verification engine for online/offline tank status and fleet aggregation.
- `mqttService.ts`: Paho MQTT WebSocket client with exponential backoff reconnects and 30-second stale watchdog.
- `deviceRegistry.ts`: Persistent local storage registry for auto-discovered and provisioned edge hardware.
- `AppContext.tsx`: Global application state manager (trains, coaches, tanks, active alarms, fleet metrics).
- `ScadaTheme.ts`: Industrial color tokens, contrast ratios, and typography specifications.

---

### 3. Backend Architecture & API Inventory

The backend service (`backend/app/`) provides an asynchronous REST and WebSocket API:

#### API Routers (`backend/app/api/v1/`):
- `auth.py`: Authentication, JWT generation, password verification (bcrypt), employee self-registration, and logout.
- `trains.py`: Fleet management, regional consist aggregation, train creation, updating, and deletion.
- `tanks.py`: Real-time tank status calculation, capacity ranking, and threshold updates.
- `devices.py`: Hardware device registry, edge diagnostics, and telemetry association.
- `telemetry.py`: Historical telemetry query endpoint with Largest-Triangle-Three-Buckets (LTTB) downsampling.
- `export.py`: RFC 4180 CSV export of historical sensor readings with formula injection neutralization.
- `alarms.py`: SCADA threshold breach detection, alarm listing, statistics, and operator acknowledgment.
- `settings.py`: 5-section unified configuration persistence and edge test triggers.
- `location.py`: Corridor waypoint coordinates and train GPS tracking telemetry.
- `users.py`: Employee lifecycle management, registration approval queue, and audit trail retrieval.
- `ws.py`: Real-time WebSocket connection manager broadcasting MQTT telemetry to active HMI clients.
- `health.py`: Liveness, readiness, and subsystem connectivity health checks.

#### Data Models & Repositories (`backend/app/models/` & `repositories/`):
- `User`: User accounts, employee metadata, hashed passwords, roles (ADMIN, EMPLOYEE, OPERATOR), account status, token versioning.
- `Device`: Hardware edge monitoring nodes, MAC/UID, train/coach assignment, firmware version, online status.
- `Tank`: Water tank geometry (capacity, height, area), thresholds, current level, sensor calibration parameters.
- `TelemetryReading`: Time-series sensor records (raw level, filtered level, volume, battery voltage, GPS, flags).
- `Alarm`: Triggered operational exceptions (CRITICAL_LOW, WARNING_LOW, OVERFLOW, SENSOR_FAULT, VOLTAGE_FAULT).
- `Setting`: Key-value configuration entities organized across SCADA operational categories.
- `AuditEvent`: Tamper-evident logging of security and operational actions with user ID, IP address, and payload diffs.

---

### 4. Hardware & Edge Protocol Inventory

- **Edge Microcontroller:** ESP32-S3 (WROOM-1 / WLI v2.0 hardware platform).
- **Communication Interfaces:** LTE Cat-1 (EC200U-CN), RS485 Modbus RTU, Bluetooth Low Energy (BLE), Wi-Fi 802.11b/g/n.
- **Transducers:** Hydrostatic pressure sensor (4–20 mA / 0.5–4.5 V), BME280 (temperature, humidity, atmospheric pressure).
- **Broker Connectivity:** HiveMQ MQTT Broker (`broker.hivemq.com:1883` TCP, `broker.hivemq.com:8884` WSS, or local Mosquitto `127.0.0.1:1883`).
- **Telemetry Payload Topic:** `0023004D4B42501120353332` (or configured device UID pattern `panorama/telemetry/+`).
