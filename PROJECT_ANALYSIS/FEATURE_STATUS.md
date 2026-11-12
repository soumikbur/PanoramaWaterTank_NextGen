# Feature Status Matrix — Panorama Water Tank NextGen

> Evaluation below reflects the **actual code behavior** across both stacks (`apps/mobile` + `backend` NextGen stack, and Qt 6 C++/QML desktop app), highlighting partial implementations and known limitations.

---

## Summary Status Table

| # | Feature | NextGen (`apps/mobile` + `backend`) | Qt 6 Desktop (`src/` + `qml/`) | Overall Verdict |
| :- | :--- | :--- | :--- | :--- |
| 1 | **Desktop Dashboard** | **Implemented** (`DashboardScreen.tsx`, Electron 45) | **Implemented** (`DashboardPage.qml`, `DashboardTopSection.qml`) | **Functional** (both stacks) |
| 2 | **Mobile Dashboard** | **Implemented** (Responsive `react-native-web` + `responsive.css`) | N/A (Desktop Qt only) | **Functional** (Web/PWA; no native APK) |
| 3 | **Admin Panel** | **Implemented** (Role-gated nav + trains/users/devices/settings) | **Implemented** (Role-gated `SettingsPage.qml`, `UsersPage.qml`) | **Functional** |
| 4 | **Admin Settings** | **Partially Implemented** (UI + DB save works; some flags unwired) | **Implemented** (`SettingsPage.qml` + `SettingsManager`) | **Partial** (alarm toggles not enforced on backend) |
| 5 | **Device Management** | **Implemented** (`DeviceMappingScreen.tsx` + `/api/v1/devices`; orphaned `DevicesScreen.tsx`) | **Implemented** (`DevicesPage.qml` + `TrainManager`) | **Functional** |
| 6 | **Water Tank Visualization** | **Implemented** (`TankVisualization.tsx`, `WaterTankScreen.tsx`) | **Implemented** (`TankVisualization.qml`, `WaterWave.qml`, `AllTanksPage.qml`) | **Functional** |
| 7 | **Real-time Water Level Monitoring** | **Implemented** (MQTT -> DB -> WebSocket + direct WSS fallback) | **Implemented** (`QMqttClient` + ESP32/Ubidots polling) | **Functional** (note `cm1`/`bat` diffs in Qt) |
| 8 | **Historical Data & Graphs** | **Implemented** (`HistoryScreen.tsx`, `TrendChart.tsx`, LTTB API) | **Implemented** (`HistoryPage.qml`, `TrendChart.qml`) | **Functional** |
| 9 | **Alert & Notification System** | **Implemented** (`AlertsScreen.tsx`, `AlertToastBanner.tsx`, `alarms.py`) | **Implemented** (`AlertsPage.qml`, `TankModel.cpp`) | **Functional** (dedup engine added in `2f96886`) |
| 10 | **User Management** | **Implemented** (`UsersScreen.tsx`, `RegisterScreen.tsx`, `users.py`) | **Implemented** (`UsersPage.qml`, `AuthManager.cpp`) | **Functional** (Qt auth is simplified local pass `"123"`) |
| 11 | **Train & Coach Management** | **Implemented** (`TrainManagementScreen.tsx`, `CoachManagementScreen.tsx`, `CoachDetailsScreen.tsx`, `trains.py`) | **Implemented** (`TrainManagementPage.qml`, `TrainSelectionPage.qml`, `CoachConfigurationPage.qml`) | **Functional** (`tsc` errors exist in `TrainManagementScreen.tsx`) |
| 12 | **Google Maps Integration** | **Not Active / Replaced by Leaflet** (uses OSM Street + Esri Satellite tiles) | **Implemented** (Google Maps tile URL & Directions API key via `LocationManager` / `LocationMap.qml`) | **Qt: Implemented; NextGen: Replaced by Leaflet** |
| 13 | **Device Connectivity / Health** | **Implemented** (`is_online`, `last_seen_at`, staleness checks, watchdog) | **Implemented** (`ConnectionManager`, `TankModel` offline logs) | **Functional** |
| 14 | **Ubidots Integration** | **Stub / Settings UI Only** (stored in DB & CSP whitelisted; no API client calls) | **Implemented** (`ApiClient.cpp` calls Ubidots v2.0 & v1.6 REST) | **Qt: Functional; NextGen: Config-only** |
| 15 | **MQTT Communication** | **Implemented** (`paho-mqtt` backend TLS/TCP + frontend WSS `8884`) | **Implemented** (`Qt6::Mqtt` `QMqttClient` + topic parsing) | **Functional** |
| 16 | **Data Export** | **Implemented** (`GET /api/v1/export/csv` RFC 4180 + formula-safe) | **Implemented** (`HistoryExporter.cpp`, `ReportsPage.qml`) | **Functional** |
| 17 | **Authentication & Permissions** | **Implemented** (JWT + bcrypt + `token_version` + `ADMIN`/`EMPLOYEE` RBAC) | **Partially Implemented** (Local `AuthManager` / `PermissionManager` with hardcoded admin pass) | **NextGen: Production-ready; Qt: Local-only** |

