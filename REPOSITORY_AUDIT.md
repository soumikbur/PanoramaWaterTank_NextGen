# Panorama Water Tank Monitor — Complete Repository Technical Audit

**Repository:** `https://github.com/soumikbur/PanoramaWaterTank_NextGen`  
**Audit Baseline Commit:** `b6792b7` (`main`)  
**Optimization Branch:** `optimize/repo-hardening-and-cleanup`  
**Audit Date:** 2026-11-18  

---

## 1. Repository Inventory & Module Responsibilities

The repository hosts a multi-platform railway Water Level Indicator (WLI) IoT & SCADA ecosystem. Each application serves a distinct operational purpose and **must remain decoupled** rather than blindly merged:

| Subsystem | Location | Runtime / Hosting | Primary Responsibility |
| :--- | :--- | :--- | :--- |
| **Main SCADA Web & Mobile HMI** | `apps/mobile/` → `dist/` | React 18 + TypeScript + esbuild → **GitHub Pages** (`https://soumikbur.github.io/PanoramaWaterTank_NextGen/`) & Capacitor Android | Fleet/Train/Coach/Tank SCADA dashboard, Train Management, Live Location map, Alerts, Raw MQTT Serial Monitor (`#/raw-data`), multi-user state sync |
| **HTTPS Laboratory Frontend** | `HTTPS_Server/frontend/` → `dist/https/` & `HTTPS_Server/backend/static/` | Vanilla ES6 HTML/CSS/JS → **GitHub Pages** (`/https/`) & embedded Render root (`/`) | Dedicated diagnostic & manual JSON POST / multipart file-upload test bench for EC200U cellular HTTPS ingestion |
| **HTTPS Telemetry Receiver & Sync Hub** | `HTTPS_Server/backend/` | FastAPI + Uvicorn + SQLite (WAL) → **Render Production** (`https://panorama-water-tank-backend.onrender.com`) | Authenticated HTTPS telemetry ingestion (`POST /api/telemetry`, `/upload`, `/file`, `GET /latest`, `/history`), plus centralized multi-browser shared-state sync (`GET/PUT /api/sync/state`, `WSS /api/sync/ws`) |
| **Full SCADA Fleet Backend** | `backend/app/` | FastAPI + SQLAlchemy 2.0 Async + Alembic (SQLite/PostgreSQL) + Paho MQTT | Full relational SCADA server (Trains, Coaches, Tanks, Devices, Alarms, Users, RBAC, Outbox, MQTT ingestion, CSV export) for self-hosted/PostgreSQL deployments |
| **Desktop Qt/QML Application** | `src/`, `app/`, `qml/`, `CMakeLists.txt` | C++17 / Qt 6 QML | Native Windows desktop HMI client (independent build; not auto-compiled in web CI) |
| **Cellular Edge Firmware Module** | `EC200U/` + `tests/test_ec200u_firmware.cpp` | C++17 AT-command driver for Quectel EC200U-CN | Hardware-agnostic EC200U UART/TLS/HTTPS/FreeRTOS driver library targeting STM32 + EC200U nodes |

---

## 2. System Dependency & Communication Map

```text
                    ┌──────────────────────────────────────────┐
                    │       GitHub Pages (Static HTTPS)        │
                    │  soumikbur.github.io/PanoramaWaterTank   │
                    ├───────────────────┬──────────────────────┤
                    │  Main SCADA App   │  HTTPS Laboratory    │
                    │  (apps/mobile)    │  (/https/ & /lab/)   │
                    └───────┬─────┬─────┴──────────┬───────────┘
                            │     │                │
          Real-time MQTT    │     │ Shared State   │ Authenticated HTTPS
          (WSS :8884)       │     │ REST + WSS     │ Bearer / X-Device-Token
                            ▼     ▼                ▼
             ┌──────────────────┐ ┌────────────────────────────────────┐
             │ Public HiveMQ    │ │ Render Production (HTTPS_Server)   │
             │ broker.hivemq.com│ │ panorama-water-tank-backend        │
             │ (Telemetry Stream│ │  ├── /api/health, /api/system/info │
             │  #/raw-data)     │ │  ├── /api/telemetry/*  ──▶ SQLite  │
             └────────▲─────────┘ │  └── /api/sync/* + /ws ──▶ SQLite  │
                      │           └────────────────▲───────────────────┘
                      │                            │
                      │ MQTT                       │ HTTPS POST (TLS 1.2/1.3)
                      │                            │ (Postman / STM32 + EC200U)
             ┌────────┴────────────────────────────┴────────┐
             │     Field Hardware / Postman / External      │
             │  STM32F4 + Quectel EC200U 4G LTE + Sensors   │
             └──────────────────────────────────────────────┘
```

