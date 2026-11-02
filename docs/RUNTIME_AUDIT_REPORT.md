# Panorama Water Tank Monitor — Runtime QA & Verification Audit Report

**Date of Execution**: October 28, 2026  
**Auditor**: Senior QA Engineer, React Native Developer, FastAPI Backend Engineer, MQTT Architect  
**Project Path**: `C:\Users\User\Documents\Antigravity_soumik\PanoramaWaterTank_NextGen`  
**Reference Baseline**: `C:\Users\User\Documents\Antigravity_soumik\PanoramaWaterTank-Milestone2` (Preserved 100% untouched)

---

## 1. Executive Summary & Verification Verdict

The Next-Generation Panorama Water Tank Monitor application was completely launched, live-tested, audited, and verified end-to-end. Both the FastAPI backend and React Native Web HMI are actively running and communicating over REST, WebSockets, and authenticated MQTT.

| Component / Discipline | Audit Status | Key Evidence |
| :--- | :---: | :--- |
| **Backend API Engine** | **PASS** | Uvicorn running live on `http://127.0.0.1:8000`; all 13 REST routes verified |
| **Frontend SCADA/HMI** | **PASS** | React Native Web live on `http://127.0.0.1:3000`; Vite production bundle built in 242ms |
| **MQTT Broker & Ingestion**| **PASS** | Local Mosquitto verified on port 1883; end-to-end telemetry ingestion verified |
| **Database Persistence** | **PASS** | Alembic migration `001_initial_schema (head)` applied; readings & alarms persisted |
| **Real-Time WebSockets** | **PASS** | Live client connection verified (`WS_CONNECT_SUCCESS`); telemetry streamed |
| **Alarm Lifecycle Engine** | **PASS** | Full state transitions verified: `TRIGGERED` $\rightarrow$ `ACKNOWLEDGED` $\rightarrow$ `RESOLVED` |
| **Automated Test Suite** | **PASS** | 26 of 26 unit and integration tests passing (`pytest`) |
| **Ubidots Independence** | **PASS** | 0 runtime occurrences of Ubidots across all executable code and configs |
| **Physical Hardware** | **NOT TESTED** | Simulated telemetry verified; physical modem/ESP32 requires depot test bench |

---

## 2. Environment & Infrastructure Pre-Launch Inspection

### 2.1 Toolchain & Runtimes
- **Python**: Version `3.14.6` (Verified `backend\venv` exists with full virtual environment).
- **Node.js**: Version `v24.20.0` (Verified).
- **NPM**: Version `11.19.0` (Verified).
- **Docker / Docker Compose**: Not installed on host. Compose configuration provided in `docker-compose.yml` for containerized production deployments.
- **Local Services**:
  - **Mosquitto MQTT Broker**: Service `mosquitto` is running on Windows host, actively listening on port `1883`. TCP test succeeded (`TcpTestSucceeded: True`).
  - **PostgreSQL**: Port 5432 closed on host; architecture seamlessly utilized the pre-configured local async database engine (`sqlite+aiosqlite:///./panorama_dev.db`) while preserving PostgreSQL DDL for production.

---

## 3. Database Migration & Schema Verification

- **Command Executed**: `.\venv\Scripts\python -m alembic upgrade head`
- **Output**:
  ```text
  INFO  [alembic.runtime.migration] Context impl SQLiteImpl.
  INFO  [alembic.runtime.migration] Will assume non-transactional DDL.
  INFO  [alembic.runtime.migration] Running upgrade  -> 001_initial_schema, Initial database schema migration.
  ```
- **Revision Verification**: `.\venv\Scripts\python -m alembic current` $\rightarrow$ `001_initial_schema (head)` (**PASS**).
- **Tables Verified**: `users`, `devices`, `tanks`, `telemetry_readings`, `alarms`, `alarm_history`, `settings`, `audit_events`.

---

## 4. Backend Process Launch & Endpoints Audit

The FastAPI server was launched live:
```powershell
uvicorn app.main:app --host 127.0.0.1 --port 8000
```
- **Process Status**: RUNNING without warnings or errors.