---

## 2. Detailed Feature Breakdown & Known Limitations

### 1 & 2. Desktop Dashboard & Mobile Dashboard
- **Files:** `apps/mobile/src/screens/DashboardScreen.tsx`, `EmployeeDashboard.tsx`, `WaterTankScreen.tsx`, `qml/pages/DashboardPage.qml`, `qml/components/DashboardTopSection.qml`.
- **Functionality:** Live KPI grid (`SummaryGrid`), dual arrival/departure tank levels, active alarm badges, connection status card, and mobile navigation drawer/bottom-friendly responsive CSS (`responsive.css`, `AppLayout.tsx`).
- **Limitations:** `apps/mobile` runs TypeScript-unverified builds via `esbuild`; `tsc --noEmit` currently reports **29 errors** (including missing `setActiveScreen` in `App.tsx` `ErrorBoundary` fallback!).

### 3 & 4. Admin Panel & Admin Settings
- **Files:** `apps/mobile/src/screens/SettingsScreen.tsx`, `backend/app/api/v1/settings.py`, `qml/pages/SettingsPage.qml`, `src/configuration/SettingsManager.cpp`.
- **Current State:** Commit `2f96886` heavily expanded `SettingsScreen.tsx` (+630/- lines) and `settings.py` to support Admin system configuration, fleet/device settings, threshold controls, and 7 granular alarm toggles (`alarm.master_enabled`, `alarm.low_water_enabled`, `alarm.sensor_fault_enabled`, `alarm.device_offline_enabled`, `alarm.modem_failure_enabled`, `alarm.overflow_enabled`, `alarm.voltage_enabled`).
- **Known Limitations:**
  - Backend `AlarmService.evaluate_reading()` in `backend/app/mqtt/client.py` does **not** yet read those 7 `alarm.*_enabled` toggles from the `settings` table; they currently govern **frontend toast notifications** (`alertNotificationService.ts`) rather than backend DB alarm creation.
  - Non-admin users opening Settings in `SettingsScreen.tsx` render `<DisplaySettingsPanel />` cleanly (fixed/scoped in `2f96886`).

### 5. Device Management
- **Files:** `apps/mobile/src/screens/DeviceMappingScreen.tsx`, `backend/app/api/v1/devices.py`, `backend/app/repositories/device_repo.py`, `qml/pages/DevicesPage.qml`.
- **Current State:** Register devices by hardware UID, bind to train/coach numbers, view `is_online` and `last_seen_at`, and auto-provision linked tanks (`T1`/`T2` or default tank).
- **Known Limitations:** An older `apps/mobile/src/screens/DevicesScreen.tsx` still exists in the source tree even though routing uses `DeviceMappingScreen.tsx`.

### 6, 7 & 8. Water Tank Visualization, Real-Time Monitoring & Historical Graphs
- **Files:** `apps/mobile/src/components/tank/TankVisualization.tsx`, `WaterTankScreen.tsx`, `MonitoringScreen.tsx`, `HistoryScreen.tsx`, `components/charts/TrendChart.tsx`, `backend/app/services/calculator.py`, `downsampler.py`, `qml/components/WaterWave.qml`, `TrendChart.qml`.
- **Current State:** Dual-wave SVG liquid visualization; server calculates liters, percentage, and 4 ranks (`LOW`, `MODERATE`, `GOOD`, `HIGH`) via `VolumeCalculator`; `/api/v1/telemetry/history` uses LTTB downsampling over `12h`, `24h`, `7d`.
- **Known Limitations:** `MonitoringScreen.tsx` calculates percentage against a hardcoded `150.0` cm divisor (`liveTelemetry.cm1 / 150.0 * 100`) when computing fallback levels, whereas backend `config.py` defaults tank height to `50.0` cm (`DEFAULT_TANK_HEIGHT_CM=50.0`) unless tank geometry overrides it. Qt's `MqttService.cpp` hardcodes `kAssumedTankHeightCm = 50.0` and `kAssumedTankCapacityL = 60.0` and does not read `cm1`/`cm2`/`bat`.

