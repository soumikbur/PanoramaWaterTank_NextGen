# GRAPHIFY ARCHITECTURE REPORT: PANORAMA WATER TANK MONITOR
**Tool:** Graphify v0.5.21 AST Parser & BFS Topological Traversal  
**Graph Metrics:** 8,405 Nodes | 14,975 Edges | 587 Communities | Commit `b271c6b8`  
**Report Date:** November 15, 2026

---

## 1. TOPOLOGICAL OVERVIEW & GRAPH METRICS

Using Graphify's AST extraction engine, the entire codebase was transformed into a directed knowledge graph. The system separates cleanly into three major runtime execution planes:
1. **Edge Transducer & Ingestion Plane:** Microcontrollers (STM32/ESP32), Cellular Modem (Quectel EC200U), MQTT Broker (HiveMQ Cloud), and Ingestion Parser.
2. **Central SCADA Backend Plane:** FastAPI asynchronous web framework, SQLAlchemy 2.0 ORM, PostgreSQL/SQLite database, and WebSocket Hub.
3. **Operator HMI Presentation Plane:** React 18 / TypeScript Web Client (GitHub Pages), Capacitor Mobile Hybrid Wrapper, and Qt/QML C++ Desktop Client.

```mermaid
graph TD
    subgraph Hardware_Edge["Hardware Edge Layer"]
        Transducers["Ultrasonic / Pressure Transducers"] --> MCU["STM32F4 / ESP32-S3"]
        MCU --> Modem["Quectel EC200U 4G LTE"]
        Modem -- "MQTT / TLS 8883" --> Broker["HiveMQ Cloud Broker"]
    end

    subgraph Central_Backend["FastAPI Central Backend"]
        Broker -- "panorama/telemetry/+" --> MqttClient["app.mqtt.client.MqttService"]
        MqttClient --> Parser["app.mqtt.parser.TelemetryParser"]
        Parser --> TelemetryRepo["app.repositories.telemetry_repo"]
        TelemetryRepo --> DB[("PostgreSQL / SQLite WAL")]
        Parser --> Alarms["app.services.alarm_service"]
        Alarms --> DB
        Alarms --> WSManager["app.websocket.manager.ws_manager"]
        MqttClient --> WSManager
        
        REST_API["FastAPI REST Routes (/api/v1)"] --> DB
        REST_API --> Broadcaster["app.services.sync_broadcaster"]
        Broadcaster --> WSManager
        Broadcaster -- "MQTT panorama/sync/*" --> Broker
        Outbox["app.services.outbox_service"] -. "Reads sync_outbox" .-> DB
    end

    subgraph Operator_Clients["Operator HMI Clients"]
        WSManager -- "WebSocket (/ws/live)" --> WebApp["React 18 / Vite SPA (GitHub Pages)"]
        REST_API -- "HTTPS REST" --> WebApp
        Broker -- "MQTT / WSS" -. "Optional Fallback" .-> WebApp
        REST_API -- "HTTPS" --> Desktop["Qt / QML C++ Desktop Client"]
        WSManager -- "WebSocket" --> Desktop
    end
```

---

## 2. INGESTION DATA FLOW PATH (BFS TRAVERSAL)

The primary telemetry ingestion path traces the call chain from incoming edge packets to client rendering:

