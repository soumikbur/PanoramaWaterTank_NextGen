# HTTPS Receiver — Backend Architecture Specification

## 1. Executive Summary

The **Panorama Water Tank Monitor HTTPS Receiver** is a lightweight, modular, and isolated FastAPI-based backend subsystem located in `HTTPS_Server/`. Its primary role is to serve as the secure IoT data ingestion gateway for cellular telemetry transmitted by the **Quectel EC200U-CN** 4G LTE module paired with the **STM32** main microcontroller.

This backend operates completely independently of the legacy MQTT/Qt desktop infrastructure and does not introduce external database dependencies during this verification phase.

---

## 2. Updated Hardware & Communication Topology

```
+-------------------------------------------------------------+
|                 HARDWARE TRANSDUCTION LAYER                 |
|                                                             |
|   +-----------------------+        +--------------------+   |
|   |   Hydrostatic Level   |        |  Analog Power Rail |   |
|   |    Pressure Sensor    |        |     (12V / 5V)     |   |
|   +-----------+-----------+        +---------+----------+   |
|               | (Analog 0.5-4.5V)            |              |
|               v                              v              |
|   +-----------------------------------------------------+   |
|   |                STM32 Main Microcontroller           |   |
|   |  - ADC Sampling & Digital Filtering                 |   |
|   |  - Water Level (cm) & Percentage Computation        |   |
|   |  - Alarm & Diagnostic State Evaluation              |   |
|   |  - JSON Serialization                               |   |
|   +--------------------------+--------------------------+   |
+------------------------------|------------------------------+
                               | UART (AT / Serial Command Bus)
                               v
+-------------------------------------------------------------+
|                  CELLULAR & NETWORKING LAYER                |
|                                                             |
|   +-----------------------------------------------------+   |
|   |             Quectel EC200U-CN 4G LTE Module         |   |
|   |  - GNSS Acquisition (Lat, Lon, Fix Status)          |   |
|   |  - 4G LTE-Cat1 Cellular Registration                |   |
|   |  - TLS v1.2/v1.3 Handshake                          |   |
|   |  - HTTP POST Body Transmission                      |   |
|   +--------------------------+--------------------------+   |
+------------------------------|------------------------------+
                               | 4G LTE Mobile Network
                               v
+-------------------------------------------------------------+
|                 REMOTE CLOUD / SERVER GATEWAY               |
|                                                             |
|   +-----------------------------------------------------+   |
|   |              FastAPI REST API Gateway               |   |
|   |  - Bearer / X-Device-Token Authentication           |   |
|   |  - Dynamic Schema Validation & Variable Extraction  |   |
|   |  - Thread-Safe Bounded Memory Storage               |   |
|   |  - Telemetry Query & System Diagnostics Endpoints   |   |
|   +-----------------------------------------------------+   |
+-------------------------------------------------------------+
```

### Hardware Role Allocation:
- **STM32:** Primary compute node. Reads physical sensor voltage, runs level calculation algorithms, constructs structured telemetry JSON.
- **Quectel EC200U-CN:** Communication and positioning coprocessor. Acquires GNSS coordinates and transmits telemetry via HTTPS POST over 4G LTE.
- **ESP32:** Limited strictly to BLE beaconing and local short-range setup. Zero cellular, Wi-Fi, or HTTPS responsibility.
- **BME280:** Omitted entirely from current hardware revision.

---

## 3. Software Architecture & Module Decomposition

The backend code is organized into decoupled layers:

```
HTTPS_Server/backend/
├── config.py             # Environment configuration and operational limits
├── main.py               # Application entrypoint, middleware, router composition
├── routes/
│   ├── health.py         # GET /api/health (Service availability)
│   ├── telemetry.py      # POST & GET /api/telemetry/* (Ingestion & query)
│   └── system.py         # GET /api/system/info (Runtime diagnostics)
├── schemas/
│   └── telemetry.py      # Pydantic v2 dynamic payload and response definitions
├── services/
│   ├── storage_service.py    # Thread-safe circular buffer & latest map
│   └── telemetry_service.py  # Unified ingestion logic & timestamping
├── static/
│   ├── index.html        # Laboratory testing dashboard
│   ├── css/style.css     # Responsive modern dark styling
│   └── js/app.js         # Real-time health & storage diagnostics probing
└── utils/
    └── security.py       # Constant-time token verification & auth dependencies
```

