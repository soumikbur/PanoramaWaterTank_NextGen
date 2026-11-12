# Source Code Structure — Panorama Water Tank NextGen

Root Path: `C:\Users\User\Documents\Antigravity_soumik\PanoramaWaterTank_NextGen`

---

## 1. Top-Level Directory Map

| Directory / File | Purpose | Notes / Status |
| :--- | :--- | :--- |
| `app/` | Qt 6 C++ entry point (`main.cpp`, `ApplicationController.*`) | Active Qt desktop shell |
| `src/` | Qt 6 C++ domain, networking, telemetry, SQLite repository, security modules | `src/domain/TankModel.cpp` updated in commit `2f96886` |
| `qml/` | Qt Quick / QML UI (`App.qml`, `auth/`, `components/`, `pages/`, `search/`, `theme/`) | 65+ QML files compiled into QML cache |
| `tests/` | 6 C++ `Qt::Test` suites (`test_csv_export.cpp`, `test_mqtt_service.cpp`, etc.) | Registered via CTest in `CMakeLists.txt` |
| `resources/` | Qt binary resources (fonts, SVG/PNG icons, logo assets) | Embedded via `qt_add_resources` |
| `build/` | Existing MinGW Qt CMake build output (`build/bin/PanoramaWaterTank.exe`) | Built `2026-10-30`; uses `mingw1310_64` |
| `backend/` | FastAPI async backend, SQLAlchemy models, Paho-MQTT worker, Alembic, PyInstaller spec | Contains `venv/` (valid Python 3.14), broken `.venv/`, `dist/panorama-backend/`, `static/` |
| `apps/mobile/` | Responsive React 18 / `react-native-web` SPA + Electron 45 desktop wrapper | Bundled with `esbuild`; contains `electron/`, `scripts/`, `src/`, audit logs & screenshots |
| `dist/` | Root synced copy of production web SPA | Populated by `scripts/sync_dist.js` -> serves `backend/static` fallback & GitHub Pages |
| `scripts/` | Root build/sync helper (`sync_dist.js`, etc.) | Invoked by root `npm run build` |
| `config/` | Mosquitto broker config (`mosquitto.conf`) & JSON schema (`topic_schema.json`) | Used by `docker-compose.yml` |
| `docs/` | Architecture, API, development setup, hardware, and security Markdown specs | Mostly written `2026-11-09`; parts out of date vs code |
| `graphify-out/` | Graphify knowledge graph, HTML callflow, and `GRAPH_REPORT.md` | Last generated around commit `70ee9c6` / `eff626a` |
| `PROJECT_SECURITY_AUDIT/` | Prior security audit report (`FINAL_SECURITY_AUDIT_REPORT.md`) | Historical audit reference |
| Root Build & Config | `CMakeLists.txt`, `CMakePresets.json`, `package.json`, `build-windows.bat`, `build-windows.ps1`, `docker-compose.yml`, `Dockerfile`, `railway.json`, `render.yaml`, `Procfile` | Multi-target packaging & PaaS manifests |

---

## 2. FastAPI Backend (`backend/`)

```text
backend/
├── app/
│   ├── main.py                      # FastAPI lifespan, CORS, CSP headers, static SPA mount
│   ├── api/v1/
│   │   ├── __init__.py              # Aggregates all /api/v1 routers
│   │   ├── auth.py                  # Login, register, logout (token_version), /me, RBAC deps
│   │   ├── users.py                 # Admin CRUD, reset-password, approve/reject, status update
│   │   ├── devices.py               # Hardware UID registration, coach mapping, online status
│   │   ├── trains.py                # Dynamic consist/train CRUD & deletion rules
│   │   ├── tanks.py                 # Tank geometry/threshold config & /tanks/live telemetry
│   │   ├── telemetry.py             # Historical readings + LTTB downsampling + ingest helper
│   │   ├── alarms.py                # List/acknowledge/stats + POST /alarms/clear (2f96886)
│   │   ├── settings.py              # Key-value settings CRUD + alarm enable flags + defaults
│   │   ├── location.py              # Corridor stations (HWH-ASN), train GPS, Haversine ETA
│   │   ├── export.py                # RFC 4180 CSV export with formula-injection sanitization
│   │   ├── health.py                # /health check
│   │   └── ws.py                    # WebSocket /api/v1/ws/telemetry + /ws/alarms
│   ├── core/
│   │   ├── config.py                # Pydantic Settings (.env loader, defaults)
│   │   ├── database.py              # Async SQLAlchemy engine, SQLite WAL, seed users & schema patching
│   │   ├── security.py              # bcrypt password hashing & HS256 JWT helpers
│   │   ├── rate_limit.py            # API rate limiting utilities
│   │   └── upload_validator.py      # Magic-byte & size validation for registration uploads
│   ├── models/                      # ORM models: user, device, tank, telemetry, alarm (+AlarmHistory), setting, audit
│   ├── schemas/                     # Pydantic v2 request/response schemas (telemetry, auth, alarm, etc.)
│   ├── repositories/                # DB query layer: alarm_repo, device_repo, settings_repo, tank_repo, telemetry_repo
│   ├── services/
│   │   ├── calculator.py            # VolumeCalculator (Liters, height %, LOW/MODERATE/GOOD/HIGH rank)
│   │   ├── alarm_service.py         # Evaluates SENSOR_FAULT, CRITICAL_LOW, WARNING_LOW, OVERFLOW, VOLTAGE_FAULT
│   │   ├── downsampler.py           # LTTB downsampling engine
│   │   └── history_service.py       # History query aggregation
│   ├── mqtt/
│   │   ├── client.py                # Paho VERSION2 subscriber -> DB persistence + WS broadcast
│   │   └── parser.py                # Flat JSON telemetry normalizer (MqttTelemetryPayload)
│   └── websocket/manager.py         # Active WebSocket connection manager & JSON broadcaster
├── migrations/                      # Alembic env.py + 001_initial_schema.py
├── scripts/
│   ├── recover_admin.py             # CLI admin credential recovery helper
│   └── simulate_telemetry.py        # Simulated railway MQTT publisher (Delhi-Agra test route)
├── tests/                           # 11 pytest modules (58 tests total)
├── static/                          # Compiled web assets served directly by FastAPI
├── dist/panorama-backend/           # Prebuilt PyInstaller one-dir executable + local DB
├── venv/                            # Working Python 3.14.6 virtual environment
└── .venv/                           # Copied home-laptop venv (broken path -> Python312)
```

