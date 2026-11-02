# Error Handling & Fault Recovery Strategy

**Project**: Panorama Water Tank NextGen Rebuild  
**Architecture**: Industrial Resilient SCADA Fault Model  
**Date**: October 30, 2026  

---

## 1. Fault Matrix & Recovery Procedures

| Fault Scenario | Detection Mechanism | Immediate Action | User-Facing State | Recovery Procedure |
| :--- | :--- | :--- | :--- | :--- |
| **Transient Sensor Surge** | Reading > physical tank height (e.g. 161 cm on 50 cm tank) | Reject value in `TankModel::applyAuthoritativeReading()` | Retain last valid reading; NO false Overflow | Resume normal updates upon valid reading |
| **Primary Sensor Failure** | Sensor flag `wlv1 == false`, `wlv2 == true` | Automatic failover to secondary sensor `wlp2` | Badge shows "Aux Sensor Active"; Normal alarm tier | Primary sensor flagged for maintenance in incident log |
| **Dual Sensor Failure** | Both `wlv1 == false` and `wlv2 == false` | Set `measurement_state = SENSOR_FAULT` | Purple "Sensor Fault" badge; Audible alarm trigger | Edge sensor replacement alert logged |
| **Network Loss (WiFi/Cellular)** | HTTP timeout (4000 ms) or MQTT disconnect event | `ConnectionManager` transitions state to `Disconnected` | Gray "Offline" badge; Retain last known level (NO false Critical Low) | Exponential backoff retry (1s, 2s, 4s, max 30s) |
| **Database Corruption / Failure** | SQLite `open()` or `exec()` returns error | Log critical error in `Logger`; fallback to in-memory cache | Banner: "Database Offline — Historical Logging Suspended" | Attempt file integrity repair on next restart |
| **Malformed Telemetry JSON** | JSON parse exception or missing required fields | Safe parse catch; increment bad packet counter | None; telemetry ignored without crash | Wait for next valid packet |
| **Graceful Application Exit** | System shutdown or window close event | `ApplicationController::shutdown()` halts timers, disconnects broker, flushes DB | Window closes smoothly without crash | Clean shutdown completed |

---

## 2. Invariant Rules for Error Handling

1. **Never Panic or Crash**: All JSON parsing, network replies, database queries, and IPC lookups must be checked with explicit defensive guards.
2. **Never Emit False Alarms**: Disconnects must never be converted to zero-level readings. Spurious 0% triggers are strictly prevented.
3. **Audit Trail**: Every alarm state change (Normal -> Warning -> Critical -> Normal) generates an incident log record stored in SQLite.