### 3.1. Layer Responsibilities

1. **Gateway Layer (`backend/main.py`)**:
   - Manages FastAPI application instance, CORS policies, static asset mounting, and router registration.
   - Enforces gateway-level payload size limits via an HTTP middleware, rejecting oversized requests with HTTP 413.

2. **Security & Auth Layer (`backend/utils/security.py`)**:
   - Inspects `Authorization: Bearer <token>` and `X-Device-Token: <token>` headers.
   - Employs `secrets.compare_digest()` to eliminate timing-attack vulnerabilities.
   - Rejects unauthenticated or invalid requests with HTTP 401 Unauthorized.

3. **Routing Layer (`backend/routes/`)**:
   - `health.py`: Lightweight health check endpoint for container orchestrators and status monitoring.
   - `telemetry.py`: Ingestion endpoints (`POST /api/telemetry`, `POST /api/telemetry/file`) and query endpoints (`GET /api/telemetry/latest`, `GET /api/telemetry/history`).
   - `system.py`: Diagnostics endpoint surfacing runtime metrics, memory utilization, and uptime.

4. **Schema Validation Layer (`backend/schemas/telemetry.py`)**:
   - Uses Pydantic v2 `ConfigDict(extra="allow")` to preserve dynamic arbitrary variables.
   - Normalizes known sensor fields while retaining arbitrary hardware-reported telemetry keys.

5. **Service Layer (`backend/services/`)**:
   - `telemetry_service.py`: Centralized ingestion engine used identically by direct JSON POST and multipart file upload. Attaches server UTC reception timestamp (`received_at`).
   - `storage_service.py`: Thread-safe singleton providing bounded history tracking (`deque(maxlen=1000)`) and device-indexed latest reading state (`dict`).

---

## 4. Dynamic Variable Extraction

Firmware versions may introduce novel diagnostic parameters (e.g. `signal_csq`, `cell_tower_id`, `firmware_rev`, `ambient_temp_mcu`, `relay_states`). The ingestion engine does not drop unknown fields.

### Mechanics:
- When incoming JSON is deserialized into `TelemetryPayload`, recognized attributes (`device_id`, `water_level_cm`, `latitude`, etc.) map to typed fields.
- Unmapped keys are captured into `model_extra`.
- `extract_full_record()` merges recognized fields with `model_extra` and injects `received_at`, preserving native Python types:
  - `int` remains `int`
  - `float` remains `float`
  - `bool` remains `bool`
  - `None` (JSON `null`) remains `None`
  - Nested objects (`dict`, `list`) remain intact

---

## 5. Storage Architecture

```
InMemoryStorageService (Singleton)
│
├── _lock: threading.Lock (Thread safety across concurrent async workers)
│
├── _latest_by_device: Dict[str, Dict[str, Any]]
│   └── Keys: device_id (e.g. "WLI_TANK_01")
│   └── Values: Latest telemetry record with metadata
│
└── _history: collections.deque(maxlen=MAX_HISTORY_RECORDS)
    └── Circular FIFO buffer (Default: 1,000 records)
    └── Automatic eviction of oldest records when capacity is reached
    └── Zero memory leaks or unbounded growth
```

### Storage Capabilities:
- Multi-device support: Telemetry from distinct devices is isolated and indexed by `device_id`.
- Fast retrieval: $O(1)$ lookup for latest device readings.
- Historical queries: Filterable by `device_id` with parameterized `limit` (1 to 1,000), returned newest first.
- Zero external database overhead: Does not require PostgreSQL, SQLite, or Redis during testing.

---

## 6. Security Architecture

1. **Authentication:**
   - Secured endpoints require an API token matched against the server's `API_TOKEN` environment variable.
   - Dual header support: `Authorization: Bearer <token>` or `X-Device-Token: <token>`.
   - Constant-time verification prevents side-channel timing attacks.

2. **DoS & Memory Protection:**
   - Gateway middleware rejects oversized request bodies with HTTP 413.
   - File uploads are streamed in chunks up to `MAX_UPLOAD_SIZE` (default 1 MB); uploads exceeding the cap are terminated immediately.
   - History buffer is strictly bounded (`MAX_HISTORY_RECORDS`).

3. **Data Protection & Sanitization:**
   - No sensitive tokens or internal paths are echoed in API responses or logs.
   - Multipart file upload operates strictly in memory (bytes are never written to disk), eliminating path traversal vulnerabilities.