---

## 3. Responsive Frontend & Electron Desktop (`apps/mobile/`)

```text
apps/mobile/
├── electron/
│   ├── main.cjs                     # Spawns backend binary/venv on random/8000 port; Electron BrowserWindow
│   ├── preload.cjs                  # Context-isolated window.electronAPI IPC bridge
│   └── assets/                      # App icons (.ico/.png) + generate_icon.ps1
├── scripts/
│   ├── build.cjs                    # esbuild bundler + GitHub Pages SPA 404.html + asset emitter
│   ├── dev.cjs / preview.cjs        # Local esbuild dev/preview servers
│   ├── test_alert_notification_unit.cjs  # Standalone Node unit test (11 assertions)
│   └── verify_*.cjs                 # 20+ Playwright / Puppeteer / Chrome verification scripts
├── src/
│   ├── App.tsx                      # Root auth gate, ErrorBoundary, screen switcher
│   ├── index.tsx                    # ReactDOM mount + Leaflet & global CSS imports
│   ├── api/client.ts                # Fetch wrapper with Bearer JWT & Electron/Web base-URL auto-detection
│   ├── state/AppContext.tsx         # Central polling, WebSocket, MQTT, train/coach selection & alert state
│   ├── context/DisplayPreferencesContext.tsx  # Scale presets, density, contrast persistence
│   ├── services/
│   │   ├── mqttService.ts           # Browser Paho-MQTT WSS client + 500-frame ring buffer
│   │   ├── websocket.ts             # Reconnecting WebSocket client -> telemetry/alarm events
│   │   ├── alertNotificationService.ts  # Deduplicated toast/banner/sound alert engine (commit 2f96886)
│   │   ├── tankStatusService.ts     # Client-side tank health/staleness calculations
│   │   ├── deviceRegistry.ts        # Device registry helpers
│   │   └── router.ts                # Hash/path SPA routing helper
│   ├── components/
│   │   ├── auth/AuthLayout.tsx
│   │   ├── charts/                  # LevelTrendCard.tsx, TrendChart.tsx (SVG charts)
│   │   ├── common/                  # Header, Sidebar, Footer, ErrorBoundary, StatusBadge, AlertToastBanner
│   │   ├── dashboard/               # SummaryGrid, SummaryCard, TankInfoCard, RankIndicator
│   │   ├── layout/AppLayout.tsx     # Desktop sidebar + mobile drawer + responsive shell
│   │   ├── settings/DisplaySettingsPanel.tsx
│   │   └── tank/TankVisualization.tsx  # Animated fluid wave & dual sensor visual gauge
│   ├── screens/                     # 17 screens (16 routed + 1 orphaned DevicesScreen.tsx)
│   └── styles/ & theme/             # CSS media-query system + design tokens
```

---

## 4. Classic Qt 6 Desktop Application (`app/`, `src/`, `qml/`, `tests/`)

- **Entry & Orchestration (`app/`):** `main.cpp` registers `ApplicationController` and custom QML types; `ApplicationController.cpp` wires backend managers, timers, MQTT, API polling, and DB initialization.
- **Core & Domain (`src/core/`, `src/domain/`):** `VolumeCalculator`, `TimeManager`, `HistoryExporter`, `DisplayPerformanceManager`, `Logger`, `TankModel`, `TrainManager`, `RailwayManager`, `TrainConfigProvider`.
- **Networking & Telemetry (`src/networking/`, `src/telemetry/`):** `ApiClient` (Ubidots v1.6/v2.0 + Direct ESP32 REST `/status`, `/health`, `/history`, `/sync`, `/config`), `ConnectionManager`, `MqttService`, `MqttConfig`.
- **Persistence & Security (`src/repository/`, `src/security/`, `src/services/`, `src/configuration/`):** `DatabaseManager` (`QSQLITE`), `TankRepository`, `AuthManager`, `PermissionManager`, `SettingsManager`, `LocationManager`, `SearchManager`, `ApplicationStateManager`.
- **QML UI (`qml/`):** `App.qml` (frameless or native window, navigation stack, global search), `auth/` (RoleSelection, AdminLogin, UserLogin), `pages/` (15 pages matching sidebar routes), `components/` (37 reusable Qt Quick components including `LocationMap.qml` and `WaterWave.qml`).
- **C++ Tests (`tests/`):** `test_csv_export.cpp`, `test_e2e_integration.cpp`, `test_esp32_rest.cpp`, `test_location_and_tanks.cpp`, `test_role_railway_architecture.cpp`, `test_mqtt_service.cpp`.

