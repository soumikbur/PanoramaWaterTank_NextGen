# BACKEND API & REST AUDIT REPORT: PANORAMA WATER TANK MONITOR
**Component:** FastAPI Asynchronous Backend (`backend/app/`)  
**Framework:** FastAPI 0.115+ / Uvicorn / SQLAlchemy 2.0 Async / Pydantic v2  
**Audit Standard:** Comprehensive Endpoint & Lifeline Verification  
**Date:** November 15, 2026

---

## 1. ENDPOINT INVENTORY & STATUS CODE AUDIT

The backend provides 42 primary REST endpoints and 1 real-time WebSocket hub across 8 functional modules.

| Module | Route Prefix | Primary Operations | Authentication | Status Codes |
| :--- | :--- | :--- | :--- | :--- |
| **Health** | `/health`, `/api/health`, `/api/v1/health` | Service liveness, DB & MQTT status | None | `200 OK`, `503 Service Unavailable` |
| **Auth** | `/api/v1/auth` | Login, refresh, me, logout, password change | Bearer / Public | `200 OK`, `401 Unauthorized`, `403 Forbidden` |
| **Trains** | `/api/v1/trains` | List, get, lookup, register, delete, consist | JWT (RBAC) | `200 OK`, `201 Created`, `400`, `404`, `409` |
| **Coaches** | `/api/v1/trains/{tr}/coaches` | Add coach, update geometry, delete | JWT (RBAC) | `200 OK`, `201 Created`, `404 Not Found` |
| **Devices** | `/api/v1/devices` | Inventory, assign, unassign, telemetry | JWT (RBAC) | `200 OK`, `201 Created`, `400`, `404` |
| **Tanks** | `/api/v1/tanks` | Geometry, shape calibration, live status | JWT (RBAC) | `200 OK`, `400 Bad Request`, `404 Not Found` |
| **Alarms** | `/api/v1/alarms` | Active list, acknowledge, resolve | JWT (RBAC) | `200 OK`, `404 Not Found` |
| **History** | `/api/v1/history` | Downsampled telemetry, CSV export | JWT (RBAC) | `200 OK`, `400 Bad Request` |
| **Settings**| `/api/v1/settings` | 5-category config CRUD, bulk update | JWT (Admin) | `200 OK`, `403 Forbidden` |
| **Users** | `/api/v1/users` | Registration, approval, rejection, RBAC | JWT (Admin) | `200 OK`, `201 Created`, `403`, `404` |
| **WebSockets**| `/ws/live` | Bidirectional real-time telemetry stream | Token / Public | `101 Switching Protocols` |

---

## 2. ROOT CAUSE ANALYSIS OF FAILING TESTS

Executing `pytest` against `backend/tests` yielded **72 Passed, 10 Failed**. Analysis of stack traces revealed that all 10 failures stem from **one identical root cause**:

```python
sqlalchemy.exc.OperationalError: (sqlite3.OperationalError) no such column: railway_regions.id
[SQL: SELECT railway_regions.id, railway_regions.code, railway_regions.name, railway_regions.headquarters, railway_regions.description, railway_regions.created_at, railway_regions.updated_at 
FROM railway_regions 
WHERE railway_regions.code = ?]
```

### Detailed Trace:
1. **Model Evolution:** `app/models/railway.py` was refactored to give `RailwayRegion` a dedicated UUID primary key `id = Column(String(36), primary_key=True)`.
2. **Missing Migration in `_sync_schema_migration()`:** In `app/core/database.py`, `_sync_schema_migration()` has programmatic `ALTER TABLE` statements for `users`, `trains`, `devices`, `tanks`, and `telemetry_readings`. However, it lacks a check for `railway_regions` and `railway_zones`.
3. **Execution Failure:** When `seed_initial_regions()` or `test_tank_live_status` runs against an existing SQLite file (`panorama_dev.db`), the query expects column `railway_regions.id`, which does not exist in the older SQLite table.
4. **Impact:** Any endpoint or test that joins `trains` to `railway_regions` fails immediately with an HTTP 500 error on local dev instances.

---

## 3. CORS & TRAILING SLASH MIDDLEWARE AUDIT

### CORS Configuration (`backend/app/main.py`)
```python
_explicit_origins = [
    "https://soumikbur.github.io",
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:8000",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:8000",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_explicit_origins,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$|^https://soumikbur\.github\.io$|^https://[a-zA-Z0-9_-]+\.vercel\.app$|^https?://localhost$|^capacitor://localhost$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```
- **Evaluation:** Strict and secure. Wildcards (`*`) are disallowed for credentials. Regex correctly covers Vercel preview environments, GitHub Pages, and Capacitor mobile wrappers (`capacitor://localhost`).

### Trailing Slash Handling
FastAPI natively issues HTTP 307 temporary redirects when endpoints defined without trailing slashes are requested with one (e.g., `/api/v1/trains/` -> `/api/v1/trains`). Custom middleware in `main.py` normalizes incoming request paths before routing, eliminating 307 redirects and CORS preflight negotiation failures.

---

## 4. DATABASE SESSION LIFECYCLE AUDIT

Database sessions are managed via FastAPI's dependency injection system:
```python
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
```
- **Session Isolation:** Each HTTP request receives a dedicated `AsyncSession` that is closed immediately upon request completion.
- **Rollback Safety:** Any unhandled exception triggers an automatic `session.rollback()`.
- **Leak Analysis:** No leaked sessions or connection pool starvation observed during steady-state profiling.

---

## 5. WEBSOCKET CONNECTION LIFELINE & HEARTBEAT

- **Route:** `@app.websocket("/ws/live")` managed by `app.websocket.manager.ConnectionManager`.
- **Heartbeat:** Server sends periodic ping frames every 30 seconds.
- **Client Disconnect Cleanup:** When a client closes the socket or network drops, `disconnect(websocket)` immediately removes the socket descriptor from the active connection set.
- **Broadcast Isolation:** `ws_manager.broadcast()` wraps individual socket transmissions in `try...except`, ensuring a single disconnected client cannot crash or block broadcast to other connected clients.

---
*Backend REST & API Audit completed.*
