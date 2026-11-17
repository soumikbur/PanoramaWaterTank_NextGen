# Authoritative Telemetry Field Mapping: MQTT to HTTPS Migration

**Project:** Panorama Water Tank Monitor — Water Level Indicator (WLI)  
**Standard:** Railway SCADA Industrial Telemetry Specification  
**Source Telemetry:** Legacy MQTT JSON Telemetry (`broker.hivemq.com` / `panorama/telemetry/{uid}`)  
**Target Telemetry:** Authenticated HTTPS JSON Document / Payload (`POST /api/telemetry` & `POST /api/telemetry/upload`)  
**Date:** November 17, 2026  
**Status:** Certified Specification — Zero Telemetry Loss Baseline

---

## 1. Overview & Data Consistency Principles

A fundamental requirement of the HTTPS migration is that **the exact same telemetry information previously transmitted through MQTT must remain available through HTTPS**. 

To satisfy this condition without data loss, the modern ingestion pipeline employs a dual-layer strategy:
1. **Core Standardized Fields:** Mapped directly to explicit, strongly-typed Pydantic V2 schema fields (`device_id`, `water_level_cm`, `water_level_percentage`, `battery_voltage`, `latitude`, `longitude`, `sequence_id`, `timestamp`).
2. **Dynamic Passthrough (`extra="allow"`):** Any legacy field names (such as `cm1`, `wlp1`, `wlv1`, `chno`, `trno`, `bat`, `temp`) or site-specific variables transmitted by firmware are automatically parsed, retained in the storage records, and exposed via `/api/telemetry/latest` and `/api/telemetry/history`.

---

## 2. Complete Field-by-Field Mapping Table (Section 8)

