# Authoritative Telemetry Data Contract

**Project:** Panorama Water Tank Monitor (WLI) — NextGen  
**Version:** v2.2.0-https  
**Target Communication Path:** `STM32 -> EC200U -> 4G LTE -> HTTPS POST -> FastAPI Backend -> Laboratory Dashboard`  
**Effective Date:** 2026-11-17  

---

## 1. Specification Overview

This document specifies the authoritative, binding telemetry contract between the embedded **STM32/EC200U edge node** and the **FastAPI HTTPS Receiver**. All firmware serializations, backend schema validations, and dashboard visualizers conform to this specification.

- **Encoding:** UTF-8 JSON
- **Wire Format:** Standard HTTP POST body with `Content-Type: application/json`
- **Authentication:** HTTP Header `Authorization: Bearer <API_TOKEN>` or `X-Device-Token: <API_TOKEN>`
- **Transport Security:** TLS 1.2 or TLS 1.3 with mandatory `ISRG Root X1` certificate verification

---

## 2. Field Specification Matrix

| JSON Key | Data Type | Engineering Unit | Generating Source | Accepted Range / Validation Regex | Optional? | Description |
|---|:---:|:---:|:---:|---|:---:|---|
| `device_id` | String | None | STM32 / Config | Length: 1–64 chars; `^[A-Za-z0-9_-]+$` | **No** (Mandatory) | Unique device/coach identifier (e.g. `COACH-PANORAMA-01`) |
| `sequence_id` | Integer | None | STM32 Tick | $1 \le \text{seq} \le 4{,}294{,}967{,}295$ (Monotonic) | Yes | Rolling 32-bit transmission sequence number for duplicate detection |
| `water_level_cm` | Float | Centimeters ($\text{cm}$) | STM32 ADC | $0.00$ to $300.00\,\text{cm}$ (2 decimal precision) | Yes | Hydrostatic water column height above sensor datum |
| `water_percentage` | Float | Percent ($\%$) | STM32 Math | $0.00\%$ to $150.00\%$ (Raw unclamped; display clamped $0-100\%$) | Yes | Fill ratio against calibrated max height ($150.0\,\text{cm}$) |
| `raw_voltage` | Float | Volts ($\text{V}$) | STM32 ADC | $0.000$ to $5.000\,\text{V}$ (3 decimal precision) | Yes | Conditioned transducer analog input voltage |
| `pressure_bar` | Float | Bar ($\text{bar}$) | STM32 Math | $0.000$ to $5.000\,\text{bar}$ | Yes | Gauge hydrostatic pressure ($P = \rho g h$) |
| `battery_v` | Float | Volts ($\text{V}$) | STM32 ADC | $0.00$ to $30.00\,\text{V}$ | Yes | Coach DC power rail voltage ($12\text{V}$ / $24\text{V}$ bus) |
| `signal_csq` | Integer | CSQ Index | EC200U Radio | $0$ to $31$, or $99$ (Unknown) | Yes | Quectel raw cellular signal strength from `AT+CSQ` |
| `gps_lat` | Float | Degrees North | EC200U GNSS | $-90.000000$ to $+90.000000$ (WGS84, 6 decimals) | Yes | Latitude coordinate |
| `gps_lon` | Float | Degrees East | EC200U GNSS | $-180.000000$ to $+180.000000$ (WGS84, 6 decimals) | Yes | Longitude coordinate |
| `gps_valid` | Boolean | None | EC200U GNSS | `true` or `false` | Yes | Satellite fix lock status. If `false`, coordinates are ignored |
| `sensor_status` | String | None | STM32 Logic | `"NORMAL"`, `"DISCONNECTED"`, `"SHORT_CIRCUIT"`, `"ERROR"` | Yes | Hydrostatic sensor loop health status |
| `alarm_status` | String | None | STM32 Logic | `"NONE"`, `"LOW_WARNING"`, `"CRITICAL_LOW"`, `"OVERFLOW"`, `"SENSOR_FAULT"` | Yes | Active threshold alarm state |
| `flow_rate_lpm` | Float | Litres/min | STM32 Pulse | $0.00$ to $200.00\,\text{L/min}$ | Yes | Optional pipeline flow transducer reading |
| `timestamp` | Integer | Seconds | STM32 RTC | POSIX Unix epoch timestamp (UTC) | Yes | Edge node generation timestamp |
| `received_at` | String | ISO 8601 | FastAPI Server | ISO 8601 UTC format (`YYYY-MM-DDTHH:MM:SS.ffffffZ`) | Auto (Server) | Authoritative server reception timestamp |
| `is_duplicate` | Boolean | None | FastAPI Storage | `true` or `false` | Auto (Server) | Replay/duplicate packet detection flag based on `sequence_id` |