### 9. Alert & Notification System
- **Files:** `backend/app/services/alarm_service.py`, `backend/app/api/v1/alarms.py`, `apps/mobile/src/services/alertNotificationService.ts`, `components/common/AlertToastBanner.tsx`, `screens/AlertsScreen.tsx`, `src/domain/TankModel.cpp`.
- **Current State:** Backend detects `CRITICAL_LOW` (<10%), `WARNING_LOW` (<20%), `OVERFLOW` (>100%), `SENSOR_FAULT`, and `VOLTAGE_FAULT` (<10.5V), supports acknowledge with audit log, and exposes `POST /api/v1/alarms/clear`. Commit `2f96886` added client-side deduplication + toast banners (`11/11` Node unit tests passing) and structuredQt console warnings/recoveries in `TankModel.cpp`.

### 10. User Management & 17. Authentication / Permissions
- **Files:** `backend/app/api/v1/auth.py`, `users.py`, `core/security.py`, `core/upload_validator.py`, `apps/mobile/src/screens/{LoginScreen,RegisterScreen,UsersScreen}.tsx`, `src/security/{AuthManager,PermissionManager}.cpp`.
- **Current State:** NextGen backend enforces bcrypt password hashing, JWT (`token_version` invalidation on logout), role checks (`get_current_admin_user`), multi-step self-registration with pending approval (`PENDING_APPROVAL` -> `ACTIVE`/`REJECTED`), and attachment validation. Qt desktop app uses local `AuthManager` where Admin password defaults to `"123"`.

### 11. Train & Coach Management
- **Files:** `backend/app/api/v1/trains.py`, `apps/mobile/src/screens/{TrainManagementScreen,CoachManagementScreen,CoachDetailsScreen}.tsx`, `qml/pages/{TrainManagementPage,CoachConfigurationPage}.qml`.
- **Current State:** Full train/coach hierarchy CRUD and track/grid coach consist visualization (up to 24 coaches). **Note:** `TrainManagementScreen.tsx` has uncompiled TypeScript errors (`Layers` icon not imported at L792, `setSelectedCoachNumber` missing at L888).

### 12. Google Maps vs Leaflet Integration
- **Qt Desktop:** `src/services/LocationManager.cpp` & `qml/components/LocationMap.qml` implement custom Web Mercator tile downloading and Google Maps Directions API integration.
- **NextGen Web (`LocationScreen.tsx`):** Commit `fa36b0e` redesigned `LocationScreen.tsx` as a map-first SCADA view powered by **`leaflet 1.9.4`** with **OpenStreetMap** Street tiles (`tile.openstreetmap.org`) and **Esri World Imagery** Satellite tiles (`server.arcgisonline.com`). It does **not** load Google Maps JS SDK tiles.

### 14. Ubidots Integration
- **Qt Desktop:** Active REST integration (`ApiClient.cpp` calling `/api/v2.0/devices/~{label}/_/values/last` and `/api/v1.6/devices/{label}/{var}/values`).
- **NextGen Web/Backend:** Only configuration storage exists (`settings.py` stores Ubidots URL, device label, variable names, and masked token placeholder, plus CSP permits `industrial.api.ubidots.com`), but **no backend worker or frontend client currently polls or pushes to Ubidots**.

### 15 & 16. MQTT Communication & Data Export
- **MQTT:** Both stacks actively ingest live broker frames. Backend runs `paho-mqtt` `VERSION2`; web app also connects directly over WSS (`broker.hivemq.com:8884`) when configured; Qt uses `Qt6::Mqtt`.
- **CSV Export:** `/api/v1/export/csv` produces RFC 4180 CSV with CSV-formula-injection sanitization (`=`, `+`, `-`, `@` prefix escaping); Qt uses `HistoryExporter`.

