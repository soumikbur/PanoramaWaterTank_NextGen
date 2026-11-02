# Comprehensive Telemetry & UI Data Flow

**Scope**: End-to-End Data Pipeline from Edge Sensor to Presentation  
**Project**: Panorama Water Tank NextGen Rebuild  
**Date**: October 30, 2026  

---

## 1. Primary Ingestion Pipelines

```mermaid
sequenceDiagram
    autonumber
    participant Sensor as ADS1115 / Dual Pressure Sensors
    participant Edge as ESP32-S3 + EC200U
    participant Broker as Mosquitto MQTT / REST
    participant Ingest as MqttService / ApiClient
    participant Repo as TankRepository
    participant Model as TankModel
    participant DB as SQLite DB
    participant UI as QML SceneGraph

    Sensor->>Edge: Analog voltage (0-3.3V)
    Edge->>Edge: Convert to pressure (mbar) & height (cm)
    alt MQTT Cellular Telemetry
        Edge->>Broker: MQTTS Publish (topic: panorama/telemetry/coach)
        Broker->>Ingest: Ingest 12-field JSON
    else Direct REST Polling
        Ingest->>Edge: HTTP GET /api/status
        Edge->>Ingest: Return status JSON
    end

    Ingest->>Repo: processEsp32Status(statusObj)
    Repo->>Repo: Validate fields (wlv1, wlv2, lat, lon)
    Repo->>Repo: Reject spikes > tankHeightCm
    Repo->>DB: INSERT into telemetry_logs
    Repo->>Model: applyReading(heightCm, pressure, levelPct)
    Model->>Model: Calculate volume via VolumeCalculator
    Model->>Model: Evaluate 4-tier alarm & hysteresis
    Model->>Model: Update downsampled trend array (~100 pts)
    Model-->>UI: Emit Q_PROPERTY notify signals
    UI->>UI: Animate fluid wave (60 FPS) & update trend curve
```

---

## 2. Invariant Data Guarantees

1. **Deterministic Downsampling**:
   The historical time series preserves boundary min/max points while enforcing chronological ordering across 12-hour, 24-hour, and 7-day ranges, capped at ~100 points for smooth QML Canvas rendering.
2. **Authoritative REST vs Live Stream Alignment**:
   When direct REST returns authoritative measurements from the edge device, they override cached polling readings, keeping the live model and historical chart latest value aligned.
3. **No False Alarms on Disconnect**:
   When network communication drops, the model transitions to `Offline` and retains last known physical values rather than zeroing out to 0 cm, preventing false Critical Low alarms.

