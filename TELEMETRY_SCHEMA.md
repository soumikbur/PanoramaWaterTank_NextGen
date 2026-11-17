# Authoritative Telemetry Schema Specification: HTTPS Ingestion Pipeline

**Project:** Panorama Water Tank Monitor — Water Level Indicator (WLI)  
**Standard:** Railway SCADA Industrial Telemetry Specification  
**Version:** v2.2.0-https  
**Target Ingestion Subsystem:** `HTTPS_Server/` (FastAPI Cloud Receiver)  
**Date:** November 17, 2026  
**Status:** Certified Specification  

---

## 1. Specification Overview

This document specifies the authoritative, binding telemetry contract between the embedded **STM32/EC200U edge node** and the **FastAPI HTTPS Receiver**.

The system provides two ingestion modes:
1. **JSON Payload Mode (`POST /api/telemetry`):** Direct serialization and transmission of the telemetry document in the HTTP request body (`Content-Type: application/json`).
2. **File Upload Mode (`POST /api/telemetry/upload`):** Upload of a discrete `.json` document file as `multipart/form-data` or stream.

---

## 2. API Endpoints

### 2.1 Ingestion Endpoints

#### Endpoint A: Direct JSON Telemetry Post
- **Method:** `POST`
- **Route:** `/api/telemetry`
- **Headers:**
  - `Content-Type: application/json`
  - `Authorization: Bearer <API_KEY>` or `X-Device-Token: <API_KEY>`
- **Body:** JSON Telemetry Document (max 1 MB)

#### Endpoint B: Telemetry File Upload
- **Method:** `POST`
- **Route:** `/api/telemetry/upload`
- **Headers:**
  - `Authorization: Bearer <API_KEY>` or `X-Device-Token: <API_KEY>`
- **Body:** `multipart/form-data` with parameter `file` containing `.json` file, or raw JSON stream with `.json` filename header.

### 2.2 Telemetry Retrieval Endpoints
- `GET /api/telemetry/latest?device_id={id}`: Returns the most recent telemetry document for a specific device or all devices.
- `GET /api/telemetry/history?device_id={id}&limit={n}`: Returns historical records in reverse chronological order (limit capped at 1,000).
- `GET /api/telemetry/stats`: Returns telemetry ingestion metrics (total requests, duplicates dropped, device count).
- `GET /health`: Health and uptime probe.

---

## 3. Data Dictionary & Field Constraints

| Field | JSON Type | Physical Unit | Permitted Range | Nullable? | Description |
|:---|:---:|:---:|:---:|:---:|:---|
| `device_id` | `string` | — | 1 to 64 chars | **No** | Unique device identifier (e.g. `002F00654B42501320353332`, `COACH-042`). Whitespace-trimmed. |
| `sequence_id` | `integer` | Count | $1$ to $4{,}294{,}967{,}295$ | Yes | Monotonically increasing sequence number. Used for packet loss tracking and cellular deduplication. |
| `timestamp` | `string` / `integer` | ISO 8601 / Epoch | — | Yes | Device-side sensor acquisition time (`2026-11-17T12:20:14Z` or Unix epoch seconds). |
| `water_level_cm` | `float` | cm | $0.0$ to $160.0$ | Yes | Measured water column height from hydrostatic transducer. Coach tank max head is $150.0\,\text{cm}$. |
| `water_level_percentage`| `float` | % | $0.0$ to $110.0$ | Yes | Computed tank volume percentage. $0.0\%$ represents empty; $100.0\%$ represents full capacity ($500\,\text{L}$). |
| `raw_voltage` | `float` | V | $0.000$ to $5.000$ | Yes | Raw analog voltage at STM32 ADC. Normal range: $0.500\,\text{V}$ (Empty) to $4.500\,\text{V}$ (Full). |
| `pressure_bar` | `float` | bar | $0.000$ to $0.500$ | Yes | Calculated hydrostatic bottom pressure ($P = \rho \cdot g \cdot h$). |
| `battery_voltage` | `float` | V | $0.0$ to $32.0$ | Yes | Backup VRLA battery rail voltage. Nominal 12V ($11.5 - 13.8\,\text{V}$). |
| `sensor_status` | `string` | — | Enum string | Yes | Transducer health state: `NORMAL`, `DISCONNECTED` ($<0.2\text{V}$), `FAULT` ($>4.85\text{V}$), `CALIBRATING`. |
| `alarm_status` | `string` | — | Enum string | Yes | Tank alarm condition: `NONE`, `LOW_WARNING` ($<25\%$), `CRITICAL_LOW` ($<10\%$), `OVERFLOW` ($>100\%$). |
| `latitude` | `double` | Degrees | $-90.0$ to $+90.0$ | Yes | GNSS WGS84 latitude coordinate. |
| `longitude` | `double` | Degrees | $-180.0$ to $+180.0$ | Yes | GNSS WGS84 longitude coordinate. |
| `gps_valid` | `boolean` | — | `true` / `false` | Yes | Satellite fix status. `true` if 2D/3D positioning lock active. |
| `speed_kmh` | `float` | km/h | $0.0$ to $250.0$ | Yes | GNSS Doppler ground speed. |
| `coach_id` | `string` | — | 1 to 32 chars | Yes | Indian Railways coach number (e.g. `pano123`, `CR-21142/C`). |
| `train_number` | `string` | — | 1 to 32 chars | Yes | Train schedule identifier (e.g. `12841`, `Coromandel Express`). |
| `received_at` | `string` | ISO 8601 UTC | — | Attached | Server-side UTC reception timestamp attached automatically upon HTTP ingest. |