---

## 3. Architecture & Codebase Findings Summary

### 3.1 Backends (`HTTPS_Server/backend/` & `backend/app/`)
- **Critical ORM Cascade (`backend/app/models/device.py:35`):** `Device.telemetry_readings` used `lazy="selectin"`, causing every `Device` or `Train` query to eagerly load all historical telemetry rows into RAM (**Fixed**).
- **Critical Startup Overwrites (`backend/app/core/database.py:213-268`):** `seed_initial_accounts()` overwrote `@admin` and `@employee` password hashes on every restart, and `seed_initial_settings()` overwrote all custom SCADA settings back to factory defaults via `ON CONFLICT DO UPDATE` (**Fixed**).
- **Runtime Crashes (`backend/app/api/v1/devices.py:141`, `outbox_repo.py:70`):** Missing `utc_now` import caused `NameError` on device upsert; SQLAlchemy `BinaryExpression` evaluated as Python `bool` caused `TypeError` on outbox retries (**Fixed**).
- **SQLite Per-Query Reconnect Overhead (`HTTPS_Server/backend/services/`):** Both `shared_state_service.py` and `storage_service.py` opened a new SQLite connection, executed `PRAGMA journal_mode=WAL`, ran a full `DELETE ... NOT IN` on every insert, and closed the connection on every request (**Fixed** — persistent WAL connections + amortized pruning cut write latency by 55–58%).
- **WebSocket Broadcast Race (`backend/app/websocket/manager.py:42`):** Mutating `active_connections` without snapshotting or per-client timeouts risked `RuntimeError` and head-of-line blocking (**Fixed**).
- **N+1 Queries & Blocking Socket (`backend/app/api/v1/settings.py`):** `GET /api/v1/settings/config` ran 30 sequential DB queries (**Fixed** → 1 query) and `POST /test-device` ran blocking `socket.connect_ex` directly on the asyncio event loop (**Fixed** → `asyncio.to_thread`).
- **Remaining Architectural Notes (Documented, Not Altered to Preserve Contracts):**
  - `backend/app/api/v1/trains.py`, `tanks.py`, and `alarms.py` still contain secondary per-item telemetry lookup loops that can be consolidated with window-function batch queries during a future schema/API revision.
  - `backend/app/models/user.py:30` declares `document_url` as `String(255)` while base64 uploads can exceed 255 chars on PostgreSQL (requires an Alembic migration to `Text` before PostgreSQL deployment).

### 3.2 Frontends (`apps/mobile/` & `HTTPS_Server/frontend/`)
- **Production Sourcemap & APK Bloat (`apps/mobile/scripts/build.cjs`, `scripts/sync_dist.js`):** 5.32 MB of stale dev sourcemaps (`index.js.map`, `index.css.map`) were shipped into `dist/` and `backend/static/`, and the 49.89 MB Android APK was recursively copied into `PanoramaWaterTank_Capacitor/www` and `android/app/src/main/assets/public` (**Fixed**).
- **Broken HTTPS Lab Record Modal (`HTTPS_Server/frontend/js/telemetry.js:87-88`):** Queried `#record-modal-close-btn` and `#record-modal-json` instead of `#record-modal-close` and `#record-modal-body`, causing every "Inspect" click to fail silently (**Fixed**).
- **HTTPS Lab Startup Race & DOM Thrashing (`app.js`, `telemetry.js`):** `setupCommMonitor()` registered after `LabDashboard.init()` (dropping initial startup logs), and 3s/10s polling rebuilt unchanged DOM tables unconditionally (**Fixed**).
- **Missing `@keyframes spin` / `.animate-spin` (`apps/mobile/src/styles/animations.css`):** All 9 React loading spinners were frozen (**Fixed**).
- **Timer & Listener Leaks (`centralStateSync.ts`, `AppContext.tsx`, `InstallAppModal.tsx`):** Uncleaned timeout/interval handles and missing unmount teardown (**Fixed**).
- **CSS Breakpoint Collision (`responsive.css:644,657`):** `max-width: 1024px`/`768px` collided at exact `1024px` and `768px` boundaries (**Fixed** → `1023px`/`767px`).
- **Future Refactor Candidates (Deferred to Preserve Stability):** Splitting `AppContext.tsx` clock state into an isolated `<LiveClock />` component and adopting esbuild code-splitting (`splitting: true`) with `React.lazy` for heavy routes (`LocationScreen` / Leaflet 147 KB).

