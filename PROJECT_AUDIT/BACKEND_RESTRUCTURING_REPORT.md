# Backend Restructuring Report — Panorama Water Tank Monitor (NextGen)

**Date**: November 16, 2026  
**Status**: COMPLETE & PRODUCTION-READY  

---

## 1. Objectives Accomplished

1. **Eliminated "Save Failed: Remote backend unreachable" Error**:
   - Replaced fragile hostname assumptions with robust, multi-environment resolution in `apps/mobile/src/config/apiConfig.ts`.
   - Connected Android Emulator natively to the host machine backend via `http://10.0.2.2:8000/api/v1`.
   - Centralized `deviceRegistry.ts` to consume `resolveApiBaseUrl()`.

2. **Differentiated Persistence Statuses**:
   - Refactored `ApiClient.applyUnifiedConfig()` in `apps/mobile/src/api/client.ts` to return granular synchronization flags:
     - `DATABASE_SAVED`: Persisted directly to authoritative PostgreSQL/SQLite database.
     - `OFFLINE_PENDING_SYNC`: Persisted to local queue/cache with pending synchronization; no false alarm error thrown to user.
   - Updated `SettingsScreen.tsx` to display accurate feedback according to actual persistence state.

3. **Restructured Standalone Backend Service**:
   - Updated `backend/run_server.py` to bind to `0.0.0.0:8000` by default, ensuring all client types (desktop, web, emulator, physical LAN) can connect simultaneously.
   - Preserved background execution of transactional outbox worker and MQTT ingestion loop regardless of frontend lifecycle.

4. **Edge Device Auto-Discovery & Telemetry Parsing**:
   - Resolved edge node dropping in `backend/app/mqtt/client.py`. Devices transmitting factory default train identifiers (`"abcd123"`, `"pano123"`, etc.) are now safely ingested as `status="DISCOVERED"`, `is_online=True`, and `train_number="UNASSIGNED"`.
   - Unified telemetry schema mapping for battery level (`bat` and `v1`) and sensor valid flags (`wlvl` and `wlv1`).

5. **Granular Health Monitoring Endpoints**:
   - Implemented 4 dedicated health endpoints in `backend/app/api/v1/health.py`:
     - `GET /api/v1/health`: Overall system readiness and status.
     - `GET /api/v1/health/database`: Database latency (ms), engine dialect, and connection pool metrics.
     - `GET /api/v1/health/mqtt`: Broker connection status, host, port, TLS, and subscribed topics.
     - `GET /api/v1/health/system`: Backend uptime, memory consumption, CPU usage, process ID, and Python runtime.

---

## 2. Summary of Modified Files

| File | Change Scope | Impact |
| :--- | :--- | :--- |
| `apps/mobile/src/config/apiConfig.ts` | Added `isAndroidCapacitorApp` check, emulator loopback mapping (`10.0.2.2:8000`), and production fallback | Restores reliable connectivity on Android Capacitor and Web |
| `apps/mobile/src/services/deviceRegistry.ts` | Replaced ad-hoc `resolveRegistryApiBase()` with centralized `resolveApiBaseUrl()` | Eliminates 404s on GitHub Pages and unified device sync |
| `apps/mobile/src/api/client.ts` | Enhanced `applyUnifiedConfig()` to return `DATABASE_SAVED` or `OFFLINE_PENDING_SYNC` | Eliminates false "Save Failed" error banners when offline |
| `apps/mobile/src/screens/SettingsScreen.tsx` | Handled `syncStatus` in `handleApply` | Informs user whether saved directly to DB or queued offline |
| `backend/run_server.py` | Changed default host binding from `127.0.0.1` to `0.0.0.0` | Allows external clients (emulator, LAN) to connect |
| `backend/app/mqtt/client.py` | Added edge device discovery for dummy/factory strings; normalized battery & sensor fields | Devices like `002F00654B42501320353332` appear in Auto-Discovery |
| `backend/app/api/v1/health.py` | Added `/health`, `/health/database`, `/health/mqtt`, and `/health/system` | Provides granular subsystem observability |
| `backend/app/repositories/coach_repo.py` | Made `create()` method idempotent across soft-deleted and existing coaches | Eliminates duplicate coach creation and constraint failures |
| `backend/tests/test_api.py` | Added tests for all 3 new health endpoints | Verifies health endpoint contract |
| `backend/tests/test_mqtt_ingestion.py` | Added unit tests for edge node auto-discovery and persistence | Verifies telemetry ingestion for edge hardware |
| `backend/tests/test_permanent_database.py` | Configured batch size in outbox test | Verifies outbox queue flushing |