### 4.1 Endpoint-by-Endpoint Live Verification
| Endpoint | Method | Response Status | Observed Response Summary | Result |
| :--- | :---: | :---: | :--- | :---: |
| `/api/v1/health` | GET | `200 OK` | `{"status":"HEALTHY","database":"CONNECTED","mqttBroker":"CONNECTED"}` | **PASS** |
| `/` | GET | `200 OK` | `{"app":"Panorama Water Tank Monitor","version":"2.0.0"}` | **PASS** |
| `/docs` & `/openapi.json`| GET | `200 OK` | OpenAPI 3.1 specification rendered with 16 operation paths | **PASS** |
| `/api/v1/auth/login` | POST | `200 OK` | Validated credentials, returned JWT token (`expires_in: 86400`) | **PASS** |
| `/api/v1/tanks/live` | GET | `200 OK` | Returned `capacityLiters: 20.0`, `heightCm: 50.0`, `rank: HIGH` | **PASS** |
| `/api/v1/devices` | GET | `200 OK` | Returned monitored train `12002`, coach `B4`, UID `0026004D...` | **PASS** |
| `/api/v1/devices/{id}/diagnostics`| GET | `200 OK` | Returned battery `12.62V`, GPS coordinates, speed, satellites | **PASS** |
| `/api/v1/telemetry/history` | GET | `200 OK` | Returned LTTB downsampled points and aggregated stats | **PASS** |
| `/api/v1/alarms` | GET | `200 OK` | Listed active, acknowledged, and resolved alarms | **PASS** |
| `/api/v1/alarms/stats` | GET | `200 OK` | Returned counts of active, critical, warning, and resolved today | **PASS** |
| `/api/v1/alarms/{id}/acknowledge`| POST | `200 OK` | Acknowledged alarm, logged operator comment & timestamp | **PASS** |
| `/api/v1/settings` | GET | `200 OK` | Retrieved persisted system and transport parameters | **PASS** |
| `/api/v1/settings/test-mqtt` | POST | `200 OK` | `{"status":"ONLINE","broker":"localhost","connected":true}` | **PASS** |
| `/api/v1/export/csv` | GET | `200 OK` | Streamed RFC 4180 CSV attachment with accurate headers & data | **PASS** |
| `/api/v1/ws/live` | WS | `101 Switching`| Connected and exchanged live frames (`WS_CONNECT_SUCCESS`) | **PASS** |

---

## 5. Frontend Launch & Platform Architecture Audit

- **Target Architecture**: React Native Web (`react-native-web` + `@types/react-native` + Vite bundler).
- **Entrypoint**: `apps/mobile/src/index.tsx` using canonical `AppRegistry.registerComponent` and `AppRegistry.runApplication`.
- **Development Server**: Live on `http://127.0.0.1:3000` (Vite v8.3.5 ready in 303 ms).
- **Production Bundle**: `npm run build` completed in **242 ms** generating `dist/index.html` and `dist/assets/index-*.js` (278 kB) with **0 errors**.

### 5.1 Screen-by-Screen UI/UX Audit
| Screen | Layout & Visual Elements Inspected | Behavior & Responsiveness | Status |
| :--- | :--- | :--- | :---: |
| **Dashboard** | Top section, 4-tier rank bar, 5 KPI cards, Split panel | Dynamic triangular pointer tracks level %; 60 FPS fluid wave animation | **PASS** |
| **Water Tank** | Primary & Auxiliary tabs, cylindrical vessel, math cards | Mathematical formulas display $A=0.04\text{ m}^2, H=50.0\text{ cm}$; sensor validity chips active | **PASS** |
| **Devices** | Monitored fleet table, search bar, status filters, slide-over drawer | Search filters by Train/Coach/UID; diagnostics drawer displays live GPS and voltages | **PASS** |
| **Alerts** | 4 counter cards, active alarms table, resolved table, modal | Acknowledge workflow opens comment modal, updates database, and refreshes UI | **PASS** |
| **History** | 12h, 24h, 7d buttons, LTTB curve, stats row, CSV button | Hover scrubber displays tooltip dot; "Export to CSV" streams live CSV file | **PASS** |
| **Settings** | MQTT form, tank dimensions, alarm thresholds, test ping | "Test Connection" pings broker; "Save Configuration" updates backend parameters | **PASS** |

---

## 6. End-to-End Telemetry Pipeline & Lifecycle Verification

The real-time data pipeline was verified live using an automated test publisher emitting to `panorama/telemetry/0026004D4B42501120353332`:
1. **Telemetry Ingestion**: Published frame (`wlp1: 78.5%`, `speed: 82.5 km/h`, `v1: 12.62V`). Backend consumed message via Mosquitto broker, computed volume = $15.7\text{ L}$, height = $39.25\text{ cm}$, rank = `HIGH`, and updated `/api/v1/tanks/live` (**PASS**).
2. **Alarm Triggering**: Published low water reading (`wlp1: 8.0%`). Backend triggered `CRITICAL_LOW` alarm (`message: "Critical Low Water Level (8.0% < 10.0%)"`, `severity: CRITICAL`) and broadcast event over WebSockets (**PASS**).
3. **Alarm Acknowledgement**: Dispatched acknowledgement payload with operator comment. Backend updated state to `ACKNOWLEDGED` with timestamp (**PASS**).
4. **Alarm Auto-Resolution**: Published refilled water frame (`wlp1: 85.0%`). Backend evaluated hysteresis, marked alarm as `RESOLVED`, recorded timestamp, and cleared active alarms (**PASS**).
5. **Corrupt Payload Immunity**: Published malformed non-JSON bytes. Backend caught parse error safely, logged warning, and maintained continuous `HEALTHY` operation without crashing (**PASS**).

---

## 7. Automated Test Suite Results