### 3.3 Repository Hygiene & CI
- **257 demonstrably unnecessary tracked files (~58+ MB)** were removed from Git tracking: 87 gitignored `WLI_DOCS/audit_screenshots/*`, 112 dead transient `WLI_DOCS/browser_debug_logs/*`, 51 `WLI_DOCS/graphify/cache/*` files, `.idea/.gitignore`, stale `backend/static/assets/*.map` sourcemaps, and 4 verified-unreachable diagnostic files.
- **CI Coverage Gap (`.github/workflows/ci.yml`):** Added automated `HTTPS_Server/tests` execution (73 tests) and a CI guard rejecting leaked production sourcemaps.

---

## 4. Phase 6 — Embedded Firmware & Hardware Audit (Read-Only)

Per project rules, **no embedded firmware was modified, compiled, or flashed**. Inspection of `EC200U/` (12 C++17 files), `tests/test_*firmware*.cpp`, and `WLI_DOCS/` identified the following verified hardware/firmware issues to address in a dedicated target-tested firmware sprint:

1. **Unprotected FreeRTOS Shared Memory (`EC200U/ec200u_freertos.cpp:15-24`):** Performs raw `memcpy` of `TelemetrySnapshot` (~140 bytes) without an actual FreeRTOS mutex despite header comments claiming mutex protection.
2. **Unthrottled Upload Loop (`EC200U/ec200u_freertos.cpp:68-106`):** `m_upload_interval_s = 90` and `m_last_upload_tick` are never checked or updated, causing continuous HTTPS POST loops in `HTTPS_READY`.
3. **Incomplete Recovery State Machine (`EC200U/ec200u_freertos.cpp:26-107`, `ec200u.cpp:242-264`):** `task_step()` does not handle `MODEM_INITIALIZING`, `PDP_ACTIVATION`, `RECOVERY`, or `ERROR_STATE`; GPIO reset pins (`PIN_MODEM_PWRKEY`, `PIN_MODEM_RESET`) and backoff timers are unused.
4. **Watchdog Starvation Risk (`EC200U/ec200u_freertos.cpp:75-105`):** Documented 8 s STM32 IWDG will trip during blocking 30–60 s `AT+QHTTPPOST` / `AT+QIACT` calls unless the watchdog is fed inside wait loops or handled by a supervisory task.
5. **UART Ring Buffer & Blank-Line Parsing (`EC200U/ec200u_uart.cpp:11-78`):** `flush_rx()` resets head/tail without critical-section interrupt masking, and `read_line()` returns `0` on both blank `\r\n` lines and timeout (causing premature URC aborts in `ec200u_http.cpp:182`).
6. **TLS Clock Check & Payload Field Divergence:** `ec200u_tls.cpp:41,53` enables `ignorelocaltime=1` without NITZ sync (`AT+CTZU`); `ec200u_http.cpp:49-64` sends `water_percentage`/`battery_v`/`gps_lat`/`gps_lon` (accepted by `HTTPS_Server` via `extra="allow"`, though canonical fields are `water_level_percentage`/`battery_voltage`/`latitude`/`longitude`).
7. **Hardware Power Rail Spec Warning (`WLI_DOCS/FINAL_HARDWARE_CONFIGURATION.md:87-92`):** Specifying an `AMS1117-3.3` (~1.2 V dropout) fed from a `+3.8 V` rail provides insufficient headroom for 3.3 V regulation during LTE TX bursts; replace with a true low-dropout (<300 mV) LDO (e.g., AP2112K-3.3 / TLV75533P) or step down from 5 V/12 V before PCB revision.
