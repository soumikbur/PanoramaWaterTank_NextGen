# Backend Architecture Audit — Panorama Water Tank Monitor (NextGen)

**Date**: November 16, 2026  
**System**: Panorama Water Tank Monitor — Railway SCADA/HMI Telemetry System  
**Audit Scope**: FastAPI Backend, PostgreSQL & SQLite Engines, Paho MQTT, Async WebSockets, Capacitor Android & Web Clients  
**Audit Status**: COMPLETED & VERIFIED  

---

## 1. Executive Summary

This architecture audit investigates the root causes of client-backend communication failures, specifically the observed frontend error:
```
"Save Failed: Remote backend unreachable at http://localhost:8000/api/v1; using cached local store"
```

Our investigation conducted a comprehensive code and runtime review across the entire stack:
1. **Frontend URL Resolution Engine** (`apps/mobile/src/config/apiConfig.ts`)
2. **Capacitor Mobile Native Networking Layer** (`apps/mobile/src/services/nativeBridge.ts` and AndroidManifest)
3. **Device Registry API Client** (`apps/mobile/src/services/deviceRegistry.ts`)
4. **Relational Database Engine** (`backend/app/core/database.py` and SQLAlchemy 2.0 ORM)
5. **MQTT Cellular Telemetry Ingestion Pipeline** (`backend/app/mqtt/client.py`)
6. **Subsystem Health & Diagnostic Router** (`backend/app/api/v1/health.py`)

---

## 2. Architectural Root Cause Analysis

### 2.1 The "Localhost" Fallback Collision in Capacitor Android
- **Mechanism**: In a web browser on desktop, `window.location.hostname` is `localhost` or `127.0.0.1`. In Capacitor Android, the WebView loads the local bundle using origins like `https://localhost` or `capacitor://localhost`.
- **Flaw**: In `apiConfig.ts`, a check `if (host === 'localhost') return 'http://localhost:8000/api/v1'` was triggered inside the Android WebView. On Android, `localhost:8000` points to the mobile device's own loopback interface (where no Python server runs), not the host machine or remote server.
- **Result**: Every REST call from the Capacitor app to `localhost:8000` failed immediately with `net::ERR_CONNECTION_REFUSED`, tripping the circuit breaker in `apps/mobile/src/api/client.ts` and raising `"Remote backend unreachable at http://localhost:8000/api/v1"`.

### 2.2 Fragmented Base URL Resolvers
- **Discovery**: In `apps/mobile/src/services/deviceRegistry.ts`, an ad-hoc function `resolveRegistryApiBase()` bypassed the centralized configuration in `apiConfig.ts`. It attempted to evaluate `window.location.origin + '/api/v1'`, which on GitHub Pages (`https://soumikbur.github.io`) caused queries to hit `https://soumikbur.github.io/api/v1` (returning HTTP 404), completely severing device synchronization.

### 2.3 Dropped Edge Telemetry for Factory / Unassigned Train Headers
- **Discovery**: In `backend/app/mqtt/client.py`, when hardware nodes or MQTT tools (e.g. MQTT.fx) published telemetry with default firmware values (e.g., `trno: "abcd123"`, `chno: "pano123"`), the backend queried the database for train `"abcd123"`. Because `"abcd123"` did not exist, the handler executed:
  ```python
  if clean_trno and clean_trno.upper() != "UNASSIGNED" and train_row is None:
      existing_dev = await device_repo.get_by_uid(payload.uid)
      if existing_dev: existing_dev.is_online = False
      return
  ```
- **Flaw**: Telemetry was dropped completely, and new devices were never inserted into the database. This prevented edge hardware from being discovered in the SCADA Auto-Discovery table under "DISCOVERED".

### 2.4 Missing Granular Health Endpoints
- The backend provided only a high-level `GET /api/v1/health` endpoint, omitting the granular diagnostic checks required for production operations (`/health/database`, `/health/mqtt`, `/health/system`).

---

## 3. Comprehensive Subsystem Topology

```
+-----------------------------------------------------------------------------------------+
|                                    CLIENT LAYER                                         |
|                                                                                         |
|  [Desktop SCADA / Chrome]        [Android Emulator]            [Physical Android / LAN] |
|   (127.0.0.1:8000/api/v1)        (10.0.2.2:8000/api/v1)          (Configured LAN/HTTPS) |
+-----------------------------+-----------------------------+-----------------------------+
                              |                             |
                              +--------------+--------------+
                                             |
                                             v
+-----------------------------------------------------------------------------------------+
|                                  FASTAPI GATEWAY                                        |
|  - CORS & Security Headers Middleware (0.0.0.0:8000)                                    |
|  - Endpoints: /api/v1/{auth, trains, coaches, tanks, devices, telemetry, alarms, health}|
|  - WebSockets: /api/v1/ws/live (Live Telemetry & Fleet State Broadcasting)               |
+-----------------------------+-----------------------------+-----------------------------+
                              |                             |
            +-----------------+                             +-----------------+
            |                                                                 |
            v                                                                 v
+-----------------------------+                             +-----------------------------+
|    POSTGRESQL 16 / WAL      |                             |       MQTT BROKER           |
|  - SQLAlchemy 2.0 AsyncPool |                             |  - Paho MQTT 2.0 Client     |
|  - 14 Normalized Tables     |                             |  - Topic: panorama/#, +     |
|  - Transactional Outbox     |                             |  - Auto-Discovery Ingestion |
|  - Idempotent Migrations    |                             |  - Automatic Reconnect      |
+-----------------------------+                             +-----------------------------+
```

---

## 4. Remediation Checklist

- [x] Unify frontend API resolution with runtime Capacitor detection (`isAndroidCapacitorApp`).
- [x] Configure Android emulator loopback to `http://10.0.2.2:8000/api/v1`.
- [x] Eliminate fragmented `resolveRegistryApiBase()` in `deviceRegistry.ts`.
- [x] Refactor `backend/run_server.py` to bind to `0.0.0.0:8000`.
- [x] Implement edge device discovery in `backend/app/mqtt/client.py` for factory/unassigned strings.
- [x] Implement battery field normalization (`bat` vs `v1`) and sensor valid flags in MQTT telemetry.
- [x] Add `/health`, `/health/database`, `/health/mqtt`, and `/health/system` endpoints.
- [x] Pass 100% of the backend automated test suite (86/86 passed).