---

## 4. Example Payload Documents

### 4.1 Standard Complete JSON Telemetry Document
```json
{
  "device_id": "002F00654B42501320353332",
  "sequence_id": 1042,
  "timestamp": "2026-11-17T12:20:14Z",
  "water_level_cm": 75.0,
  "water_level_percentage": 50.0,
  "raw_voltage": 2.500,
  "pressure_bar": 0.0735,
  "sensor_status": "NORMAL",
  "alarm_status": "NONE",
  "battery_voltage": 12.6,
  "latitude": 22.556949,
  "longitude": 88.352447,
  "gps_valid": true,
  "speed_kmh": 0.0,
  "temperature_c": 28.4,
  "coach_id": "pano123",
  "train_number": "12841"
}
```

### 4.2 Document with Legacy MQTT Field Aliases (Fully Supported)
```json
{
  "device_id": "002F00654B42501320353332",
  "sequence_id": 1043,
  "timestamp": "2026-11-17T12:21:14Z",
  "cm1": 75.0,
  "wlp1": 50.0,
  "bat": 12.6,
  "temp": 28.4,
  "wlv1": false,
  "lat": 22.556949,
  "long": 88.352447,
  "speed": 0.0,
  "chno": "pano123",
  "trno": "12841"
}
```

---

## 5. Server Response Specifications

### 5.1 Success Response (`200 OK` or `201 Created`)
```json
{
  "status": "success",
  "message": "Telemetry received",
  "device_id": "002F00654B42501320353332",
  "received_at": "2026-11-17T12:20:14.812345+00:00",
  "variables_count": 17,
  "data": {
    "device_id": "002F00654B42501320353332",
    "sequence_id": 1042,
    "water_level_cm": 75.0,
    "water_level_percentage": 50.0,
    "sensor_status": "NORMAL",
    "received_at": "2026-11-17T12:20:14.812345+00:00"
  }
}
```

### 5.2 Error Responses
- **`400 Bad Request`:** Malformed JSON document or validation violation:
  ```json
  {"status": "error", "message": "Invalid JSON format: Expecting ',' delimiter: line 1 column 45"}
  ```
- **`401 Unauthorized`:** Missing or invalid Bearer token / `X-Device-Token`:
  ```json
  {"status": "error", "message": "Invalid or missing device authentication token"}
  ```
- **`413 Payload Too Large`:** Payload size exceeds the 1 MB gateway threshold:
  ```json
  {"status": "error", "message": "Payload size exceeds 1.0 MB limit"}
  ```
- **`422 Unprocessable Entity`:** Missing required `device_id` or invalid data types:
  ```json
  {"detail": [{"loc": ["body", "device_id"], "msg": "Field required", "type": "missing"}]}
  ```
