# Backend Architecture & Service Documentation — Panorama NextGen

The **Panorama Water Tank Monitor — NextGen Backend** is an asynchronous Python service built on **FastAPI 0.110+**, **SQLAlchemy 2.0 (Async)**, and **Paho-MQTT 2.1.0**. It ingests telemetry from edge hardware, evaluates fluid physics and alarms, persists records in **PostgreSQL 16**, and broadcasts live metrics via WebSockets and a transactional outbox queue.

---

## 1. Architectural Highlights

- **Framework**: FastAPI with asynchronous lifecycle (`@asynccontextmanager`)
- **Runtime**: Python 3.11 / 3.12 with `uvloop`/`asyncio`
- **Database Engine**: SQLAlchemy 2.0 with asynchronous drivers (`asyncpg` for PostgreSQL, `aiosqlite` for local dev)
- **Data Serialization**: Pydantic v2 schemas with strict runtime validation
- **Telemetry Transport**: Paho-MQTT client running on an isolated background thread, bridged into the asyncio event loop via threadsafe queues
- **Real-Time Distribution**: Asynchronous WebSocket connection manager broadcasting normalized frames to active SCADA consoles
- **Multi-Client Consistency**: Transactional Outbox Pattern (`sync_outbox` table) ensuring at-least-once telemetry delivery across distributed clients without data loss

---

## 2. Directory Layout

```text
backend/
├── app/
│   ├── api/v1/                 # Versioned REST controllers & WebSocket routes
│   │   ├── alarms.py           # SCADA alarm querying, acknowledgment & stats
│   │   ├── auth.py             # JWT login, registration, token revocation
│   │   ├── devices.py          # Device CRUD, auto-discovery & diagnostics
│   │   ├── export.py           # RFC 4180 CSV export with formula injection escaping
│   │   ├── health.py           # Subsystem health probes (/health, /database, /mqtt)
│   │   ├── location.py         # Corridor GPS tracking, station search & routes
│   │   ├── settings.py         # SCADA system parameters, calibration & timeouts
│   │   ├── tanks.py            # Dual-tank geometry, capacity & live levels
│   │   ├── telemetry.py        # Historical telemetry querying & ingestion
│   │   ├── trains.py           # Trains, coach consists & official compositions
│   │   ├── users.py            # User management, approvals & RBAC auditing
│   │   └── ws.py               # Live WebSocket telemetry stream
│   ├── core/                   # Infrastructure configuration
│   │   ├── config.py           # Pydantic BaseSettings loading from environment
│   │   ├── database.py         # Async engine, sessionmaker & pool tuning
│   │   └── security.py         # Bcrypt password hashing & JWT encoding/decoding
│   ├── models/                 # SQLAlchemy 2.0 Declarative ORM models
│   ├── mqtt/                   # MQTT subscriber, thread bridge & packet parser
│   ├── repositories/           # Isolated data access layer
│   ├── schemas/                # Pydantic validation contracts
│   ├── services/               # Core domain logic (Calculators, Alarms, LTTB)
│   └── websocket/              # WebSocket client lifecycle manager
├── migrations/                 # Alembic database migration versions
├── requirements.txt            # Locked Python dependencies
├── run_server.py               # Production CLI launcher bound to 0.0.0.0:8000
└── tests/                      # 86 automated Pytest unit & integration tests
```

---

## 3. Subsystem Health Diagnostics

The backend provides granular health probes for container orchestration and uptime monitoring:

| Endpoint | Method | Focus Area | Checks Executed |
|:---|:---:|:---|:---|
| `/api/v1/health` | `GET` | Overall System | Database connectivity, MQTT broker status, uptime |
| `/api/v1/health/database` | `GET` | PostgreSQL Storage | Connection pool execution `SELECT 1`, active pools, latency |
| `/api/v1/health/mqtt` | `GET` | Message Broker | Client loop state, active subscriptions, last RX timestamp |
| `/api/v1/health/system` | `GET` | OS & Compute | CPU utilization, memory consumption, process thread count |

Example Health Response:
```json
{
  "status": "healthy",
  "app_name": "Panorama Water Tank Monitor",
  "version": "2.0.0",
  "database": {
    "status": "connected",
    "engine": "postgresql+asyncpg",
    "latency_ms": 1.42
  },
  "mqtt": {
    "status": "connected",
    "broker": "broker.hivemq.com:1883",
    "subscribed_topics": 12
  },
  "timestamp": "2026-11-16T15:30:00Z"
}
```

---

## 4. Transactional Outbox Pattern

To avoid losing synchronization events during transient network dropouts, all state mutations (coach reordering, train creation, threshold adjustments) are transactionally written to the `sync_outbox` table within the same ACID database transaction as the business entity.

An asynchronous background worker (`outbox_service.py`) polls pending events, publishes them to the MQTT sync bus (`panorama/sync/events`), and marks them `PUBLISHED`. In the event of broker unavailability, events automatically accumulate safely in PostgreSQL and retry with exponential backoff once the link is restored.

---

## 5. Automated Verification

The entire backend test suite is automated using `pytest` and `pytest-asyncio`:
```bash
cd backend
pytest tests/ -v
```
**Verification Status**: **86 passed, 0 failed (100% pass rate)**.
