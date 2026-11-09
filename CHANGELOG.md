# Changelog

All notable changes to the **Panorama Water Tank Monitor (WLI SCADA NextGen)** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