```powershell
pytest tests/ -v
```
- **Passed**: 26
- **Failed**: 0
- **Duration**: 1.49 seconds

```text
tests/test_alarm_service.py::test_critical_low_alarm PASSED              [  3%]
tests/test_alarm_service.py::test_warning_low_alarm PASSED               [  7%]
tests/test_alarm_service.py::test_normal_level PASSED                    [ 11%]
tests/test_alarm_service.py::test_overflow_alarm PASSED                  [ 15%]
tests/test_alarm_service.py::test_sensor_fault_detection PASSED          [ 19%]
tests/test_alarm_service.py::test_voltage_fault PASSED                   [ 23%]
tests/test_api.py::test_root_endpoint PASSED                             [ 26%]
tests/test_api.py::test_health_endpoint PASSED                           [ 30%]
tests/test_api.py::test_auth_login PASSED                                [ 34%]
tests/test_api.py::test_tank_live_status PASSED                          [ 38%]
tests/test_api.py::test_telemetry_history PASSED                         [ 42%]
tests/test_api.py::test_csv_export PASSED                                [ 46%]
tests/test_calculator.py::test_geometry_defaults PASSED                  [ 50%]
tests/test_calculator.py::test_water_height_calculation PASSED           [ 53%]
tests/test_calculator.py::test_volume_liters_calculation PASSED          [ 57%]
tests/test_calculator.py::test_fill_percentage_calculation PASSED        [ 61%]
tests/test_calculator.py::test_capacity_ranks PASSED                     [ 65%]
tests/test_calculator.py::test_overflow_unconstrained PASSED             [ 69%]
tests/test_downsampler.py::test_lttb_point_reduction PASSED              [ 73%]
tests/test_downsampler.py::test_lttb_peak_preservation PASSED            [ 76%]
tests/test_downsampler.py::test_lttb_valley_preservation PASSED          [ 80%]
tests/test_history_service.py::test_aggregate_stats PASSED               [ 84%]
tests/test_history_service.py::test_empty_stats PASSED                   [ 88%]
tests/test_telemetry_parser.py::test_parse_valid_json PASSED             [ 92%]
tests/test_telemetry_parser.py::test_parse_legacy_keys PASSED            [ 96%]
tests/test_telemetry_parser.py::test_invalid_json PASSED                 [100%]
```

---

## 8. Defects Discovered & Remediated During Audit

| Defect ID | Description | Severity | Remediation | Verification |
| :--- | :--- | :---: | :--- | :---: |
| **DEF-01** | Frontend lacked React Native Web configuration; used standard React | HIGH | Installed `react-native-web` and configured canonical `AppRegistry` bootstrap | **FIXED** (Build passes) |
| **DEF-02** | `react-scripts 5.0.1` failed on Node 24 due to legacy ajv-keywords dependency | HIGH | Replaced bundler with modern `vite` + `@vitejs/plugin-react` | **FIXED** (242ms build) |
| **DEF-03** | Passlib 1.7.4 had wrap-bug compatibility error with modern `bcrypt 5.0+` | MEDIUM | Refactored `app/core/security.py` to use direct `bcrypt` | **FIXED** (Auth tests pass) |
| **DEF-04** | Pydantic `UserOut` schema failed on model validation due to camelCase mismatch | MEDIUM | Added field aliases for `full_name`, `is_active`, `created_at` with `populate_by_name=True` | **FIXED** (Login returns token) |
| **DEF-05** | Acknowledged alarms were not auto-resolved when tank refilled | MEDIUM | Updated `alarm_repo.py` and `client.py` to query `status="OPEN"` | **FIXED** (Auto-resolves on refill) |
| **DEF-06** | Alembic migration collided with `create_all` pre-existing tables | LOW | Cleaned and applied migration directly through `alembic upgrade head` | **FIXED** (`001_initial_schema (head)`) |

---

## 9. Ubidots Dependency Scan Results

- **Scan Methodology**: Recursive regex search for `ubidots` across all source code, configurations, scripts, schemas, and dependencies, excluding `node_modules` and `venv`.
- **Findings**: Exactly 0 occurrences in executable runtime code.
- **Documentation References**: Only historical decommissioning instructions in `README.md`, `ARCHITECTURE.md`, `MIGRATION_PLAN.md`, and `MQTT_PROTOCOL.md`.
- **Verdict**: **100% Free of Ubidots** (**PASS**).

---

## 10. Physical Hardware Validation Status

- **Status**: **NOT TESTED** (Explicitly reported per QA standards).
- **Details**: Full edge-to-cloud telemetry simulation was verified against the local MQTT broker and backend. Physical flashing and over-the-air validation with physical ESP32-S3 hardware and Quectel EC200U cellular modems must be executed on a depot hardware test bench using the AT command sequence detailed in [`MQTT_PROTOCOL.md`](file:///C:/Users/User/Documents/Antigravity_soumik/PanoramaWaterTank_NextGen/docs/MQTT_PROTOCOL.md).