| Old MQTT Field | Actual Firmware Variable (`TelemetrySnapshot`) | New JSON Field | Data Type | Field Classification | Mapping Rationale & Normalization Rules |
|:---|:---|:---|:---|:---|:---|
| `uid` | `snap.device_id[32]` | `device_id` | `string` | **Migrated** | Unique 24-character hex factory serial or coach asset tag (e.g. `002F00654B42501320353332`, `COACH-042`). Serves as primary lookup key. |
| `time` | `snap.timestamp` (seconds) | `timestamp` / `time` | `string` / `integer` | **Migrated** | Legacy was `HH:mm:ss` UTC. Migrated to ISO 8601 UTC string (or POSIX epoch integer). Backend attaches authoritative `received_at` timestamp. |
| `cm1` | `snap.water_level_cm` | `water_level_cm` | `float` (cm) | **Migrated** | Physical water column height in Primary Tank ($0.0 - 150.0\,\text{cm}$). Transmitted as `water_level_cm`; alias `cm1` also accepted. |
| `cm2` | *N/A (Coach single-tank configuration)* | `cm2` | `float` (cm) | **Requires hardware verification** | Secondary tank height. When a coach utilizes a dual-tank setup, STM32 passes `cm2`; preserved dynamically via `extra="allow"`. |
| `wlp1` | `snap.water_percentage` | `water_level_percentage` | `float` (%) | **Migrated** | Geometric fill percentage of Primary Tank ($0.0 - 100.0\%$). Transmitted as `water_level_percentage`; alias `wlp1` preserved. |
| `wlp2` | *N/A (Coach single-tank configuration)* | `wlp2` | `float` (%) | **Requires hardware verification** | Secondary tank percentage. Preserved dynamically via `extra="allow"` when dual sensors are installed. |
| `wlv1` | *Coach solenoid feedback GPIO* | `valve1_open` / `wlv1` | `boolean` | **Migrated** | Solenoid valve actuation state for Tank 1 (`true` = Open, `false` = Closed). Passed in JSON; preserved dynamically. |
| `wlv2` | *Coach solenoid feedback GPIO* | `valve2_open` / `wlv2` | `boolean` | **Migrated** | Solenoid valve actuation state for Tank 2 (`true` = Open, `false` = Closed). Preserved dynamically. |
| `bat` | `snap.battery_v` | `battery_voltage` | `float` (V) | **Migrated** | Backup VRLA battery voltage ($0.0 - 32.0\,\text{V}$). Transmitted as `battery_voltage`; alias `bat` or `battery_v` accepted. |
| `temp` | *Onboard NTC / Modem temp* | `temperature_c` / `temp` | `float` (°C) | **Migrated** | Enclosure ambient temperature. Fetched via Quectel `AT+QTEMP` or STM32 NTC ADC; preserved dynamically. |
| `lat` | `snap.gps_lat` | `latitude` | `double` (deg) | **Migrated** | GNSS latitude in WGS84 decimal degrees ($-90.0$ to $+90.0$). Extracted via Quectel `AT+QGPSLOC`. Alias `gps_lat` accepted. |
| `long` / `lon` | `snap.gps_lon` | `longitude` | `double` (deg) | **Migrated** | GNSS longitude in WGS84 decimal degrees ($-180.0$ to $+180.0$). Extracted via Quectel `AT+QGPSLOC`. Alias `gps_lon` accepted. |
| `speed` | *Calculated GNSS Doppler* | `speed_kmh` / `speed` | `float` (km/h) | **Migrated** | Ground speed calculated from GNSS Doppler velocity. Preserved dynamically. |
| `sats` | *Extracted from GNSS NMEA* | `satellites` / `sats` | `integer` | **Migrated** | Number of active GNSS satellite vehicles in view. Extracted from Quectel NMEA GSV sentences; preserved dynamically. |
| `alt` | *Extracted from GNSS GGA* | `altitude_m` / `alt` | `float` (m) | **Migrated** | Altitude above mean sea level in meters. Preserved dynamically. |
| `v1` / `v2` | `snap.raw_voltage` | `raw_voltage` | `float` (V) | **Migrated** | Raw analog ratiometric voltage reading from 4–20mA receiver ($0.500\,\text{V}$ Empty to $4.500\,\text{V}$ Full). Used for diagnostic drift detection. |
| `chno` | *Coach configuration flash* | `coach_id` / `chno` | `string` | **Migrated** | Indian Railways coach identification number (e.g. `pano123`, `CR-21142/C`). Preserved dynamically. |
| `trno` | *Train configuration flash* | `train_number` / `trno` | `string` | **Migrated** | Train schedule number (e.g. `12841`, `abcd123`). Preserved dynamically. |
| `sequence_id` | `snap.sequence_id` | `sequence_id` | `integer` | **Migrated (New)** | Monotonically increasing 32-bit counter ($1, 2, 3\dots$). Enforces deduplication and detection of cellular dropped packets. |
| `sensor_status`| `snap.sensor_status[16]` | `sensor_status` | `string` | **Migrated (New)** | Sensor health indicator (`NORMAL`, `DISCONNECTED`, `FAULT`, `CALIBRATING`). Wire-break ($<0.2\text{V}$) and short ($>4.85\text{V}$) traps. |
| `alarm_status` | `snap.alarm_status[16]` | `alarm_status` | `string` | **Migrated (New)** | 4-tier alarm state (`NONE`, `LOW_WARNING`, `CRITICAL_LOW`, `OVERFLOW`). |
| `pressure_bar` | `snap.pressure_bar` | `pressure_bar` | `float` (bar) | **Migrated (New)** | Hydrostatic head pressure at tank base ($0.0 - 0.5\,\text{bar}$). Derived directly from water column height. |

---

## 3. Comparison of Legacy MQTT Payload vs. Modern HTTPS JSON Payload

### 3.1 Legacy MQTT Payload Example
```json
{
  "uid": "002F00654B42501320353332",
  "lat": 22.556949,
  "long": 88.352447,
  "speed": 0.9,
  "time": "12:20:14",
  "cm1": 75.0,
  "cm2": 0.0,
  "wlp1": 50.0,
  "wlp2": 0.0,
  "wlv1": false,
  "wlv2": false,
  "bat": 12.6,
  "temp": 28.4,
  "chno": "pano123",
  "trno": "12841"
}
```

### 3.2 Standardized Modern HTTPS JSON Telemetry Document
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
  "speed_kmh": 0.9,
  "temperature_c": 28.4,
  "coach_id": "pano123",
  "train_number": "12841",
  "cm1": 75.0,
  "wlp1": 50.0,
  "bat": 12.6,
  "wlv1": false
}
```

---

## 4. Ingestion & Preservation Guarantee

1. **Zero Field Loss:** The FastAPI backend in `HTTPS_Server/backend/schemas/telemetry.py` uses `model_config = ConfigDict(extra="allow")`. If an embedded firmware transmits either legacy field names (`cm1`, `wlp1`, `bat`) or modern keys (`water_level_cm`, `water_level_percentage`, `battery_voltage`), both are ingested and stored.
2. **Type Safety & Bounds:** Numerical fields are validated against physical railway boundaries to prevent telemetry corruption.
3. **Sequence Deduplication:** The storage service uses `(device_id, sequence_id)` tracking to ensure retransmitted cellular packets do not introduce duplicate records.
