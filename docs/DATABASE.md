# PostgreSQL Database Architecture & Schema Specification

The **Panorama Water Tank Monitor — NextGen** uses **PostgreSQL 16** as its primary authoritative relational storage engine. It provides strict relational integrity, foreign key cascading constraints, transactional outbox logging, and versioned Alembic migrations.

---

## 1. Relational Entity-Relationship (ER) Diagram

```mermaid
erDiagram
    RAILWAY_REGIONS ||--o{ RAILWAY_ZONES : contains
    RAILWAY_ZONES ||--o{ TRAINS : assigns
    TRAINS ||--o{ COACHES : consists_of
    TRAINS ||--o{ DEVICES : maps
    COACHES ||--o{ TANKS : mounts
    DEVICES ||--o{ TANKS : instruments
    DEVICES ||--o{ TELEMETRY_READINGS : emits
    TANKS ||--o{ TELEMETRY_READINGS : records
    DEVICES ||--o{ ALARMS : triggers
    TANKS ||--o{ ALARMS : evaluates
    USERS ||--o{ ALARMS : acknowledges
    USERS ||--o{ ALARM_HISTORY : modifies
    ALARMS ||--o{ ALARM_HISTORY : logs
    USERS ||--o{ AUDIT_EVENTS : performs

    TRAINS {
        string id PK
        string train_number UK
        string name
        string source_station
        string destination_station
        string region
        string railway_zone
        int total_coaches
        float tank_height_cm
        float tank_capacity_liters
        boolean is_deleted
        datetime created_at
        datetime updated_at
    }

    COACHES {
        string id PK
        string train_id FK
        string train_number
        string coach_number
        string coach_name
        string coach_category
        int position
        string device_uid
        boolean is_deleted
        datetime created_at
        datetime updated_at
    }

    DEVICES {
        string id PK
        string uid UK
        string train_id FK
        string train_number
        string coach_number
        string name
        string firmware_version
        string status
        boolean is_online
        datetime last_seen_at
        boolean is_deleted
    }

    TANKS {
        string id PK
        string device_id FK
        string coach_id FK
        string train_number
        string coach_number
        int tank_index
        string name
        float capacity_liters
        float height_cm
        float warning_threshold_percent
        float critical_threshold_percent
        float overflow_threshold_percent
        boolean is_deleted
    }

    TELEMETRY_READINGS {
        int id PK
        string device_id FK
        string device_uid
        string train_number
        string coach_number
        string tank_id FK
        int tank_index
        datetime timestamp
        float level_percent
        float volume_liters
        float height_cm
        boolean sensor_valid
        float latitude
        float longitude
        float speed_kmh
        float battery_v1
    }

    ALARMS {
        string id PK
        string device_id FK
        string tank_id FK
        string alarm_type
        string severity
        float trigger_value
        float threshold_value
        string message
        string status
        datetime triggered_at
        datetime acknowledged_at
        string acknowledged_by FK
        datetime resolved_at
    }

    USERS {
        string id PK
        string username UK
        string hashed_password
        string full_name
        string email
        string employee_id
        string designation
        string department
        string role
        string account_status
        int token_version
        boolean is_active
    }

    SYNC_OUTBOX {
        int id PK
        string event_id UK
        string event_type
        string entity_type
        string entity_id
        string operation
        string payload_json
        string status
        int retry_count
        datetime created_at
        datetime published_at
    }

    DELETION_AUDIT_RECORDS {
        string id PK
        string admin_username
        string entity_type
        string entity_identifier
        string snapshot_json
        string reason
        datetime created_at
    }
```

---

## 2. Table Specifications

### 2.1 `trains`
Stores passenger rolling stock rakes.
- **Primary Key**: `id` (UUID string)
- **Unique Constraint**: `train_number`
- **Soft Deletion**: Supported via `is_deleted` (preserves historical telemetry while hiding train from active operations)
- **Cascade Rule**: Deleting a train cascades to soft-delete dependent coaches and disengage device assignments without leaving orphaned records.

### 2.2 `coaches`
Maintains individual coaches within a train consist.
- **Primary Key**: `id` (UUID string)
- **Foreign Key**: `train_id` references `trains.id` (`ON DELETE CASCADE`)
- **Position Tracking**: `position` (integer 1..N) determines train marshaling sequence.
- **Idempotency**: Re-adding an existing coach reuses prior configuration.

### 2.3 `devices`
Tracks physical edge IoT hardware modules (Quectel EC200U / ESP32-S3).
- **Primary Key**: `id` (UUID string)
- **Unique Constraint**: `uid` (Hardware UID e.g. `002F00654B42501320353332`)
- **Watchdog Status**: `is_online` evaluated dynamically against a 120-second stale telemetry window.

### 2.4 `tanks`
Cylindrical water vessels installed on passenger coaches.
- **Dual Configuration**: Typically 2 tanks per coach (`tank_index` 1 for Arrival End, `tank_index` 2 for Departure End).
- **Foreign Keys**: `coach_id` references `coaches.id`, `device_id` references `devices.id`.

### 2.5 `telemetry_readings`
Time-series log of all incoming water levels, battery voltages, and GNSS positions.
- **Indexes**: `(device_uid, timestamp)`, `(train_number, timestamp)`.

### 2.6 `sync_outbox`
Transactional queue implementing the Outbox Pattern to guarantee event publishing to MQTT subscribers across distributed clients.

---

## 3. Database Initialization & Alembic Migrations

### Applying Migrations
```bash
cd backend
# Run all pending migrations against the active database
alembic upgrade head
```

### Creating a New Migration
```bash
cd backend
alembic revision -m "add_custom_field"
```

### PostgreSQL Docker Quickstart
```bash
docker run --name panorama-postgres \
  -e POSTGRES_USER=panorama_app \
  -e POSTGRES_PASSWORD=panorama_secure_pass_2026 \
  -e POSTGRES_DB=panorama_db \
  -p 5432:5432 -d postgres:16-alpine
```
