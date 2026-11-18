# Changelog

All notable changes to the **Panorama Water Tank Monitor (WLI SCADA NextGen)** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.3.0] - 2026-11-18

### Added
- **Comprehensive Audit & Optimization Documentation:** Published `REPOSITORY_AUDIT.md`, `OPTIMIZATION_REPORT.md`, `SECURITY_AUDIT.md`, `PERFORMANCE_REPORT.md`, `TEST_RESULTS.md`, and updated `DEPLOYMENT_GUIDE.md`.
- **SQLite Persistence & Optimistic Concurrency (`HTTPS_Server`):** Added persistent WAL-mode SQLite write-through for telemetry (`panorama_telemetry.db`) and shared multi-user fleet state (`panorama_shared_state.db`) with optional `expected_version` (`409 Conflict`) checks.
- **Postman Collection & Environment:** Added zero-secret importable collection and environment under `HTTPS_Server/docs/postman/`.
- **CI Coverage Expansion:** Added `HTTPS_Server/tests` (73 tests) and a production sourcemap-leak check to `.github/workflows/ci.yml`.

### Fixed
- **Backend ORM OOM & Startup Overwrites (`backend/app/`):** Changed `Device.telemetry_readings` from `lazy="selectin"` to `lazy="select"`, prevented startup from overwriting existing `@admin`/`@employee` passwords or custom SCADA settings, added composite telemetry indexes, enabled SQLite `PRAGMA foreign_keys=ON`, fixed `NameError: utc_now` in `devices.py` and `TypeError` in `outbox_repo.py`, converted `GET /settings/config` from 30 queries to 1, offloaded blocking TCP probes to `asyncio.to_thread`, and fixed WebSocket broadcast concurrency races.
- **Authentication Hardening (`HTTPS_Server`):** Hardened case-insensitive `Authorization: Bearer` and `X-Device-Token` validation, exposed both schemes in OpenAPI `/docs`, rejected reserved header names sent as token values, and enforced WebSocket `Origin` allowlist + payload size caps.
- **HTTPS Laboratory Frontend:** Repaired broken record-inspection modal IDs (`#record-modal-close`, `#record-modal-body`), fixed Communication Monitor startup race, skipped redundant 3 s/10 s DOM rebuilds, debounced JSON syntax highlighting, paused hidden-tab clocks, and resolved `/docs` & `/openapi.json` links dynamically for GitHub Pages.
- **Main SCADA Frontend & Build Pipeline:** Eliminated 5.32 MB of leaked dev sourcemaps and 100 MB of recursive Capacitor APK duplication, restored missing `@keyframes spin`/`.animate-spin`, fixed `1024px`/`768px` CSS breakpoint collisions, fixed timer/listener leaks in `centralStateSync.ts`, `AppContext.tsx`, and `InstallAppModal.tsx`, and gated `window.panoramaNavigate`.

### Security
- Scrubbed hardcoded live-format Ubidots API token (`BBUS-*`) from `src/configuration/SettingsManager.cpp` and sample token from `backend/app/api/v1/settings.py`.
- Removed permissive wildcard `*.vercel.app` CORS regex from `backend/app/main.py`.
- Added `token_version` revocation checks to `get_current_user_optional` and `current_password` verification to `change-password`.

### Performance & Cleanup
- Cut `HTTPS_Server` SQLite write latency by **55–58%** (`POST /api/telemetry`: 13.67 ms → 5.69 ms; `PUT /api/sync/state/fleet`: 15.56 ms → 7.00 ms) via persistent WAL connections and amortized pruning.
- Removed 257 tracked stale debug logs, gitignored screenshots, dev sourcemaps, and redundant cache files (~58+ MB) and unused dependencies (`passlib[bcrypt]`, `python-multipart`) from `backend/requirements.txt`.

---

## [2.2.0] - 2026-11-17

