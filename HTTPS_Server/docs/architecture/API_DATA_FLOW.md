# HTTPS Receiver — API Data Flow Specification

## 1. Overview

This document specifies the end-to-end data flows, sequence interactions, and transformation pipelines for the **Panorama Water Tank HTTPS Receiver REST API**.

---

## 2. Telemetry Ingestion Flow (Direct JSON POST)

The primary production ingestion pathway for the Quectel EC200U cellular module.

```mermaid
sequenceDiagram
    autonumber
    actor Modem as Quectel EC200U (4G LTE)
    participant Gateway as FastAPI Application
    participant Middleware as Request Size Middleware
    participant Security as Auth Dependency (verify_api_token)
    participant Schema as TelemetryPayload (Pydantic v2)
    participant Service as TelemetryService
    participant Storage as InMemoryStorageService

    Modem->>Gateway: POST /api/telemetry (JSON + Bearer/Device Token)
    Gateway->>Middleware: Inspect Content-Length
    alt Content-Length > MAX_UPLOAD_SIZE
        Middleware-->>Modem: HTTP 413 (Payload Too Large)
    end

    Gateway->>Security: Validate Token
    alt Token Missing or Invalid
        Security-->>Modem: HTTP 401 (Unauthorized)
    end

    Gateway->>Schema: Deserialize & Validate JSON
    alt Validation Error (e.g. missing device_id)
        Schema-->>Modem: HTTP 422 (Unprocessable Entity)
    end

    Gateway->>Service: process_payload(payload)
    Service->>Schema: extract_full_record(received_at)
    Schema-->>Service: Record with preserved extra vars + UTC ISO timestamp
    Service->>Storage: store_record(record)
    Storage->>Storage: Acquire Thread Lock
    Storage->>Storage: Update _latest_by_device[device_id]
    Storage->>Storage: Append to circular _history deque
    Storage->>Storage: Release Thread Lock
    Storage-->>Service: Stored Record
    Service-->>Gateway: Ingestion Metadata
    Gateway-->>Modem: HTTP 200 OK (TelemetryIngestResponse)
```

---

## 3. Telemetry Ingestion Flow (Multipart File Upload)

The laboratory testing pathway for uploading telemetry batches or diagnostic test files.

```mermaid
sequenceDiagram
    autonumber
    actor Client as Laboratory Client / Tester
    participant Gateway as FastAPI Application
    participant Security as Auth Dependency (verify_api_token)
    participant Route as routes/telemetry.py (receive_telemetry_file)
    participant Service as TelemetryService (process_json_bytes)
    participant Storage as InMemoryStorageService

    Client->>Gateway: POST /api/telemetry/file (multipart/form-data)
    Gateway->>Security: Validate Token
    alt Token Missing or Invalid
        Security-->>Client: HTTP 401 (Unauthorized)
    end

    Gateway->>Route: Inspect file metadata & extension
    alt Extension is not .json / .txt
        Route-->>Client: HTTP 400 (Invalid file format)
    end

    Route->>Route: Stream chunks in memory (up to MAX_UPLOAD_SIZE)
    alt Uploaded bytes > MAX_UPLOAD_SIZE
        Route-->>Client: HTTP 413 (Payload Too Large)
    end

    Route->>Service: process_json_bytes(content)
    alt Corrupted or Non-JSON Bytes
        Service-->>Client: HTTP 400 (Malformed JSON)
    end

    Service->>Service: Validate JSON dict against TelemetryPayload
    alt Missing device_id or Invalid schema
        Service-->>Client: HTTP 422 (Validation Failed)
    end

    Service->>Storage: store_record(record)
    Storage->>Storage: Acquire Thread Lock & Commit
    Storage-->>Service: Stored Record
    Service-->>Route: Stored Record + Variables Count
    Route-->>Client: HTTP 200 OK (FileIngestResponse)
```

---

## 4. Telemetry Query Flow (Latest & History)

```mermaid
sequenceDiagram
    autonumber
    actor Dashboard as Web Dashboard / External Consumer
    participant Gateway as FastAPI Application
    participant Security as Auth Dependency (verify_api_token)
    participant Route as routes/telemetry.py
    participant Storage as InMemoryStorageService

    Dashboard->>Gateway: GET /api/telemetry/latest?device_id=WLI_01
    Gateway->>Security: Validate Token
    alt Token Missing or Invalid
        Security-->>Dashboard: HTTP 401 (Unauthorized)
    end

    Gateway->>Route: get_latest_telemetry(device_id)
    Route->>Storage: get_latest("WLI_01")
    Storage->>Storage: Acquire Thread Lock
    Storage->>Storage: Lookup _latest_by_device["WLI_01"]
    Storage->>Storage: Release Thread Lock
    alt Device Not Found
        Storage-->>Route: None
        Route-->>Dashboard: HTTP 404 (No telemetry found for device)
    else Device Found
        Storage-->>Route: Latest Telemetry Record
        Route-->>Dashboard: HTTP 200 OK (TelemetryLatestResponse)
    end
```

---

## 5. Data Transformation Pipeline

```
Raw JSON Byte Stream (HTTP Request)
           │
           ▼
[FastAPI / Starlette Deserialization]
           │
           ▼
[TelemetryPayload Model Validation]
  ├── Standard Fields: device_id, water_level_cm, water_level_percentage,
  │                    raw_voltage, sensor_status, latitude, longitude,
  │                    gps_valid, battery_voltage, alarm_status
  └── Dynamic Extra Fields: model_extra (preserves unknown keys & types)
           │
           ▼
[TelemetryService Transformation]
  ├── Injects: received_at = datetime.now(timezone.utc).isoformat()
  ├── Preserves: device timestamp (if provided by STM32)
  └── Consolidates into single complete Python dict
           │
           ▼
[InMemoryStorageService Commit]
  ├── Thread-safe copy into _latest_by_device[device_id]
  └── Thread-safe append into circular buffer _history (deque maxlen=1000)
           │
           ▼
[HTTP Response Serialization]
  └── Returns clean response model containing metadata and ingested record
```

---

## 6. Concurrency & Error Propagation Matrix

| Failure Condition | Detection Point | HTTP Status | Response Payload Summary |
|---|---|---|---|
| Missing Auth Header | `verify_api_token` | `401 Unauthorized` | `{"detail": "Unauthorized: Missing API token..."}` |
| Bad API Token | `verify_api_token` | `401 Unauthorized` | `{"detail": "Unauthorized: Invalid API token provided."}` |
| Payload > Limit | `limit_request_size` | `413 Payload Too Large` | `{"status": "error", "message": "Payload size exceeds limit..."}` |
| Non-JSON File | `receive_telemetry_file` | `400 Bad Request` | `{"detail": "Invalid file format..."}` |
| Malformed JSON File | `process_json_bytes` | `400 Bad Request` | `{"detail": "Malformed JSON: ..."}` |
| Missing `device_id` | `TelemetryPayload` validator | `422 Unprocessable` | Standard Pydantic field validation error |
| Non-existent Device | `get_latest_telemetry` | `404 Not Found` | `{"detail": "No telemetry found for device: ..."}` |
| Server Internal Error | Global Exception Handler | `500 Internal Error` | Standard JSON error response |