---

## 3. Wire Payload JSON Schema Example

```json
{
  "device_id": "COACH-PANORAMA-01",
  "sequence_id": 42001,
  "water_level_cm": 120.80,
  "water_percentage": 80.53,
  "raw_voltage": 3.721,
  "pressure_bar": 0.402,
  "battery_v": 12.65,
  "signal_csq": 28,
  "gps_lat": 22.557279,
  "gps_lon": 88.352432,
  "gps_valid": true,
  "sensor_status": "NORMAL",
  "alarm_status": "NONE",
  "flow_rate_lpm": 0.0,
  "timestamp": 1731841200
}
```

---

## 4. Semantic State Handling Rules

To prevent data ambiguity, all downstream consumers (FastAPI storage, REST clients, and frontend UI dashboards) strictly distinguish between the following conditions:

```
┌──────────────┬────────────────────────────────────────────────────────────────────────┐
│ State        │ Semantic Interpretation & Rendering Behavior                            │
├──────────────┼────────────────────────────────────────────────────────────────────────┤
│ Zero (0.0)   │ A valid, confirmed zero reading (e.g., completely empty tank, 0.0 cm). │
│              │ Rendered as "0.0 cm" and "0.0%".                                       │
├──────────────┼────────────────────────────────────────────────────────────────────────┤
│ Null / None  │ Telemetry attribute not equipped or not transmitted by firmware.       │
│              │ Rendered as "—" or "N/A" (never rendered as 0.0).                      │
├──────────────┼────────────────────────────────────────────────────────────────────────┤
│ Missing      │ Key omitted from JSON packet. Dynamically preserved via model_extra.   │
│              │ Default values applied where safe; never halts ingestion.              │
├──────────────┼────────────────────────────────────────────────────────────────────────┤
│ Invalid      │ Sensor loop fault (e.g. V < 0.2V wire cut or V > 4.85V short circuit).  │
│              │ Rendered in UI as red "FAULT", suppressing numeric calculations.       │
├──────────────┼────────────────────────────────────────────────────────────────────────┤
│ Stale        │ Valid data whose server reception age exceeds the watchdog timer       │
│              │ (> 180 seconds in normal mode, > 30 seconds in fast test mode).         │
│              │ Rendered with a yellow/orange "STALE" badge.                           │
└──────────────┴────────────────────────────────────────────────────────────────────────┘
```

### GPS Coordinate Handling Rule
When `gps_valid` is `false` (e.g. inside tunnels, underground stations, or cold start before satellite fix), the latitude and longitude fields must **never** be populated with fabricated default values (such as `0.0, 0.0` or placeholder cities). The UI must display `"No GPS Lock"` or `"—"`.

---

## 5. Backward & Forward Compatibility

The FastAPI backend uses Pydantic V2 with `ConfigDict(extra="allow")`. Any additional proprietary debug variables, coach attributes, or future sensor readings appended by firmware (e.g., `aux_temp_c`, `door_closed_bool`) are dynamically preserved, stored, and displayed without requiring backend schema updates.
