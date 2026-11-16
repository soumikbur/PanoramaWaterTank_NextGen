# Database Schema Documentation — Panorama Water Tank Monitor (NextGen)

**Authoritative Database**: PostgreSQL 16 (Production) / SQLite WAL Mode (Local Embedded Development)  
**ORM Framework**: SQLAlchemy 2.0 (Async Engine via `asyncpg` / `aiosqlite`)  
**Migration Tool**: Alembic (Revisions 001, 002, 003)  
**Schema Status**: AUDITED, NORMALIZED, AND PERSISTENT  

---

## 1. Relational Entity Diagram

```mermaid
erDiagram
    USERS ||--o{ AUDIT_EVENTS : triggers
    USERS ||--o{ DELETION_AUDIT_RECORDS : performs
    RAILWAY_REGIONS ||--o{ RAILWAY_ZONES : contains
    RAILWAY_ZONES ||--o{ TRAINS : assigns
    TRAINS ||--o{ COACHES : consists_of
    COACHES ||--o{ TANKS : contains
    DEVICES ||--o{ TANKS : monitors
    DEVICES ||--o{ TELEMETRY_READINGS : emits
    TANKS ||--o{ TELEMETRY_READINGS : stores
    DEVICES ||--o{ ALARMS : triggers
    TANKS ||--o{ ALARMS : associates
    ALARMS ||--o{ ALARM_HISTORY : tracks

    USERS {
        string id PK
        string username UK
        string hashed_password
        string role
        string employee_id
        string phone
        string account_status
        boolean is_active
        datetime created_at
    }

    TRAINS {
        string id PK
        string train_number UK
        string name
        string region
        string train_type
        integer total_coaches
        boolean is_deleted
        datetime created_at
    }

    COACHES {
        string id PK
        string train_id FK
        string train_number
        string coach_number
        string coach_category
        string coach_type
        integer position
        string device_uid
        boolean is_deleted
        datetime created_at
    }

    DEVICES {
        string id PK
        string uid UK
        string train_number
        string coach_number
        string status
        boolean is_online
        datetime last_seen_at
        string hardware_version
        string firmware_version
        boolean is_deleted
    }

    TANKS {
        string id PK
        string device_id FK
        string coach_id FK
        integer tank_index
        float capacity_liters
        float height_cm
        float warning_threshold_percent
        float critical_threshold_percent
        boolean is_deleted
    }

    TELEMETRY_READINGS {
        integer id PK
        string device_id FK
        string tank_id FK
        datetime timestamp
        float level_percent
        float volume_liters
        float height_cm
        float battery_v1
        float latitude
        float longitude
        float speed_kmh
        boolean sensor_valid
        text raw_payload
    }

    ALARMS {
        string id PK
        string device_id FK
        string tank_id FK
        string alarm_type
        string severity
        string status
        float trigger_value
        float threshold_value
        datetime triggered_at
        datetime resolved_at
    }

    SYSTEM_SETTINGS {
        string key PK
        string value
        string category
        string description
        datetime updated_at
    }

    SYNC_OUTBOX {
        integer id PK
        string event_id UK
        string event_type
        string entity_type
        string entity_id
        string operation
        text payload_json
        string status
        datetime created_at
        datetime published_at
    }
```

---

## 2. Table Specifications

### 2.1 `users`
- Primary Key: `id` (UUID, String 36)
- Unique Constraints: `username`, `email`
- Default Seeded Accounts: `@admin` (Role: ADMIN), `@employee` (Role: EMPLOYEE)

### 2.2 `trains`
- Primary Key: `id` (UUID, String 36)
- Unique Constraint: `train_number` (String 32)
- Soft Deletion: `is_deleted` (Boolean default `False`)

### 2.3 `coaches`
- Primary Key: `id` (UUID, String 36)
- Foreign Key: `train_id` references `trains(id)` on delete CASCADE
- Indexes: `ix_coaches_train_id`, `ix_coaches_train_number`, `ix_coaches_coach_number`, `ix_coaches_device_uid`

### 2.4 `devices`
- Primary Key: `id` (UUID, String 36)
- Unique Constraint: `uid` (String 64)
- Operational States: `DISCOVERED`, `AVAILABLE`, `REGISTERED`, `ENGAGED`

### 2.5 `tanks`
- Primary Key: `id` (UUID, String 36)
- Foreign Keys: `device_id` references `devices(id)`, `coach_id` references `coaches(id)`
- Unique Index: `(device_id, tank_index)`

### 2.6 `telemetry_readings`
- Primary Key: `id` (BigInteger autoincrement)
- Foreign Keys: `device_id` references `devices(id)`, `tank_id` references `tanks(id)`
- High-Volume Index: `(device_id, timestamp DESC)`

### 2.7 `alarms` & `alarm_history`
- Primary Key: `id` (UUID, String 36)
- States: `OPEN`, `ACKNOWLEDGED`, `RESOLVED`

### 2.8 `sync_outbox`
- Primary Key: `id` (Integer autoincrement)
- Unique Constraint: `event_id` (UUID)
- Statuses: `PENDING`, `PUBLISHED`, `FAILED`

---

## 3. Database Connection Pooling Configuration

```python
engine_kwargs = {
    "echo": False,
    "future": True,
}
if is_sqlite:
    engine_kwargs["connect_args"] = {"check_same_thread": False, "timeout": 30.0}
    engine_kwargs["poolclass"] = NullPool
else:
    engine_kwargs["pool_size"] = 10
    engine_kwargs["max_overflow"] = 20
    engine_kwargs["pool_pre_ping"] = True
    engine_kwargs["pool_recycle"] = 3600
```
