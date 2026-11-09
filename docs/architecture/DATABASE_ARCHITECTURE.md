# Panorama Water Tank Monitor — Database Architecture & Schema Specification

---

### 1. Database Technology & Concurrency Model

- **Primary Supported Engines:**
  - **PostgreSQL 16:** Industrial production engine using async driver `asyncpg` with connection pooling.
  - **SQLite 3:** Local edge / development engine using `aiosqlite` with Write-Ahead Logging (`PRAGMA journal_mode=WAL`).
- **ORM & Migrations:** SQLAlchemy 2.0 async engine with Alembic declarative revision control.

---

### 2. Entity-Relationship Model

```mermaid
erDiagram
    USERS ||--o{ AUDIT_EVENTS : generates
    DEVICES ||--o{ TANKS : provisions
    DEVICES ||--o{ TELEMETRY_READINGS : records
    DEVICES ||--o{ ALARMS : triggers
    TANKS ||--o{ TELEMETRY_READINGS : measures
    TANKS ||--o{ ALARMS : associates

    USERS {
        string id PK
        string username UK
        string hashed_password
        string role
        string account_status
        int token_version
        datetime created_at
    }

    DEVICES {
        string id PK
        string uid UK
        string train_number
        string coach_number
        boolean is_online
        datetime last_seen_at
    }

    TANKS {
        string id PK
        string device_id FK
        int tank_index
        float capacity_liters
        float height_cm
        float warning_threshold_percent
        float critical_threshold_percent
    }

    TELEMETRY_READINGS {
        int id PK
        string device_id FK
        string tank_id FK
        float level_percent
        float volume_liters
        float height_cm
        float battery_v1
        datetime timestamp
    }

    ALARMS {
        string id PK
        string device_id FK
        string tank_id FK
        string alarm_type
        string severity
        string status
        datetime triggered_at
    }

    SETTINGS {
        string key PK
        string category
        text value
        datetime updated_at
    }
```

---

### 3. Data Integrity & Query Optimization

- **Composite Indexes:** `(device_id, timestamp DESC)` and `(tank_id, timestamp DESC)` enable sub-millisecond historical queries.
- **Cascading Deletion:** Deleting a physical edge device cascades to its provisioned tanks while preserving audit event history.
- **Audit Preservation:** `audit_events.user_id` uses `ondelete="SET NULL"` ensuring historical traceability even after employee offboarding.
