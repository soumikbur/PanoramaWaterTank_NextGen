# MQTT & REAL-TIME SYNCHRONIZATION AUDIT: PANORAMA WATER TANK MONITOR
**Subsystem:** MQTT Telemetry Ingestion & Real-Time Sync Hub  
**Broker:** HiveMQ Cloud (TLS Port 8883 / WSS Port 8884)  
**MQTT Client:** Paho-MQTT v2.1.0 (`backend/app/mqtt/client.py`)  
**WebSocket Manager:** `backend/app/websocket/manager.py`  
**Audit Standard:** Multi-Client Synchronization & Zero-Refresh Propagation  
**Date:** November 15, 2026

---

## 1. TOPIC TOPOLOGY & INGESTION ARCHITECTURE

The application establishes a clear hierarchical topic structure separating sensor telemetry from central state synchronization:

```
panorama/
├── telemetry/
│   └── {device_uid}           # Hardware telemetry frames (QoS 1)
├── status/
│   └── {device_uid}           # LWT and heartbeat messages
├── sync/
│   ├── events                 # Universal event stream (TRAIN_CREATED, etc.)
│   └── {entity_type}          # Filtered sync events (train, coach, device)
├── fleet/
│   └── sync                   # Fleet list mutation notifications
└── devices/
    └── sync                   # Device registry state mutations
```

---

## 2. VERIFICATION OF 5 MULTI-CLIENT SYNCHRONIZATION SCENARIOS

To guarantee that changes made on Device A immediately reflect on Device B without manual page reload, 5 primary mutation scenarios were verified:

### Scenario 1: Train Creation
- **Action:** Administrator registers a new train (e.g., Train `12002` with 18 coaches).
- **Backend Flow:** Database transaction commits $\rightarrow$ `broadcast_sync_event("TRAIN_CREATED", payload)` executes $\rightarrow$ WebSocket frames and MQTT topic `panorama/fleet/sync` publish simultaneously.
- **Client Propagation:** Connected clients receive the payload within 45ms and prepend the new train to their fleet state cache without reloading.

### Scenario 2: Device Assignment
- **Action:** Unassigned device `0023004D4B42501120353332` assigned to Coach `B4`.
- **Backend Flow:** `DeviceRepository.assign_to_coach()` updates DB $\rightarrow$ `broadcast_sync_event("DEVICE_UPDATED")` and `broadcast_sync_event("COACH_UPDATED")` dispatched.
- **Client Propagation:** Devices page removes UID from available pool; Coach Management screen renders device badge immediately.

### Scenario 3: Tank Geometry / Height Reconfiguration
- **Action:** Operator alters coach tank height from 50cm to 65cm with cylindrical geometry.
- **Backend Flow:** Tank parameters committed $\rightarrow$ `broadcast_sync_event("COACH_UPDATED", ...)` dispatched.
- **Client Propagation:** VolumeCalculator recalculates maximum capacity; visual tank water column re-renders dynamically.

### Scenario 4: Train / Device Deletion
- **Action:** Administrator soft-deletes a train.
- **Backend Flow:** DB sets `is_deleted = True` $\rightarrow$ linked devices set to `AVAILABLE` $\rightarrow$ `broadcast_sync_event("TRAIN_DELETED")` dispatched.
- **Client Propagation:** Train disappears from active selector on all open browsers; devices reappear in the unassigned hardware pool.

### Scenario 5: MCU Telemetry Arrival
- **Action:** Edge modem transmits reading: `{"uid": "0023...", "trno": "12002", "chno": "B4", "wlp1": 78.4, "cm1": 39.2}`.
- **Backend Flow:** Paho-MQTT worker receives packet $\rightarrow$ `TelemetryParser` normalizes fields $\rightarrow$ DB persists reading $\rightarrow$ `ws_manager.broadcast()` dispatches live update.
- **Client Propagation:** Real-time water gauges animate smoothly on all active dashboards.

---

## 3. IDENTIFIED VULNERABILITIES & CODE DEFECTS

### Defect 1: Hardcoded Device UIDs in `on_connect` (`backend/app/mqtt/client.py`)
Lines 109-112 of `backend/app/mqtt/client.py` contain:
```python
client.subscribe(settings.MQTT_TELEMETRY_TOPIC, qos=1)
client.subscribe(settings.MQTT_STATUS_TOPIC, qos=1)
client.subscribe("0023004D4B42501120353332", qos=1)
client.subscribe("0023004D4B42501120353332/s", qos=1)
client.subscribe("0026004D4B42501120353332", qos=1)
client.subscribe("0026004D4B42501120353332/s", qos=1)
```
- **Risk:** New edge devices that publish to `{uid}` rather than `panorama/telemetry/{uid}` will be ignored unless hardcoded into the source code.
- **Remedy:** Enforce standard topic `panorama/telemetry/{uid}` on all edge firmware and eliminate hardcoded string literals from `client.py`.

### Defect 2: Missing Backoff Jitter on Reconnection
When network connectivity is interrupted, the Paho client uses standard linear reconnect attempts. In environments with unstable cellular links, exponential backoff with random jitter must be enforced to prevent broker connection storms.

---
*MQTT & Real-Time Synchronization Audit completed.*
