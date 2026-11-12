# Issues, Risks & Recommendations

All items below were directly observed in the current source tree, environment checks, and verification runs.

---

## 1. Critical & High-Priority Code Bugs

### 1.1 Frontend `tsc --noEmit` Fails with 29 TypeScript Errors (Masked by `esbuild` & CI)
- **Where:** `apps/mobile/src/` — `App.tsx`, `Header.tsx`, `Sidebar.tsx`, `TankVisualization.tsx`, `CoachManagementScreen.tsx`, `EmployeeDashboard.tsx`, `LocationScreen.tsx`, `TrainManagementScreen.tsx`, `AppContext.tsx`.
- **Concrete Examples Observed:**
  - `apps/mobile/src/App.tsx:110`: `onReset={() => setActiveScreen('dashboard')}` calls `setActiveScreen`, which is **not destructured** in `MainContent`. If `<ErrorBoundary>` triggers and the user clicks reset, it will throw a **`ReferenceError: setActiveScreen is not defined`**.
  - `apps/mobile/src/screens/TrainManagementScreen.tsx:792, 888`: Missing `Layers` import (`TS2304`) and missing `setSelectedCoachNumber` (`TS2552`).
- **Why Masked:** `apps/mobile/scripts/build.cjs` uses `esbuild` (which strips types without typechecking), and `.github/workflows/ci.yml` ("Frontend Build & Typecheck") runs `npm run build` rather than `tsc --noEmit`.
- **Recommendation:** Add `npx tsc --noEmit` to CI and resolve all 29 type errors, starting with `App.tsx` and `TrainManagementScreen.tsx`.

### 1.2 Backend Alarm Evaluator Ignores Admin `alarm.*_enabled` Settings Toggles
- **Where:** `backend/app/api/v1/settings.py` vs `backend/app/mqtt/client.py` / `backend/app/services/alarm_service.py`.
- **Impact:** Commit `2f96886` added 7 persisted toggles (`alarm.master_enabled`, `alarm.low_water_enabled`, `alarm.sensor_fault_enabled`, `alarm.device_offline_enabled`, `alarm.modem_failure_enabled`, `alarm.overflow_enabled`, `alarm.voltage_enabled`) and UI switches in `SettingsScreen.tsx`. However, server-side MQTT alarm evaluation (`mqtt/client.py` -> `AlarmService`) does not read these settings, so disabled alarm classes still trigger DB alarm rows and WebSocket `ALARM_TRIGGERED` events (only frontend toasts suppress them).
- **Recommendation:** Query the `alarm.*_enabled` flags (or cache them in `settings_repo`) in `mqtt/client.py` / `alarm_service.py` before creating DB alarms.

### 1.3 Qt Telemetry Adapter Drops `cm1`/`cm2`/`bat` & Hardcodes Tank Dimensions
- **Where:** `src/telemetry/MqttService.cpp:376-431`.
- **Impact:** Qt computes `waterLevelCm` and `volumeL` from `wlp1`/`wlp2` using hardcoded `kAssumedTankHeightCm = 50.0` and `kAssumedTankCapacityL = 60.0`, while NextGen sensors emit real `cm1`, `cm2`, and `bat` fields and default to `20.0 L / 50.0 cm`.
- **Recommendation:** Parse `cm1`, `cm2`, `bat`, `trno`, and `wlvl` in `MqttService::processPayload`, using configured tank geometry rather than constants.

---

## 2. Environment, Migration & Security Issues

### 2.1 Broken Home-Laptop `.venv` Referenced Before Working `venv` in Electron
- **Where:** `backend/.venv/pyvenv.cfg` (points to missing `C:\Users\soumi\AppData\Local\Programs\Python\Python312`) and `apps/mobile/electron/main.cjs:56-62`.
- **Impact:** In Electron dev mode (when `panorama-backend.exe` is missing/bypassed), `main.cjs` probes `backend/.venv/Scripts/python.exe` **first** before `backend/venv/Scripts/python.exe`, which fails on this office desktop.
- **Recommendation:** Delete stale `backend/.venv` (when authorized to mutate workspace) or reorder `main.cjs` to check `backend/venv` first.

### 2.2 Hardcoded Home Session Scratch Path in `qml/App.qml`
- **Where:** `qml/App.qml` lines `334, 356, 375, 393, 411, 430, 448`.
- **Impact:** References `C:/Users/User/.gemini/antigravity-ide/brain/af675fed-8d5d-441e-bf51-fbde6dfbdf72/scratch/`, breaking portability if triggered in Qt.
- **Recommendation:** Replace with `StandardPaths` / app-relative paths or remove leftover debug/export references.

### 2.3 `CMakePresets.json` Toolchain Mismatch on Office Desktop
- **Where:** `CMakePresets.json:18-19` points to `C:/msys64/ucrt64/bin/g++.exe` (GCC `16.2.0` on this PC), whereas Qt `6.12.0` (`mingw_64`) and `build/CMakeCache.txt` use `C:/Qt/Tools/mingw1310_64/bin/g++.exe` (GCC `13.1.0`).
- **Recommendation:** Update preset or build scripts to point to `C:/Qt/Tools/mingw1310_64/bin` so ABI matches Qt `6.12.0`.

### 2.4 Security Hygiene & Credentials
- **Where:**
  - `app/ApplicationController.cpp:109,118` & `src/security/AuthManager.cpp:12`: Qt desktop app hardcodes Admin password `"123"`.
  - `backend/app/core/database.py`: Seeds `@admin` / `@employee` default passwords (`Admin@123` / `Employee@123`) when DB is initialized; ensure non-default credentials in production.
  - `backend/app/mqtt/client.py`: Hardcodes subscription to literal device UID `"0023004D4B42501120353332"` in addition to topic filter.
  - `apps/mobile/scripts/build.cjs:27`: Defaults `VITE_ENABLE_TEST_LOGIN` to **`true`** when unset (exposes quick-login buttons in production/GitHub Pages unless explicitly disabled).

---

## 3. Architectural & Maintenance Debt

1. **Dual Unsynchronized Tank Geometry Defaults:** `MonitoringScreen.tsx:60` assumes `150.0` cm tank height; backend `config.py` defaults `50.0` cm / `20.0 L`; Qt `MqttService.cpp` assumes `50.0` cm / `60.0 L`.
2. **Dual Active Desktop Stacks (Maintenance Burden):** Changes like commit `2f96886` touch *both* React/FastAPI and C++ (`src/domain/TankModel.cpp`) with diverging data models (`QSQLITE` vs FastAPI `panorama_dev.db`).
3. **Orphaned & Clutter Files in Repo:**
   - `apps/mobile/src/screens/DevicesScreen.tsx` is unused (superseded by `DeviceMappingScreen.tsx`).
   - `backend/test.db` (0-byte file), `apps/mobile/*.log` (`audit_out*.log`, `audit_err*.log`, `multi_res_*.log`), and `.chrome-test-profile` / screenshot folders bloat the working tree.
4. **3 Uncommitted Trailing-Newline Modifications:** Present on `main` at copy time (`test_alert_notification_unit.cjs`, `AlertToastBanner.tsx`, `alertNotificationService.ts`).
5. **Stale Graphify Cache:** `graphify-out/GRAPH_REPORT.md` reflects commit `70ee9c6` / `eff626a` (5 commits behind `2f96886`).
