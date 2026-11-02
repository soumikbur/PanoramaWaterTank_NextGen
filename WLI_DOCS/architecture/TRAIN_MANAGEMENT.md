# Architecture Specification: Train Management & Consist Hierarchy

**System**: Panorama Water Tank Monitor (NextGen Desktop Architecture)  
**Module**: Train Management System  
**Pattern**: Domain-Driven Design (DDD) with Clean Separation of Concerns  
**Date**: October 30, 2026  
**Status**: ACTIVE & VERIFIED  

---

## 1. Architectural Philosophy

The Train Management architecture establishes a strict single source of truth across all tiers of the railway hierarchy:

```text
Railway Region ──(1:N)──> Train ──(1:24)──> Coach ──(1:N)──> Tank ──(1:1)──> Monitoring Device
```

All operational metrics, counts, and status indicators are derived directly from the underlying relational database models. No hardcoded or mock counts exist.

---

## 2. Component Responsibility Matrix

```mermaid
graph TD
    UI_TM[TrainManagementPage.qml] -->|Invoke CRUD & Nav| RM[RailwayManager Singleton]
    UI_SB[Sidebar.qml] -->|Query Active Train & Counts| RM
    UI_HD[Header.qml] -->|Search Query| SM[SearchManager Singleton]
    
    RM -->|Query & Persist| DB[DatabaseManager]
    RM -->|Sync Active Telemetry| TM[TankModel]
    
    SM -->|FTS & Prefix Matching| DB
    
    subgraph SQLite Database (panorama_railway.db)
        T_TRAINS[(trains)]
        T_COACHES[(coaches)]
        T_TANKS[(tanks)]
        T_DEVICES[(devices)]
    end
    
    DB --> T_TRAINS
    DB --> T_COACHES
    DB --> T_TANKS
    DB --> T_DEVICES
```

### 2.1 QML Presentation Layer
- **`TrainManagementPage.qml`**: Handles multi-tier navigation state (`viewMode`: `"regions"` -> `"trains"` -> `"train_details"` -> `"coach_details"`), modal dialogs, and responsive layout management.
- **`Sidebar.qml`**: Presents high-level Train Summary metrics (`12301 · Rajdhani Express`), primary/system navigation routes, system connectivity state, and sidebar collapse animations.
- **`Header.qml`**: Provides global search with live debouncing, RBAC role indicator, MQTT connection status, and persistent clock.

### 2.2 Domain & Application Layer
- **`RailwayManager`** (`src/domain/RailwayManager.h/.cpp`):
  - Exposes QML-invokable APIs for train, coach, and tank operations.
  - Aggregates region statistics (`regions` property).
  - Enforces 24-coach consist capacity invariants.
  - Calculates physical tank volumes using analytical geometry (Rectangular: $L \times W \times H / 1000$; Cylindrical: $\pi \times r^2 \times H / 1000$).
  - Emits `feedbackMessage(bool, QString)` for user-facing operation notifications.

### 2.3 Repository Layer
- **`DatabaseManager`** (`src/repository/DatabaseManager.h/.cpp`):
  - Thread-safe SQLite repository with connection pooling.
  - Generates canonical region summaries (NORTH, SOUTH, EAST, WEST) via aggregated queries.
  - Enforces relational foreign key cascades (`ON DELETE CASCADE` from Train to Coaches and Coaches to Tanks).
  - Validates unique train numbers and coach position indices.

### 2.4 Search Layer
- **`SearchManager`** (`src/domain/SearchManager.h/.cpp`):
  - Indexes and queries trains, coaches, tanks, and geolocation waypoints with case-insensitive partial substring matching.
  - Dispatches results directly to the QML navigation handler.

---

## 3. Data Flow & Synchronization

1. **User Action**: User submits `Add Train` with Train Number `12302`, Name `Kalka Mail`, Region `Northern Region`, Status `Online`.
2. **Validation**: `RailwayManager::addTrain` verifies inputs and checks uniqueness via `DatabaseManager::getTrainId`.
3. **Persistence**: `DatabaseManager::addTrain` creates train record and initializes default consist.
4. **Signal Propagation**: `DatabaseManager` emits `databaseChanged()`, prompting `RailwayManager::reloadData()`.
5. **Reactive UI Update**:
   - `RailwayManager::regions` property notifies QML.
   - Region cards re-evaluate aggregate counts.
   - `Sidebar.qml` Train Summary metrics update.
   - `feedbackToast` displays `Train 12302 added successfully.` for 3.5 seconds.