### Added
- **Phase 1 Complete Technical Audit**: Exhaustive verification of embedded C++ firmware, STM32 sensor math, EC200U cellular gateway, FastAPI backend, and Laboratory Dashboard. Published `AUDIT_REPORT.md`.
- **Phase 2 Implementation Plan & Telemetry Contracts**: Step-by-step phased migration roadmap published in `IMPLEMENTATION_PLAN.md`.
- **Zero-Loss Telemetry Mapping**: Full 1-to-1 migration table mapping legacy MQTT fields (`cm1`, `wlp1`, `bat`, `wlv1`, `lat`, `long`, `chno`, `trno`) to modern HTTPS schema published in `MQTT_TO_HTTPS_MAPPING.md`.
- **Hardware Telemetry Schema**: Formally specified direct JSON post (`POST /api/telemetry`) and document file upload (`POST /api/telemetry/upload`) in `TELEMETRY_SCHEMA.md`.
- **Hardened TLS/SSL 1.2/1.3 Engine**: Configured Quectel EC200U-CN modem with `ISRG Root X1` CA trust anchor, server certificate validation (`seclevel=1`), and SNI in `TLS_CERTIFICATE_SETUP.md`.
- **Standalone Cloud Receiver Subsystem**: Completed isolated FastAPI backend in `HTTPS_Server/` with bounded circular buffer storage, sequence deduplication, 1MB size limit middleware, and responsive Laboratory Dashboard.

### Security
- **Legacy Credential Sanitization**: Removed and sanitized exposed legacy Ubidots API token from `tests/test_e2e_integration.cpp`, replacing with placeholder.
- **Git Exclusions**: Updated `.gitignore` to strictly exclude private keys (`*.key`, `*.pfx`, `*.p12`) and environment configuration secrets.

### Verified
- 8/8 C++ embedded modem unit & integration tests passing (`test_ec200u_firmware.exe`).
- 6/6 physical sensor math & FreeRTOS integration tests passing (`test_phase09_e2e_firmware.exe`).
- 62/62 cloud backend pytest test cases passing (`HTTPS_Server/tests`).
- 10/10 end-to-end cellular AT transaction tests passing (`tools/test_ec200u_live.py`).

---

## [2.0.0] - 2026-11-09

### Added
- Complete Next-Generation web and desktop HMI rebuild utilizing React 18, React Native Web, TypeScript, and Vite.
- Mobile-first responsive architecture supporting ultra-compact smartphones (320px), standard phones (390px/430px), tablets (768px/1024px), and desktop workstations (1366px/1920px).
- Centralized `tankStatusService` pure calculation engine enforcing 4-point operational verification (device mapping, telemetry receipt, 120s timeout, carrier link) and mathematical consistency $\text{Total Tanks} = \text{Online} + \text{Offline}$.
- High-performance asynchronous FastAPI backend daemon with SQLAlchemy 2.0 ORM and SQLite WAL / PostgreSQL persistence.
- Time-series downsampling engine utilizing Largest-Triangle-Three-Buckets (LTTB) algorithm reducing 1,000 points to 100 visually accurate points in < 4.5ms.
- Full 58-test automated pytest backend test suite covering boundary calculations, downsampling, API security, and concurrency.
- Enterprise security audit reports covering OWASP Top 10, ASVS v4.0, and OWASP API Top 10 (`PROJECT_SECURITY_AUDIT/`).
- Native desktop Electron 30 wrapper with context isolation, process tree supervision, and single-instance locks.

### Fixed
- **P0 Path Traversal:** Remediated arbitrary file reading vulnerability in SPA fallback handler via `os.path.realpath` canonicalization and parent containment checks.
- **P1 Permissive CORS:** Narrowed wildcard regex from `*.github.io` strictly to authorized repository domain (`soumikbur.github.io`) and local loopback.
- **P2 CSV Formula Injection:** Neutralized DDE trigger characters (`=`, `+`, `-`, `@`) in historical telemetry export.
- **P2 Content Security Policy:** Stripped `'unsafe-eval'` and whitelisted specific MQTT/WebSocket endpoints.
- **P3 Build Sync Paths:** Corrected `build.cjs` synchronization target to prevent escaping repository root.
- **P3 Python Detection in Electron:** Added standard `.venv` virtual environment discovery in addition to legacy `venv`.

### Security
- Implemented bcrypt password verification with 72-byte safe UTF-8 truncation.
- Configured sliding-window rate limiting on authentication and employee registration endpoints.
- Enforced server-side session revocation via database-backed `token_version` tracking.
- Hardened defensive HTTP headers (`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`).

---

## [1.0.0] - Legacy Reference
- Initial legacy desktop release built on C++17, Qt 6.8, QML, and proprietary cloud dependencies.