1. `Quectel EC200U` formats a JSON string containing sensor readings (`uid`, `trno`, `chno`, `wlp1`, `cm1`, `v1`, `lat`, `lon`, `dt`).
2. Transmitted via cellular TCP to HiveMQ Cloud broker on topic `panorama/telemetry/{uid}`.
3. `app.mqtt.client.MqttService._on_message()` receives the incoming message in a dedicated background worker thread.
4. Payload passed to `app.mqtt.parser.TelemetryParser.parse_payload()`.
5. `TelemetryParser.from_dict()` normalizes schema variations (e.g., mapping `deviceId` -> `uid`, `trainNumber` -> `trno`, `wlv1` -> `wlvl`, estimating battery voltage from percentage).
6. Validated model `MqttTelemetryPayload` dispatched to `_process_telemetry_payload()`.
7. `app.repositories.device_repo.DeviceRepository.get_by_uid()` checks if the hardware UID is registered. If unregistered, auto-registers as `UNASSIGNED` with status `AVAILABLE`.
8. `app.repositories.tank_repo.TankRepository` retrieves tank dimensions (`height_cm`, `tank_capacity_l`, `shape`).
9. `app.services.calculator.VolumeCalculator.calculate_volume_liters()` computes current volume based on tank geometry (`CYLINDER` vs `RECTANGLE`).
10. `app.repositories.telemetry_repo.TelemetryRepository.create_reading()` writes a persistent row to `telemetry_readings`.
11. `app.services.alarm_service.AlarmService.evaluate_telemetry()` evaluates threshold breaches (e.g. level $< 10\%$, sensor disconnection).
12. `app.websocket.manager.ws_manager.broadcast()` dispatches real-time JSON frame to all active web and desktop connections.
13. React `AppContext` / `MonitoringScreen` receives WebSocket frame, updates state without full page refresh.

---

## 3. IDENTIFIED "GOD NODES" & COUPLING HOTSPOTS

Graphify identifies nodes with abnormally high in-degree and out-degree centrality:

### 1. `backend/app/api/v1/trains.py` (Centrality: 98 connections)
- **Role:** Handles train lookup, train registration, coach allocation, consist ordering, train deletion, coach deletion, and custom tank dimensions.
- **Weakness:** Contains 1,900+ lines of code. It directly instantiates repositories (`TrainRepository`, `CoachRepository`, `TankRepository`, `DeviceRepository`, `AlarmRepository`, `OutboxRepository`), issues sync broadcasts, writes audit logs, and formats responses.
- **Architectural Risk:** Changes to train business logic risk collateral impact on coach, tank, and device lifecycles.
- **Recommendation:** Refactor into separated sub-routers: `trains_crud.py`, `train_coaches.py`, and `train_lookup.py`.

### 2. `apps/mobile/src/screens/EmployeeDashboard.tsx` (Centrality: 74 connections)
- **Role:** Comprehensive mobile dashboard for water-filling field staff.
- **Weakness:** File size exceeds 133 KB with 2,500+ lines. It incorporates map rendering, telemetry plotting, filling action forms, alarm acknowledging, and local storage caching inside a single monolithic component.
- **Architectural Risk:** State updates trigger unnecessary re-renders of map and chart sub-trees.
- **Recommendation:** Decompose into modular components: `FillingActionCard.tsx`, `TelemetryMiniPlot.tsx`, and `OperatorConsistList.tsx`.

### 3. `apps/mobile/src/screens/SettingsScreen.tsx` (Centrality: 62 connections)
- **Role:** Manages 5 distinct configuration categories (System, Hardware, MQTT, Telemetry, Alarms).
- **Weakness:** Exceeds 107 KB. It manages both local draft state, backend API synchronization, and MQTT parameter testing inside one file.
- **Recommendation:** Separate into tab sub-components under `src/components/settings/`.

---

## 4. CIRCULAR DEPENDENCIES & CROSS-LAYER LEAKS

1. **Outbox Pattern Asymmetry:**
   - `app/api/v1/trains.py` explicitly writes to `OutboxRepository` for train/coach mutations.
   - `app/api/v1/devices.py`, `app/api/v1/settings.py`, and `app/api/v1/tanks.py` call `broadcast_sync_event()` directly without inserting into `sync_outbox`.
   - **Architectural Fix:** Standardize mutation persistence: all mutating endpoints must write to `sync_outbox` in the same database transaction, while `sync_broadcaster` flushes both immediately and via the background outbox worker.

2. **Qt/QML C++ Architecture Independence:**
   - The Qt/QML codebase in `src/` and `app/` is architecturally decoupled from the Python backend. It communicates purely via REST (`ApiClient.cpp`) and MQTT (`MqttService.cpp`).
   - Graphify confirms zero invalid compile-time couplings between the Python backend and C++ client code.

---
*Generated by Graphify Knowledge Graph Engine.*
