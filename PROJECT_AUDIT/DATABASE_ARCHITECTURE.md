# Database Architecture & Persistence Specifications

**Project:** Panorama Water Tank Monitor (NextGen SCADA)  
**ORM Framework:** SQLAlchemy (Async Engine)  
**Database Backend:** SQLite (Development / Local) · PostgreSQL (Production)  

---

## 1. Schema ER Diagram

```mermaid
erDiagram
    TRAIN ||--o{ COACH : contains
    COACH ||--o{ WATER_TANK : mounts
    WATER_TANK ||--o| DEVICE : monitored_by
    DEVICE ||--o{ TELEMETRY_READING : generates
    COACH ||--o{ ALARM : triggers
    USER ||--o{ USER_SESSION : authenticates

    TRAIN {
        string train_number PK
        string train_name
        string region
        string source_station
        string destination_station
        int total_coaches
        datetime created_at
    }

    COACH {
        string id PK
        string train_number FK
        string coach_number
        string coach_type
        int sequence_order
        boolean is_active
    }

    WATER_TANK {
        string id PK
        string coach_id FK
        string tank_name
        float capacity_liters
        float max_height_cm
        float current_level_percent
        float current_volume_liters
    }

    DEVICE {
        string id PK
        string device_uid UK
        string status
        datetime last_seen
    }

    ALARM {
        string id PK
        string coach_id FK
        string severity
        string status
        string message
        datetime triggered_at
        datetime resolved_at
    }
```

---

## 2. Integrity & Persistence Guarantees

1. **Foreign Key Enforcement:** Foreign keys with `ON DELETE CASCADE` ensure that deleting a train automatically cleans up its associated coaches, tanks, and alarms.
2. **Transaction Atomicity:** Multi-table mutations (e.g. creating a train with default coaches) execute inside explicit transactions (`async with db.begin():`).
3. **Lookup Seed Database:** Express trains database cache ([express_trains_db.json](file:///C:/Users/soumi/OneDrive/Documents/Antigravity/PanoramaWaterTank_NextGen/backend/data/express_trains_db.json)) pre-populates official Indian Railways train metadata for instant offline lookups.

